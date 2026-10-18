import { useState, useEffect, useMemo, useCallback } from "react";
import { Employee, WorktimeRow, DateRange, AdvanceRecord } from "@/components/reporting/types";
import {
  getThisWeekRange,
  fetchEmployees,
  fetchWorktimeRows,
  fetchAdvances,
  fetchScheduledEmpIds,
  deleteAdvance,
} from "@/lib/reporting";
import { payrollConfig, sumHours, sumConsommation, sumAbsences } from "@/lib/payrollConfig";
import { API_BASE_URL } from "@/lib/config";
import { ensureOk, friendlyError, optionalData } from "@/lib/errors";
import { toast } from "@/lib/notify";

export interface WeeklyAdvanceRow {
  empId: number | string;
  firstName: string;
  lastName: string;
  hourlyRate: number;
  hours: number;
  absences: number;
  weeklySalary: number; // brut for the week: hours * hourlyRate
  consommation: number;
  advanceOffer: number;
  advanceGiven: boolean;
  advanceId?: string; // present only when advanceGiven is true; needed to revoke
}

export function useWeeklyAdvancesList(initialRange?: DateRange) {
  const [range, setRangeState] = useState<DateRange>(initialRange ?? getThisWeekRange());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rows, setRows] = useState<WorktimeRow[]>([]);
  const [advances, setAdvances] = useState<AdvanceRecord[]>([]);
  const [scheduledIds, setScheduledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async (r: DateRange = range) => {
    setLoading(true);
    setError("");
    try {
      const emps = await fetchEmployees();
      setEmployees(emps);

      const [worktimeRows, advanceRecords, scheduled] = await Promise.all([
        fetchWorktimeRows(r),
        fetchAdvances(emps, undefined, r).catch(optionalData([] as AdvanceRecord[], "Advances")),
        fetchScheduledEmpIds(r).catch(optionalData(new Set<string>(), "The planning")),
      ]);

      setRows(worktimeRows);
      setAdvances(advanceRecords);
      setScheduledIds(scheduled);
      setRangeState(r);
    } catch (err) {
      console.error("Error loading weekly advances:", err);
      setError(friendlyError(err, "Couldn't load the weekly advances"));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load(initialRange ?? getThisWeekRange());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map emp_id -> that employee's advance record for this range (id is what matters for revoke).
  const advanceByEmp = useMemo(() => {
    const map: Record<string, AdvanceRecord> = {};
    advances.forEach((a) => {
      map[String(a.empId)] = a;
    });
    return map;
  }, [advances]);

  const advanceRows: WeeklyAdvanceRow[] = useMemo(() => {
    const groups: Record<string, WorktimeRow[]> = {};
    rows.forEach((row) => {
      const key = String(row.emp_id);
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });

    return employees
      .filter((emp) => scheduledIds.has(String(emp.emp_id))) // only employees scheduled (Planning) in this range
      .filter((emp) => {
        if (!search) return true;
        const name = `${emp.FirstName} ${emp.LastName}`.toLowerCase();
        return name.includes(search.toLowerCase());
      })
      .map((emp) => {
        const empRows = groups[String(emp.emp_id)] || [];
        const hourlyRate = payrollConfig.hourlyRate(emp);
        const hours = sumHours(empRows);
        const weeklySalary = hours * hourlyRate;
        const consommation = sumConsommation(empRows);
        const absences = empRows.reduce((sum, r) => sum + (r.absent ? 1 : 0), 0);
        const advanceOffer = payrollConfig.weeklyAdvance({ hours, hourlyRate, consommation });
        const existing = advanceByEmp[String(emp.emp_id)];

        return {
          empId: emp.emp_id,
          firstName: emp.FirstName,
          lastName: emp.LastName,
          hourlyRate: Number(hourlyRate.toFixed(2)),
          hours: Number(hours.toFixed(2)),
          absences,
          weeklySalary: Number(weeklySalary.toFixed(2)),
          consommation: Number(consommation.toFixed(2)),
          advanceOffer: Number(advanceOffer.toFixed(2)),
          advanceGiven: Boolean(existing),
          advanceId: existing?.id,
        };
      });
  }, [employees, rows, search, advanceByEmp, scheduledIds]);


  const giveAdvance = useCallback(
    async (empId: number | string, amount: number, date: string) => {
      const res = await fetch(`${API_BASE_URL}/advances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emp_id: empId,
          amount,
          date,
          reason: `Weekly advance (${range.start} to ${range.end})`,
        }),
      });
      await ensureOk(res); // the modal catches this and shows the message
      const created = await res.json();
      setAdvances((prev) => [
        ...prev,
        { id: created._id, empId, employee: undefined, amount, date, reason: "Weekly advance" },
      ]);
      toast.success("Advance given.");
    },
    [range]
  );


  const revokeAdvance = useCallback(async (advanceId: string | undefined) => {
    if (!advanceId) return;
    const previous = advances;
    setAdvances((prev) => prev.filter((a) => a.id !== advanceId));
    try {
      await deleteAdvance(advanceId);
    } catch (err) {
      setAdvances(previous);
      toast.error(friendlyError(err, "Couldn't remove the advance"));
    }
  }, [advances]);

  return {
    range,
    setRange: load,
    advanceRows,
    search,
    //sumAbsences,
    setSearch,
    loading,
    error,
    giveAdvance,
    revokeAdvance,
  };
}