import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Employee,
  WorktimeRow,
  EmployeeStatusRow,
  OverviewStats,
  AdvanceRecord,
  DateRange,
} from "@/components/reporting/types";
import {
  getThisWeekRange,
  fetchEmployees,
  fetchWorktimeRows,
  fetchAdvances,
  timeToDecimalHours,
} from "@/lib/reporting";
import { payrollConfig } from "@/lib/payrollConfig";

export function useReportingOverview() {
  const [range, setRangeState] = useState<DateRange>(getThisWeekRange());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rows, setRows] = useState<WorktimeRow[]>([]);
  const [advances, setAdvances] = useState<AdvanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (r: DateRange = range) => {
    setLoading(true);
    setError("");
    try {
      const emps = await fetchEmployees();
      setEmployees(emps);

      const [worktimeRows, advanceRecords] = await Promise.all([
        fetchWorktimeRows(r),
        fetchAdvances(emps, undefined, r).catch(() => [] as AdvanceRecord[]),
      ]);

      setRows(worktimeRows);
      setAdvances(advanceRecords);
      setRangeState(r);
    } catch (err) {
      console.error("Error loading overview:", err);
      setError("Failed to load overview data.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load(getThisWeekRange());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Per-employee rows (used only to derive aggregate stats + chart, no table shown) ──
  const employeeRows: EmployeeStatusRow[] = useMemo(() => {
    const groups: Record<string, WorktimeRow[]> = {};
    rows.forEach((row) => {
      const key = String(row.emp_id);
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });

    return employees.map((emp) => {
      const empRows = groups[String(emp.emp_id)] || [];
      const hourlyRate = payrollConfig.hourlyRate(emp);

      const hours = empRows.reduce((sum, r) => sum + timeToDecimalHours(r.work_hours), 0);
      const consommation = empRows.reduce((sum, r) => sum + (r.consommation || 0), 0);
      const penalties = empRows.reduce((sum, r) => sum + (r.penalty || 0), 0);
      const absences = empRows.reduce((sum, r) => sum + (r.absent ? 1 : 0), 0);
      const lateCount = empRows.reduce((sum, r) => sum + (r.late_minutes > 0 ? 1 : 0), 0);
      const brutSalary = hours * hourlyRate;
      const netSalary = brutSalary - consommation - penalties;

      return {
        empId: emp.emp_id,
        firstName: emp.FirstName,
        lastName: emp.LastName,
        hours: Number(hours.toFixed(2)),
        netSalary: Number(netSalary.toFixed(2)),
        absences,
        lateCount,
        status: absences > 0 || lateCount > 1 ? "attention" : "ok",
      } as EmployeeStatusRow;
    });
  }, [employees, rows]);

  // ── Headline stats ─────────────────────────────────────────────────────
  const stats: OverviewStats = useMemo(() => {
    const totalHours = employeeRows.reduce((sum, e) => sum + e.hours, 0);
    const totalNetPayroll = employeeRows.reduce((sum, e) => sum + e.netSalary, 0);
    const totalAbsences = employeeRows.reduce((sum, e) => sum + e.absences, 0);

    return {
      totalHoursWorked: totalHours.toFixed(2),
      totalNetPayroll: totalNetPayroll.toFixed(2),
      totalAbsences,
      activeAdvancesCount: advances.length,
    };
  }, [employeeRows, advances]);

  // ── Chart 1: hours per employee (outlier scanner across the chosen range) ──
  const hoursPerEmployeeChart = useMemo(
    () => ({
      categories: employeeRows.map((e) => `${e.firstName} ${e.lastName}`.trim() || `#${e.empId}`),
      series: employeeRows.map((e) => e.hours),
    }),
    [employeeRows]
  );

  // ── Chart 1b: net salary per employee for the chosen range ────────────
  const netSalaryPerEmployeeChart = useMemo(
    () => ({
      categories: employeeRows.map((e) => `${e.firstName} ${e.lastName}`.trim() || `#${e.empId}`),
      series: employeeRows.map((e) => e.netSalary),
    }),
    [employeeRows]
  );

  // ── Chart 2: daily trend across the chosen range (hours, penalties, consommation) ──
  const dailyTrendChart = useMemo(() => {
    const byDate: Record<string, { hours: number; penalty: number; consommation: number }> = {};
    rows.forEach((r) => {
      if (!byDate[r.work_date]) byDate[r.work_date] = { hours: 0, penalty: 0, consommation: 0 };
      byDate[r.work_date].hours += timeToDecimalHours(r.work_hours);
      byDate[r.work_date].penalty += r.penalty || 0;
      byDate[r.work_date].consommation += r.consommation || 0;
    });
    const dates = Object.keys(byDate).sort();
    return {
      categories: dates,
      hoursSeries: dates.map((d) => Number(byDate[d].hours.toFixed(2))),
      penaltySeries: dates.map((d) => Number(byDate[d].penalty.toFixed(2))),
      consommationSeries: dates.map((d) => Number(byDate[d].consommation.toFixed(2))),
    };
  }, [rows]);

  return {
    range,
    setRange: load,
    stats,
    hoursPerEmployeeChart,
    netSalaryPerEmployeeChart,
    dailyTrendChart,
    loading,
    error,
  };
}