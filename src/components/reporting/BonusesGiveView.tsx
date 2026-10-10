"use client";
import React, { useState } from "react";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../ui/table";
import BonusModal from "./BonusModal";
import { useBonusesList, BonusEmployeeRow } from "@/hooks/useBonusesList";

const EMPLOYEE_HEADERS = ["Employee", "Primes This Month", "Total This Month", "Action"];

const BonusesGiveView: React.FC = () => {
  const { range, employeeRows, totalGiven, search, setSearch, loading, error, giveBonus } =
    useBonusesList();

  // Employee for which the "Give Prime" modal is open (null = closed)
  const [selected, setSelected] = useState<BonusEmployeeRow | null>(null);

  const totalCount = employeeRows.reduce((s, r) => s + r.count, 0);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Give Primes</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Give primes to employees. Primes are added to the net salary.
        </p>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400">
        This month:{" "}
        <span className="font-medium text-gray-800 dark:text-white">
          {range.start} → {range.end}
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employee…"
          className="w-56 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        />
        <div className="ml-auto rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-right dark:border-green-900 dark:bg-green-500/10">
          <div className="text-xs text-gray-500 dark:text-gray-400">Total Primes (this month)</div>
          <div className="text-sm font-bold text-green-600 dark:text-green-400">{totalGiven.toFixed(2)} DA</div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</div>
      )}
      {loading && <div className="text-sm text-gray-500 dark:text-gray-400">Loading…</div>}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
        <Table className="min-w-full">
          <TableHeader className="bg-gray-50 dark:bg-gray-800/60">
            <TableRow>
              {EMPLOYEE_HEADERS.map((h) => (
                <TableCell key={h} isHeader className="p-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {employeeRows.length ? (
              <>
                {employeeRows.map((r: BonusEmployeeRow) => (
                  <TableRow key={r.empId}>
                    <TableCell className="p-3 text-sm font-medium text-gray-800 dark:text-white">
                      {r.firstName} {r.lastName}
                    </TableCell>
                    <TableCell className={`p-3 text-sm ${r.count ? "font-medium text-gray-800 dark:text-white" : "text-gray-400"}`}>
                      {r.count || "—"}
                    </TableCell>
                    <TableCell className={`p-3 text-sm ${r.total ? "font-semibold text-green-600 dark:text-green-400" : "text-gray-400"}`}>
                      {r.total ? `${r.total.toFixed(2)} DA` : "—"}
                    </TableCell>
                    <TableCell className="p-3">
                      <button onClick={() => setSelected(r)} className="text-sm font-medium text-brand-500 hover:text-brand-600">
                        Give Prime
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow key="totals" className="border-t-2 border-gray-300 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
                  <TableCell className="p-3 text-sm font-bold uppercase text-gray-800 dark:text-white">Total</TableCell>
                  <TableCell className="p-3 text-sm font-bold text-gray-800 dark:text-white">{totalCount}</TableCell>
                  <TableCell className="p-3 text-sm font-bold text-green-600 dark:text-green-400">{totalGiven.toFixed(2)} DA</TableCell>
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

      <BonusModal
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        employeeName={selected ? `${selected.firstName} ${selected.lastName}` : ""}
        onConfirm={(amount, date, reason) => giveBonus(selected!.empId, amount, date, reason)}
      />
    </div>
  );
};

export default BonusesGiveView;