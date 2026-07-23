import { useState, useEffect, useMemo, useCallback } from "react";
import { Employee, WorktimeRow, DateRange, AdvanceRecord } from "@/components/reporting/types";
import {
  getThisWeekRange,
  fetchEmployees,
  fetchWorktimeRows,
  fetchAdvances,
  fetchScheduledEmpIds,
  deleteAdvance,
  API_BASE_URL,
} from "@/lib/reporting";
import { payrollConfig, sumHours, sumConsommation } from "@/lib/payrollConfig";

export interface WeeklyAdvanceRow {
  empId: number | string;
  firstName: string;
  lastName: string;
  hourlyRate: number;
  hours: number;
  weeklySalary: number; // brut for the week: hours * hourlyRate
  consommation: number;
  advanceOffer: number;
  advanceGiven: boolean;
  advanceId?: string; // present only when advanceGiven is true; needed to revoke
}

export function useWeeklyAdvancesList() {
  const [range, setRangeState] = useState<DateRange>(getThisWeekRange());
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
        fetchAdvances(emps, undefined, r).catch(() => [] as AdvanceRecord[]),
        fetchScheduledEmpIds(r).catch(() => new Set<string>()),
      ]);

      setRows(worktimeRows);
      setAdvances(advanceRecords);
      setScheduledIds(scheduled);
      setRangeState(r);
    } catch (err) {
      console.error("Error loading weekly advances:", err);
      setError("Failed to load weekly advances.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load(getThisWeekRange());
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
        const advanceOffer = payrollConfig.weeklyAdvance({ hours, hourlyRate, consommation });
        const existing = advanceByEmp[String(emp.emp_id)];

        return {
          empId: emp.emp_id,
          firstName: emp.FirstName,
          lastName: emp.LastName,
          hourlyRate: Number(hourlyRate.toFixed(2)),
          hours: Number(hours.toFixed(2)),
          weeklySalary: Number(weeklySalary.toFixed(2)),
          consommation: Number(consommation.toFixed(2)),
          advanceOffer: Number(advanceOffer.toFixed(2)),
          advanceGiven: Boolean(existing),
          advanceId: existing?.id,
        };
      });
  }, [employees, rows, search, advanceByEmp, scheduledIds]);

  const giveAdvance = useCallback(
    async (empId: number | string, amount: number) => {
      try {
        const res = await fetch(`${API_BASE_URL}/advances`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            emp_id: empId,
            amount,
            date: range.start,
            reason: `Weekly advance (${range.start} to ${range.end})`,
          }),
        });
        if (!res.ok) throw new Error("Failed to create advance");
        const created = await res.json();
        setAdvances((prev) => [
          ...prev,
          { id: created._id, empId, employee: undefined, amount, date: range.start, reason: "Weekly advance" },
        ]);
      } catch (err) {
        console.error("Error giving advance:", err);
      }
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
      console.error("Error revoking advance:", err);
      setAdvances(previous);
    }
  }, [advances]);

  return {
    range,
    setRange: load,
    advanceRows,
    search,
    setSearch,
    loading,
    error,
    giveAdvance,
    revokeAdvance,
  };
}