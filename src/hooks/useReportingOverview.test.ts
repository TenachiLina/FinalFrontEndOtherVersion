import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { previousRange, useReportingOverview } from "./useReportingOverview";
import {
  AMINE,
  SARA,
  failGet,
  mockReportingApi,
  rangesRequested,
  rawAdvance,
  rawBonus,
  rawEmployee,
  rawRow,
  slowWorktimeFor,
  toastMessages,
  clearFeedbackAfterEachTest,
  fixTodayInEachTest,
  type ReportingData,
} from "@/components/reporting/__testutils__/reportingApi";

fixTodayInEachTest(); // Wednesday 2026-03-11 → this week = 03-09..03-15, previous = 03-02..03-08
clearFeedbackAfterEachTest();

// Amine: 200 DA/h, Sara: 100 DA/h
const WEEK: ReportingData = {
  employees: [rawEmployee(AMINE), rawEmployee(SARA)],
  worktime: [
    rawRow({ emp_id: 101, work_date: "2026-03-09", work_hours: "08:00:00", late_minutes: 10, penalty: 200, consommation: 300 }),
    rawRow({ emp_id: 101, work_date: "2026-03-10", work_hours: "07:30:00", overtime_minutes: 30 }),
    rawRow({ emp_id: 102, work_date: "2026-03-09", work_hours: "06:00", consommation: 100 }),
    rawRow({ emp_id: 102, work_date: "2026-03-10", work_hours: 0, absent: true }),
    // previous week
    rawRow({ emp_id: 101, work_date: "2026-03-02", work_hours: "08:00:00" }),
  ],
  advances: [rawAdvance({ emp_id: 101, amount: 1000, date: "2026-03-10" })],
  bonuses: [rawBonus({ emp_id: 102, amount: 500, date: "2026-03-11" })],
};

async function renderLoaded(data: ReportingData = WEEK) {
  const requests = mockReportingApi(data);
  const hook = renderHook(() => useReportingOverview());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return { ...hook, requests };
}

describe("previousRange", () => {
  it("is the same number of days, ending the day before", () => {
    expect(previousRange({ start: "2026-03-09", end: "2026-03-15" })).toEqual({ start: "2026-03-02", end: "2026-03-08" });
  });

  it("handles a month, crossing into February", () => {
    expect(previousRange({ start: "2026-03-01", end: "2026-03-31" })).toEqual({ start: "2026-01-29", end: "2026-02-28" });
  });
});

describe("useReportingOverview", () => {
  it("starts loading this week and asks for this week and the week before", async () => {
    const requests = mockReportingApi(WEEK);
    const { result } = renderHook(() => useReportingOverview());
    expect(result.current.loading).toBe(true);
    expect(result.current.range).toEqual({ start: "2026-03-09", end: "2026-03-15" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(rangesRequested(requests, "/worktime")).toEqual(["2026-03-09..2026-03-15", "2026-03-02..2026-03-08"]);
    expect(rangesRequested(requests, "/advances")).toEqual(["2026-03-09..2026-03-15", "2026-03-02..2026-03-08"]);
    expect(rangesRequested(requests, "/bonuses")).toEqual(["2026-03-09..2026-03-15", "2026-03-02..2026-03-08"]);
    expect(result.current.previousRange).toEqual({ start: "2026-03-02", end: "2026-03-08" });
  });

  it("computes the company totals for the period", async () => {
    const { result } = await renderLoaded();
    // hours: Amine 8 + 7.5 = 15.5, Sara 6 → 21.5
    // gross: 15.5 × 200 + 6 × 100 = 3700
    // net: 3700 + 500 bonus − 1000 advance − 400 consumption − 200 penalty = 2600
    expect(result.current.current).toEqual({
      hours: 21.5,
      overtimeHours: 0.5,
      gross: 3700,
      net: 2600,
      advances: 1000,
      advancesCount: 1,
      bonuses: 500,
      bonusesCount: 1,
      consommation: 400,
      penalties: 200,
      lateEvents: 1,
      lateMinutes: 10,
      absences: 1,
      records: 4,
      lateRate: 25,
      absenceRate: 25,
      activeEmployees: 2,
      avgHoursPerEmployee: 10.75,
    });
  });

  it("computes the previous period the same way", async () => {
    const { result } = await renderLoaded();
    expect(result.current.previous).toMatchObject({ hours: 8, gross: 1600, net: 1600, records: 1, activeEmployees: 1, advances: 0, bonuses: 0 });
  });

  it("counts hours of an employee it doesn't know, but no pay for them", async () => {
    const { result } = await renderLoaded({
      employees: [rawEmployee(AMINE)],
      worktime: [rawRow({ emp_id: 101, work_hours: "02:00" }), rawRow({ emp_id: 555, work_hours: "03:00" })],
    });
    expect(result.current.current).toMatchObject({ hours: 5, gross: 400, activeEmployees: 2 });
  });

  it("groups a short range by day, gaps included", async () => {
    const { result } = await renderLoaded();
    const { trend } = result.current;
    expect(trend.granularity).toBe("daily");
    expect(trend.categories).toEqual([
      "Mon 9 Mar", "Tue 10 Mar", "Wed 11 Mar", "Thu 12 Mar", "Fri 13 Mar", "Sat 14 Mar", "Sun 15 Mar",
    ]);
    expect(trend.hours).toEqual([14, 7.5, 0, 0, 0, 0, 0]);
    expect(trend.penalties).toEqual([200, 0, 0, 0, 0, 0, 0]);
    expect(trend.consommation).toEqual([400, 0, 0, 0, 0, 0, 0]);
    expect(trend.lateEvents).toEqual([1, 0, 0, 0, 0, 0, 0]);
    expect(trend.absences).toEqual([0, 1, 0, 0, 0, 0, 0]);
  });

  it("groups a month by week (weeks start on Monday)", async () => {
    const { result, requests } = await renderLoaded();
    await act(() => result.current.setRange({ start: "2026-03-01", end: "2026-03-31" }));
    const { trend } = result.current;
    expect(rangesRequested(requests, "/worktime").slice(-2)).toEqual(["2026-03-01..2026-03-31", "2026-01-29..2026-02-28"]);
    expect(trend.granularity).toBe("weekly");
    // March 1st 2026 is a Sunday, so the first bucket is the week of Feb 23
    expect(trend.categories).toEqual(["Wk 23 Feb", "Wk 2 Mar", "Wk 9 Mar", "Wk 16 Mar", "Wk 23 Mar", "Wk 30 Mar"]);
    expect(trend.hours).toEqual([0, 8, 21.5, 0, 0, 0]);
  });

  it("groups half a year by month and several years by year", async () => {
    const { result } = await renderLoaded();
    await act(() => result.current.setRange({ start: "2026-01-01", end: "2026-06-30" }));
    expect(result.current.trend.granularity).toBe("monthly");
    expect(result.current.trend.categories).toEqual(["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026"]);
    expect(result.current.trend.hours).toEqual([0, 0, 29.5, 0, 0, 0]);

    await act(() => result.current.setRange({ start: "2024-01-01", end: "2026-12-31" }));
    expect(result.current.trend.granularity).toBe("yearly");
    expect(result.current.trend.categories).toEqual(["2024", "2025", "2026"]);
    expect(result.current.trend.hours).toEqual([0, 0, 29.5]);
  });

  it("is all zeros for a period without data", async () => {
    const { result } = await renderLoaded({ employees: [rawEmployee(AMINE)] });
    expect(result.current.current).toMatchObject({ hours: 0, gross: 0, net: 0, records: 0, lateRate: 0, absenceRate: 0, avgHoursPerEmployee: 0 });
    expect(result.current.error).toBe("");
  });

  it("shows an error when the worktime can't be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockReportingApi(WEEK);
    failGet("/worktime", 500);
    const { result } = renderHook(() => useReportingOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Failed to load the overview.");
  });

  it("keeps working without advances and bonuses, and warns that totals may be incomplete", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockReportingApi(WEEK);
    failGet("/advances", 500);
    failGet("/bonuses", 500);
    const { result } = renderHook(() => useReportingOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("");
    expect(result.current.current).toMatchObject({ gross: 3700, advances: 0, bonuses: 0, net: 3100 });
    await waitFor(() =>
      expect(toastMessages("warning").sort()).toEqual([
        "Advances couldn't be loaded, so the totals shown may be incomplete. Try refreshing.",
        "Bonuses couldn't be loaded, so the totals shown may be incomplete. Try refreshing.",
      ])
    );
  });

  it("stays silent when advances are switched off for the company (403)", async () => {
    mockReportingApi(WEEK);
    failGet("/advances", 403);
    const { result } = renderHook(() => useReportingOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.current.advances).toBe(0);
    await new Promise((r) => setTimeout(r, 20));
    expect(toastMessages()).toEqual([]);
  });

  it("clears a previous error when a new range loads", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockReportingApi(WEEK);
    failGet("/employees", 500);
    const { result } = renderHook(() => useReportingOverview());
    await waitFor(() => expect(result.current.error).not.toBe(""));
    mockReportingApi(WEEK);
    await act(() => result.current.setRange({ start: "2026-03-09", end: "2026-03-15" }));
    expect(result.current.error).toBe("");
    expect(result.current.current.gross).toBe(3700);
  });

  it("can be unmounted while loading", async () => {
    const errors = vi.spyOn(console, "error");
    mockReportingApi(WEEK);
    const { unmount } = renderHook(() => useReportingOverview());
    unmount();
    await new Promise((r) => setTimeout(r, 30));
    expect(errors).not.toHaveBeenCalled();
  });

  // BUG-501: the overview has no guard against an older, slower response
  it("shows the last range chosen when an earlier request answers late", async () => {
    const { result } = await renderLoaded();
    slowWorktimeFor("2026-02-01", 150, WEEK);
    let first!: Promise<void>;
    act(() => {
      first = result.current.setRange({ start: "2026-02-01", end: "2026-02-28" });
    });
    await act(() => result.current.setRange({ start: "2026-03-09", end: "2026-03-15" }));
    await act(() => first);
    expect(result.current.range).toEqual({ start: "2026-03-09", end: "2026-03-15" });
    expect(result.current.current.hours).toBe(21.5);
  });
});
