"use client";
import React, { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../ui/table";
import RangePicker from "./RangePicker";
import { useMonthlyPayrollList, MonthlyPayrollRow } from "@/hooks/useMonthlyPayrollList";
import { readRange, rangeQuery } from "@/lib/rangeParams";

import { currency } from "@/lib/payrollConfig";
import LoadError from "@/components/ui/feedback/LoadError";
const sumBy = (rows: MonthlyPayrollRow[], pick: (r: MonthlyPayrollRow) => unknown): number =>
  rows.reduce((acc, r) => acc + (Number(pick(r)) || 0), 0);

const MonthlyPayrollContent: React.FC = () => {
  const params = useSearchParams();
  // When coming back from an employee's details, reopen the same month
  const { range, setRange, payrollRows, totals, monthLabel, search, setSearch, loading, error } =
    useMonthlyPayrollList(readRange(params));

  const headers = [
    "Employee",
    "Salaire de Base",
    "Hour Rate",
    "Total Heures",
    "Total Avances",
    "Total Consommations",
    "Total Penalites",
    "Total Primes",
    `Salaire Brut ${monthLabel}`,
    `Salaire Net ${monthLabel}`,
    "",
  ];

  // Column totals (computed from the rows currently displayed, so they follow the search filter)
  const colTotals = {
    baseSalary: sumBy(payrollRows, (r) => r.baseSalary),
    hours: sumBy(payrollRows, (r) => r.hours),
    advances: sumBy(payrollRows, (r) => r.advancesDeducted),
    consommation: sumBy(payrollRows, (r) => r.consommation),
    penalties: sumBy(payrollRows, (r) => r.penalties),
    bonuses: sumBy(payrollRows, (r) => r.bonuses),
    brut: sumBy(payrollRows, (r) => r.brut),
    net: sumBy(payrollRows, (r) => r.net),
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Monthly Payroll</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Net payout for every employee for the selected pay period.
        </p>
      </div>

      <RangePicker mode="month" range={range} onApply={setRange} />

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employee…"
          className="w-56 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        />

        <div className="ml-auto flex flex-wrap gap-3">
          <TotalPill label="Total Brut" value={`${totals.totalBrut} ${currency()}`} />
          <TotalPill label="Total Advances" value={`${totals.totalAdvances} ${currency()}`} negative />
          <TotalPill label="Total Net Payout" value={`${totals.totalNet} ${currency()}`} highlight />
        </div>
      </div>

      {error && (
        <LoadError title="Couldn't load the payroll" message={error} onRetry={() => setRange(range)} />
      )}
      {loading && <div className="text-sm text-gray-500 dark:text-gray-400">Loading…</div>}

      {/* Table has its own horizontal scrollbar, scoped to just the table.
          Full words, full numbers, sticky employee column so you never lose
          track of which row you're reading while scrolling. */}
      <div className="w-full max-w-full overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
        <Table className="w-max">
          <TableHeader className="bg-[#2563a0]">
            <TableRow>
              {headers.map((h, idx) => (
                <TableCell
                  key={`${h}-${idx}`}
                  isHeader
                  className={`whitespace-nowrap p-3 text-center text-xs font-bold uppercase tracking-wide text-white ${
                    idx === 0 ? "sticky left-0 z-20 bg-[#2563a0] text-left" : ""
                  }`}
                >
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {payrollRows.length ? (
              <>
                {payrollRows.map((r: MonthlyPayrollRow) => (
                  <TableRow key={r.empId}>
                    <TableCell className="sticky left-0 z-10 whitespace-nowrap bg-white p-3 text-sm font-medium text-gray-800 shadow-[2px_0_4px_rgba(0,0,0,0.04)] dark:bg-gray-900 dark:text-white">
                      {r.firstName} {r.lastName}
                    </TableCell>
                    <TableCell className="whitespace-nowrap p-3 text-center text-sm text-gray-600 dark:text-gray-400">
                      {r.baseSalary.toFixed(2)} {currency()}
                    </TableCell>
                    <TableCell className="whitespace-nowrap p-3 text-center text-sm text-gray-600 dark:text-gray-400">
                      {r.hourlyRate.toFixed(2)} {currency()}/h
                    </TableCell>
                    <TableCell className="whitespace-nowrap p-3 text-center text-sm text-gray-600 dark:text-gray-400">{r.hours} h</TableCell>
                    <TableCell className="whitespace-nowrap p-3 text-center text-sm text-red-500">{r.advancesDeducted.toFixed(2)} {currency()}</TableCell>
                    <TableCell className="whitespace-nowrap p-3 text-center text-sm text-red-500">{r.consommation.toFixed(2)} {currency()}</TableCell>
                    <TableCell className="whitespace-nowrap p-3 text-center text-sm text-red-500">{r.penalties.toFixed(2)} {currency()}</TableCell>
                    <TableCell className="whitespace-nowrap p-3 text-center text-sm text-green-600 dark:text-green-400">
                      {r.bonuses.toFixed(2)} {currency()}
                    </TableCell>
                    <TableCell className="whitespace-nowrap p-3 text-center text-sm font-medium text-gray-800 dark:text-white">
                      {r.brut.toFixed(2)} {currency()}
                    </TableCell>
                    <TableCell className="whitespace-nowrap p-3 text-center text-sm font-semibold text-green-600 dark:text-green-400">
                      {r.net.toFixed(2)} {currency()}
                    </TableCell>
                    <TableCell className="whitespace-nowrap p-3 text-right">
                      <Link
                        href={`/reporting/employee/${r.empId}?tab=payroll&${rangeQuery(range)}&from=monthly-payroll`}
                        className="inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-100 dark:border-brand-900 dark:bg-brand-500/10 dark:text-brand-400 dark:hover:bg-brand-500/20"
                      >
                        Details
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}

                {/* Totals row */}
                <TableRow key="totals" className="border-t-2 border-gray-300 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
                  <TableCell className="sticky left-0 z-10 whitespace-nowrap bg-gray-100 p-3 text-sm font-bold uppercase text-gray-800 shadow-[2px_0_4px_rgba(0,0,0,0.04)] dark:bg-gray-800 dark:text-white">
                    Total
                  </TableCell>
                  <TableCell className="whitespace-nowrap p-3 text-center text-sm font-bold text-gray-800 dark:text-white">
                    {colTotals.baseSalary.toFixed(2)} {currency()}
                  </TableCell>
                  <TableCell className="whitespace-nowrap p-3 text-center text-sm text-gray-400">—</TableCell>
                  <TableCell className="whitespace-nowrap p-3 text-center text-sm font-bold text-gray-800 dark:text-white">
                    {colTotals.hours} h
                  </TableCell>
                  <TableCell className="whitespace-nowrap p-3 text-center text-sm font-bold text-red-500">
                    {colTotals.advances.toFixed(2)} {currency()}
                  </TableCell>
                  <TableCell className="whitespace-nowrap p-3 text-center text-sm font-bold text-red-500">
                    {colTotals.consommation.toFixed(2)} {currency()}
                  </TableCell>
                  <TableCell className="whitespace-nowrap p-3 text-center text-sm font-bold text-red-500">
                    {colTotals.penalties.toFixed(2)} {currency()}
                  </TableCell>
                  <TableCell className="whitespace-nowrap p-3 text-center text-sm font-bold text-green-600 dark:text-green-400">
                    {colTotals.bonuses.toFixed(2)} {currency()}
                  </TableCell>
                  <TableCell className="whitespace-nowrap p-3 text-center text-sm font-bold text-gray-800 dark:text-white">
                    {colTotals.brut.toFixed(2)} {currency()}
                  </TableCell>
                  <TableCell className="whitespace-nowrap p-3 text-center text-sm font-bold text-green-600 dark:text-green-400">
                    {colTotals.net.toFixed(2)} {currency()}
                  </TableCell>
                  <TableCell className="p-3">{null}</TableCell>
                </TableRow>
              </>
            ) : (
              <TableRow key="empty">
                <TableCell className="p-6 text-center text-sm text-gray-400">No employees found</TableCell>
                <TableCell className="p-6">{null}</TableCell>
                <TableCell className="p-6">{null}</TableCell>
                <TableCell className="p-6">{null}</TableCell>
                <TableCell className="p-6">{null}</TableCell>
                <TableCell className="p-6">{null}</TableCell>
                <TableCell className="p-6">{null}</TableCell>
                <TableCell className="p-6">{null}</TableCell>
                <TableCell className="p-6">{null}</TableCell>
                <TableCell className="p-6">{null}</TableCell>
                <TableCell className="p-6">{null}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-gray-400">Scroll the table right to see all columns — employee names stay fixed in place.</p>
    </div>
  );
};

const TotalPill: React.FC<{ label: string; value: string; negative?: boolean; highlight?: boolean }> = ({
  label,
  value,
  negative,
  highlight,
}) => (
  <div
    className={`rounded-xl border px-4 py-2 text-right ${
      highlight
        ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-500/10"
        : "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03]"
    }`}
  >
    <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    <div
      className={`text-sm font-bold ${
        highlight ? "text-green-600 dark:text-green-400" : negative ? "text-red-500" : "text-gray-800 dark:text-white"
      }`}
    >
      {value}
    </div>
  </div>
);

// useSearchParams needs a Suspense boundary for production builds
const MonthlyPayrollView: React.FC = () => (
  <Suspense fallback={null}>
    <MonthlyPayrollContent />
  </Suspense>
);

export default MonthlyPayrollView;