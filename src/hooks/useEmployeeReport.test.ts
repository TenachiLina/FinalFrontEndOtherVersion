import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, delay, http } from "msw";
import { API, server } from "@/test/server";
import { useEmployeeReport } from "./useEmployeeReport";
import {
  AMINE,
  SARA,
  captureWrites,
  failGet,
  mockReportingApi,
  rangesRequested,
  rawAdvance,
  rawBonus,
  rawEmployee,
  rawRow,
  toastMessages,
  clearFeedbackAfterEachTest,
  fixTodayInEachTest,
  type ReportingData,
} from "@/components/reporting/__testutils__/reportingApi";

fixTodayInEachTest(); // Wednesday 2026-03-11 → week 03-09..03-15, month March
clearFeedbackAfterEachTest();

// Amine: 200 DA/h
const DATA: ReportingData = {
  employees: [rawEmployee(AMINE), rawEmployee(SARA)],
  worktime: [
    rawRow({ emp_id: 101, work_date: "2026-03-02", work_hours: "08:00:00", penalty: 150, late_minutes: 5 }),
    rawRow({ emp_id: 101, work_date: "2026-03-09", work_hours: "08:00:00", consommation: 300 }),
    rawRow({ emp_id: 101, work_date: "2026-03-10", work_hours: "07:30:00" }),
    rawRow({ emp_id: 101, work_date: "2026-03-20", work_hours: 0, absent: true }),
    // Another employee: the API returns it even with ?empId=101
    rawRow({ emp_id: 102, work_date: "2026-03-09", work_hours: "06:00:00", consommation: 999 }),
  ],
  advances: [
    rawAdvance({ _id: "adv-mar-3", emp_id: 101, amount: 500, date: "2026-03-03" }),
    rawAdvance({ _id: "adv-feb", emp_id: 101, amount: 700, date: "2026-02-20" }),
  ],
  bonuses: [
    rawBonus({ emp_id: 101, amount: 250, date: "2026-03-05", reason: "Perfect attendance" }),
    rawBonus({ emp_id: 102, amount: 500, date: "2026-03-06" }),
  ],
};

async function renderReport(data: ReportingData = DATA, empId: number | string = 101, initial?: Parameters<typeof useEmployeeReport>[1]) {
  const requests = mockReportingApi(data);
  const hook = renderHook(() => useEmployeeReport(empId, initial));
  await waitFor(() => {
    expect(hook.result.current.loadingEmployee).toBe(false);
    expect(hook.result.current.week.loading).toBe(false);
    expect(hook.result.current.month.loading).toBe(false);
    expect(hook.result.current.week.isLoadingAdvance).toBe(false);
  });
  return { ...hook, requests };
}

describe("useEmployeeReport — employee", () => {
  it("finds the employee and their hourly rate (41 600 / 8 / 26 = 200)", async () => {
    const { result } = await renderReport();
    expect(result.current.employee).toMatchObject({ emp_id: 101, FirstName: "Amine", LastName: "Kaci" });
    expect(result.current.hourlyRate).toBe(200);
  });

  it("has no employee and a zero rate for an unknown id", async () => {
    const { result } = await renderReport(DATA, 999);
    expect(result.current.employee).toBeNull();
    expect(result.current.hourlyRate).toBe(0);
    expect(result.current.week.rows).toEqual([]);
  });

  it("stops loading when the employees can't be fetched", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockReportingApi(DATA);
    failGet("/employees", 500);
    const { result } = renderHook(() => useEmployeeReport(101));
    await waitFor(() => expect(result.current.loadingEmployee).toBe(false));
    expect(result.current.employee).toBeNull();
  });
});

describe("useEmployeeReport — weekly advance", () => {
  it("loads this week's rows for this employee only", async () => {
    const { result, requests } = await renderReport();
    expect(result.current.week.range).toEqual({ start: "2026-03-09", end: "2026-03-15" });
    expect(requests.some((u) => u.pathname === "/worktime" && u.searchParams.get("empId") === "101")).toBe(true);
    expect(result.current.week.rows.map((r) => r.work_date)).toEqual(["2026-03-09", "2026-03-10"]);
  });

  it("offers half of what was earned after consumption", async () => {
    const { result } = await renderReport();
    // 15.5 h × 200 = 3100, − 300 consumption = 2800, × 0.5 = 1400
    expect(result.current.week.hours).toBe(15.5);
    expect(result.current.week.consommation).toBe(300);
    expect(result.current.week.advanceOffer).toBe(1400);
    expect(result.current.week.advanceGiven).toBe(false);
  });

  it("opens on the week passed in", async () => {
    const { result, requests } = await renderReport(DATA, 101, { week: { start: "2026-03-02", end: "2026-03-08" } });
    expect(rangesRequested(requests, "/worktime")[0]).toBe("2026-03-02..2026-03-08");
    expect(result.current.week.range).toEqual({ start: "2026-03-02", end: "2026-03-08" });
    expect(result.current.week.hours).toBe(8);
  });

  it("knows an advance was already given for the week", async () => {
    const { result, requests } = await renderReport({
      ...DATA,
      advances: [rawAdvance({ _id: "adv-week", emp_id: 101, amount: 1400, date: "2026-03-09" })],
    });
    expect(rangesRequested(requests, "/advances/employee/101")).toContain("2026-03-09..2026-03-15");
    expect(result.current.week.advanceGiven).toBe(true);
  });

  it("treats a failed advance check as 'not given'", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockReportingApi(DATA);
    failGet("/advances/employee/:id", 500);
    const { result } = renderHook(() => useEmployeeReport(101));
    await waitFor(() => expect(result.current.week.isLoadingAdvance).toBe(false));
    expect(result.current.week.advanceGiven).toBe(false);
  });

  it("gives the offered advance, dated on the first day of the week", async () => {
    const { result } = await renderReport();
    const posts = captureWrites("post", "/advances", () => HttpResponse.json({ _id: "new-adv" }));
    await act(() => result.current.week.giveAdvance());
    expect(posts.map((p) => p.body)).toEqual([
      { emp_id: 101, amount: 1400, date: "2026-03-09", reason: "Weekly advance (2026-03-09 to 2026-03-15)" },
    ]);
    expect(result.current.week.advanceGiven).toBe(true);
    expect(toastMessages("success")).toEqual(["Advance given."]);
  });

  it("shows the server's reason when the advance is refused", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = await renderReport();
    captureWrites("post", "/advances", () => HttpResponse.json({ message: "Advances are closed" }, { status: 400 }));
    await act(() => result.current.week.giveAdvance());
    expect(result.current.week.advanceGiven).toBe(false);
    expect(toastMessages("error")).toEqual(["Couldn't give the advance. Advances are closed"]);
  });

  it("revokes the advance it just gave", async () => {
    const { result } = await renderReport();
    captureWrites("post", "/advances", () => HttpResponse.json({ _id: "new-adv" }));
    const deletes = captureWrites("delete", "/advances/:id");
    await act(() => result.current.week.giveAdvance());
    await act(() => result.current.week.revokeAdvance());
    expect(deletes.map((d) => d.url)).toEqual(["https://api.test/advances/new-adv"]);
    expect(result.current.week.advanceGiven).toBe(false);
  });

  it("does nothing on revoke when no advance was given", async () => {
    const { result } = await renderReport();
    const deletes = captureWrites("delete", "/advances/:id");
    await act(() => result.current.week.revokeAdvance());
    expect(deletes).toEqual([]);
  });

  it("puts the advance back when the revoke fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = await renderReport({ ...DATA, advances: [rawAdvance({ _id: "adv-week", emp_id: 101, date: "2026-03-09" })] });
    captureWrites("delete", "/advances/:id", () => HttpResponse.json({}, { status: 500 }));
    await act(() => result.current.week.revokeAdvance());
    expect(result.current.week.advanceGiven).toBe(true);
  });

  // BUG-505: a failed revoke is silent: the advance just reappears, with no message
  it.fails("tells the user when the revoke fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = await renderReport({ ...DATA, advances: [rawAdvance({ _id: "adv-week", emp_id: 101, date: "2026-03-09" })] });
    captureWrites("delete", "/advances/:id", () => HttpResponse.json({}, { status: 500 }));
    await act(() => result.current.week.revokeAdvance());
    expect(toastMessages("error")).toEqual([
      "Couldn't remove the advance. Something went wrong on our side. Please try again in a moment.",
    ]);
  });

  // BUG-503: when consumption is higher than what was earned, the offer is negative and is sent as is
  it.fails("never sends an advance of zero or less", async () => {
    const { result } = await renderReport({
      employees: [rawEmployee(AMINE)],
      worktime: [rawRow({ emp_id: 101, work_date: "2026-03-09", work_hours: "08:00", consommation: 2000 })],
    });
    // 8 h × 200 = 1600, − 2000 consumption = −400, × 0.5 = −200
    expect(result.current.week.advanceOffer).toBe(-200);
    const posts = captureWrites("post", "/advances", () => HttpResponse.json({ _id: "neg" }));
    await act(() => result.current.week.giveAdvance());
    expect(posts).toEqual([]);
    expect(result.current.week.advanceGiven).toBe(false);
  });

  it("loads another week", async () => {
    const { result, requests } = await renderReport();
    await act(() => result.current.week.setRange({ start: "2026-03-02", end: "2026-03-08" }));
    expect(rangesRequested(requests, "/worktime")).toContain("2026-03-02..2026-03-08");
    expect(result.current.week.range).toEqual({ start: "2026-03-02", end: "2026-03-08" });
    expect(result.current.week.hours).toBe(8);
    expect(result.current.week.advanceOffer).toBe(800);
  });

  it("ignores a slow answer for a week that is no longer selected", async () => {
    const { result } = await renderReport();
    // The first request (week of 03-02) answers after the second one (week of 03-16)
    server.use(
      http.get(`${API}/worktime`, async ({ request }) => {
        if (new URL(request.url).searchParams.get("start") !== "2026-03-02") return undefined;
        await delay(100);
        return HttpResponse.json([rawRow({ emp_id: 101, work_date: "2026-03-02", work_hours: "05:00" })]);
      })
    );
    let first!: Promise<void>;
    act(() => {
      first = result.current.week.setRange({ start: "2026-03-02", end: "2026-03-08" });
    });
    await act(() => result.current.week.setRange({ start: "2026-03-16", end: "2026-03-22" }));
    await act(() => first);
    expect(result.current.week.range).toEqual({ start: "2026-03-16", end: "2026-03-22" });
    expect(result.current.week.hours).toBe(0);
    expect(result.current.week.loading).toBe(false);
  });

  it("shows an error and no rows when the week can't be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = await renderReport();
    failGet("/worktime", 500);
    await act(() => result.current.week.setRange({ start: "2026-03-02", end: "2026-03-08" }));
    expect(result.current.week.error).toBe(
      "Couldn't load this week. Something went wrong on our side. Please try again in a moment."
    );
    expect(result.current.week.rows).toEqual([]);
    expect(result.current.week.loading).toBe(false);
  });
});

describe("useEmployeeReport — monthly payroll", () => {
  it("computes the month's take-home pay", async () => {
    const { result } = await renderReport();
    const m = result.current.month;
    // hours 8 + 8 + 7.5 = 23.5 → gross 23.5 × 200 = 4700
    // net = 4700 − 150 penalty − 300 consumption − 500 advance + 250 bonus = 4000
    expect(m.range).toEqual({ start: "2026-03-01", end: "2026-03-31" });
    expect(m.hours).toBe(23.5);
    expect(m.penalties).toBe(150);
    expect(m.consommation).toBe(300);
    expect(m.absences).toBe(1);
    expect(m.lateMinutes).toBe(5);
    expect(m.advancesTotal).toBe(500);
    expect(m.advancesList).toEqual([{ date: "2026-03-03", amount: 500 }]);
    expect(m.bonusesTotal).toBe(250);
    expect(m.bonusesList).toEqual([{ date: "2026-03-05", amount: 250, reason: "Perfect attendance" }]);
    expect(m.payout).toEqual({ brut: 4700, net: 4000 });
  });

  it("opens on the month passed in", async () => {
    const { result } = await renderReport(DATA, 101, { month: { start: "2026-02-01", end: "2026-02-28" } });
    expect(result.current.month.range).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    // No hours in February, only the 700 DA advance → net −700
    expect(result.current.month.advancesTotal).toBe(700);
    expect(result.current.month.payout).toEqual({ brut: 0, net: -700 });
  });

  it("loads another month", async () => {
    const { result } = await renderReport();
    await act(() => result.current.month.setRange({ start: "2026-02-01", end: "2026-02-28" }));
    expect(result.current.month.range.start).toBe("2026-02-01");
    expect(result.current.month.hours).toBe(0);
  });

  it("still shows the pay without advances or bonuses when they can't be loaded, with a warning", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockReportingApi(DATA);
    failGet("/advances/employee/:id", 500);
    failGet("/bonuses", 500);
    const { result } = renderHook(() => useEmployeeReport(101));
    await waitFor(() => expect(result.current.month.hours).toBe(23.5));
    await waitFor(() => expect(result.current.month.loading).toBe(false));
    expect(result.current.month.error).toBe("");
    expect(result.current.month.payout).toEqual({ brut: 4700, net: 4250 });
    await waitFor(() => expect(toastMessages("warning").length).toBe(2));
  });

  it("shows an error when the month can't be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = await renderReport();
    failGet("/worktime", 503);
    await act(() => result.current.month.setRange({ start: "2026-02-01", end: "2026-02-28" }));
    expect(result.current.month.error).toBe(
      "Couldn't load this month. Something went wrong on our side. Please try again in a moment."
    );
    expect(result.current.month.rows).toEqual([]);
  });

  it("can be unmounted while loading", async () => {
    const errors = vi.spyOn(console, "error");
    mockReportingApi(DATA);
    const { unmount } = renderHook(() => useEmployeeReport(101));
    unmount();
    await new Promise((r) => setTimeout(r, 30));
    expect(errors).not.toHaveBeenCalled();
  });
});
