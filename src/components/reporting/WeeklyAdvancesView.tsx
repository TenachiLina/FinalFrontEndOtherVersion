"use client";
import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../ui/table";
import RangePicker from "./RangePicker";
import AdvanceModal from "./AdvanceModal";
import { useWeeklyAdvancesList, WeeklyAdvanceRow } from "@/hooks/useWeeklyAdvancesList";
import { readRange, rangeQuery } from "@/lib/rangeParams";

import { currency } from "@/lib/payrollConfig";
const TABLE_HEADERS = [
  "Employee",
  "Hour Rate",
  "Hours",
  "Absences",
  "Salary (Week)",
  "Consommation",
  "Advance Offer",
  "Status",
  "Action",
  "",
];

const sumBy = (rows: WeeklyAdvanceRow[], pick: (r: WeeklyAdvanceRow) => unknown): number =>
  rows.reduce((acc, r) => acc + (Number(pick(r)) || 0), 0);

const WeeklyAdvancesContent: React.FC = () => {
  const params = useSearchParams();
  // When coming back from an employee's details, reopen the same week
  const { range, setRange, advanceRows, search, setSearch, loading, error, giveAdvance, revokeAdvance } =
    useWeeklyAdvancesList(readRange(params));

  // Employee row for which the "Give Advance" modal is open (null = closed)
  const [selected, setSelected] = useState<WeeklyAdvanceRow | null>(null);

  const colTotals = {
    hours: sumBy(advanceRows, (r) => r.hours),
    absences: sumBy(advanceRows, (r) => r.absences),
    weeklySalary: sumBy(advanceRows, (r) => r.weeklySalary),
    consommation: sumBy(advanceRows, (r) => r.consommation),
    advanceOffer: sumBy(advanceRows, (r) => r.advanceOffer),
    givenCount: advanceRows.filter((r) => r.advanceGiven).length,
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Weekly Advances</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Review and give salary advances for the selected week, across all employees.
        </p>
      </div>

      <RangePicker mode="week" range={range} onApply={setRange} />

      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employee…"
          className="w-56 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}
      {loading && <div className="text-sm text-gray-500 dark:text-gray-400">Loading…</div>}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
        <Table className="min-w-full">
          <TableHeader className="bg-gray-50 dark:bg-gray-800/60">
            <TableRow>
              {TABLE_HEADERS.map((h, idx) => (
                <TableCell key={`${h}-${idx}`} isHeader className="p-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {advanceRows.length ? (
              <>
                {advanceRows.map((r: WeeklyAdvanceRow) => (
                  <TableRow key={r.empId}>
                    <TableCell className="p-3 text-sm font-medium text-gray-800 dark:text-white">
                      {r.firstName} {r.lastName}
                    </TableCell>
                    <TableCell className="p-3 text-sm text-gray-600 dark:text-gray-400">{r.hourlyRate.toFixed(2)} {currency()}/h</TableCell>
                    <TableCell className="p-3 text-sm text-gray-600 dark:text-gray-400">{r.hours} h</TableCell>
                    <TableCell className={`p-3 text-sm ${r.absences > 0 ? "font-semibold text-red-500" : "text-gray-400"}`}>
                      {r.absences > 0 ? r.absences : "—"}
                    </TableCell>
                    <TableCell className="p-3 text-sm font-medium text-gray-800 dark:text-white">{r.weeklySalary.toFixed(2)} {currency()}</TableCell>
                    <TableCell className="p-3 text-sm text-gray-600 dark:text-gray-400">{r.consommation} {currency()}</TableCell>
                    <TableCell className="p-3 text-sm font-semibold text-brand-600 dark:text-brand-400">
                      {r.advanceOffer.toFixed(2)} {currency()}
                    </TableCell>
                    <TableCell className="p-3">
                      {r.advanceGiven ? (
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/10 dark:text-green-400">
                          Given
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                          Not given
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="p-3">
                      {r.advanceGiven ? (
                        <button
                          onClick={() => revokeAdvance(r.advanceId)}
                          className="text-sm font-medium text-red-500 hover:text-red-600"
                        >
                          Undo
                        </button>
                      ) : (
                        <button
                          onClick={() => setSelected(r)}
                          className="text-sm font-medium text-brand-500 hover:text-brand-600"
                        >
                          Give Advance
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="p-3 text-right">
                      <Link
                        href={`/reporting/employee/${r.empId}?tab=advance&${rangeQuery(range)}&from=weekly-advances`}
                        className="inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-100 dark:border-brand-900 dark:bg-brand-500/10 dark:text-brand-400 dark:hover:bg-brand-500/20"
                      >
                        Details
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}

                <TableRow key="totals" className="border-t-2 border-gray-300 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
                  <TableCell className="p-3 text-sm font-bold uppercase text-gray-800 dark:text-white">Total</TableCell>
                  <TableCell className="p-3 text-sm text-gray-400">—</TableCell>
                  <TableCell className="p-3 text-sm font-bold text-gray-800 dark:text-white">{colTotals.hours} h</TableCell>
                  <TableCell className={`p-3 text-sm font-bold ${colTotals.absences > 0 ? "text-red-500" : "text-gray-400"}`}>
                    {colTotals.absences}
                  </TableCell>
                  <TableCell className="p-3 text-sm font-bold text-gray-800 dark:text-white">
                    {colTotals.weeklySalary.toFixed(2)} {currency()}
                  </TableCell>
                  <TableCell className="p-3 text-sm font-bold text-gray-800 dark:text-white">
                    {colTotals.consommation.toFixed(2)} {currency()}
                  </TableCell>
                  <TableCell className="p-3 text-sm font-bold text-brand-600 dark:text-brand-400">
                    {colTotals.advanceOffer.toFixed(2)} {currency()}
                  </TableCell>
                  <TableCell className="p-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {colTotals.givenCount} / {advanceRows.length} given
                  </TableCell>
                  <TableCell className="p-3">{null}</TableCell>
                  <TableCell className="p-3">{null}</TableCell>
                </TableRow>
              </>
            ) : (
              <TableRow key="empty">
                <TableCell className="p-6 text-center text-sm text-gray-400">No employees found</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <AdvanceModal
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        employeeName={selected ? `${selected.firstName} ${selected.lastName}` : ""}
        offer={selected?.advanceOffer ?? 0}
        range={range}
        onConfirm={(amount, date) => giveAdvance(selected!.empId, amount, date)}
      />
    </div>
  );
};

// useSearchParams needs a Suspense boundary for production builds
const WeeklyAdvancesView: React.FC = () => (
  <Suspense fallback={null}>
    <WeeklyAdvancesContent />
  </Suspense>
);

export default WeeklyAdvancesView;