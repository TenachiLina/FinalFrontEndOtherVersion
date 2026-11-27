import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AdvanceRecord, Employee, WorktimeRow, DateRange } from "@/components/reporting/types";
import {
  getThisWeekRange,
  getThisMonthRange,
  fetchEmployees,
  fetchWorktimeRows,
  fetchAdvances,
  deleteAdvance,
} from "@/lib/reporting";
import { emptyPayrollRow, fetchPayrollPeriod, PayrollRow } from "@/lib/payrollApi";
import { fetchBonuses, BonusRecord } from "@/lib/bonuses";
import { API_BASE_URL } from "@/lib/config";
import { ensureOk, friendlyError, optionalData } from "@/lib/errors";
import { toast } from "@/lib/notify";

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


  // ═══════════════════════════════════════════════════════════════════════
  // WEEKLY ADVANCE
  // ═══════════════════════════════════════════════════════════════════════
  const [weekRange, setWeekRangeState] = useState<DateRange>(initial?.week ?? getThisWeekRange());
  const [weekRows, setWeekRows] = useState<WorktimeRow[]>([]);
  // The week's pay, calculated by the server (GET /payroll/period)
  const [weekPay, setWeekPay] = useState<PayrollRow>(() => emptyPayrollRow(empId));
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
        const [rows, pay] = await Promise.all([fetchWorktimeRows(range, empId), fetchPayrollPeriod(range, empId)]);
        if (reqId !== weekReq.current) return; // outdated response → ignore
        setWeekRows(rows);
        setWeekPay(pay.rows[0] ?? emptyPayrollRow(empId));
        setWeekRangeState(range);
      } catch (err) {
        if (reqId !== weekReq.current) return;
        console.error(err);
        setWeekError(friendlyError(err, "Couldn't load this week"));
        setWeekRows([]);
        setWeekPay(emptyPayrollRow(empId));
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

  const weekHours = weekPay.hours;
  const weekConsommation = weekPay.consommation;
  const weekAdvanceOffer = weekPay.advanceOffer;

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

  // Set while an advance is being saved, so a double click doesn't give it twice
  const [savingAdvance, setSavingAdvance] = useState(false);
  const savingRef = useRef(false);

  const giveAdvance = useCallback(async () => {
    if (!empId || !weekRange.start || !weekRange.end) return;
    if (savingRef.current) return;
    // A zero or negative advance would add money to the month-end net
    if (weekAdvanceOffer <= 0) {
      toast.error("There is nothing to advance for this week.");
      return;
    }
    savingRef.current = true;
    setSavingAdvance(true);
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
      await ensureOk(res);
      const created = await res.json();
      setExistingAdvance({ id: created._id });
      toast.success("Advance given.");
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't give the advance"));
    } finally {
      savingRef.current = false;
      setSavingAdvance(false);
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
      toast.error(friendlyError(err, "Couldn't remove the advance"));
    }
  }, [existingAdvance]);

  // ═══════════════════════════════════════════════════════════════════════
  // MONTHLY PAYROLL
  // ═══════════════════════════════════════════════════════════════════════
  const [monthRange, setMonthRangeState] = useState<DateRange>(initial?.month ?? getThisMonthRange());
  const [monthRows, setMonthRows] = useState<WorktimeRow[]>([]);
  // The month's pay, calculated by the server (GET /payroll/period)
  const [monthPay, setMonthPay] = useState<PayrollRow>(() => emptyPayrollRow(empId));
  const [monthAdvancesList, setMonthAdvancesList] = useState<{ date: string; amount: number }[]>([]);
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
        const [rows, pay, advanceRecords, bonusRecords] = await Promise.all([
          fetchWorktimeRows(range, empId),
          fetchPayrollPeriod(range, empId),
          fetchAdvances([employee].filter(Boolean) as Employee[], empId, range).catch(optionalData([] as AdvanceRecord[], "Advances")),
          fetchBonuses(range).catch(optionalData([] as BonusRecord[], "Bonuses")),
        ]);
        if (reqId !== monthReq.current) return; // outdated response → ignore

        const myBonuses = bonusRecords.filter((b) => String(b.empId) === String(empId));
        setMonthRows(rows);
        setMonthPay(pay.rows[0] ?? emptyPayrollRow(empId));
        setMonthAdvancesList(advanceRecords.map((a) => ({ date: a.date, amount: a.amount })));
        setMonthBonusesList(myBonuses.map((b) => ({ date: b.date, amount: b.amount, reason: b.reason })));
        setMonthRangeState(range);
      } catch (err) {
        if (reqId !== monthReq.current) return;
        console.error(err);
        setMonthError(friendlyError(err, "Couldn't load this month"));
        setMonthRows([]);
        setMonthPay(emptyPayrollRow(empId));
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

  // Hours × rate, deductions and net all come from the server
  const hourlyRate = monthPay.hourlyRate || weekPay.hourlyRate;
  const monthPayout = useMemo(() => ({ brut: monthPay.gross, net: monthPay.net }), [monthPay]);

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
      savingAdvance,
      giveAdvance,
      revokeAdvance,
      loading: loadingWeek,
      error: weekError,
    },

    month: {
      range: monthRange,
      setRange: fetchMonth,
      rows: monthRows,
      hours: monthPay.hours,
      penalties: monthPay.penalties,
      consommation: monthPay.consommation,
      absences: monthPay.absences,
      lateMinutes: monthPay.lateMinutes,
      advancesTotal: monthPay.advances,
      advancesList: monthAdvancesList,
      bonusesTotal: monthPay.bonuses,
      bonusesList: monthBonusesList,
      payout: monthPayout,
      loading: loadingMonth,
      error: monthError,
    },
  };
}