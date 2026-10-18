// import { useState, useEffect, useMemo, useCallback } from "react";
// import { DateRange, Employee, WorktimeRow, AdvanceRecord } from "@/components/reporting/types";
// import {
//   getThisWeekRange,
//   fetchEmployees,
//   fetchWorktimeRows,
//   fetchAdvances,
//   generateDateRange,
//   toLocalDateString,
// } from "@/lib/reporting";
// import { payrollConfig, sumHours, sumConsommation } from "@/lib/payrollConfig";

// // ─────────────────────────────────────────────────────────────────────────
// // Types
// // ─────────────────────────────────────────────────────────────────────────

// export interface PeriodTotals {
//   hours: number;
//   overtimeHours: number;
//   gross: number;
//   net: number;
//   advances: number;
//   advancesCount: number;
//   consommation: number;
//   penalties: number;
//   lateEvents: number;
//   lateMinutes: number;
//   absences: number;
//   records: number; // number of worktime records in the period
//   lateRate: number; // % of records with lateness
//   absenceRate: number; // % of records marked absent
//   activeEmployees: number; // distinct employees with at least one record
//   avgHoursPerEmployee: number;
// }

// export type Granularity = "daily" | "weekly" | "monthly" | "yearly";

// export interface TrendData {
//   granularity: Granularity;
//   categories: string[];
//   hours: number[];
//   penalties: number[];
//   consommation: number[];
//   lateEvents: number[];
//   absences: number[];
// }

// // ─────────────────────────────────────────────────────────────────────────
// // Helpers
// // ─────────────────────────────────────────────────────────────────────────

// const round2 = (n: number) => Number(n.toFixed(2));

// /** The period of the same length that ends the day before `r` starts. */
// export function previousRange(r: DateRange): DateRange {
//   const s = new Date(`${r.start}T00:00:00`);
//   const e = new Date(`${r.end}T00:00:00`);
//   const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
//   const prevEnd = new Date(s);
//   prevEnd.setDate(prevEnd.getDate() - 1);
//   const prevStart = new Date(prevEnd);
//   prevStart.setDate(prevEnd.getDate() - (days - 1));
//   return { start: toLocalDateString(prevStart), end: toLocalDateString(prevEnd) };
// }

// /**
//  * ⚠️ NET FORMULA — single place to edit if your real payroll differs.
//  * The previous Overview computed net = gross − consommation − penalties (advances NOT subtracted).
//  * Monthly Payroll shows "Total Avances", so net there most likely subtracts them too.
//  * Set to false to reproduce the old Overview behaviour.
//  */
// const SUBTRACT_ADVANCES_FROM_NET = true;

// function computeNet(gross: number, advances: number, consommation: number, penalties: number) {
//   return gross - (SUBTRACT_ADVANCES_FROM_NET ? advances : 0) - consommation - penalties;
// }

// function computePeriod(rows: WorktimeRow[], advances: AdvanceRecord[], employees: Employee[]): PeriodTotals {
//   // Group by employee only to compute gross correctly (rate differs per employee).
//   // Nothing per-employee is exposed — everything is summed into company totals.
//   const groups: Record<string, WorktimeRow[]> = {};
//   rows.forEach((r) => {
//     const key = String(r.emp_id);
//     (groups[key] = groups[key] || []).push(r);
//   });

//   let hours = 0;
//   let gross = 0;
//   let consommation = 0;
//   let employeesWithHours = 0;

//   Object.entries(groups).forEach(([empId, empRows]) => {
//     const emp = employees.find((e) => String(e.emp_id) === empId);
//     const h = sumHours(empRows);
//     hours += h;
//     consommation += sumConsommation(empRows);
//     if (emp) gross += h * payrollConfig.hourlyRate(emp);
//     if (h > 0) employeesWithHours += 1;
//   });

//   const penalties = rows.reduce((s, r) => s + (Number(r.penalty) || 0), 0);
//   const overtimeMinutes = rows.reduce((s, r) => s + (Number(r.overtime_minutes) || 0), 0);
//   const lateEvents = rows.filter((r) => Number(r.late_minutes) > 0).length;
//   const lateMinutes = rows.reduce((s, r) => s + (Number(r.late_minutes) || 0), 0);
//   const absences = rows.filter((r) => r.absent).length;
//   const advancesTotal = advances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
//   const records = rows.length;

//   return {
//     hours: round2(hours),
//     overtimeHours: round2(overtimeMinutes / 60),
//     gross: round2(gross),
//     net: round2(computeNet(gross, advancesTotal, consommation, penalties)),
//     advances: round2(advancesTotal),
//     advancesCount: advances.length,
//     consommation: round2(consommation),
//     penalties: round2(penalties),
//     lateEvents,
//     lateMinutes,
//     absences,
//     records,
//     lateRate: records ? round2((lateEvents / records) * 100) : 0,
//     absenceRate: records ? round2((absences / records) * 100) : 0,
//     activeEmployees: employeesWithHours,
//     avgHoursPerEmployee: employeesWithHours ? round2(hours / employeesWithHours) : 0,
//   };
// }

// /** Monday of the week containing the given YYYY-MM-DD date. */
// function weekStartKey(dateStr: string): string {
//   const d = new Date(`${dateStr}T00:00:00`);
//   const sinceMonday = d.getDay() === 0 ? 6 : d.getDay() - 1;
//   d.setDate(d.getDate() - sinceMonday);
//   return toLocalDateString(d);
// }

// /**
//  * Picks how the trend charts are grouped so they stay readable:
//  *  up to 2 weeks   -> per day
//  *  up to ~3 months -> per week
//  *  up to ~2 years  -> per month
//  *  longer          -> per year
//  */
// function pickGranularity(totalDays: number): Granularity {
//   if (totalDays <= 14) return "daily";
//   if (totalDays <= 92) return "weekly";
//   if (totalDays <= 800) return "monthly";
//   return "yearly";
// }

// function bucketKey(dateStr: string, g: Granularity): string {
//   switch (g) {
//     case "daily":
//       return dateStr;
//     case "weekly":
//       return weekStartKey(dateStr);
//     case "monthly":
//       return dateStr.slice(0, 7); // YYYY-MM
//     case "yearly":
//       return dateStr.slice(0, 4); // YYYY
//   }
// }

// function bucketLabel(key: string, g: Granularity): string {
//   if (g === "yearly") return key;
//   if (g === "monthly") {
//     return new Date(`${key}-01T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });
//   }
//   const d = new Date(`${key}T00:00:00`);
//   if (g === "weekly") return `Wk ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
//   return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
// }

// function computeTrend(rows: WorktimeRow[], range: DateRange): TrendData {
//   const allDates = range.start && range.end ? generateDateRange(range.start, range.end) : [];
//   const granularity = pickGranularity(allDates.length);

//   // Ordered buckets (empty ones included, so gaps show as zero instead of disappearing)
//   const order: string[] = [];
//   const buckets: Record<string, { hours: number; penalties: number; consommation: number; lateEvents: number; absences: number }> = {};
//   allDates.forEach((d) => {
//     const k = bucketKey(d, granularity);
//     if (!buckets[k]) {
//       buckets[k] = { hours: 0, penalties: 0, consommation: 0, lateEvents: 0, absences: 0 };
//       order.push(k);
//     }
//   });

//   rows.forEach((r) => {
//     const b = buckets[bucketKey(r.work_date, granularity)];
//     if (!b) return; // outside range
//     b.hours += sumHours([r]);
//     b.penalties += Number(r.penalty) || 0;
//     b.consommation += Number(r.consommation) || 0;
//     if (Number(r.late_minutes) > 0) b.lateEvents += 1;
//     if (r.absent) b.absences += 1;
//   });

//   return {
//     granularity,
//     categories: order.map((k) => bucketLabel(k, granularity)),
//     hours: order.map((k) => round2(buckets[k].hours)),
//     penalties: order.map((k) => round2(buckets[k].penalties)),
//     consommation: order.map((k) => round2(buckets[k].consommation)),
//     lateEvents: order.map((k) => buckets[k].lateEvents),
//     absences: order.map((k) => buckets[k].absences),
//   };
// }

// // ─────────────────────────────────────────────────────────────────────────
// // Hook
// // ─────────────────────────────────────────────────────────────────────────

// export function useReportingOverview() {
//   const [range, setRangeState] = useState<DateRange>(getThisWeekRange());
//   const [employees, setEmployees] = useState<Employee[]>([]);
//   const [rows, setRows] = useState<WorktimeRow[]>([]);
//   const [advances, setAdvances] = useState<AdvanceRecord[]>([]);
//   const [prevRows, setPrevRows] = useState<WorktimeRow[]>([]);
//   const [prevAdvances, setPrevAdvances] = useState<AdvanceRecord[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState("");

//   const load = useCallback(async (r: DateRange) => {
//     setLoading(true);
//     setError("");
//     try {
//       const emps = await fetchEmployees();
//       const prev = previousRange(r);
//       const [cur, curAdv, prv, prvAdv] = await Promise.all([
//         fetchWorktimeRows(r),
//         fetchAdvances(emps, undefined, r).catch(optionalData([] as AdvanceRecord[], "Advances")),
//         fetchWorktimeRows(prev),
//         fetchAdvances(emps, undefined, prev).catch(optionalData([] as AdvanceRecord[], "Advances")),
//       ]);
//       setEmployees(emps);
//       setRows(cur);
//       setAdvances(curAdv);
//       setPrevRows(prv);
//       setPrevAdvances(prvAdv);
//       setRangeState(r);
//     } catch (err) {
//       console.error("Error loading overview:", err);
//       setError(friendlyError(err, "Couldn't load the overview"));
//     } finally {
//       setLoading(false);
//     }
//   }, []);

//   useEffect(() => {
//     load(getThisWeekRange());
//   }, [load]);

//   const current = useMemo(() => computePeriod(rows, advances, employees), [rows, advances, employees]);
//   const previous = useMemo(
//     () => computePeriod(prevRows, prevAdvances, employees),
//     [prevRows, prevAdvances, employees]
//   );
//   const trend = useMemo(() => computeTrend(rows, range), [rows, range]);
//   const prevRange = useMemo(() => previousRange(range), [range]);

//   return { range, setRange: load, previousRange: prevRange, current, previous, trend, loading, error };
// }
import { useState, useEffect, useMemo, useCallback } from "react";
import { DateRange, Employee, WorktimeRow, AdvanceRecord } from "@/components/reporting/types";
import {
  getThisWeekRange,
  fetchEmployees,
  fetchWorktimeRows,
  fetchAdvances,
  generateDateRange,
  toLocalDateString,
} from "@/lib/reporting";
import { payrollConfig, sumHours, sumConsommation } from "@/lib/payrollConfig";
import { fetchBonuses, BonusRecord } from "@/lib/bonuses";
import { friendlyError, optionalData } from "@/lib/errors";

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export interface PeriodTotals {
  hours: number;
  overtimeHours: number;
  gross: number;
  net: number;
  advances: number;
  advancesCount: number;
  bonuses: number; // primes given in the period
  bonusesCount: number;
  consommation: number;
  penalties: number;
  lateEvents: number;
  lateMinutes: number;
  absences: number;
  records: number; // number of worktime records in the period
  lateRate: number; // % of records with lateness
  absenceRate: number; // % of records marked absent
  activeEmployees: number; // distinct employees with at least one record
  avgHoursPerEmployee: number;
}

export type Granularity = "daily" | "weekly" | "monthly" | "yearly";

export interface TrendData {
  granularity: Granularity;
  categories: string[];
  hours: number[];
  penalties: number[];
  consommation: number[];
  lateEvents: number[];
  absences: number[];
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

const round2 = (n: number) => Number(n.toFixed(2));

/** The period of the same length that ends the day before `r` starts. */
export function previousRange(r: DateRange): DateRange {
  const s = new Date(`${r.start}T00:00:00`);
  const e = new Date(`${r.end}T00:00:00`);
  const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  const prevEnd = new Date(s);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevEnd.getDate() - (days - 1));
  return { start: toLocalDateString(prevStart), end: toLocalDateString(prevEnd) };
}

/**
 * ⚠️ NET FORMULA — single place to edit if your real payroll differs.
 * The previous Overview computed net = gross − consommation − penalties (advances NOT subtracted).
 * Monthly Payroll shows "Total Avances", so net there most likely subtracts them too.
 * Set to false to reproduce the old Overview behaviour.
 */
const SUBTRACT_ADVANCES_FROM_NET = true;

function computeNet(gross: number, advances: number, consommation: number, penalties: number, bonuses: number) {
  return gross + bonuses - (SUBTRACT_ADVANCES_FROM_NET ? advances : 0) - consommation - penalties;
}

function computePeriod(
  rows: WorktimeRow[],
  advances: AdvanceRecord[],
  bonuses: BonusRecord[],
  employees: Employee[]
): PeriodTotals {
  // Group by employee only to compute gross correctly (rate differs per employee).
  // Nothing per-employee is exposed — everything is summed into company totals.
  const groups: Record<string, WorktimeRow[]> = {};
  rows.forEach((r) => {
    const key = String(r.emp_id);
    (groups[key] = groups[key] || []).push(r);
  });

  let hours = 0;
  let gross = 0;
  let consommation = 0;
  let employeesWithHours = 0;

  Object.entries(groups).forEach(([empId, empRows]) => {
    const emp = employees.find((e) => String(e.emp_id) === empId);
    const h = sumHours(empRows);
    hours += h;
    consommation += sumConsommation(empRows);
    if (emp) gross += h * payrollConfig.hourlyRate(emp);
    if (h > 0) employeesWithHours += 1;
  });

  const penalties = rows.reduce((s, r) => s + (Number(r.penalty) || 0), 0);
  const overtimeMinutes = rows.reduce((s, r) => s + (Number(r.overtime_minutes) || 0), 0);
  const lateEvents = rows.filter((r) => Number(r.late_minutes) > 0).length;
  const lateMinutes = rows.reduce((s, r) => s + (Number(r.late_minutes) || 0), 0);
  const absences = rows.filter((r) => r.absent).length;
  const advancesTotal = advances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const bonusesTotal = bonuses.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const records = rows.length;

  return {
    hours: round2(hours),
    overtimeHours: round2(overtimeMinutes / 60),
    gross: round2(gross),
    net: round2(computeNet(gross, advancesTotal, consommation, penalties, bonusesTotal)),
    advances: round2(advancesTotal),
    advancesCount: advances.length,
    bonuses: round2(bonusesTotal),
    bonusesCount: bonuses.length,
    consommation: round2(consommation),
    penalties: round2(penalties),
    lateEvents,
    lateMinutes,
    absences,
    records,
    lateRate: records ? round2((lateEvents / records) * 100) : 0,
    absenceRate: records ? round2((absences / records) * 100) : 0,
    activeEmployees: employeesWithHours,
    avgHoursPerEmployee: employeesWithHours ? round2(hours / employeesWithHours) : 0,
  };
}

/** Monday of the week containing the given YYYY-MM-DD date. */
function weekStartKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const sinceMonday = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - sinceMonday);
  return toLocalDateString(d);
}

/**
 * Picks how the trend charts are grouped so they stay readable:
 *  up to 2 weeks   -> per day
 *  up to ~3 months -> per week
 *  up to ~2 years  -> per month
 *  longer          -> per year
 */
function pickGranularity(totalDays: number): Granularity {
  if (totalDays <= 14) return "daily";
  if (totalDays <= 92) return "weekly";
  if (totalDays <= 800) return "monthly";
  return "yearly";
}

function bucketKey(dateStr: string, g: Granularity): string {
  switch (g) {
    case "daily":
      return dateStr;
    case "weekly":
      return weekStartKey(dateStr);
    case "monthly":
      return dateStr.slice(0, 7); // YYYY-MM
    case "yearly":
      return dateStr.slice(0, 4); // YYYY
  }
}

function bucketLabel(key: string, g: Granularity): string {
  if (g === "yearly") return key;
  if (g === "monthly") {
    return new Date(`${key}-01T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }
  const d = new Date(`${key}T00:00:00`);
  if (g === "weekly") return `Wk ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function computeTrend(rows: WorktimeRow[], range: DateRange): TrendData {
  const allDates = range.start && range.end ? generateDateRange(range.start, range.end) : [];
  const granularity = pickGranularity(allDates.length);

  // Ordered buckets (empty ones included, so gaps show as zero instead of disappearing)
  const order: string[] = [];
  const buckets: Record<string, { hours: number; penalties: number; consommation: number; lateEvents: number; absences: number }> = {};
  allDates.forEach((d) => {
    const k = bucketKey(d, granularity);
    if (!buckets[k]) {
      buckets[k] = { hours: 0, penalties: 0, consommation: 0, lateEvents: 0, absences: 0 };
      order.push(k);
    }
  });

  rows.forEach((r) => {
    const b = buckets[bucketKey(r.work_date, granularity)];
    if (!b) return; // outside range
    b.hours += sumHours([r]);
    b.penalties += Number(r.penalty) || 0;
    b.consommation += Number(r.consommation) || 0;
    if (Number(r.late_minutes) > 0) b.lateEvents += 1;
    if (r.absent) b.absences += 1;
  });

  return {
    granularity,
    categories: order.map((k) => bucketLabel(k, granularity)),
    hours: order.map((k) => round2(buckets[k].hours)),
    penalties: order.map((k) => round2(buckets[k].penalties)),
    consommation: order.map((k) => round2(buckets[k].consommation)),
    lateEvents: order.map((k) => buckets[k].lateEvents),
    absences: order.map((k) => buckets[k].absences),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────

export function useReportingOverview() {
  const [range, setRangeState] = useState<DateRange>(getThisWeekRange());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rows, setRows] = useState<WorktimeRow[]>([]);
  const [advances, setAdvances] = useState<AdvanceRecord[]>([]);
  const [prevRows, setPrevRows] = useState<WorktimeRow[]>([]);
  const [prevAdvances, setPrevAdvances] = useState<AdvanceRecord[]>([]);
  const [bonuses, setBonuses] = useState<BonusRecord[]>([]);
  const [prevBonuses, setPrevBonuses] = useState<BonusRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (r: DateRange) => {
    setLoading(true);
    setError("");
    try {
      const emps = await fetchEmployees();
      const prev = previousRange(r);
      const [cur, curAdv, prv, prvAdv, curBon, prvBon] = await Promise.all([
        fetchWorktimeRows(r),
        fetchAdvances(emps, undefined, r).catch(optionalData([] as AdvanceRecord[], "Advances")),
        fetchWorktimeRows(prev),
        fetchAdvances(emps, undefined, prev).catch(optionalData([] as AdvanceRecord[], "Advances")),
        fetchBonuses(r).catch(optionalData([] as BonusRecord[], "Primes")),
        fetchBonuses(prev).catch(optionalData([] as BonusRecord[], "Primes")),
      ]);
      setEmployees(emps);
      setRows(cur);
      setAdvances(curAdv);
      setPrevRows(prv);
      setPrevAdvances(prvAdv);
      setBonuses(curBon);
      setPrevBonuses(prvBon);
      setRangeState(r);
    } catch (err) {
      console.error("Error loading overview:", err);
      setError("Failed to load the overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(getThisWeekRange());
  }, [load]);

  const current = useMemo(() => computePeriod(rows, advances, bonuses, employees), [rows, advances, bonuses, employees]);
  const previous = useMemo(
    () => computePeriod(prevRows, prevAdvances, prevBonuses, employees),
    [prevRows, prevAdvances, prevBonuses, employees]
  );
  const trend = useMemo(() => computeTrend(rows, range), [rows, range]);
  const prevRange = useMemo(() => previousRange(range), [range]);

  return { range, setRange: load, previousRange: prevRange, current, previous, trend, loading, error };
}