import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Employee, WorktimeRow, DateRange } from "@/components/reporting/types";
import {
  getThisWeekRange,
  getThisMonthRange,
  fetchEmployees,
  fetchWorktimeRows,
  fetchAdvances,
  deleteAdvance,
  API_BASE_URL,
} from "@/lib/reporting";
import {
  payrollConfig,
  sumHours,
  sumConsommation,
  sumPenalties,
  sumAbsences,
  sumLateMinutes,
} from "@/lib/payrollConfig";
import { fetchBonuses, BonusRecord } from "@/lib/bonuses";

// Ranges to open on (e.g. the week / month selected on the list page the user came from).
export interface EmployeeReportInitialRanges {
  week?: DateRange;
  month?: DateRange;
}

export function useEmployeeReport(empId: number | string, initial?: EmployeeReportInitialRanges) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loadingEmployee, setLoadingEmployee] = useState(true);

  useEffect(() => {
    async function loadEmployee() {
      setLoadingEmployee(true);
      try {
        const all = await fetchEmployees();
        const found = all.find((e) => String(e.emp_id) === String(empId)) || null;
        setEmployee(found);
      } catch (err) {
        console.error("Error loading employee:", err);
      } finally {
        setLoadingEmployee(false);
      }
    }
    loadEmployee();
  }, [empId]);

  const hourlyRate = useMemo(() => payrollConfig.hourlyRate(employee || undefined), [employee]);

  // ═══════════════════════════════════════════════════════════════════════
  // WEEKLY ADVANCE
  // ═══════════════════════════════════════════════════════════════════════
  const [weekRange, setWeekRangeState] = useState<DateRange>(initial?.week ?? getThisWeekRange());
  const [weekRows, setWeekRows] = useState<WorktimeRow[]>([]);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [weekError, setWeekError] = useState("");
  // Each call gets an id; a response is only applied if no newer call started meanwhile
  const weekReq = useRef(0);

  const fetchWeek = useCallback(
    async (range: DateRange = weekRange) => {
      const reqId = ++weekReq.current;
      setLoadingWeek(true);
      setWeekError("");
      try {
        const rows = await fetchWorktimeRows(range, empId);
        if (reqId !== weekReq.current) return; // outdated response → ignore
        setWeekRows(rows);
        setWeekRangeState(range);
      } catch (err) {
        if (reqId !== weekReq.current) return;
        console.error(err);
        setWeekError("Failed to load weekly data.");
        setWeekRows([]);
      } finally {
        if (reqId === weekReq.current) setLoadingWeek(false);
      }
    },
    [empId, weekRange]
  );

  useEffect(() => {
    fetchWeek(initial?.week ?? getThisWeekRange());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empId]);

  const weekHours = useMemo(() => sumHours(weekRows), [weekRows]);
  const weekConsommation = useMemo(() => sumConsommation(weekRows), [weekRows]);
  const weekAdvanceOffer = useMemo(
    () => payrollConfig.weeklyAdvance({ hours: weekHours, hourlyRate, consommation: weekConsommation }),
    [weekHours, hourlyRate, weekConsommation]
  );

  // Has an advance already been given for this specific week range?
  // We track the actual record (not just a boolean) since revoking needs its id.
  const [existingAdvance, setExistingAdvance] = useState<{ id?: string } | null>(null);
  const [isLoadingAdvance, setIsLoadingAdvance] = useState(false);
  const advanceGiven = existingAdvance !== null;

  useEffect(() => {
    async function checkAdvance() {
      if (!empId || !weekRange.start || !weekRange.end) {
        setExistingAdvance(null);
        return;
      }
      setIsLoadingAdvance(true);
      try {
        const records = await fetchAdvances([employee].filter(Boolean) as Employee[], empId, weekRange);
        setExistingAdvance(records.length > 0 ? records[0] : null);
      } catch (err) {
        console.error("Error checking advance:", err);
        setExistingAdvance(null);
      } finally {
        setIsLoadingAdvance(false);
      }
    }
    checkAdvance();
  }, [empId, weekRange.start, weekRange.end, employee]);

  const giveAdvance = useCallback(async () => {
    if (!empId || !weekRange.start || !weekRange.end) return;
    try {
      const res = await fetch(`${API_BASE_URL}/advances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emp_id: empId,
          amount: parseFloat(weekAdvanceOffer.toFixed(2)),
          date: weekRange.start,
          reason: `Weekly advance (${weekRange.start} to ${weekRange.end})`,
        }),
      });
      if (!res.ok) throw new Error("Failed to create advance");
      const created = await res.json();
      setExistingAdvance({ id: created._id });
    } catch (err) {
      console.error("Error giving advance:", err);
    }
  }, [empId, weekRange, weekAdvanceOffer]);

  const revokeAdvance = useCallback(async () => {
    if (!existingAdvance?.id) return;
    const previous = existingAdvance;
    setExistingAdvance(null);
    try {
      await deleteAdvance(existingAdvance.id);
    } catch (err) {
      console.error("Error revoking advance:", err);
      setExistingAdvance(previous);
    }
  }, [existingAdvance]);

  // ═══════════════════════════════════════════════════════════════════════
  // MONTHLY PAYROLL
  // ═══════════════════════════════════════════════════════════════════════
  const [monthRange, setMonthRangeState] = useState<DateRange>(initial?.month ?? getThisMonthRange());
  const [monthRows, setMonthRows] = useState<WorktimeRow[]>([]);
  const [monthAdvancesTotal, setMonthAdvancesTotal] = useState(0);
  const [monthAdvancesList, setMonthAdvancesList] = useState<{ date: string; amount: number }[]>([]);
  const [monthBonusesTotal, setMonthBonusesTotal] = useState(0);
  const [monthBonusesList, setMonthBonusesList] = useState<{ date: string; amount: number; reason: string }[]>([]);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [monthError, setMonthError] = useState("");
  const monthReq = useRef(0);

  const fetchMonth = useCallback(
    async (range: DateRange = monthRange) => {
      const reqId = ++monthReq.current;
      setLoadingMonth(true);
      setMonthError("");
      try {
        const [rows, advanceRecords, bonusRecords] = await Promise.all([
          fetchWorktimeRows(range, empId),
          fetchAdvances([employee].filter(Boolean) as Employee[], empId, range).catch(() => []),
          fetchBonuses(range).catch(() => [] as BonusRecord[]),
        ]);
        if (reqId !== monthReq.current) return; // outdated response → ignore

        const myBonuses = bonusRecords.filter((b) => String(b.empId) === String(empId));
        setMonthRows(rows);
        setMonthAdvancesList(advanceRecords.map((a) => ({ date: a.date, amount: a.amount })));
        setMonthAdvancesTotal(advanceRecords.reduce((sum, a) => sum + a.amount, 0));
        setMonthBonusesList(myBonuses.map((b) => ({ date: b.date, amount: b.amount, reason: b.reason })));
        setMonthBonusesTotal(myBonuses.reduce((sum, b) => sum + b.amount, 0));
        setMonthRangeState(range);
      } catch (err) {
        if (reqId !== monthReq.current) return;
        console.error(err);
        setMonthError("Failed to load monthly data.");
        setMonthRows([]);
      } finally {
        if (reqId === monthReq.current) setLoadingMonth(false);
      }
    },
    [empId, employee, monthRange]
  );

  // Re-runs when the employee finishes loading (advances need it) — it must reuse the
  // initial range, NOT reset to the current month.
  useEffect(() => {
    fetchMonth(initial?.month ?? getThisMonthRange());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empId, employee]);

  const monthHours = useMemo(() => sumHours(monthRows), [monthRows]);
  const monthPenalties = useMemo(() => sumPenalties(monthRows), [monthRows]);
  const monthConsommation = useMemo(() => sumConsommation(monthRows), [monthRows]);
  const monthAbsences = useMemo(() => sumAbsences(monthRows), [monthRows]);
  const monthLateMinutes = useMemo(() => sumLateMinutes(monthRows), [monthRows]);

  const monthPayout = useMemo(() => {
    const base = payrollConfig.monthlyPayout({
      hours: monthHours,
      hourlyRate,
      penalties: monthPenalties,
      consommation: monthConsommation,
      advancesGivenThisMonth: monthAdvancesTotal,
    });
    // primes are added to the net salary (same as the Monthly Payroll list)
    return { ...base, net: base.net + monthBonusesTotal };
  }, [monthHours, hourlyRate, monthPenalties, monthConsommation, monthAdvancesTotal, monthBonusesTotal]);

  return {
    employee,
    loadingEmployee,
    hourlyRate,

    week: {
      range: weekRange,
      setRange: fetchWeek,
      rows: weekRows,
      hours: weekHours,
      consommation: weekConsommation,
      advanceOffer: weekAdvanceOffer,
      advanceGiven,
      isLoadingAdvance,
      giveAdvance,
      revokeAdvance,
      loading: loadingWeek,
      error: weekError,
    },

    month: {
      range: monthRange,
      setRange: fetchMonth,
      rows: monthRows,
      hours: monthHours,
      penalties: monthPenalties,
      consommation: monthConsommation,
      absences: monthAbsences,
      lateMinutes: monthLateMinutes,
      advancesTotal: monthAdvancesTotal,
      advancesList: monthAdvancesList,
      bonusesTotal: monthBonusesTotal,
      bonusesList: monthBonusesList,
      payout: monthPayout,
      loading: loadingMonth,
      error: monthError,
    },
  };
}