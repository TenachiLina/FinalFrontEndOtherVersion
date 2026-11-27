import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { API, server } from "@/test/server";
import { ApiError } from "@/lib/errors";
import {
  closeMonth,
  EMPTY_TOTALS,
  emptyPayrollRow,
  fetchMonthStatus,
  fetchPayrollPeriod,
  fetchPayslipAmounts,
  reopenMonth,
  wholeMonthOf,
} from "./payrollApi";

const RANGE = { start: "2026-03-01", end: "2026-03-31" };

describe("fetchPayrollPeriod", () => {
  it("asks the server for the period and returns its lines and totals as they are", async () => {
    let asked = "";
    const row = { ...emptyPayrollRow(101), firstName: "Amine", gross: 4700, net: 3000 };
    server.use(
      http.get(`${API}/payroll/period`, ({ request }) => {
        asked = new URL(request.url).search;
        return HttpResponse.json({ ...RANGE, closed: true, rows: [row], totals: { gross: 4700, net: 3000 } });
      })
    );
    const period = await fetchPayrollPeriod(RANGE);
    expect(asked).toBe("?start=2026-03-01&end=2026-03-31");
    expect(period.rows).toEqual([row]);
    expect(period.closed).toBe(true);
    // Totals the server didn't send are 0, never undefined
    expect(period.totals).toEqual({ ...EMPTY_TOTALS, gross: 4700, net: 3000 });
  });

  it("asks for one employee with empId, also for employee number 0", async () => {
    const asked: (string | null)[] = [];
    server.use(
      http.get(`${API}/payroll/period`, ({ request }) => {
        asked.push(new URL(request.url).searchParams.get("empId"));
        return HttpResponse.json({ rows: [], totals: {} });
      })
    );
    await fetchPayrollPeriod(RANGE, 101);
    await fetchPayrollPeriod(RANGE, 0);
    await fetchPayrollPeriod(RANGE, null);
    expect(asked).toEqual(["101", "0", null]);
  });

  it("copes with an answer that has no lines or totals", async () => {
    server.use(http.get(`${API}/payroll/period`, () => HttpResponse.json({})));
    expect(await fetchPayrollPeriod(RANGE)).toEqual({ ...RANGE, closed: false, rows: [], totals: EMPTY_TOTALS });
  });

  it("throws the server's error", async () => {
    server.use(
      http.get(`${API}/payroll/period`, () => HttpResponse.json({ message: "start must be on or before end" }, { status: 400 }))
    );
    await expect(fetchPayrollPeriod(RANGE)).rejects.toEqual(new ApiError(400, "start must be on or before end"));
  });
});

describe("emptyPayrollRow", () => {
  it("is a line of zeros for that employee", () => {
    const row = emptyPayrollRow(7);
    expect(row.empId).toBe(7);
    expect(row.advanceId).toBeNull();
    expect(Object.values(row).filter((v) => typeof v === "number" && v !== 7)).toEqual(
      expect.arrayContaining([0])
    );
    expect(row.gross + row.net + row.hours + row.advanceOffer).toBe(0);
  });
});

describe("fetchPayslipAmounts", () => {
  it("returns each employee's amounts by employee number", async () => {
    let asked = "";
    const slip = { employeeId: "e1", empId: 101, days: 30, baseSalary: 24000, postSalary: 24000, socialSecurity: 2160, net: 21840 };
    server.use(
      http.get(`${API}/payroll/payslips`, ({ request }) => {
        asked = new URL(request.url).search;
        return HttpResponse.json({ month: "2026-05", payslips: [slip] });
      })
    );
    const map = await fetchPayslipAmounts("2026-05");
    expect(asked).toBe("?month=2026-05");
    expect(map.get("101")).toEqual(slip);
    expect(map.size).toBe(1);
  });

  it("is empty when the server sends no list, and throws its errors", async () => {
    server.use(http.get(`${API}/payroll/payslips`, () => HttpResponse.json({})));
    expect((await fetchPayslipAmounts("2026-05")).size).toBe(0);
    server.use(http.get(`${API}/payroll/payslips`, () => HttpResponse.json({ message: "No" }, { status: 403 })));
    await expect(fetchPayslipAmounts("2026-05")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("wholeMonthOf", () => {
  it.each([
    [{ start: "2026-03-01", end: "2026-03-31" }, "2026-03"],
    [{ start: "2026-02-01", end: "2026-02-28" }, "2026-02"],
    [{ start: "2028-02-01", end: "2028-02-29" }, "2028-02"],
    [{ start: "2026-12-01", end: "2026-12-31" }, "2026-12"],
  ])("%o is the month %s", (range, month) => {
    expect(wholeMonthOf(range)).toBe(month);
  });

  it.each([
    { start: "2026-03-02", end: "2026-03-31" },
    { start: "2026-03-01", end: "2026-03-30" },
    { start: "2026-03-01", end: "2026-04-30" },
    { start: "2026-03-09", end: "2026-03-15" },
    { start: "", end: "" },
  ])("%o is not a whole month", (range) => {
    expect(wholeMonthOf(range)).toBeNull();
  });
});

describe("month closing calls", () => {
  const status = { month: "2026-02", closed: true };

  it("reads a month's state", async () => {
    server.use(http.get(`${API}/payroll/closings/2026-02`, () => HttpResponse.json(status)));
    expect(await fetchMonthStatus("2026-02")).toEqual(status);
  });

  it("closes and reopens with a POST", async () => {
    const calls: string[] = [];
    server.use(
      http.post(`${API}/payroll/closings/:month/:action`, ({ params }) => {
        calls.push(`${params.action} ${params.month}`);
        return HttpResponse.json(status, { status: 201 });
      })
    );
    expect(await closeMonth("2026-02")).toEqual(status);
    expect(await reopenMonth("2026-02")).toEqual(status);
    expect(calls).toEqual(["close 2026-02", "reopen 2026-02"]);
  });

  it("throws the server's refusal", async () => {
    server.use(
      http.get(`${API}/payroll/closings/:month`, () => HttpResponse.json({ message: "No" }, { status: 403 })),
      http.post(`${API}/payroll/closings/:month/:action`, () =>
        HttpResponse.json({ message: "This month is not over yet" }, { status: 400 })
      )
    );
    await expect(fetchMonthStatus("2026-02")).rejects.toBeInstanceOf(ApiError);
    await expect(closeMonth("2026-02")).rejects.toEqual(new ApiError(400, "This month is not over yet"));
    await expect(reopenMonth("2026-02")).rejects.toEqual(new ApiError(400, "This month is not over yet"));
  });
});
