"use client";
import React, { useState } from "react";
import Link from "next/link";
import Button from "../ui/button/Button";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../ui/table";
import { useEmployeeReport } from "@/hooks/useEmployeeReport";
import { WorktimeRow } from "@/components/reporting/types";
import { toLocalDateString } from "@/lib/reporting";
import DateInput from "./DateInput";

interface EmployeeDetailViewProps {
  empId: string;
}

type Tab = "advance" | "payroll";

const EmployeeDetailView: React.FC<EmployeeDetailViewProps> = ({ empId }) => {
  const { employee, loadingEmployee, week, month } = useEmployeeReport(empId);
  const [tab, setTab] = useState<Tab>("advance");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/" className="text-sm text-brand-500 hover:text-brand-600">
          ← Back to Overview
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-800 dark:text-white">
          {loadingEmployee
            ? "Loading…"
            : employee
            ? `${employee.FirstName} ${employee.LastName}`
            : `Employee #${empId}`}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Payroll &amp; attendance detail.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-white/[0.03] w-fit">
        <TabButton active={tab === "advance"} onClick={() => setTab("advance")}>
          Weekly Advance
        </TabButton>
        <TabButton active={tab === "payroll"} onClick={() => setTab("payroll")}>
          Monthly Payroll
        </TabButton>
      </div>

      {tab === "advance" ? <WeeklyAdvanceTab week={week} /> : <MonthlyPayrollTab month={month} />}
    </div>
  );
};

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({
  active,
  onClick,
  children,
}) => (
  <button
    onClick={onClick}
    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
      active
        ? "bg-white text-brand-600 shadow-theme-xs dark:bg-gray-800 dark:text-brand-400"
        : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
    }`}
  >
    {children}
  </button>
);

// ═══════════════════════════════════════════════════════════════════════════
// WEEKLY ADVANCE TAB
// ═══════════════════════════════════════════════════════════════════════════

const WeeklyAdvanceTab: React.FC<{ week: ReturnType<typeof useEmployeeReport>["week"] }> = ({ week }) => {
  const [customStart, setCustomStart] = useState(week.range.start);

  const handleWeekChange = (start: string) => {
    const startDate = new Date(start);
    const end = new Date(startDate);
    end.setDate(startDate.getDate() + 6);
    week.setRange({ start, end: toLocalDateString(end) });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Week starting</label>
          <DateInput
            value={customStart}
            onChange={(val) => {
              setCustomStart(val);
              handleWeekChange(val);
            }}
          />
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {week.range.start} → {week.range.end}
        </div>
      </div>

      {week.error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          {week.error}
        </div>
      )}
      {week.loading && <div className="text-sm text-gray-500 dark:text-gray-400">Loading…</div>}

      {/* The headline advance offer card */}
      <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-6 dark:border-brand-900 dark:from-brand-500/10 dark:to-transparent">
        <div className="text-sm text-gray-500 dark:text-gray-400">Advance Offer This Week</div>
        <div className="mt-1 text-3xl font-bold text-brand-600 dark:text-brand-400">
          {week.advanceOffer.toFixed(2)} DA
        </div>
        <div className="mt-1 text-xs text-gray-400">
          (hours × hourly rate − consommation) / 2
        </div>

        <div className="mt-4 flex items-center gap-3">
          {week.advanceGiven ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 dark:bg-green-500/10 dark:text-green-400">
                ✓ Advance given for this week
              </span>
              <button
                onClick={week.revokeAdvance}
                disabled={week.isLoadingAdvance}
                className="text-sm font-medium text-red-500 hover:text-red-600"
              >
                Undo
              </button>
            </>
          ) : (
            <Button size="md" variant="primary" onClick={week.giveAdvance} disabled={week.isLoadingAdvance}>
              Give Advance
            </Button>
          )}
        </div>
      </div>

      {/* Supporting numbers */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SummaryCard label="Hours This Week" value={`${week.hours.toFixed(2)} h`} />
        <SummaryCard label="Consommation" value={`${week.consommation.toFixed(2)} DA`} />
      </div>

      {/* Day-by-day context */}
      <DayTable rows={week.rows} />
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// MONTHLY PAYROLL TAB
// ═══════════════════════════════════════════════════════════════════════════

const MonthlyPayrollTab: React.FC<{ month: ReturnType<typeof useEmployeeReport>["month"] }> = ({ month }) => {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Pay period: <strong className="text-gray-700 dark:text-gray-300">{month.range.start} → {month.range.end}</strong>
        </div>
      </div>

      {month.error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          {month.error}
        </div>
      )}
      {month.loading && <div className="text-sm text-gray-500 dark:text-gray-400">Loading…</div>}

      {/* Net payout — the headline number */}
      <div className="rounded-2xl border border-green-200 bg-gradient-to-br from-green-50 to-white p-6 dark:border-green-900 dark:from-green-500/10 dark:to-transparent">
        <div className="text-sm text-gray-500 dark:text-gray-400">Net Payout (Take-Home)</div>
        <div className="mt-1 text-3xl font-bold text-green-600 dark:text-green-400">
          {month.payout.net.toFixed(2)} DA
        </div>
        <div className="mt-1 text-xs text-gray-400">
          brut − penalties − consommation − advances given this month
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Brut Salary" value={`${month.payout.brut.toFixed(2)} DA`} />
        <SummaryCard label="Total Hours" value={`${month.hours.toFixed(2)} h`} />
        <SummaryCard label="Penalties" value={`${month.penalties.toFixed(2)} DA`} negative />
        <SummaryCard label="Consommation" value={`${month.consommation.toFixed(2)} DA`} negative />
        <SummaryCard label="Advances Deducted" value={`${month.advancesTotal.toFixed(2)} DA`} negative />
        <SummaryCard label="Absences" value={`${month.absences}`} />
        <SummaryCard label="Late Minutes" value={`${month.lateMinutes} min`} />
      </div>

      {/* Advances breakdown — auditable list of what was deducted and why */}
      {month.advancesList.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Advances Deducted This Month</h3>
          <ul className="flex flex-col gap-2">
            {month.advancesList.map((a, idx) => (
              <li key={idx} className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">{a.date}</span>
                <span className="font-medium text-gray-800 dark:text-white">{a.amount.toFixed(2)} DA</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Day-by-day */}
      <DayTable rows={month.rows} />
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Shared pieces
// ═══════════════════════════════════════════════════════════════════════════

const DayTable: React.FC<{ rows: WorktimeRow[] }> = ({ rows }) => {
  const headers = ["Date", "Hours", "Late (min)", "Overtime", "Penalty", "Consommation", "Absent"];
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
      <Table className="min-w-full">
        <TableHeader className="bg-gray-50 dark:bg-gray-800/60">
          <TableRow>
            {headers.map((h) => (
              <TableCell key={h} isHeader className="p-3 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">
                {h}
              </TableCell>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((r, idx) => {
              const dateObj = new Date(`${r.work_date}T00:00:00`);
              const weekday = dateObj.toLocaleDateString("en-US", { weekday: "short" });
              return (
                <TableRow key={idx} className={r.is_empty ? "bg-gray-50/60 dark:bg-white/[0.01]" : ""}>
                  <TableCell className="p-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {weekday}, {r.work_date}
                  </TableCell>
                  <TableCell className="p-3 text-center text-sm text-gray-600 dark:text-gray-400">
                    {r.work_hours ? `${r.work_hours}h` : "—"}
                  </TableCell>
                  <TableCell className="p-3 text-center text-sm text-gray-600 dark:text-gray-400">{r.late_minutes}</TableCell>
                  <TableCell className="p-3 text-center text-sm text-gray-600 dark:text-gray-400">{r.overtime_minutes}</TableCell>
                  <TableCell className="p-3 text-center text-sm text-gray-600 dark:text-gray-400">{r.penalty}</TableCell>
                  <TableCell className="p-3 text-center text-sm text-gray-600 dark:text-gray-400">{r.consommation}</TableCell>
                  <TableCell className={`p-3 text-center text-sm font-medium ${r.absent ? "text-red-500" : "text-gray-400"}`}>
                    {r.absent ? "Yes" : ""}
                    {r.absent && r.absent_comment && (
                      <div className="mt-0.5 text-xs italic text-gray-400">{r.absent_comment}</div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow key="empty">
              <TableCell className="p-6 text-center text-sm text-gray-400">No data available</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

const SummaryCard: React.FC<{ label: string; value: string; negative?: boolean }> = ({ label, value, negative }) => {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-1 text-xl font-bold ${negative ? "text-red-500" : "text-gray-800 dark:text-white"}`}>{value}</div>
    </div>
  );
};

export default EmployeeDetailView;