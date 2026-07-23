import { useState, useEffect, useMemo, useCallback } from "react";
import { Employee, WorktimeRow, DateRange, AdvanceRecord } from "@/components/reporting/types";
import { getThisMonthRange, fetchEmployees, fetchWorktimeRows, fetchAdvances, fetchScheduledEmpIds } from "@/lib/reporting";
import { payrollConfig, sumHours, sumConsommation, sumPenalties, sumAbsences } from "@/lib/payrollConfig";

export interface MonthlyPayrollRow {
  empId: number | string;
  firstName: string;
  lastName: string;
  baseSalary: number;
  hourlyRate: number;
  hours: number;
  brut: number;
  penalties: number;
  consommation: number;
  advancesDeducted: number;
  net: number;
  absences: number;
}

export function useMonthlyPayrollList() {
  const [range, setRangeState] = useState<DateRange>(getThisMonthRange());
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
      console.error("Error loading monthly payroll:", err);
      setError("Failed to load monthly payroll.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load(getThisMonthRange());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const advancesByEmp = useMemo(() => {
    const map: Record<string, number> = {};
    advances.forEach((a) => {
      const key = String(a.empId);
      map[key] = (map[key] || 0) + a.amount;
    });
    return map;
  }, [advances]);

  const payrollRows: MonthlyPayrollRow[] = useMemo(() => {
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
        const penalties = sumPenalties(empRows);
        const consommation = sumConsommation(empRows);
        const absences = sumAbsences(empRows);
        const advancesDeducted = advancesByEmp[String(emp.emp_id)] || 0;

        const { brut, net } = payrollConfig.monthlyPayout({
          hours,
          hourlyRate,
          penalties,
          consommation,
          advancesGivenThisMonth: advancesDeducted,
        });

        return {
          empId: emp.emp_id,
          firstName: emp.FirstName,
          lastName: emp.LastName,
          baseSalary: Number(emp.Base_salary || 0),
          hourlyRate: Number(hourlyRate.toFixed(2)),
          hours: Number(hours.toFixed(2)),
          brut: Number(brut.toFixed(2)),
          penalties: Number(penalties.toFixed(2)),
          consommation: Number(consommation.toFixed(2)),
          advancesDeducted: Number(advancesDeducted.toFixed(2)),
          net: Number(net.toFixed(2)),
          absences,
        };
      });
  }, [employees, rows, search, advancesByEmp, scheduledIds]);

  const totals = useMemo(
    () => ({
      totalBrut: payrollRows.reduce((sum, r) => sum + r.brut, 0).toFixed(2),
      totalNet: payrollRows.reduce((sum, r) => sum + r.net, 0).toFixed(2),
      totalAdvances: payrollRows.reduce((sum, r) => sum + r.advancesDeducted, 0).toFixed(2),
    }),
    [payrollRows]
  );

  // e.g. "September 2025" — derived from the range's start date, for column headers.
  const monthLabel = useMemo(() => {
    if (!range.start) return "";
    const d = new Date(`${range.start}T00:00:00`);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [range.start]);

  return {
    range,
    setRange: load,
    payrollRows,
    totals,
    monthLabel,
    search,
    setSearch,
    loading,
    error,
  };
}