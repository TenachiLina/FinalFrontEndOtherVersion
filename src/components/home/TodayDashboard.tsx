"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import LoadError from "@/components/ui/feedback/LoadError";
import { useAuth } from "@/context/AuthContext";
import { canOpen } from "@/lib/auth";
import { Dashboard, fetchDashboard, PersonToday, TodayStatus } from "@/lib/dashboard";
import { friendlyError } from "@/lib/errors";
import { locale, t } from "@/lib/i18n";

/** How often the dashboard asks the server again while the page is open. */
export const REFRESH_MS = 60_000;

const STATUS: Record<TodayStatus, { label: string; badge: string }> = {
  missing: { label: "Not clocked in", badge: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400" },
  absent: { label: "Absent", badge: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" },
  present: { label: "Present", badge: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400" },
  expected: { label: "Expected later", badge: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300" },
  left: { label: "Left", badge: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400" },
};

const money = (n: number, currency: string) =>
  `${n.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

const monthName = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString(locale(), { month: "long", year: "numeric" });

function Tile({ label, value, tone, hint }: { label: string; value: number; tone: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <dt className="text-sm text-gray-500 dark:text-gray-400">{t(label)}</dt>
      <dd className={`mt-1 text-3xl font-bold ${value > 0 ? tone : "text-gray-800 dark:text-white/90"}`}>{value}</dd>
      {hint && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  );
}

function PersonRow({ p }: { p: PersonToday }) {
  const s = STATUS[p.status];
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
      <span className="min-w-0 flex-1 font-medium text-gray-800 dark:text-white/90">{p.name}</span>
      <span className="text-sm text-gray-500 dark:text-gray-400">{p.shift ?? t("Not planned")}</span>
      <span className="w-28 text-sm text-gray-600 dark:text-gray-300">
        {p.clockIn ? `${p.clockIn}${p.clockOut ? ` → ${p.clockOut}` : ""}` : "—"}
      </span>
      <span className="flex items-center gap-2">
        {p.late && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
            {t("{minutes} min late", { minutes: p.lateMinutes })}
          </span>
        )}
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.badge}`}>{t(s.label)}</span>
      </span>
    </li>
  );
}

/**
 * Today at a glance, at the top of Home: who is in, late, absent or has not
 * arrived, what is waiting for an answer and, for admins, the pay of the
 * month so far. Refreshes by itself every minute.
 */
export default function TodayDashboard() {
  const { user, company } = useAuth();
  const enabled = !!company && (user?.role === "admin" || user?.role === "manager" || user?.role === "superadmin");
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await fetchDashboard());
      setError("");
    } catch (err) {
      setError(friendlyError(err, "Couldn't load today's figures"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [enabled, load, company?.id]);

  if (!enabled || !user) return null;
  const open = (href: string) => canOpen(href, user, company);

  if (!data) {
    return error ? (
      <LoadError title="Couldn't load today's figures" message={error} onRetry={load} />
    ) : (
      <p className="text-sm text-gray-500 dark:text-gray-400">{loading ? t("Loading…") : ""}</p>
    );
  }

  const { attendance, month, pending } = data;
  const counts = attendance?.counts;
  const waiting = pending.corrections > 0 && open("/corrections");

  return (
    <section aria-labelledby="today-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="today-heading" className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {t("Today")}
        </h2>
        <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span>{t("Updated at {time}", { time: data.time })}</span>
          <button
            type="button"
            onClick={load}
            aria-label={t("Refresh")}
            className="rounded-lg p-1.5 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 dark:ring-gray-700 dark:hover:bg-white/[0.03]"
          >
            <ArrowPathIcon className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-error-500">{error}</p>}

      {counts ? (
        <>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Tile label="Present" value={counts.present} tone="text-green-600" hint={t("of {count} planned", { count: counts.planned })} />
            <Tile label="Late arrivals" value={counts.late} tone="text-amber-600" />
            <Tile label="Not clocked in" value={counts.missing} tone="text-red-600" hint={t("shift started")} />
            <Tile label="Absent" value={counts.absent} tone="text-amber-600" />
            <Tile label="Expected later" value={counts.expected} tone="text-gray-800 dark:text-white/90" />
            <Tile label="Left" value={counts.left} tone="text-blue-600" />
          </dl>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <h3 className="font-semibold text-gray-800 dark:text-white/90">{t("Who is where")}</h3>
              {open("/clock-in/history") && (
                <Link href="/clock-in/history" className="text-sm font-medium text-brand-500 hover:underline">
                  {t("Open the clock-in history")}
                </Link>
              )}
            </div>
            {attendance.people.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                {t("Nobody is planned or clocked in today.")}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {attendance.people.map((p) => (
                  <PersonRow key={p.empNumber} p={p} />
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <p className="rounded-2xl border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          {t("Clock-in is switched off for this company, so there is no attendance to show.")}
        </p>
      )}

      {(month || waiting) && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {month && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-gray-800 dark:text-white/90">
                  {t("{month} so far", { month: monthName(month.month) })}
                </h3>
                {open("/reporting/monthly-payroll") && (
                  <Link href="/reporting/monthly-payroll" className="text-sm font-medium text-brand-500 hover:underline">
                    {t("Open the payroll")}
                  </Link>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">{t("Gross")}</dt>
                  <dd className="mt-0.5 font-semibold text-gray-800 dark:text-white/90">{money(month.gross, month.currency)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">{t("Advances")}</dt>
                  <dd className="mt-0.5 font-semibold text-gray-800 dark:text-white/90">{money(month.advances, month.currency)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">{t("Net to pay")}</dt>
                  <dd className="mt-0.5 font-semibold text-brand-500">{money(month.net, month.currency)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                {t("{hours} hours worked by {count} employees.", { hours: month.hours, count: month.employees })}
              </p>
            </div>
          )}
          {waiting && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
              <h3 className="font-semibold text-amber-900 dark:text-amber-200">{t("Waiting for you")}</h3>
              <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">
                {pending.corrections === 1
                  ? t("1 correction request from an employee is waiting for an answer.")
                  : t("{count} correction requests from employees are waiting for an answer.", { count: pending.corrections })}
              </p>
              <Link href="/corrections" className="mt-2 inline-block text-sm font-medium text-amber-900 underline dark:text-amber-200">
                {t("Answer them")}
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
