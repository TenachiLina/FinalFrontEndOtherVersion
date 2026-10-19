"use client";
import React from "react";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../ui/table";
import SimpleRangePicker from "./SimpleRangePicker";
import { useBonusesHistory, BonusHistoryRow } from "@/hooks/useBonusesHistory";

import { currency } from "@/lib/payrollConfig";
import LoadError from "@/components/ui/feedback/LoadError";
import { t } from "@/lib/i18n";
const HEADERS = ["Employee", "Amount", "Date", "Reason", ""];

const BonusesHistoryView: React.FC = () => {
  const { range, setRange, rows, total, search, setSearch, loading, error, revokeBonus } =
    useBonusesHistory();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">{t("Bonus History")}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t("All bonuses given to employees over a chosen period.")}</p>
      </div>

      <SimpleRangePicker range={range} onApply={setRange} />

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Search employee…")}
          className="w-56 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        />

        <div className="ms-auto rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-end dark:border-green-900 dark:bg-green-500/10">
          <div className="text-xs text-gray-500 dark:text-gray-400">{t("Total Bonuses")}</div>
          <div className="text-sm font-bold text-green-600 dark:text-green-400">{total.toFixed(2)} {currency()}</div>
        </div>
      </div>

      {error && (
        <LoadError title="Couldn't load the bonus history" message={error} onRetry={() => setRange(range)} />
      )}
      {loading && <div className="text-sm text-gray-500 dark:text-gray-400">{t("Loading…")}</div>}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
        <Table className="min-w-full">
          <TableHeader className="bg-gray-50 dark:bg-gray-800/60">
            <TableRow>
              {HEADERS.map((h, idx) => (
                <TableCell key={`${h}-${idx}`} isHeader className="p-3 text-start text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {t(h)}
                </TableCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              <>
                {rows.map((b: BonusHistoryRow) => (
                  <TableRow key={b.id}>
                    <TableCell className="p-3 text-sm font-medium text-gray-800 dark:text-white">{b.employeeName}</TableCell>
                    <TableCell className="p-3 text-sm font-semibold text-green-600 dark:text-green-400">{b.amount.toFixed(2)} {currency()}</TableCell>
                    <TableCell className="p-3 text-sm text-gray-600 dark:text-gray-400">{b.date}</TableCell>
                    <TableCell className="p-3 text-sm text-gray-500 dark:text-gray-400">{b.reason || "—"}</TableCell>
                    <TableCell className="p-3 text-end">
                      <button onClick={() => revokeBonus(b.id)} className="text-sm font-medium text-red-500 hover:text-red-600">
                        {t("Revoke")}
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow key="totals" className="border-t-2 border-gray-300 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
                  <TableCell className="p-3 text-sm font-bold uppercase text-gray-800 dark:text-white">Total ({rows.length})</TableCell>
                  <TableCell className="p-3 text-sm font-bold text-green-600 dark:text-green-400">{total.toFixed(2)} {currency()}</TableCell>
                  <TableCell className="p-3">{null}</TableCell>
                  <TableCell className="p-3">{null}</TableCell>
                  <TableCell className="p-3">{null}</TableCell>
                </TableRow>
              </>
            ) : (
              <TableRow key="empty">
                <TableCell className="p-6 text-center text-sm text-gray-400">{t("No bonuses in this range")}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default BonusesHistoryView;