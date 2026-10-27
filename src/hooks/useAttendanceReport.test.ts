import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAttendanceReport } from "./useAttendanceReport";
import {
  AMINE,
  SARA,
  failGet,
  mockReportingApi,
  rangesRequested,
  rawEmployee,
  rawRow,
  fixTodayInEachTest,
  type ReportingData,
} from "@/components/reporting/__testutils__/reportingApi";

fixTodayInEachTest(); // Wednesday 2026-03-11 → default week = last Thursday 03-05 .. Wednesday 03-11

const DATA: ReportingData = {
  employees: [rawEmployee(AMINE), rawEmployee(SARA)],
  worktime: [
    rawRow({ emp_id: 101, work_date: "2026-03-05", late_minutes: 15 }),
    rawRow({ emp_id: 101, work_date: "2026-03-06" }),
    rawRow({ emp_id: 102, work_date: "2026-03-07", work_hours: 0, absent: true, absent_comment: "Sick" }),
    rawRow({ emp_id: 999, work_date: "2026-03-08", late_minutes: 5 }),
    rawRow({ emp_id: 101, work_date: "2026-03-02", late_minutes: 40 }),
  ],
};

async function renderLoaded(data: ReportingData = DATA) {
  const requests = mockReportingApi(data);
  const hook = renderHook(() => useAttendanceReport());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await waitFor(() => expect(requests.length).toBeGreaterThan(0));
  return { ...hook, requests };
}

describe("useAttendanceReport", () => {
  it("loads the Thursday-to-Wednesday week on open", async () => {
    const { result, requests } = await renderLoaded();
    expect(rangesRequested(requests, "/worktime")).toEqual(["2026-03-05..2026-03-11"]);
    expect(result.current.appliedRange).toEqual({ start: "2026-03-05", end: "2026-03-11" });
    expect(result.current.filterMode).toBe("week");
    expect(result.current.selectedDate).toBe("2026-03-05");
  });

  it("shows only lateness and absences by default, with names", async () => {
    const { result } = await renderLoaded();
    expect(result.current.rows.map((r) => [r.employeeName, r.work_date])).toEqual([
      ["Amine Kaci", "2026-03-05"],
      ["Sara Bel", "2026-03-07"],
      ["#999", "2026-03-08"],
    ]);
    expect(result.current.lateRows).toHaveLength(2);
    expect(result.current.absentRows.map((r) => r.absent_comment)).toEqual(["Sick"]);
    expect(result.current.stats).toEqual({ totalLateEvents: 2, totalAbsences: 1, totalLateMinutes: 20 });
  });

  it("shows every row when 'only issues' is off", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setOnlyIssues(false));
    expect(result.current.rows).toHaveLength(4);
    expect(result.current.stats.totalLateEvents).toBe(2);
  });

  it("loads a single day", async () => {
    const { result, requests } = await renderLoaded();
    act(() => {
      result.current.setFilterMode("day");
      result.current.setSelectedDate("2026-03-02");
    });
    await act(() => result.current.fetchReport());
    expect(rangesRequested(requests, "/worktime").at(-1)).toBe("2026-03-02..2026-03-02");
    expect(result.current.stats.totalLateMinutes).toBe(40);
  });

  it("loads 30 days from the chosen date in month mode", async () => {
    const { result, requests } = await renderLoaded();
    act(() => {
      result.current.setFilterMode("month");
      result.current.setSelectedDate("2026-03-02");
    });
    await act(() => result.current.fetchReport());
    expect(rangesRequested(requests, "/worktime").at(-1)).toBe("2026-03-02..2026-03-31");
  });

  it("loads a custom range", async () => {
    const { result, requests } = await renderLoaded();
    act(() => {
      result.current.setFilterMode("custom");
      result.current.setCustomStart("2026-03-01");
      result.current.setCustomEnd("2026-03-04");
    });
    await act(() => result.current.fetchReport());
    expect(rangesRequested(requests, "/worktime").at(-1)).toBe("2026-03-01..2026-03-04");
    expect(result.current.appliedRange).toEqual({ start: "2026-03-01", end: "2026-03-04" });
    expect(result.current.customStart).toBe("2026-03-01");
    expect(result.current.customEnd).toBe("2026-03-04");
  });

  it("asks for both dates of a custom range without calling the server", async () => {
    const { result, requests } = await renderLoaded();
    const before = requests.length;
    act(() => result.current.setFilterMode("custom"));
    await act(() => result.current.fetchReport());
    expect(result.current.error).toBe("Please provide a valid date range.");
    expect(requests.length).toBe(before);
  });

  it("shows an error and no rows when loading fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = await renderLoaded();
    failGet("/worktime", 500);
    await act(() => result.current.fetchReport());
    expect(result.current.error).toBe(
      "Couldn't load the attendance. Something went wrong on our side. Please try again in a moment."
    );
    expect(result.current.rows).toEqual([]);
  });

  // BUG-507: "YYYY-MM-DD" is parsed as UTC midnight, so west of UTC the week starts a day early
  it("starts the week on the chosen day in a time zone behind UTC", async () => {
    process.env.TZ = "America/New_York"; // restored by fixTodayInEachTest
    const requests = mockReportingApi(DATA);
    const { result } = renderHook(() => useAttendanceReport());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(result.current.selectedDate).toBe("2026-03-05");
    expect(rangesRequested(requests, "/worktime")).toEqual(["2026-03-05..2026-03-11"]);
  });
});
