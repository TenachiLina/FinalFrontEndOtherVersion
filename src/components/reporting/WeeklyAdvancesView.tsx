"use client";
import React from "react";
import Link from "next/link";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../ui/table";
import RangePicker from "./RangePicker";
import { useWeeklyAdvancesList, WeeklyAdvanceRow } from "@/hooks/useWeeklyAdvancesList";

const TABLE_HEADERS = [
  "Employee",
  "Hour Rate",
  "Hours",
  "Salary (Week)",
  "Consommation",
  "Advance Offer",
  "Status",
  "Action",
  "",
];

const WeeklyAdvancesView: React.FC = () => {
  const { range, setRange, advanceRows, search, setSearch, loading, error, giveAdvance, revokeAdvance } =
    useWeeklyAdvancesList();

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
              advanceRows.map((r: WeeklyAdvanceRow) => (
                <TableRow key={r.empId}>
                  <TableCell className="p-3 text-sm font-medium text-gray-800 dark:text-white">
                    {r.firstName} {r.lastName}
                  </TableCell>
                  <TableCell className="p-3 text-sm text-gray-600 dark:text-gray-400">{r.hourlyRate.toFixed(2)} DA/h</TableCell>
                  <TableCell className="p-3 text-sm text-gray-600 dark:text-gray-400">{r.hours} h</TableCell>
                  <TableCell className="p-3 text-sm font-medium text-gray-800 dark:text-white">{r.weeklySalary.toFixed(2)} DA</TableCell>
                  <TableCell className="p-3 text-sm text-gray-600 dark:text-gray-400">{r.consommation} DA</TableCell>
                  <TableCell className="p-3 text-sm font-semibold text-brand-600 dark:text-brand-400">
                    {r.advanceOffer.toFixed(2)} DA
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
                        onClick={() => giveAdvance(r.empId, r.advanceOffer)}
                        className="text-sm font-medium text-brand-500 hover:text-brand-600"
                      >
                        Give Advance
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="p-3 text-right">
                    <Link
                      href={`/reporting/employee/${r.empId}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-100 dark:border-brand-900 dark:bg-brand-500/10 dark:text-brand-400 dark:hover:bg-brand-500/20"
                    >
                      Details
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow key="empty">
                <TableCell className="p-6 text-center text-sm text-gray-400">No employees found</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default WeeklyAdvancesView;