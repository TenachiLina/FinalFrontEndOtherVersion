"use client";
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../ui/table";
import SimpleRangePicker from "./SimpleRangePicker";
import { useAdvancesReport } from "@/hooks/useAdvancesReport";
import { AdvanceRecord, DateRange } from "@/components/reporting/types";
import { getThisMonthRange } from "@/lib/reporting";

import { currency } from "@/lib/payrollConfig";
import LoadError from "@/components/ui/feedback/LoadError";
const TABLE_HEADERS = ["Employee", "Amount", "Date", "Reason", ""];

const AdvancesView: React.FC = () => {
  const { advances, search, setSearch, loading, error, revokeAdvance } = useAdvancesReport();
  const [range, setRange] = useState<DateRange>(getThisMonthRange());

  // Keep only advances inside the selected range (compares the YYYY-MM-DD part, so
  // it also works if the API returns full ISO timestamps).
  const filteredAdvances = useMemo(
    () =>
      advances.filter((a: AdvanceRecord) => {
        const day = String(a.date).slice(0, 10);
        return day >= range.start && day <= range.end;
      }),
    [advances, range]
  );

  // Recomputed from the filtered list so it always matches what's in the table
  const totalAdvanced = useMemo(
    () => filteredAdvances.reduce((sum, a) => sum + (Number(a.amount) || 0), 0),
    [filteredAdvances]
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Advances</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Salary advances given to employees.</p>
      </div>

      <SimpleRangePicker range={range} onApply={setRange} />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Search employee</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-56 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          />
        </div>

        <div className="ml-auto rounded-2xl border border-gray-200 bg-gray-50 px-5 py-2.5 text-right dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="text-xs text-gray-500 dark:text-gray-400">Total Advanced</div>
          <div className="text-lg font-bold text-gray-800 dark:text-white">{totalAdvanced.toFixed(2)} {currency()}</div>
        </div>
      </div>

      {error && (
        <LoadError title="Couldn't load the advances" message={error} onRetry={() => window.location.reload()} />
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
            {filteredAdvances.length ? (
              filteredAdvances.map((a: AdvanceRecord, idx: number) => (
                <TableRow key={a.id || idx}>
                  <TableCell className="p-3 text-sm font-medium text-gray-800 dark:text-white">
                    {a.employee ? (
                      <Link href={`/reporting/employee/${a.empId}`} className="hover:text-brand-500">
                        {a.employee.FirstName} {a.employee.LastName}
                      </Link>
                    ) : (
                      `#${a.empId}`
                    )}
                  </TableCell>
                  <TableCell className="p-3 text-sm text-gray-600 dark:text-gray-400">{a.amount.toFixed(2)} {currency()}</TableCell>
                  <TableCell className="p-3 text-sm text-gray-600 dark:text-gray-400">{a.date}</TableCell>
                  <TableCell className="p-3 text-sm text-gray-500 dark:text-gray-400">{a.reason || "—"}</TableCell>
                  <TableCell className="p-3 text-right">
                    <button
                      onClick={() => revokeAdvance(a.id)}
                      className="text-sm font-medium text-red-500 hover:text-red-600"
                    >
                      Revoke
                    </button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow key="empty">
                <TableCell className="p-6 text-center text-sm text-gray-400">No advances in this range</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default AdvancesView;