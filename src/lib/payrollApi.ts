// ─────────────────────────────────────────────────────────────────────────
// Pay, as calculated by the server (GET /payroll/*).
//
// The reporting pages show these numbers as they are: no formula lives in
// the app, so the web and the mobile app always agree.
// ─────────────────────────────────────────────────────────────────────────
import { DateRange } from "@/components/reporting/types";
import { API_BASE_URL } from "@/lib/config";
import { ensureOk } from "@/lib/errors";

/** One employee's pay for a period. Amounts are already rounded to two decimals. */
export interface PayrollRow {
  employeeId: string;
  empId: number | string;
  firstName: string;
  lastName: string;
  baseSalary: number;
  /** Has a planning entry in the period */
  scheduled: boolean;
  hourlyRate: number;
  hours: number;
  /** hours × hourly rate */
  gross: number;
  penalties: number;
  consommation: number;
  absences: number;
  lateMinutes: number;
  lateDays: number;
  overtimeMinutes: number;
  records: number;
  advances: number;
  advancesCount: number;
  /** The advance to remove when the weekly advance is taken back */
  advanceId: string | null;
  bonuses: number;
  bonusesCount: number;
  /** gross − penalties − consumption − advances + bonuses */
  net: number;
  /** The weekly advance the employee may be offered */
  advanceOffer: number;
}

export interface PayrollTotals {
  hours: number;
  gross: number;
  penalties: number;
  consommation: number;
  advances: number;
  advancesCount: number;
  bonuses: number;
  bonusesCount: number;
  net: number;
  absences: number;
  lateMinutes: number;
  lateDays: number;
  overtimeMinutes: number;
  records: number;
  activeEmployees: number;
  employees: number;
}

export interface PayrollPeriod {
  start: string;
  end: string;
  /** The period is a closed month: these are the numbers frozen when it closed */
  closed: boolean;
  rows: PayrollRow[];
  totals: PayrollTotals;
}

export const EMPTY_TOTALS: PayrollTotals = {
  hours: 0,
  gross: 0,
  penalties: 0,
  consommation: 0,
  advances: 0,
  advancesCount: 0,
  bonuses: 0,
  bonusesCount: 0,
  net: 0,
  absences: 0,
  lateMinutes: 0,
  lateDays: 0,
  overtimeMinutes: 0,
  records: 0,
  activeEmployees: 0,
  employees: 0,
};

/** A line of zeros, for an employee the period has nothing about. */
export function emptyPayrollRow(empId: number | string): PayrollRow {
  return {
    employeeId: "",
    empId,
    firstName: "",
    lastName: "",
    baseSalary: 0,
    scheduled: false,
    hourlyRate: 0,
    hours: 0,
    gross: 0,
    penalties: 0,
    consommation: 0,
    absences: 0,
    lateMinutes: 0,
    lateDays: 0,
    overtimeMinutes: 0,
    records: 0,
    advances: 0,
    advancesCount: 0,
    advanceId: null,
    bonuses: 0,
    bonusesCount: 0,
    net: 0,
    advanceOffer: 0,
  };
}

/** Every employee's pay for the period, or one employee's with `empId`. */
export async function fetchPayrollPeriod(
  range: DateRange,
  empId?: number | string | null
): Promise<PayrollPeriod> {
  const params = new URLSearchParams({ start: range.start, end: range.end });
  if (empId !== undefined && empId !== null) params.set("empId", String(empId));
  const res = await fetch(`${API_BASE_URL}/payroll/period?${params}`);
  await ensureOk(res);
  const data = await res.json();
  return {
    start: data.start ?? range.start,
    end: data.end ?? range.end,
    closed: data.closed === true,
    rows: Array.isArray(data.rows) ? data.rows : [],
    totals: { ...EMPTY_TOTALS, ...(data.totals ?? {}) },
  };
}

/** The amounts of one fiche de paie. */
export interface PayslipAmounts {
  employeeId: string;
  empId: number | string;
  days: number;
  baseSalary: number;
  postSalary: number;
  socialSecurity: number;
  net: number;
}

/** Payslip amounts of every employee for a month ("YYYY-MM"), by employee number. */
export async function fetchPayslipAmounts(month: string): Promise<Map<string, PayslipAmounts>> {
  const res = await fetch(`${API_BASE_URL}/payroll/payslips?month=${encodeURIComponent(month)}`);
  await ensureOk(res);
  const data = await res.json();
  const list: PayslipAmounts[] = Array.isArray(data.payslips) ? data.payslips : [];
  return new Map(list.map((p) => [String(p.empId), p]));
}

// ── Month closing ──────────────────────────────────────────────────────────

/** Whether a month ("YYYY-MM") is closed: its hours and pay can then no longer change. */
export interface MonthStatus {
  month: string;
  closed: boolean;
  /** Closed by itself after the company's delay */
  auto: boolean;
  closedAt: string | null;
  closedBy: string | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
  /** When the month will close by itself; null when it won't */
  closesAt: string | null;
  /** The month is over, so an admin may close it now */
  canClose: boolean;
}

/** "YYYY-MM" when the range is exactly one calendar month, otherwise null. */
export function wholeMonthOf(range: DateRange): string | null {
  if (!/^\d{4}-\d{2}-01$/.test(range.start)) return null;
  const month = range.start.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return range.end === `${month}-${String(last).padStart(2, "0")}` ? month : null;
}

export async function fetchMonthStatus(month: string): Promise<MonthStatus> {
  const res = await fetch(`${API_BASE_URL}/payroll/closings/${month}`);
  await ensureOk(res);
  return (await res.json()) as MonthStatus;
}

export async function closeMonth(month: string): Promise<MonthStatus> {
  const res = await fetch(`${API_BASE_URL}/payroll/closings/${month}/close`, { method: "POST" });
  await ensureOk(res);
  return (await res.json()) as MonthStatus;
}

export async function reopenMonth(month: string): Promise<MonthStatus> {
  const res = await fetch(`${API_BASE_URL}/payroll/closings/${month}/reopen`, { method: "POST" });
  await ensureOk(res);
  return (await res.json()) as MonthStatus;
}
