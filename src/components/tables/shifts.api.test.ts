import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { API, server } from "@/test/server";
import { friendlyError } from "@/lib/errors";
import { getEmployees, getPlanningByDate, getShifts } from "./shifts.api";

describe("shifts.api", () => {
  it("reads employees, shifts and a day's planning", async () => {
    let planningUrl = "";
    server.use(
      http.get(`${API}/employees`, () => HttpResponse.json([{ _id: "e1" }])),
      http.get(`${API}/shifts`, () => HttpResponse.json([{ _id: "s1" }])),
      http.get(`${API}/planning`, ({ request }) => {
        planningUrl = request.url;
        return HttpResponse.json([]);
      })
    );
    expect(await getEmployees()).toEqual([{ _id: "e1" }]);
    expect(await getShifts()).toEqual([{ _id: "s1" }]);
    expect(await getPlanningByDate("2026-03-01")).toEqual([]);
    expect(planningUrl).toBe(`${API}/planning?planDate=2026-03-01`);
  });

  it("throws with the status and body", async () => {
    server.use(http.get(`${API}/shifts`, () => new HttpResponse("down", { status: 503 })));
    await expect(getShifts()).rejects.toThrow("[api] 503 down");
  });

  it("falls back to the status text when the body can't be read", async () => {
    server.use(http.get(`${API}/shifts`, () => new HttpResponse(null, { status: 500, statusText: "Server Error" })));
    await expect(getShifts()).rejects.toThrow(/^\[api\] 500/);
  });

  // BUG-014 (same cause as in worktime.api.ts)
  it.fails("its errors become readable messages", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.get(`${API}/shifts`, () => HttpResponse.json({ message: "Shift not found" }, { status: 400 })));
    const err = await getShifts().catch((e) => e);
    expect(friendlyError(err)).toBe("Shift not found");
  });
});
