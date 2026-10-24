import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { API, server } from "@/test/server";
import { friendlyError } from "@/lib/errors";
import {
  createWorktime,
  deleteWorktime,
  getWorktime,
  getWorktimes,
  getWorktimesByDate,
  updateWorktime,
  upsertWorktime,
  type WorktimeRecord,
} from "./worktime.api";

const record = (overrides: Partial<WorktimeRecord> = {}): WorktimeRecord => ({
  _id: "w1",
  worktime_id: 1,
  emp_id: 101,
  work_date: "2026-03-01",
  ...overrides,
});

let log: { method: string; url: string; audit: string | null; body: unknown }[];

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  log = [];
  const remember = async (request: Request) => {
    const text = await request.text();
    log.push({
      method: request.method,
      url: request.url.replace(API, ""),
      audit: request.headers.get("X-Audit-As"),
      body: text ? JSON.parse(text) : undefined,
    });
  };
  server.use(
    http.get(`${API}/worktime`, async ({ request }) => {
      await remember(request);
      return HttpResponse.json([]);
    }),
    http.get(`${API}/worktime/:id`, async ({ request, params }) => {
      await remember(request);
      return HttpResponse.json(record({ _id: String(params.id) }));
    }),
    http.post(`${API}/worktime`, async ({ request }) => {
      await remember(request);
      return HttpResponse.json(record({ _id: "created" }));
    }),
    http.put(`${API}/worktime/:id`, async ({ request, params }) => {
      await remember(request);
      return HttpResponse.json(record({ _id: String(params.id) }));
    }),
    http.delete(`${API}/worktime/:id`, async ({ request }) => {
      await remember(request);
      return HttpResponse.json({ deleted: true });
    })
  );
});

describe("CRUD calls", () => {
  it("getWorktimes builds the query", async () => {
    await getWorktimes();
    await getWorktimes({ emp_id: "101", work_date: "2026-03-01" });
    await getWorktimesByDate("2026-03-02");
    expect(log.map((l) => l.url)).toEqual([
      "/worktime",
      "/worktime?emp_id=101&work_date=2026-03-01",
      "/worktime?work_date=2026-03-02",
    ]);
  });

  it("getWorktime, create, update and delete", async () => {
    expect((await getWorktime("w7"))._id).toBe("w7");
    await createWorktime({ emp_id: 101, work_date: "2026-03-01" }, "clock");
    await updateWorktime("w1", { penalty: 100 }, "edit");
    await updateWorktime("w1", { penalty: 0 });
    expect(await deleteWorktime("w1")).toEqual({ deleted: true });
    expect(log.map((l) => [l.method, l.url, l.audit])).toEqual([
      ["GET", "/worktime/w7", null],
      ["POST", "/worktime", "clock"],
      ["PUT", "/worktime/w1", "edit"],
      ["PUT", "/worktime/w1", null],
      ["DELETE", "/worktime/w1", null],
    ]);
    expect(log[1].body).toEqual({ emp_id: 101, work_date: "2026-03-01" });
  });

  it("throws with the status and body on failure", async () => {
    server.use(http.get(`${API}/worktime/:id`, () => new HttpResponse("Not found", { status: 404 })));
    await expect(getWorktime("x")).rejects.toThrow("[worktime] 404 Not found");
  });

  it("throws on an empty successful response", async () => {
    server.use(http.get(`${API}/worktime/:id`, () => new HttpResponse("", { status: 200 })));
    await expect(getWorktime("x")).rejects.toThrow("Empty response from /worktime/x");
  });

  // BUG-012: a delete the server confirms with "204 No Content" is reported as a failure
  it.fails("treats an empty 204 delete as success", async () => {
    server.use(http.delete(`${API}/worktime/:id`, () => new HttpResponse(null, { status: 204 })));
    await expect(deleteWorktime("w1")).resolves.not.toThrow();
  });

  // BUG-013: every response body (names, hours, penalties) is printed to the browser console
  it.fails("doesn't print response bodies to the console", async () => {
    await getWorktime("w1");
    expect(console.log).not.toHaveBeenCalled();
  });

  // BUG-014: "[worktime] 400 …" doesn't match the "400 …" pattern friendlyError expects,
  // so people see the raw text, JSON included
  it.fails("its errors become readable messages", async () => {
    server.use(http.post(`${API}/worktime`, () => HttpResponse.json({ message: "Clock-out before clock-in" }, { status: 400 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await createWorktime({ emp_id: 1, work_date: "2026-03-01" }).catch((e) => e);
    expect(friendlyError(err)).toBe("Clock-out before clock-in");
  });
});

describe("upsertWorktime", () => {
  const payload = { emp_id: 101, work_date: "2026-03-01", clock_in: "08:00" };

  it("updates the known record directly", async () => {
    const saved = await upsertWorktime(payload, "w5", "clock");
    expect(saved._id).toBe("w5");
    expect(log.map((l) => [l.method, l.url, l.audit])).toEqual([["PUT", "/worktime/w5", "clock"]]);
  });

  it("falls back to a search when the known record can't be updated", async () => {
    server.use(http.put(`${API}/worktime/gone`, () => new HttpResponse("Not found", { status: 404 })));
    const saved = await upsertWorktime(payload, "gone");
    expect(saved._id).toBe("created");
    expect(log.map((l) => [l.method, l.url])).toEqual([
      ["GET", "/worktime?emp_id=101&work_date=2026-03-01"],
      ["POST", "/worktime"],
    ]);
  });

  it("updates the employee's record for that day when one exists", async () => {
    server.use(http.get(`${API}/worktime`, () => HttpResponse.json([record({ _id: "day-rec" })])));
    const saved = await upsertWorktime(payload, null, "edit");
    expect(saved._id).toBe("day-rec");
  });

  it("creates a record when none exists", async () => {
    const saved = await upsertWorktime(payload);
    expect(saved._id).toBe("created");
    expect(log.at(-1)).toMatchObject({ method: "POST", body: payload });
  });

  // BUG-015: the search result is trusted blindly; reporting.ts notes the API ignores
  // the employee filter, so this can overwrite ANOTHER employee's day
  it.fails("never updates another employee's record", async () => {
    server.use(
      http.get(`${API}/worktime`, () =>
        HttpResponse.json([record({ _id: "someone-else", emp_id: 202, work_date: "2026-02-27" })])
      )
    );
    await upsertWorktime(payload);
    expect(log.some((l) => l.url === "/worktime/someone-else")).toBe(false);
  });
});
