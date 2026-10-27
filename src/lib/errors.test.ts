import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { API, server } from "@/test/server";
import { ApiError, ensureOk, fetchJson, friendlyError, optionalData } from "./errors";
import { setLang } from "./i18n";
import * as notify from "./notify";

const NETWORK = "Can't reach the server. Check your internet connection and try again.";
const SERVER = "Something went wrong on our side. Please try again in a moment.";

beforeEach(() => {
  // friendlyError logs every error on purpose
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => setLang("en"));

describe("ensureOk", () => {
  it("returns an OK response unchanged", async () => {
    const res = new Response("ok");
    expect(await ensureOk(res)).toBe(res);
  });

  it.each([
    [JSON.stringify({ message: "Email taken", reference: "E-12" }), "Email taken", "E-12"],
    [JSON.stringify({ message: ["a is required", "b is too long"] }), "a is required. b is too long", undefined],
    [JSON.stringify({ message: 42 }), JSON.stringify({ message: 42 }), undefined],
    ["plain text", "plain text", undefined],
    ["x".repeat(300), "", undefined],
  ])("reads the server message from %s", async (body, message, reference) => {
    const err = await ensureOk(new Response(body, { status: 400 })).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, message, reference, name: "ApiError" });
  });

  it("copes with a body that can't be read", async () => {
    const res = new Response("x", { status: 500 });
    vi.spyOn(res, "text").mockRejectedValue(new Error("stream"));
    await expect(ensureOk(res)).rejects.toMatchObject({ status: 500, message: "" });
  });
});

describe("fetchJson", () => {
  it("parses the JSON body", async () => {
    server.use(http.get(`${API}/x`, () => HttpResponse.json({ a: 1 })));
    expect(await fetchJson(`${API}/x`)).toEqual({ a: 1 });
  });

  it("returns undefined for an empty body", async () => {
    server.use(http.delete(`${API}/x`, () => new HttpResponse(null, { status: 204 })));
    expect(await fetchJson(`${API}/x`, { method: "DELETE" })).toBeUndefined();
  });

  it("turns a network failure into ApiError(0)", async () => {
    server.use(http.get(`${API}/x`, () => HttpResponse.error()));
    await expect(fetchJson(`${API}/x`)).rejects.toMatchObject({ status: 0, message: NETWORK });
  });

  it("throws the server's error", async () => {
    server.use(http.get(`${API}/x`, () => HttpResponse.json({ message: "Nope" }, { status: 403 })));
    await expect(fetchJson(`${API}/x`)).rejects.toMatchObject({ status: 403, message: "Nope" });
  });
});

describe("friendlyError", () => {
  it.each([
    [0, "", NETWORK],
    [400, "Bad date", "Bad date"],
    [409, "", "Some of the information isn't valid. Please check it and try again."],
    [422, "", "Some of the information isn't valid. Please check it and try again."],
    [401, "anything", "Your session has expired. Please sign in again."],
    [403, "", "You don't have permission to do this."],
    [403, "Feature disabled", "Feature disabled"],
    [404, "", "We couldn't find that. It may have been deleted."],
    [413, "", "That file is too large."],
    [429, "", "Too many attempts. Please wait a moment and try again."],
    [500, "stack trace…", SERVER],
    [418, "Teapot", "Teapot"],
    [418, "", SERVER],
  ])("ApiError %i %j → %s", (status, message, expected) => {
    expect(friendlyError(new ApiError(status, message))).toBe(expected);
  });

  it("adds the error code from the system log", () => {
    expect(friendlyError(new ApiError(500, "", "ERR-42"))).toBe(`${SERVER} (Error code: ERR-42)`);
  });

  it("puts the context in front", () => {
    expect(friendlyError(new ApiError(404, ""), "Couldn't save the planning")).toBe(
      "Couldn't save the planning. We couldn't find that. It may have been deleted."
    );
  });

  it("recognises a browser network failure", () => {
    expect(friendlyError(new TypeError("Failed to fetch"))).toBe(NETWORK);
  });

  it("recovers status and message from older `${status} ${body}` errors", () => {
    expect(friendlyError(new Error('400 {"message":["a","b"]}'))).toBe("a. b");
    expect(friendlyError(new Error('500 {"message":"x","reference":"R1"}'))).toBe(`${SERVER} (Error code: R1)`);
    expect(friendlyError(new Error("403 not json"))).toBe("not json");
    expect(friendlyError(new Error('400 {"other":1}'))).toBe(
      "Some of the information isn't valid. Please check it and try again."
    );
  });

  it("hides technical wording", () => {
    expect(friendlyError(new Error("Failed to fetch employees"))).toBe(SERVER);
    expect(friendlyError(new Error("Error: boom"))).toBe(SERVER);
    expect(friendlyError(new Error("x".repeat(200)))).toBe(SERVER);
  });

  it("shows short human messages as they are", () => {
    expect(friendlyError(new Error("Pick at least one employee"))).toBe("Pick at least one employee");
    expect(friendlyError(new Error(""))).toBe(SERVER);
  });

  it("uses a generic message for non-errors", () => {
    expect(friendlyError("oops")).toBe(SERVER);
    expect(friendlyError(undefined)).toBe(SERVER);
  });

  it("translates the result", () => {
    setLang("fr");
    expect(friendlyError(new ApiError(0, ""))).not.toBe(NETWORK);
  });
});

describe("optionalData", () => {
  it("returns the fallback silently when the feature is off (403)", () => {
    const warning = vi.spyOn(notify.toast, "warning");
    expect(optionalData([], "Advances")(new ApiError(403, ""))).toEqual([]);
    expect(warning).not.toHaveBeenCalled();
  });

  it("returns the fallback and warns on other failures", async () => {
    const warning = vi.spyOn(notify.toast, "warning").mockImplementation(() => {});
    expect(optionalData(0, "Advances")(new ApiError(500, ""))).toBe(0);
    await vi.dynamicImportSettled();
    expect(warning).toHaveBeenCalledWith(
      "Advances couldn't be loaded, so the totals shown may be incomplete. Try refreshing."
    );
  });
});
