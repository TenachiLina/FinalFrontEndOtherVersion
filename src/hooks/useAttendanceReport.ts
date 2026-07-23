import { useState, useEffect, useMemo, useCallback } from "react";
import { Employee, WorktimeRow, DateRange, FilterMode } from "@/components/reporting/types";
import { getLastWeekRange, fetchEmployees, fetchWorktimeRows, toLocalDateString } from "@/lib/reporting";

export interface AttendanceRow extends WorktimeRow {
  employeeName: string;
}

export function useAttendanceReport() {
  const lastWeek = getLastWeekRange();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>("week");
  const [selectedDate, setSelectedDate] = useState(lastWeek.start);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(true); // show only late/absent rows by default

  const computeRange = useCallback((): DateRange => {
    const ref = new Date(selectedDate);

    if (filterMode === "day") return { start: selectedDate, end: selectedDate };

    if (filterMode === "week") {
      const start = new Date(ref);
      const end = new Date(ref);
      end.setDate(start.getDate() + 6);
      return { start: toLocalDateString(start), end: toLocalDateString(end) };
    }

    if (filterMode === "month") {
      const start = new Date(ref);
      const end = new Date(ref);
      end.setDate(start.getDate() + 29);
      return { start: toLocalDateString(start), end: toLocalDateString(end) };
    }

    return { start: customStart, end: customEnd };
  }, [filterMode, selectedDate, customStart, customEnd]);

  const [appliedRange, setAppliedRange] = useState<DateRange>(lastWeek);
  const [rawRows, setRawRows] = useState<WorktimeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchReport = useCallback(async () => {
    const range = computeRange();
    if (!range.start || !range.end) {
      setError("Please provide a valid date range.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [emps, rows] = await Promise.all([fetchEmployees(), fetchWorktimeRows(range)]);
      setEmployees(emps);
      setRawRows(rows);
      setAppliedRange(range);
    } catch (err) {
      console.error(err);
      setError("Failed to load attendance data.");
      setRawRows([]);
    } finally {
      setLoading(false);
    }
  }, [computeRange]);

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Rows with employee name attached ──────────────────────────────────
  const allRowsWithNames: AttendanceRow[] = useMemo(() => {
    return rawRows.map((r) => {
      const emp = employees.find((e) => String(e.emp_id) === String(r.emp_id));
      return {
        ...r,
        employeeName: emp ? `${emp.FirstName} ${emp.LastName}` : `#${r.emp_id}`,
      };
    });
  }, [rawRows, employees]);

  const rows: AttendanceRow[] = useMemo(() => {
    if (!onlyIssues) return allRowsWithNames;
    return allRowsWithNames.filter((r) => r.late_minutes > 0 || r.absent);
  }, [allRowsWithNames, onlyIssues]);

  const lateRows = useMemo(() => rows.filter((r) => r.late_minutes > 0), [rows]);
  const absentRows = useMemo(() => rows.filter((r) => r.absent), [rows]);

  const stats = useMemo(
    () => ({
      totalLateEvents: lateRows.length,
      totalAbsences: absentRows.length,
      totalLateMinutes: lateRows.reduce((sum, r) => sum + r.late_minutes, 0),
    }),
    [lateRows, absentRows]
  );

  return {
    filterMode,
    setFilterMode,
    selectedDate,
    setSelectedDate,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    appliedRange,
    fetchReport,

    rows,
    lateRows,
    absentRows,
    stats,
    onlyIssues,
    setOnlyIssues,

    loading,
    error,
  };
}