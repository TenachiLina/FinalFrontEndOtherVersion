import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Employee, WorktimeRow, DateRange, FilterMode } from "@/components/reporting/types";
import { getLastWeekRange, fetchEmployees, fetchWorktimeRows, toLocalDateString } from "@/lib/reporting";
import { friendlyError } from "@/lib/errors";
import { t } from "@/lib/i18n";

export interface AttendanceRow extends WorktimeRow {
  employeeName: string;
}

// initialRange: the range the page shows on open, loaded once as a custom range
// (without it, the hook opens on last Thursday-Wednesday)
export function useAttendanceReport(initialRange?: DateRange) {
  const lastWeek = getLastWeekRange();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>(initialRange ? "custom" : "week");
  const [selectedDate, setSelectedDate] = useState(lastWeek.start);
  const [customStart, setCustomStart] = useState(initialRange?.start ?? "");
  const [customEnd, setCustomEnd] = useState(initialRange?.end ?? "");
  const [onlyIssues, setOnlyIssues] = useState(true); // show only late/absent rows by default

  const computeRange = useCallback((): DateRange => {
    // Local midnight: "YYYY-MM-DD" alone is parsed as UTC, a day early west of UTC
    const ref = new Date(`${selectedDate}T00:00:00`);

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

  const [appliedRange, setAppliedRange] = useState<DateRange>(initialRange ?? lastWeek);
  const [rawRows, setRawRows] = useState<WorktimeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Each call gets an id; a response is only applied if no newer call started meanwhile
  const req = useRef(0);

  const fetchReport = useCallback(async () => {
    const range = computeRange();
    if (!range.start || !range.end) {
      setError(t("Please provide a valid date range."));
      return;
    }

    const reqId = ++req.current;
    setLoading(true);
    setError("");
    try {
      const [emps, rows] = await Promise.all([fetchEmployees(), fetchWorktimeRows(range)]);
      if (reqId !== req.current) return; // outdated response → ignore
      setEmployees(emps);
      setRawRows(rows);
      setAppliedRange(range);
    } catch (err) {
      if (reqId !== req.current) return;
      console.error(err);
      setError(friendlyError(err, "Couldn't load the attendance"));
      setRawRows([]);
    } finally {
      if (reqId === req.current) setLoading(false);
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