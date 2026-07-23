import { useState, useEffect, useMemo, useCallback } from "react";
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

export function useEmployeeReport(empId: number | string) {
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
  const [weekRange, setWeekRangeState] = useState<DateRange>(getThisWeekRange());
  const [weekRows, setWeekRows] = useState<WorktimeRow[]>([]);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [weekError, setWeekError] = useState("");

  const fetchWeek = useCallback(
    async (range: DateRange = weekRange) => {
      setLoadingWeek(true);
      setWeekError("");
      try {
        const rows = await fetchWorktimeRows(range, empId);
        setWeekRows(rows);
        setWeekRangeState(range);
      } catch (err) {
        console.error(err);
        setWeekError("Failed to load weekly data.");
        setWeekRows([]);
      } finally {
        setLoadingWeek(false);
      }
    },
    [empId, weekRange]
  );

  useEffect(() => {
    fetchWeek(getThisWeekRange());
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
  const [monthRange, setMonthRangeState] = useState<DateRange>(getThisMonthRange());
  const [monthRows, setMonthRows] = useState<WorktimeRow[]>([]);
  const [monthAdvancesTotal, setMonthAdvancesTotal] = useState(0);
  const [monthAdvancesList, setMonthAdvancesList] = useState<{ date: string; amount: number }[]>([]);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [monthError, setMonthError] = useState("");

  const fetchMonth = useCallback(
    async (range: DateRange = monthRange) => {
      setLoadingMonth(true);
      setMonthError("");
      try {
        const [rows, advanceRecords] = await Promise.all([
          fetchWorktimeRows(range, empId),
          fetchAdvances([employee].filter(Boolean) as Employee[], empId, range).catch(() => []),
        ]);
        setMonthRows(rows);
        setMonthAdvancesList(advanceRecords.map((a) => ({ date: a.date, amount: a.amount })));
        setMonthAdvancesTotal(advanceRecords.reduce((sum, a) => sum + a.amount, 0));
        setMonthRangeState(range);
      } catch (err) {
        console.error(err);
        setMonthError("Failed to load monthly data.");
        setMonthRows([]);
      } finally {
        setLoadingMonth(false);
      }
    },
    [empId, employee, monthRange]
  );

  useEffect(() => {
    fetchMonth(getThisMonthRange());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empId, employee]);

  const monthHours = useMemo(() => sumHours(monthRows), [monthRows]);
  const monthPenalties = useMemo(() => sumPenalties(monthRows), [monthRows]);
  const monthConsommation = useMemo(() => sumConsommation(monthRows), [monthRows]);
  const monthAbsences = useMemo(() => sumAbsences(monthRows), [monthRows]);
  const monthLateMinutes = useMemo(() => sumLateMinutes(monthRows), [monthRows]);

  const monthPayout = useMemo(
    () =>
      payrollConfig.monthlyPayout({
        hours: monthHours,
        hourlyRate,
        penalties: monthPenalties,
        consommation: monthConsommation,
        advancesGivenThisMonth: monthAdvancesTotal,
      }),
    [monthHours, hourlyRate, monthPenalties, monthConsommation, monthAdvancesTotal]
  );

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
      payout: monthPayout,
      loading: loadingMonth,
      error: monthError,
    },
  };
}