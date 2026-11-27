import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { DateRange, WorktimeRow } from "@/components/reporting/types";
import { getThisWeekRange, fetchWorktimeRows, generateDateRange, toLocalDateString, timeToDecimalHours } from "@/lib/reporting";
import { EMPTY_TOTALS, fetchPayrollPeriod, PayrollTotals } from "@/lib/payrollApi";
import { locale, t } from "@/lib/i18n";

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
  bonuses: number; // bonuses given in the period
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

/** The Overview's figures from the server's totals (GET /payroll/period): nothing is calculated here but rates. */
function periodTotals(totals: PayrollTotals): PeriodTotals {
  const { records, hours, activeEmployees } = totals;
  return {
    hours: totals.hours,
    overtimeHours: round2(totals.overtimeMinutes / 60),
    gross: totals.gross,
    net: totals.net,
    advances: totals.advances,
    advancesCount: totals.advancesCount,
    bonuses: totals.bonuses,
    bonusesCount: totals.bonusesCount,
    consommation: totals.consommation,
    penalties: totals.penalties,
    lateEvents: totals.lateDays,
    lateMinutes: totals.lateMinutes,
    absences: totals.absences,
    records,
    lateRate: records ? round2((totals.lateDays / records) * 100) : 0,
    absenceRate: records ? round2((totals.absences / records) * 100) : 0,
    activeEmployees,
    avgHoursPerEmployee: activeEmployees ? round2(hours / activeEmployees) : 0,
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
    return new Date(`${key}-01T00:00:00`).toLocaleDateString(locale(), { month: "short", year: "numeric" });
  }
  const d = new Date(`${key}T00:00:00`);
  if (g === "weekly") return `${t("Wk")} ${d.toLocaleDateString(locale(), { month: "short", day: "numeric" })}`;
  return d.toLocaleDateString(locale(), { weekday: "short", month: "short", day: "numeric" });
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
    b.hours += timeToDecimalHours(r.work_hours);
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
  // Work time records of the period, for the trend charts
  const [rows, setRows] = useState<WorktimeRow[]>([]);
  // Company totals of the period and of the one before, calculated by the server
  const [totals, setTotals] = useState<PayrollTotals>(EMPTY_TOTALS);
  const [prevTotals, setPrevTotals] = useState<PayrollTotals>(EMPTY_TOTALS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Each call gets an id; a response is only applied if no newer call started meanwhile
  const req = useRef(0);

  const load = useCallback(async (r: DateRange) => {
    const reqId = ++req.current;
    setLoading(true);
    setError("");
    try {
      const prev = previousRange(r);
      const [cur, pay, prevPay] = await Promise.all([fetchWorktimeRows(r), fetchPayrollPeriod(r), fetchPayrollPeriod(prev)]);
      if (reqId !== req.current) return; // outdated response → ignore
      setRows(cur);
      setTotals(pay.totals);
      setPrevTotals(prevPay.totals);
      setRangeState(r);
    } catch (err) {
      if (reqId !== req.current) return;
      console.error("Error loading overview:", err);
      setError("Failed to load the overview.");
    } finally {
      if (reqId === req.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(getThisWeekRange());
  }, [load]);

  const current = useMemo(() => periodTotals(totals), [totals]);
  const previous = useMemo(() => periodTotals(prevTotals), [prevTotals]);
  const trend = useMemo(() => computeTrend(rows, range), [rows, range]);
  const prevRange = useMemo(() => previousRange(range), [range]);

  return { range, setRange: load, previousRange: prevRange, current, previous, trend, loading, error };
}