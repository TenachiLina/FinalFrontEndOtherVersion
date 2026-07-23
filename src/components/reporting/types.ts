// ─────────────────────────────────────────────────────────────────────────
// Reporting types
//
// Field names below match the REAL Mongo data, confirmed via GET /employees
// and GET /worktime:
//   - Employees store `empNumber` (e.g. 101, 102...), `firstName`, `lastName`,
//     `baseSalary` — NOT the old MySQL-style `emp_id`/`FirstName`/`Base_salary`.
//   - Worktime records reference employees via `emp_id`, which is a NUMBER
//     matching `empNumber` (NOT the Mongo `_id` string).
//
// `EmployeeRaw` is the wire shape; `Employee` is the normalized shape the
// rest of the app uses, with `emp_id` as the canonical join key (matching
// what worktime/advances already use) so most app code didn't need to change.
// `normalizeEmployee()` in `lib/reporting.ts` is the ONLY place that maps
// raw -> normalized.
// ─────────────────────────────────────────────────────────────────────────

export type FilterMode = "day" | "week" | "month" | "custom";

/** Raw employee document as actually returned by GET /employees. */
export interface EmployeeRaw {
  _id?: string;
  empNumber?: number;
  firstName?: string;
  lastName?: string;
  baseSalary?: number;
  address?: string;
  phoneNumber?: string;
  __v?: number;
  [key: string]: unknown;
}

/** Normalized employee shape used everywhere in the UI/hooks. */
export interface Employee {
  emp_id: number | string; // = empNumber, the join key worktime/advances actually use
  FirstName: string;
  LastName: string;
  Base_salary: number;
  _visible?: boolean; // local UI-only flag for the search/filter list
}

/**
 * Raw row as confirmed returned by GET /worktime?start=&end=&empId=
 * (verified against real data: emp_id, work_date, work_hours, late_minutes,
 * overtime_minutes, penalty, absent, absent_comment, consomation).
 */
export interface WorktimeRowRaw {
  _id?: string;
  worktime_id?: string | number;
  emp_id?: number | string;
  empId?: number | string; // possible Mongo naming variant
  work_date?: string;
  workDate?: string; // possible Mongo naming variant
  work_hours?: string | number; // "HH:MM:SS" | "HH:MM" | decimal
  late_minutes?: string | number;
  overtime_minutes?: string | number;
  penalty?: string | number;
  consommation?: string | number;
  consomation?: string | number; // old DB had this misspelling too
  absent?: boolean | number;
  absent_comment?: string;
  [key: string]: unknown;
}

/**
 * Normalized row used everywhere in the UI/hook after `normalizeRow()`.
 * Field names match the OLD frontend's conventions so the ported
 * calculation logic (payroll formulas, summaries, etc.) needs minimal changes.
 */
export interface WorktimeRow {
  emp_id: number | string;
  work_date: string; // "YYYY-MM-DD"
  work_hours: string | number | null; // raw value, converted via timeToDecimalHours()
  late_minutes: number;
  overtime_minutes: number;
  penalty: number;
  consommation: number;
  absent: number; // 0 | 1
  absent_comment: string;
  is_empty: boolean; // true for client-generated "missing day" placeholder rows
}

export interface DateRange {
  start: string; // "YYYY-MM-DD"
  end: string; // "YYYY-MM-DD"
}

/** Per-period (week/month/day) summary for a SINGLE selected employee. */
export interface PeriodSummary {
  totalHours: string; // toFixed(2)
  brutSalary: string;
  netSalary: string;
  advance: string;
  hourlyRate: string;
  totalLate: number;
  totalConsommation: number;
  totalPenalties: number;
  totalAbsences: number;
}

/** Aggregate summary across ALL employees (the "global view"). */
export interface GlobalSummary {
  totalHours: string;
  brutSalary: string;
  netSalary: string;
  totalLate: string;
  totalConsommation: string;
  totalPenalties: string;
  totalBaseSalary: string;
  totalAdvances: string;
  totalAbsences: number;
  employeeCount: number;
}

/** Per-employee breakdown card shown in the global view. */
export interface EmployeeBreakdown {
  empId: number | string;
  employee: Employee | undefined;
  baseSalary: number;
  hours: number;
  brutSalary: number;
  netSalary: number;
  advance: number;
  consommation: number;
  penalties: number;
  absences: number;
}

/** Row shown in the Overview page's employee table (one row per employee, "this week"). */
export interface EmployeeStatusRow {
  empId: number | string;
  firstName: string;
  lastName: string;
  hours: number;
  netSalary: number;
  absences: number;
  lateCount: number;
  status: "ok" | "attention"; // "attention" = has absences or significant lateness this period
}

/** Headline stats shown at the top of the Overview page. */
export interface OverviewStats {
  totalHoursWorked: string;
  totalNetPayroll: string;
  totalAbsences: number;
  activeAdvancesCount: number;
}

/** A single advance record, as shown on the Advances page. */
export interface AdvanceRecord {
  id?: string;
  empId: number | string;
  employee: Employee | undefined;
  amount: number;
  date: string; // "YYYY-MM-DD"
  reason: string;
}

/** Raw advance row as (assumed) returned by GET /advances or GET /advances/:empId */
export interface AdvanceRecordRaw {
  _id?: string;
  emp_id?: number | string;
  empId?: number | string;
  Advances_amount?: number | string;
  amount?: number | string;
  Advances_date?: string;
  date?: string;
  Advances_reason?: string;
  reason?: string;
  [key: string]: unknown;
}