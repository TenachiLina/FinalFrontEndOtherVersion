"use client";
import React, { useCallback, useEffect, useState } from "react";
import { LockClosedIcon, LockOpenIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/context/AuthContext";
import { friendlyError } from "@/lib/errors";
import { locale, t } from "@/lib/i18n";
import { confirmDialog, toast } from "@/lib/notify";
import { closeMonth, fetchMonthStatus, MonthStatus, reopenMonth } from "@/lib/payrollApi";

interface Props {
  /** "YYYY-MM" */
  month: string;
  /** Called after the month was closed or reopened, so the page reloads its numbers. */
  onChanged?: () => void;
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });

const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString(locale(), { month: "long", year: "numeric" });

/**
 * Says whether a month is closed (its hours and pay can no longer change),
 * and lets an admin close or reopen it.
 */
const MonthClosingBar: React.FC<Props> = ({ month, onChanged }) => {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "superadmin";
  const [status, setStatus] = useState<MonthStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    setStatus(null);
    fetchMonthStatus(month)
      .then((s) => {
        if (current) setStatus(s);
      })
      // The bar is extra information: without it the page still works
      .catch(() => {
        if (current) setStatus(null);
      });
    return () => {
      current = false;
    };
  }, [month]);

  const change = useCallback(
    async (action: "close" | "reopen") => {
      const name = monthLabel(month);
      const ok = await confirmDialog(
        action === "close"
          ? {
              title: t("Close {month}?", { month: name }),
              message: t(
                "Its hours, advances and bonuses can no longer be changed, and its payroll is kept as it is now. An admin can reopen it."
              ),
              confirmLabel: t("Close month"),
            }
          : {
              title: t("Reopen {month}?", { month: name }),
              message: t(
                "Its records can be changed again and its payroll is recalculated. It stays open until an admin closes it again."
              ),
              confirmLabel: t("Reopen month"),
              danger: true,
            }
      );
      if (!ok) return;
      setBusy(true);
      try {
        setStatus(await (action === "close" ? closeMonth(month) : reopenMonth(month)));
        toast.success(action === "close" ? "Month closed." : "Month reopened.");
        onChanged?.();
      } catch (err) {
        toast.error(
          friendlyError(err, action === "close" ? "Couldn't close the month" : "Couldn't reopen the month")
        );
      } finally {
        setBusy(false);
      }
    },
    [month, onChanged]
  );

  if (!status) return null;

  const button =
    "rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset disabled:cursor-not-allowed disabled:opacity-60";

  if (status.closed) {
    return (
      <div
        role="status"
        className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
      >
        <LockClosedIcon className="h-5 w-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t("{month} is closed", { month: monthLabel(month) })}</p>
          <p>
            {status.closedAt &&
              (status.auto || !status.closedBy
                ? t("Closed automatically on {date}.", { date: day(status.closedAt) })
                : t("Closed on {date} by {name}.", { date: day(status.closedAt), name: status.closedBy }))}{" "}
            {t("Its hours, advances and bonuses can no longer be changed.")}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            disabled={busy}
            onClick={() => change("reopen")}
            className={`${button} bg-white text-amber-900 ring-amber-300 hover:bg-amber-100 dark:bg-transparent dark:text-amber-200 dark:ring-amber-500/40`}
          >
            {t("Reopen month")}
          </button>
        )}
      </div>
    );
  }

  const note = status.reopenedAt
    ? t("Reopened on {date} by {name}. It stays open until an admin closes it again.", {
        date: day(status.reopenedAt),
        name: status.reopenedBy ?? "—",
      })
    : status.closesAt
      ? t("This month will close automatically on {date}.", { date: day(status.closesAt) })
      : "";
  const canClose = canManage && status.canClose;
  // An open month with nothing to say and nothing to do: no bar
  if (!note && !canClose) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300"
    >
      <LockOpenIcon className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-gray-800 dark:text-white/90">
          {t("{month} is open", { month: monthLabel(month) })}
        </p>
        {note && <p>{note}</p>}
      </div>
      {canClose && (
        <button
          type="button"
          disabled={busy}
          onClick={() => change("close")}
          className={`${button} bg-brand-500 text-white ring-brand-500 hover:bg-brand-600`}
        >
          {t("Close month")}
        </button>
      )}
    </div>
  );
};

export default MonthClosingBar;
