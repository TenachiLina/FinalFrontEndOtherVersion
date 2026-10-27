import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { API, server } from "@/test/server";

type Module = typeof import("./reportError");

// The module counts reports per page load: load a fresh copy for each test
let mod: Module;
let received: Record<string, unknown>[];

beforeEach(async () => {
  vi.resetModules();
  mod = await import("./reportError");
  received = [];
  server.use(
    http.post(`${API}/error-logs/client`, async ({ request }) => {
      received.push((await request.json()) as Record<string, unknown>);
      return new HttpResponse(null, { status: 201 });
    })
  );
  localStorage.setItem("auth_token", "token");
});

/** Waits until the fire-and-forget requests have reached the server. */
const flush = () => new Promise((r) => setTimeout(r, 50));

describe("reportClientError", () => {
  it("sends the error with the page URL", async () => {
    mod.reportClientError(new Error("Boom"), { digest: "d1" });
    await flush();
    expect(received).toEqual([
      expect.objectContaining({ name: "Error", message: "Boom", digest: "d1", pageUrl: window.location.href }),
    ]);
  });

  it("wraps values that are not errors", async () => {
    mod.reportClientError("plain string");
    await flush();
    expect(received[0]).toMatchObject({ message: "plain string" });
  });

  it("sends nothing when signed out", async () => {
    localStorage.clear();
    mod.reportClientError(new Error("Boom"));
    await flush();
    expect(received).toEqual([]);
  });

  it.each(["ResizeObserver loop limit exceeded", "Script error.", "at chrome-extension://abc"])(
    "ignores browser noise: %s",
    async (message) => {
      mod.reportClientError(new Error(message));
      await flush();
      expect(received).toEqual([]);
    }
  );

  it("sends the same error once per 10 seconds", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    mod.reportClientError(new Error("Same"));
    mod.reportClientError(new Error("Same"));
    vi.setSystemTime(Date.now() + 10_001);
    mod.reportClientError(new Error("Same"));
    vi.useRealTimers();
    await flush();
    expect(received).toHaveLength(2);
  });

  it("stops after 20 reports per page load", async () => {
    for (let i = 0; i < 25; i++) mod.reportClientError(new Error(`E${i}`));
    await flush();
    expect(received).toHaveLength(20);
  });

  it("never throws, even if the server is down", async () => {
    server.use(http.post(`${API}/error-logs/client`, () => HttpResponse.error()));
    expect(() => mod.reportClientError(new Error("x"))).not.toThrow();
    await flush();
  });

  it("never throws when reading the error fails", () => {
    const evil = new Error("x");
    Object.defineProperty(evil, "message", {
      get() {
        throw new Error("getter");
      },
    });
    expect(() => mod.reportClientError(evil)).not.toThrow();
  });
});

describe("installErrorReporting", () => {
  it("reports window errors and unhandled rejections, once", async () => {
    mod.installErrorReporting();
    mod.installErrorReporting();
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("Window error") }));
    window.dispatchEvent(new ErrorEvent("error", { message: "no error object" }));
    const rejection = new Event("unhandledrejection") as Event & { reason?: unknown };
    rejection.reason = new Error("Rejected");
    window.dispatchEvent(rejection);
    await flush();
    expect(received.map((r) => r.message)).toEqual(["Window error", "Rejected"]);
  });
});
