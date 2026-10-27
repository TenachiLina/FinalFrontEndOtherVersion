import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse } from "msw";
import { useWeeklyAdvancesList } from "./useWeeklyAdvancesList";
import {
  AMINE,
  NADIA,
  SARA,
  captureWrites,
  failGet,
  mockReportingApi,
  plan,
  rangesRequested,
  rawAdvance,
  rawEmployee,
  rawRow,
  slowWorktimeFor,
  toastMessages,
  clearFeedbackAfterEachTest,
  fixTodayInEachTest,
  type ReportingData,
} from "@/components/reporting/__testutils__/reportingApi";
import { ApiError } from "@/lib/errors";

fixTodayInEachTest(); // 2026-03-11 → week 03-09..03-15
clearFeedbackAfterEachTest();

// Amine 200 DA/h, Sara 100 DA/h
const WEEK: ReportingData = {
  employees: [rawEmployee(AMINE), rawEmployee(SARA), rawEmployee(NADIA)],
  planning: [plan(101, "2026-03-09"), plan(102, "2026-03-10"), plan(103, "2026-03-02")],
  worktime: [
    rawRow({ emp_id: 101, work_date: "2026-03-09", work_hours: "08:00:00", consommation: 300 }),
    rawRow({ emp_id: 101, work_date: "2026-03-10", work_hours: "07:30:00" }),
    rawRow({ emp_id: 101, work_date: "2026-03-11", work_hours: 0, absent: true }),
    rawRow({ emp_id: 102, work_date: "2026-03-09", work_hours: "06:00", consommation: 100 }),
    rawRow({ emp_id: 103, work_date: "2026-03-03", work_hours: "05:00" }),
  ],
  advances: [rawAdvance({ _id: "adv-102", emp_id: 102, amount: 250, date: "2026-03-10" })],
};

async function renderLoaded(data: ReportingData = WEEK, initial?: { start: string; end: string }) {
  const requests = mockReportingApi(data);
  const hook = renderHook(() => useWeeklyAdvancesList(initial));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return { ...hook, requests };
}

describe("useWeeklyAdvancesList", () => {
  it("loads this week by default", async () => {
    const { result, requests } = await renderLoaded();
    expect(result.current.range).toEqual({ start: "2026-03-09", end: "2026-03-15" });
    expect(rangesRequested(requests, "/worktime")).toEqual(["2026-03-09..2026-03-15"]);
    expect(rangesRequested(requests, "/advances")).toEqual(["2026-03-09..2026-03-15"]);
  });

  it("computes the week's salary and the advance offer for each scheduled employee", async () => {
    const { result } = await renderLoaded();
    expect(result.current.advanceRows).toEqual([
      {
        // 15.5 h × 200 = 3100; offer (3100 − 300) × 0.5 = 1400
        empId: 101, firstName: "Amine", lastName: "Kaci", hourlyRate: 200, hours: 15.5, absences: 1,
        weeklySalary: 3100, consommation: 300, advanceOffer: 1400, advanceGiven: false, advanceId: undefined,
      },
      {
        // 6 h × 100 = 600; offer (600 − 100) × 0.5 = 250
        empId: 102, firstName: "Sara", lastName: "Bel", hourlyRate: 100, hours: 6, absences: 0,
        weeklySalary: 600, consommation: 100, advanceOffer: 250, advanceGiven: true, advanceId: "adv-102",
      },
    ]);
  });

  it("filters by name", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setSearch("kaci"));
    expect(result.current.advanceRows.map((r) => r.empId)).toEqual([101]);
  });

  it("opens on the week passed in", async () => {
    const { result } = await renderLoaded(WEEK, { start: "2026-03-02", end: "2026-03-08" });
    expect(result.current.range.start).toBe("2026-03-02");
    expect(result.current.advanceRows).toEqual([expect.objectContaining({ empId: 103, hours: 5, advanceOffer: 312.5 })]);
  });

  it("loads another week, and reloads the same one without arguments", async () => {
    const { result, requests } = await renderLoaded();
    await act(() => result.current.setRange({ start: "2026-03-02", end: "2026-03-08" }));
    expect(result.current.advanceRows.map((r) => r.empId)).toEqual([103]);
    await act(() => result.current.setRange());
    expect(rangesRequested(requests, "/worktime")).toEqual([
      "2026-03-09..2026-03-15",
      "2026-03-02..2026-03-08",
      "2026-03-02..2026-03-08",
    ]);
  });

  it("gives an advance and marks the employee", async () => {
    const { result } = await renderLoaded();
    const posts = captureWrites("post", "/advances", () => HttpResponse.json({ _id: "adv-new" }));
    await act(() => result.current.giveAdvance(101, 1200, "2026-03-11"));
    expect(posts.map((p) => p.body)).toEqual([
      { emp_id: 101, amount: 1200, date: "2026-03-11", reason: "Weekly advance (2026-03-09 to 2026-03-15)" },
    ]);
    expect(result.current.advanceRows[0]).toMatchObject({ advanceGiven: true, advanceId: "adv-new" });
    expect(toastMessages("success")).toEqual(["Advance given."]);
  });

  it("rejects with the server's error when the advance is refused", async () => {
    const { result } = await renderLoaded();
    captureWrites("post", "/advances", () => HttpResponse.json({ message: "Too much" }, { status: 400 }));
    await expect(result.current.giveAdvance(101, 1200, "2026-03-11")).rejects.toEqual(new ApiError(400, "Too much"));
    expect(result.current.advanceRows[0].advanceGiven).toBe(false);
  });

  it("revokes an advance", async () => {
    const { result } = await renderLoaded();
    const deletes = captureWrites("delete", "/advances/:id");
    await act(() => result.current.revokeAdvance("adv-102"));
    expect(deletes.map((d) => d.url)).toEqual(["https://api.test/advances/adv-102"]);
    expect(result.current.advanceRows[1].advanceGiven).toBe(false);
  });

  it("does nothing when there is no advance id", async () => {
    const { result } = await renderLoaded();
    const deletes = captureWrites("delete", "/advances/:id");
    await act(() => result.current.revokeAdvance(undefined));
    expect(deletes).toEqual([]);
  });

  it("puts the advance back and explains when the revoke fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = await renderLoaded();
    captureWrites("delete", "/advances/:id", () => HttpResponse.json({}, { status: 404 }));
    await act(() => result.current.revokeAdvance("adv-102"));
    expect(result.current.advanceRows[1]).toMatchObject({ advanceGiven: true, advanceId: "adv-102" });
    expect(toastMessages("error")).toEqual(["Couldn't remove the advance. We couldn't find that. It may have been deleted."]);
  });

  it("shows an error when the week can't be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockReportingApi(WEEK);
    failGet("/employees", 500);
    const { result } = renderHook(() => useWeeklyAdvancesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(
      "Couldn't load the weekly advances. Something went wrong on our side. Please try again in a moment."
    );
    expect(result.current.advanceRows).toEqual([]);
  });

  it("shows every offer as not given when the advances can't be loaded, and warns", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockReportingApi(WEEK);
    failGet("/advances", 500);
    const { result } = renderHook(() => useWeeklyAdvancesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.advanceRows.map((r) => r.advanceGiven)).toEqual([false, false]);
    await waitFor(() => expect(toastMessages("warning")).toHaveLength(1));
  });

  // BUG-502: when the planning can't be loaded, the list is empty
  it("still lists the employees who worked when the planning can't be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockReportingApi(WEEK);
    failGet("/planning", 500);
    const { result } = renderHook(() => useWeeklyAdvancesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.advanceRows.map((r) => r.empId)).toEqual(expect.arrayContaining([101, 102]));
  });

  // BUG-501: no guard against an older, slower response
  it("shows the last week chosen when an earlier request answers late", async () => {
    const { result } = await renderLoaded();
    slowWorktimeFor("2026-03-02", 150, WEEK);
    let first!: Promise<void>;
    act(() => {
      first = result.current.setRange({ start: "2026-03-02", end: "2026-03-08" });
    });
    await act(() => result.current.setRange({ start: "2026-03-09", end: "2026-03-15" }));
    await act(() => first);
    expect(result.current.range.start).toBe("2026-03-09");
  });
});
