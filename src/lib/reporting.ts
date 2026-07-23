import {
  WorktimeRow,
  WorktimeRowRaw,
  DateRange,
  Employee,
  EmployeeRaw,
  AdvanceRecord,
  AdvanceRecordRaw,
} from "@/components/reporting/types";

// ⚠️ Adjust to match your real API base / env var if different.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";

// ─────────────────────────────────────────────────────────────────────────
// Time / date helpers (ported from old ReportingContent.jsx)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Format a Date as "YYYY-MM-DD" using its LOCAL date components.
 * ⚠️ Never use `date.toISOString().split("T")[0]` for this — toISOString()
 * converts to UTC first, which silently shifts the date backward by one
 * day for any timezone ahead of UTC (e.g. midnight June 1st local time
 * becomes "2026-05-31" after UTC conversion). This was a real, confirmed
 * bug in the original range helpers below.
 */
export function toLocalDateString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Convert "HH:MM:SS" | "HH:MM" | decimal string | number -> decimal hours. */
export function timeToDecimalHours(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;

  const str = String(value).trim();
  if (str === "" || str === "00:00" || str === "00:00:00") return 0;

  if (!str.includes(":")) {
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  }

  const parts = str.split(":");
  if (parts.length === 3) {
    const [h, m, s] = parts.map((p) => parseInt(p, 10));
    if (isNaN(h) || isNaN(m) || isNaN(s)) return 0;
    return h + m / 60 + s / 3600;
  }
  if (parts.length === 2) {
    const [h, m] = parts.map((p) => parseInt(p, 10));
    if (isNaN(h) || isNaN(m)) return 0;
    return h + m / 60;
  }
  return 0;
}

/** Normalize a raw API row into the clean WorktimeRow shape.
 *  ⚠️ THIS is the single place to edit once the real Mongo field names
 *  are confirmed — everything else consumes WorktimeRow only.
 */
export function normalizeRow(raw: WorktimeRowRaw): WorktimeRow {
  const empId = raw.emp_id ?? raw.empId ?? "";
  const workDateRaw = raw.work_date ?? raw.workDate ?? "";
  const workDate = workDateRaw ? String(workDateRaw).split("T")[0] : "";
  const consommation = raw.consommation ?? raw.consomation ?? 0;

  return {
    emp_id: empId as number | string,
    work_date: workDate,
    work_hours: (raw.work_hours as string | number | null) ?? null,
    late_minutes: Number(raw.late_minutes || 0),
    overtime_minutes: Number(raw.overtime_minutes || 0),
    penalty: Number(raw.penalty || 0),
    consommation: Number(consommation || 0),
    absent: raw.absent ? 1 : 0,
    absent_comment: raw.absent_comment || "",
    is_empty: false,
  };
}

/** Normalize a raw employee document into the shape the app uses.
 *  ⚠️ THIS is the only place to edit if the real Mongo field names for
 *  employees ever change — confirmed live: empNumber, firstName, lastName,
 *  baseSalary (NOT the old MySQL-style emp_id/FirstName/Base_salary).
 */
export function normalizeEmployee(raw: EmployeeRaw): Employee {
  return {
    emp_id: raw.empNumber ?? raw._id ?? "",
    FirstName: raw.firstName || "",
    LastName: raw.lastName || "",
    Base_salary: Number(raw.baseSalary || 0),
    _visible: true,
  };
}

/** Normalize a raw advance row. */
export function normalizeAdvance(raw: AdvanceRecordRaw, employees: Employee[]): AdvanceRecord {
  const empId = raw.emp_id ?? raw.empId ?? "";
  const employee = employees.find((e) => String(e.emp_id) === String(empId));
  return {
    id: raw._id,
    empId: empId as number | string,
    employee,
    amount: Number(raw.Advances_amount ?? raw.amount ?? 0),
    date: String(raw.Advances_date ?? raw.date ?? "").split("T")[0],
    reason: String(raw.Advances_reason ?? raw.reason ?? ""),
  };
}

/** Generate every "YYYY-MM-DD" date string between start and end (inclusive). */
export function generateDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let current = new Date(start);
  const last = new Date(end);
  while (current <= last) {
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, "0");
    const dd = String(current.getDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/** Fill missing days in the range with empty placeholder rows (single-employee view only). */
export function fillMissingDates(rows: WorktimeRow[], range: DateRange): WorktimeRow[] {
  if (!range.start || !range.end) return [];
  const allDates = generateDateRange(range.start, range.end);

  return allDates.map((d) => {
    const existing = rows.find((r) => r.work_date === d);
    if (existing) return existing;
    return {
      emp_id: "",
      work_date: d,
      work_hours: null,
      late_minutes: 0,
      overtime_minutes: 0,
      penalty: 0,
      consommation: 0,
      absent: 0,
      absent_comment: "",
      is_empty: true,
    };
  });
}

/** Returns the last Thursday -> following Wednesday range (old default week). */
export function getLastWeekRange(): DateRange {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday ... 4 = Thursday
  const daysToLastThursday = dayOfWeek >= 4 ? dayOfWeek - 4 : dayOfWeek + 3;

  const lastThursday = new Date(today);
  lastThursday.setDate(today.getDate() - daysToLastThursday);

  const endOfWeek = new Date(lastThursday);
  endOfWeek.setDate(lastThursday.getDate() + 6);

  return {
    start: toLocalDateString(lastThursday),
    end: toLocalDateString(endOfWeek),
  };
}

/** Returns "this week" — Monday through today (used for the Overview landing snapshot). */
export function getThisWeekRange(): DateRange {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const monday = new Date(today);
  monday.setDate(today.getDate() - daysSinceMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start: toLocalDateString(monday),
    end: toLocalDateString(sunday),
  };
}

/** Returns the full current calendar month (1st -> last day), used by Monthly Payroll. */
export function getThisMonthRange(): DateRange {
  const today = new Date();
  return getCalendarMonthRange(today.getFullYear(), today.getMonth());
}

/** Returns the full calendar month range for a given year + zero-indexed month. */
export function getCalendarMonthRange(year: number, monthIndex: number): DateRange {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0); // last day of the month
  return {
    start: toLocalDateString(start),
    end: toLocalDateString(end),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Shared fetchers
// ─────────────────────────────────────────────────────────────────────────

export async function fetchEmployees(): Promise<Employee[]> {
  const res = await fetch(`${API_BASE_URL}/employees`);
  if (!res.ok) throw new Error("Failed to fetch employees");
  const data = await res.json();
  return (data as EmployeeRaw[]).map(normalizeEmployee);
}

export async function fetchWorktimeRows(
  range: DateRange,
  empId?: number | string | null
): Promise<WorktimeRow[]> {
  const params = new URLSearchParams({ start: range.start, end: range.end });
  if (empId !== undefined && empId !== null) {
    params.set("empId", String(empId));
  }

  const res = await fetch(`${API_BASE_URL}/worktime?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch worktime report.");

  const data = await res.json();
  // ⚠️ ASSUMPTION: findAll() returns an array of raw rows directly.
  // If it returns { rows: [...] } or a paginated shape, adjust this line.
  const list: WorktimeRowRaw[] = Array.isArray(data) ? data : data.rows || [];
  return list.map(normalizeRow);
}

export async function fetchAdvances(
  employees: Employee[],
  empId?: number | string | null,
  range?: DateRange
): Promise<AdvanceRecord[]> {
  const params = new URLSearchParams();
  if (range?.start) params.set("start", range.start);
  if (range?.end) params.set("end", range.end);
  const qs = params.toString() ? `?${params}` : "";

  const url =
    empId !== undefined && empId !== null
      ? `${API_BASE_URL}/advances/employee/${empId}${qs}`
      : `${API_BASE_URL}/advances${qs}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch advances.");

  const data = await res.json();
  const list: AdvanceRecordRaw[] = Array.isArray(data) ? data : data.rows || [];
  return list.map((raw) => normalizeAdvance(raw, employees));
}

/** Delete a specific advance by its own record id (NOT the employee id). */
export async function deleteAdvance(advanceId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/advances/${advanceId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete advance.");
}

// ─────────────────────────────────────────────────────────────────────────
// Planning integration
//
// Confirmed shape from GET /planning: each record's `empId` is a POPULATED
// employee object (not a plain number) — `record.empId.empNumber` is what
// matches our normalized Employee.emp_id. `planDate` is filtered client-side
// since the planning service doesn't support range filtering server-side.
// ─────────────────────────────────────────────────────────────────────────

interface PlanningRecordRaw {
  _id?: string;
  empId?: { empNumber?: number } | number | null;
  planDate?: string;
  [key: string]: unknown;
}

/**
 * Returns the set of employee numbers (emp_id) that have at least one
 * planning entry within the given date range — i.e. "scheduled to work".
 */
export async function fetchScheduledEmpIds(range: DateRange): Promise<Set<string>> {
  const res = await fetch(`${API_BASE_URL}/planning`);
  if (!res.ok) throw new Error("Failed to fetch planning.");

  const data = await res.json();
  const list: PlanningRecordRaw[] = Array.isArray(data) ? data : [];

  const start = new Date(`${range.start}T00:00:00`);
  const end = new Date(`${range.end}T23:59:59`);

  const ids = new Set<string>();
  list.forEach((r) => {
    if (!r.planDate) return;
    const planDate = new Date(r.planDate);
    if (planDate < start || planDate > end) return;

    const empId = typeof r.empId === "object" && r.empId !== null ? r.empId.empNumber : r.empId;
    if (empId !== undefined && empId !== null) {
      ids.add(String(empId));
    }
  });

  return ids;
}