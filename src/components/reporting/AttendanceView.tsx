"use client";
import React from "react";
import Button from "../ui/button/Button";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../ui/table";
import { useAttendanceReport, AttendanceRow } from "@/hooks/useAttendanceReport";
import DateInput from "./DateInput";

const TABLE_HEADERS = ["Employee", "Date", "Late (min)", "Absent", "Comment"];

const AttendanceView: React.FC = () => {
  const {
    filterMode,
    setFilterMode,
    selectedDate,
    setSelectedDate,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    fetchReport,
    rows,
    stats,
    onlyIssues,
    setOnlyIssues,
    loading,
    error,
  } = useAttendanceReport();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Attendance</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Lateness and absences across all employees.</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Range</label>
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as typeof filterMode)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        {filterMode === "custom" ? (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Start</label>
              <DateInput value={customStart} onChange={setCustomStart} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">End</label>
              <DateInput value={customEnd} onChange={setCustomEnd} />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Start Date</label>
            <DateInput value={selectedDate} onChange={setSelectedDate} />
          </div>
        )}

        <Button size="md" variant="primary" onClick={fetchReport}>
          Apply
        </Button>

        <label className="ml-auto flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
          Only show issues
        </label>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
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