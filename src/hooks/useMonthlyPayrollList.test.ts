import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useMonthlyPayrollList } from "./useMonthlyPayrollList";
import {
  AMINE,
  NADIA,
  SARA,
  failGet,
  mockReportingApi,
  plan,
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

fixTodayInEachTest(); // 2026-03-11 → March
clearFeedbackAfterEachTest();

// Amine 200 DA/h, Sara 100 DA/h, Nadia 125 DA/h
const MARCH: ReportingData = {
  employees: [rawEmployee(AMINE), rawEmployee(SARA), rawEmployee(NADIA)],
  planning: [plan(101, "2026-03-02"), plan(102, "2026-03-09"), plan(101, "2026-02-10")],
  worktime: [
    rawRow({ emp_id: 101, work_date: "2026-03-02", work_hours: "08:00:00", penalty: 150, late_minutes: 5 }),
    rawRow({ emp_id: 101, work_date: "2026-03-09", work_hours: "08:00:00", consommation: 300 }),
    rawRow({ emp_id: 101, work_date: "2026-03-10", work_hours: "07:30:00" }),
    rawRow({ emp_id: 101, work_date: "2026-03-20", work_hours: 0, absent: true }),
    rawRow({ emp_id: 102, work_date: "2026-03-09", work_hours: "06:00", consommation: 100 }),
    rawRow({ emp_id: 102, work_date: "2026-03-12", work_hours: "04:30" }),
    // Nadia worked but has no planning entry this month
    rawRow({ emp_id: 103, work_date: "2026-03-12", work_hours: "08:00" }),
    // February
    rawRow({ emp_id: 101, work_date: "2026-02-10", work_hours: "04:00" }),
  ],
  advances: [
    rawAdvance({ emp_id: 101, amount: 1000, date: "2026-03-10" }),
    rawAdvance({ emp_id: 101, amount: 500, date: "2026-03-03" }),
    rawAdvance({ emp_id: 102, amount: 200, date: "2026-03-16" }),
    rawAdvance({ emp_id: 101, amount: 9999, date: "2026-02-27" }),
  ],
  bonuses: [rawBonus({ emp_id: 101, amount: 250, date: "2026-03-05" })],
};

async function renderLoaded(data: ReportingData = MARCH, initial?: { start: string; end: string }) {
  const requests = mockReportingApi(data);
  const hook = renderHook(() => useMonthlyPayrollList(initial));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return { ...hook, requests };
}

describe("useMonthlyPayrollList", () => {
  it("loads the current month by default", async () => {
    const { result, requests } = await renderLoaded();
    expect(result.current.range).toEqual({ start: "2026-03-01", end: "2026-03-31" });
    expect(rangesRequested(requests, "/worktime")).toEqual(["2026-03-01..2026-03-31"]);
    expect(rangesRequested(requests, "/advances")).toEqual(["2026-03-01..2026-03-31"]);
    expect(rangesRequested(requests, "/bonuses")).toEqual(["2026-03-01..2026-03-31"]);
    expect(result.current.monthLabel).toBe("March 2026");
  });

  it("computes each scheduled employee's gross and net pay", async () => {
    const { result } = await renderLoaded();
    expect(result.current.payrollRows).toEqual([
      {
        // 23.5 h × 200 = 4700; net = 4700 − 150 − 300 − 1500 + 250 = 3000
        empId: 101, firstName: "Amine", lastName: "Kaci", baseSalary: 41600, hourlyRate: 200,
        hours: 23.5, brut: 4700, penalties: 150, consommation: 300, advancesDeducted: 1500, bonuses: 250, net: 3000, absences: 1,
      },
      {
        // 10.5 h × 100 = 1050; net = 1050 − 100 − 200 = 750
        empId: 102, firstName: "Sara", lastName: "Bel", baseSalary: 20800, hourlyRate: 100,
        hours: 10.5, brut: 1050, penalties: 0, consommation: 100, advancesDeducted: 200, bonuses: 0, net: 750, absences: 0,
      },
    ]);
  });

  it("adds up the totals", async () => {
    const { result } = await renderLoaded();
    expect(result.current.totals).toEqual({ totalBrut: "5750.00", totalNet: "3750.00", totalAdvances: "1700.00", totalBonuses: "250.00" });
  });

  it("filters by name, ignoring case, and the totals follow", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setSearch("SARA b"));
    expect(result.current.payrollRows.map((r) => r.empId)).toEqual([102]);
    expect(result.current.totals.totalNet).toBe("750.00");
  });

  it("opens on the month passed in", async () => {
    const { result, requests } = await renderLoaded(MARCH, { start: "2026-02-01", end: "2026-02-28" });
    expect(rangesRequested(requests, "/worktime")).toEqual(["2026-02-01..2026-02-28"]);
    expect(result.current.monthLabel).toBe("February 2026");
    // 4 h × 200 = 800, − 9999 advance = −9199
    expect(result.current.payrollRows).toEqual([expect.objectContaining({ empId: 101, hours: 4, brut: 800, net: -9199 })]);
  });

  it("loads another month", async () => {
    const { result } = await renderLoaded();
    await act(() => result.current.setRange({ start: "2026-02-01", end: "2026-02-28" }));
    expect(result.current.range).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(result.current.payrollRows.map((r) => r.empId)).toEqual([101]);
  });

  it("reloads the same month when called without a range", async () => {
    const { result, requests } = await renderLoaded();
    await act(() => result.current.setRange());
    expect(rangesRequested(requests, "/worktime")).toEqual(["2026-03-01..2026-03-31", "2026-03-01..2026-03-31"]);
  });

  it("is empty when nobody is scheduled", async () => {
    const { result } = await renderLoaded({ ...MARCH, planning: [] });
    expect(result.current.payrollRows).toEqual([]);
    expect(result.current.totals.totalNet).toBe("0.00");
  });

  it("shows an error when the worktime can't be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockReportingApi(MARCH);
    failGet("/worktime", 500);
    const { result } = renderHook(() => useMonthlyPayrollList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(
      "Couldn't load the monthly payroll. Something went wrong on our side. Please try again in a moment."
    );
  });

  it("pays without advances and bonuses when they can't be loaded, and warns", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockReportingApi(MARCH);
    failGet("/advances", 500);
    failGet("/bonuses", 500);
    const { result } = renderHook(() => useMonthlyPayrollList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.payrollRows.map((r) => r.net)).toEqual([4250, 950]);
    await waitFor(() => expect(toastMessages("warning")).toHaveLength(2));
  });

  // BUG-502: when the planning can't be loaded, every employee disappears from the payroll
  it.fails("still lists the employees who worked when the planning can't be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockReportingApi(MARCH);
    failGet("/planning", 500);
    const { result } = renderHook(() => useMonthlyPayrollList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.payrollRows.map((r) => r.empId)).toEqual(expect.arrayContaining([101, 102]));
  });

  // BUG-506: hours worked by someone without a planning entry are never paid
  it.fails("pays an employee who worked in the month even without a planning entry", async () => {
    const { result } = await renderLoaded();
    expect(result.current.payrollRows.find((r) => r.empId === 103)).toMatchObject({ hours: 8, brut: 1000, net: 1000 });
  });

  // BUG-501: no guard against an older, slower response
  it.fails("shows the last month chosen when an earlier request answers late", async () => {
    const { result } = await renderLoaded();
    slowWorktimeFor("2026-01-01", 150, MARCH);
    let first!: Promise<void>;
    act(() => {
      first = result.current.setRange({ start: "2026-01-01", end: "2026-01-31" });
    });
    await act(() => result.current.setRange({ start: "2026-03-01", end: "2026-03-31" }));
    await act(() => first);
    expect(result.current.range.start).toBe("2026-03-01");
    expect(result.current.payrollRows).toHaveLength(2);
  });
});
