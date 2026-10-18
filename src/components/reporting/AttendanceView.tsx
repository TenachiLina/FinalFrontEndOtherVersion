"use client";
import React, { useEffect, useState } from "react";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../ui/table";
import SimpleRangePicker from "./SimpleRangePicker";
import { useAttendanceReport, AttendanceRow } from "@/hooks/useAttendanceReport";
import { DateRange } from "@/components/reporting/types";
import { getThisWeekRange } from "@/lib/reporting";
import LoadError from "@/components/ui/feedback/LoadError";

const TABLE_HEADERS = ["Employee", "Date", "Late (min)", "Absent", "Comment"];

const AttendanceView: React.FC = () => {
  const {
    setFilterMode,
    setCustomStart,
    setCustomEnd,
    fetchReport,
    rows,
    stats,
    onlyIssues,
    setOnlyIssues,
    loading,
    error,
  } = useAttendanceReport();

  const [range, setRange] = useState<DateRange>(getThisWeekRange());
  // Bumped on every apply: the hook's fetchReport reads its own state, so we must
  // wait for the new custom start/end to be committed before calling it.
  const [applyTick, setApplyTick] = useState(0);

  const applyRange = (r: DateRange) => {
    setRange(r);
    setFilterMode("custom");
    setCustomStart(r.start);
    setCustomEnd(r.end);
    setApplyTick((t) => t + 1);
  };

  // Load the default range (this week) on mount so the picker and the table agree
  useEffect(() => {
    applyRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (applyTick > 0) fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyTick]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Attendance</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Lateness and absences across all employees.</p>
      </div>

      <SimpleRangePicker range={range} onApply={applyRange} />

      <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
        Only show issues
      </label>

      {error && (
        <LoadError title="Couldn't load the attendance" message={error} onRetry={() => fetchReport()} />
      )}
      {loading && <div className="text-sm text-gray-500 dark:text-gray-400">Loading…</div>}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Late Events" value={`${stats.totalLateEvents}`} />
        <StatCard label="Total Late Minutes" value={`${stats.totalLateMinutes} min`} />
        <StatCard label="Absences" value={`${stats.totalAbsences}`} tone={stats.totalAbsences > 0 ? "warning" : "default"} />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
        <Table className="min-w-full">
          <TableHeader className="bg-gray-50 dark:bg-gray-800/60">
            <TableRow>
              {TABLE_HEADERS.map((h) => (
                <TableCell key={h} isHeader className="p-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((r: AttendanceRow, idx: number) => (
                <TableRow key={idx} className={r.absent ? "bg-red-50/40 dark:bg-red-500/5" : ""}>
                  <TableCell className="p-3 text-sm font-medium text-gray-800 dark:text-white">{r.employeeName}</TableCell>
                  <TableCell className="p-3 text-sm text-gray-600 dark:text-gray-400">{r.work_date}</TableCell>
                  <TableCell className={`p-3 text-sm ${r.late_minutes > 0 ? "font-medium text-amber-600 dark:text-amber-400" : "text-gray-400"}`}>
                    {r.late_minutes || "—"}
                  </TableCell>
                  <TableCell className={`p-3 text-sm font-medium ${r.absent ? "text-red-500" : "text-gray-400"}`}>
                    {r.absent ? "Yes" : "—"}
                  </TableCell>
                  <TableCell className="p-3 text-sm italic text-gray-500 dark:text-gray-400">{r.absent_comment || "—"}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow key="empty">
                <TableCell className="p-6 text-center text-sm text-gray-400">
                  No attendance issues in this range 🎉
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string; tone?: "default" | "warning" }> = ({
  label,
  value,
  tone = "default",
}) => (
  <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center dark:border-gray-800 dark:bg-white/[0.03]">
    <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    <div
      className={`mt-1 text-xl font-bold ${
        tone === "warning" ? "text-amber-600 dark:text-amber-400" : "text-gray-800 dark:text-white"
      }`}
    >
      {value}
    </div>
  </div>
);

export default AttendanceView;