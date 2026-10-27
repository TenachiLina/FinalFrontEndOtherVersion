"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/lib/config";
import { fetchJson, friendlyError } from "@/lib/errors";
import LoadError from "@/components/ui/feedback/LoadError";
import { locale, t } from "@/lib/i18n";
import DateInput from "@/components/form/DateInput";

interface LogEntry {
  _id: string;
  createdAt: string;
  userId: string | null;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  action: string;
  target?: string;
  targetId?: string;
  changes?: Change[];
  details?: unknown;
  method: string;
  path: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  ip?: string;
}

// One changed field: no "before" = added, no "after" = removed
interface Change {
  label: string;
  before?: string;
  after?: string;
}

interface LogPage {
  items: LogEntry[];
  total: number;
  page: number;
  limit: number;
}

interface Actor {
  id: string;
  name?: string;
  email?: string;
}

// Action keys written by the backend (see audit/audit-actions.ts).
const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.changePassword": "Changed their password",
  "auth.logout": "Signed out",
  "auth.logoutOthers": "Signed out of their other devices",
  "session.revoke": "Ended one of their sessions",
  "session.revokeByAdmin": "Ended a user's session",
  "user.create": "Added a user",
  "user.update": "Edited a user",
  "user.resetPassword": "Reset a user's password",
  "user.delete": "Deleted a user",
  "company.create": "Created a company",
  "company.update": "Edited a company",
  "companySettings.update": "Changed company settings",
  "employee.create": "Added an employee",
  "employee.update": "Edited an employee",
  "employee.delete": "Deleted an employee",
  "shift.create": "Created a shift",
  "shift.update": "Edited a shift",
  "shift.archive": "Archived a shift",
  "shift.restore": "Restored a shift",
  "shift.delete": "Deleted a shift",
  "task.create": "Created a task",
  "task.update": "Edited a task",
  "task.delete": "Deleted a task",
  "planning.create": "Added a planning entry",
  "planning.saveDay": "Changed the planning of a day",
  "planning.copyMonth": "Copied a month's planning",
  "planning.update": "Edited a planning entry",
  "planning.delete": "Deleted a planning entry",
  "worktime.create": "Added a day of clock-in/out (work time)",
  "worktime.update": "Changed a day of clock-in/out (work time)",
  "worktime.delete": "Deleted a day of clock-in/out (work time)",
  "worktime.clockIn": "Clocked in",
  "worktime.clockOut": "Clocked out",
  "worktime.clockInOut": "Clocked in and out",
  "attendance.sync": "Synced the clocking machine",
  "punch.create": "Added a clock punch by hand",
  "punch.update": "Changed the time of a clock punch",
  "punch.delete": "Deleted a clock punch",
  "kiosk.clockIn": "Clocked in at the kiosk",
  "kiosk.clockOut": "Clocked out at the kiosk",
  "advance.create": "Gave an advance",
  "advance.delete": "Deleted an advance",
  "bonus.create": "Gave a bonus",
  "bonus.delete": "Deleted a bonus",
  other: "Other change",
};

const ACTION_GROUPS: [string, string][] = [
  ["auth", "Sign-in & password"],
  ["session", "Login sessions"],
  ["user", "Users"],
  ["employee", "Employees"],
  ["planning", "Planning"],
  ["shift", "Shifts"],
  ["task", "Tasks"],
  ["kiosk", "Clock-in kiosk"],
  ["punch", "Punches"],
  ["worktime", "Work time"],
  ["attendance", "Clocking machine"],
  ["advance", "Advances"],
  ["bonus", "Bonuses"],
  ["companySettings", "Company settings"],
  ["company", "Companies"],
];

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super admin",
  admin: "Admin",
  manager: "Manager",
  employee: "Clock-in kiosk",
};

const PAGE_SIZE = 50;

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30";
const labelClass = "mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400";

const EMPTY_FILTERS = { search: "", userId: "", action: "", status: "", from: "", to: "" };

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(locale(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const CLOCK_ACTIONS = new Set(["worktime.clockIn", "worktime.clockOut", "worktime.clockInOut"]);

/** "Clocked out at 13:02" for a normal clock, the action's name otherwise. */
function actionText(entry: LogEntry) {
  if (CLOCK_ACTIONS.has(entry.action)) {
    const time = (label: string) => entry.changes?.find((c) => c.label === label)?.after ?? "";
    const clockIn = time("Clock-in time");
    const clockOut = time("Clock-out time");
    if (entry.action === "worktime.clockIn") return t("Clocked in at {time}", { time: clockIn });
    if (entry.action === "worktime.clockOut") return t("Clocked out at {time}", { time: clockOut });
    return t("Clocked in at {in} and out at {out}", { in: clockIn, out: clockOut });
  }
  return t(ACTION_LABELS[entry.action] ?? ACTION_LABELS.other);
}

/** "Clock-out time: 17:00 → 18:30", "+ Sara Benali · Shift 08:00–16:00", … */
function ChangeList({ changes }: { changes: Change[] }) {
  return (
    <ul className="mt-2 space-y-1.5 rounded-lg bg-gray-50 p-3 text-sm dark:bg-white/[0.03]">
      {changes.map((c, i) => {
        const added = c.before === undefined && c.after !== undefined;
        const removed = c.after === undefined && c.before !== undefined;
        return (
          <li key={i} className="leading-relaxed">
            <span className="font-medium text-gray-700 dark:text-gray-300">{t(c.label)}</span>
            {(c.before !== undefined || c.after !== undefined) && <span className="text-gray-500">: </span>}
            {added && <span className="text-success-600 dark:text-success-500">{t(c.after!)}</span>}
            {removed && <span className="text-error-600 line-through decoration-error-300 dark:text-error-500">{t(c.before!)}</span>}
            {!added && !removed && c.before !== undefined && (
              <>
                <span className="text-gray-500 line-through decoration-gray-300 dark:text-gray-400">{t(c.before)}</span>
                <span className="mx-1 text-gray-400">→</span>
                <span className="font-medium text-gray-800 dark:text-white/90">{t(c.after ?? "")}</span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function ActivityLogView() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  // The search box is applied a moment after typing stops.
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LogPage | null>(null);
  const [actors, setActors] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  // The search last applied. Only a real change of the typed search goes back
  // to page 1: on first load nothing changed, and resetting then undid a quick
  // click on "Next".
  const appliedSearch = useRef(search);
  useEffect(() => {
    if (search === appliedSearch.current) return;
    const id = setTimeout(() => {
      appliedSearch.current = search;
      setFilters((f) => (f.search === search ? f : { ...f, search }));
      setPage(1);
    }, 400);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    try {
      setData(await fetchJson<LogPage>(`${API_BASE_URL}/audit-logs?${params}`));
      setError(null);
    } catch (err) {
      setError(friendlyError(err, "Couldn't load the activity log"));
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetchJson<Actor[]>(`${API_BASE_URL}/audit-logs/users`)
      .then(setActors)
      .catch(() => setActors([]));
  }, []);

  const setFilter = (key: keyof typeof EMPTY_FILTERS, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const hasFilters = search || Object.values(filters).some(Boolean);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t("Every change made in the app: who did it, what they did and when. Viewing pages is not recorded.")}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label className={labelClass} htmlFor="log-search">{t("Search")}</label>
          <input
            id="log-search"
            className={inputClass}
            placeholder={t("Name, email or record…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="log-user">{t("User")}</label>
          <select id="log-user" className={inputClass} value={filters.userId} onChange={(e) => setFilter("userId", e.target.value)}>
            <option value="">{t("Everyone")}</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>{a.name || a.email}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="log-action">{t("Action")}</label>
          <select id="log-action" className={inputClass} value={filters.action} onChange={(e) => setFilter("action", e.target.value)}>
            <option value="">{t("All actions")}</option>
            {ACTION_GROUPS.map(([key, label]) => (
              <option key={key} value={key}>{t(label)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="log-from">{t("From")}</label>
          <DateInput id="log-from" className="w-full" clearable value={filters.from} max={filters.to || undefined} onChange={(v) => setFilter("from", v)} />
        </div>
        <div>
          <label className={labelClass} htmlFor="log-to">{t("To")}</label>
          <DateInput id="log-to" className="w-full" clearable value={filters.to} min={filters.from || undefined} onChange={(v) => setFilter("to", v)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 text-sm">
          {([["", "All"], ["success", "Succeeded"], ["failed", "Failed"]] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter("status", value)}
              className={`rounded-full px-3 py-1 ring-1 ring-inset ${
                filters.status === value
                  ? "bg-brand-500 text-white ring-brand-500"
                  : "text-gray-600 ring-gray-300 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-white/[0.03]"
              }`}
            >
              {t(label)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
          {data && <span>{t("{count} entries", { count: data.total })}</span>}
          {hasFilters && (
            <button
              type="button"
              className="text-brand-500 hover:underline"
              onClick={() => {
                setSearch("");
                setFilters(EMPTY_FILTERS);
                setPage(1);
              }}
            >
              {t("Clear filters")}
            </button>
          )}
          <button type="button" className="text-brand-500 hover:underline" onClick={load}>
            {t("Refresh")}
          </button>
        </div>
      </div>

      {error && <LoadError message={error} onRetry={load} />}

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-start text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
            <tr>
              <th className="px-4 py-3 text-start font-medium">{t("When")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("User")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("What happened")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("Result")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-800 dark:divide-gray-800 dark:text-white/90">
            {loading && !data && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">{t("Loading…")}</td>
              </tr>
            )}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                  {hasFilters ? t("No activity matches these filters.") : t("No activity recorded yet.")}
                </td>
              </tr>
            )}
            {data?.items.map((entry) => {
              const isOpen = open === entry._id;
              return (
                <React.Fragment key={entry._id}>
                  <tr
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                    onClick={() => setOpen(isOpen ? null : entry._id)}
                    aria-expanded={isOpen}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">{formatWhen(entry.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{entry.userName || entry.userEmail || t("Unknown")}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {[entry.userName && entry.userEmail, entry.userRole && t(ROLE_LABELS[entry.userRole] ?? entry.userRole)]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </td>
                    <td className="max-w-xl px-4 py-3">
                      <div>{actionText(entry)}</div>
                      {entry.target && <div className="font-medium">{entry.target}</div>}
                      {/* What changed stays hidden until the row is clicked */}
                      {!CLOCK_ACTIONS.has(entry.action) && entry.changes && entry.changes.length > 0 &&
                        (isOpen ? (
                          <ChangeList changes={entry.changes} />
                        ) : (
                          <div className="mt-1 text-xs text-brand-500">
                            {entry.changes.length === 1
                              ? t("1 change, click to see it")
                              : t("{count} changes, click to see them", { count: entry.changes.length })}
                          </div>
                        ))}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          entry.success
                            ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500"
                            : "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500"
                        }`}
                      >
                        {entry.success ? t("Succeeded") : t("Failed")}
                      </span>
                    </td>
                  </tr>
                  {isOpen && entry.error && (
                    <tr className="bg-gray-50/60 dark:bg-white/[0.02]">
                      <td colSpan={4} className="px-4 py-3 text-sm text-error-600 dark:text-error-500">
                        <span className="font-medium">{t("Error")}:</span> {entry.error}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {data && totalPages > 1 && (
        <div className="flex items-center justify-end gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg px-3 py-1.5 ring-1 ring-inset ring-gray-300 disabled:opacity-40 dark:ring-gray-700"
          >
            {t("Previous")}
          </button>
          <span className="text-gray-500 dark:text-gray-400">{t("Page {page} of {pages}", { page, pages: totalPages })}</span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg px-3 py-1.5 ring-1 ring-inset ring-gray-300 disabled:opacity-40 dark:ring-gray-700"
          >
            {t("Next")}
          </button>
        </div>
      )}
    </div>
  );
}
