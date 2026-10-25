"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/lib/config";
import { fetchJson, friendlyError } from "@/lib/errors";
import LoadError from "@/components/ui/feedback/LoadError";
import { locale, t } from "@/lib/i18n";
import DateInput from "@/components/form/DateInput";

type Level = "error" | "warning";
type Source = "request" | "background" | "process" | "frontend";

interface ErrorEntry {
  _id: string;
  createdAt: string;
  reference?: string;
  level: Level;
  source: Source;
  name: string;
  message: string;
  code?: string;
  hint?: string;
  where?: string;
  stack?: string;
  context?: string;
  fingerprint: string;
  statusCode?: number;
  method?: string;
  path?: string;
  route?: string;
  query?: unknown;
  body?: unknown;
  pageUrl?: string;
  userAgent?: string;
  ip?: string;
  companyId?: string | null;
  userName?: string;
  userEmail?: string;
  userRole?: string;
}

interface ErrorPage {
  items: ErrorEntry[];
  total: number;
  page: number;
  limit: number;
}

interface ErrorGroup {
  fingerprint: string;
  count: number;
  lastSeen: string;
  firstSeen: string;
  level: Level;
  source: Source;
  name: string;
  message: string;
  hint?: string;
  where?: string;
  route?: string;
  method?: string;
  affectedUsers: number;
}

const SOURCE_LABELS: Record<Source, string> = {
  request: "API request",
  background: "Background task",
  process: "Server crash",
  frontend: "Browser",
};

const PAGE_SIZE = 50;

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30";
const labelClass = "mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400";
const preClass =
  "max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white p-3 text-gray-700 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-800";

const EMPTY_FILTERS = { search: "", level: "", source: "", from: "", to: "", fingerprint: "" };

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

function LevelBadge({ level }: { level: Level }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        level === "error"
          ? "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500"
          : "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-orange-400"
      }`}
    >
      {level === "error" ? t("Error") : t("Warning")}
    </span>
  );
}

function hasContent(value: unknown) {
  return value !== undefined && value !== null && (typeof value !== "object" || Object.keys(value).length > 0);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <span className="shrink-0 font-medium text-gray-500 sm:w-32 dark:text-gray-400">{t(label)}</span>
      <span className="min-w-0 break-words text-gray-800 dark:text-white/90">{children}</span>
    </div>
  );
}

function ErrorDetails({ entry }: { entry: ErrorEntry }) {
  const user = [entry.userName, entry.userEmail, entry.userRole].filter(Boolean).join(" · ");
  return (
    <div className="space-y-3 text-xs">
      {entry.hint && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-gray-800 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-white/90">
          <span className="font-semibold">{t("Likely cause")}: </span>
          {entry.hint}
        </div>
      )}
      <div className="space-y-1.5">
        <Field label="Message">
          <span className="font-medium">{entry.name}</span>: {entry.message}
        </Field>
        {entry.where && (
          <Field label="Where">
            <code>{entry.where}</code>
          </Field>
        )}
        {entry.method && (
          <Field label="Request">
            <code>
              {entry.method} {entry.path}
            </code>
            {entry.statusCode ? ` → ${entry.statusCode}` : ""}
          </Field>
        )}
        {entry.pageUrl && <Field label="Page">{entry.pageUrl}</Field>}
        {entry.context && <Field label="Part of the app">{entry.context}</Field>}
        <Field label="User">{user || t("Nobody signed in")}</Field>
        {entry.reference && (
          <Field label="Error code">
            <code>{entry.reference}</code>
          </Field>
        )}
        {entry.code && <Field label="Technical code">{entry.code}</Field>}
        {entry.ip && <Field label="IP address">{entry.ip}</Field>}
        {entry.userAgent && <Field label="Browser">{entry.userAgent}</Field>}
      </div>
      {hasContent(entry.query) && (
        <div>
          <p className="mb-1 font-medium text-gray-500 dark:text-gray-400">{t("Query parameters")}</p>
          <pre className={preClass}>{JSON.stringify(entry.query, null, 2)}</pre>
        </div>
      )}
      {hasContent(entry.body) && (
        <div>
          <p className="mb-1 font-medium text-gray-500 dark:text-gray-400">{t("Data sent")}</p>
          <pre className={preClass}>{JSON.stringify(entry.body, null, 2)}</pre>
        </div>
      )}
      {entry.stack && (
        <div>
          <p className="mb-1 font-medium text-gray-500 dark:text-gray-400">{t("Stack trace (for developers)")}</p>
          <pre className={preClass}>{entry.stack}</pre>
        </div>
      )}
    </div>
  );
}

export default function SystemErrorsView() {
  // Only errors by default: warnings are refusals the app made on purpose.
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, level: "error" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ErrorPage | null>(null);
  const [groups, setGroups] = useState<{ days: number; groups: ErrorGroup[] } | null>(null);
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
      setData(await fetchJson<ErrorPage>(`${API_BASE_URL}/error-logs?${params}`));
      setError(null);
    } catch (err) {
      setError(friendlyError(err, "Couldn't load the system errors"));
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  const loadSummary = useCallback(() => {
    fetchJson<{ days: number; groups: ErrorGroup[] }>(`${API_BASE_URL}/error-logs/summary`)
      .then(setGroups)
      .catch(() => setGroups(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const setFilter = (key: keyof typeof EMPTY_FILTERS, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const focusedGroup = groups?.groups.find((g) => g.fingerprint === filters.fingerprint);

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t("Problems the app ran into, with a likely cause and where they happened. Users who see an error get an error code you can search for here. Errors are kept for 90 days.")}
      </p>

      {/* Most frequent problems: where to start */}
      {groups && groups.groups.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">
            {t("Most frequent in the last {days} days", { days: groups.days })}
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {groups.groups.map((g) => (
              <button
                key={g.fingerprint}
                type="button"
                onClick={() => {
                  setFilters({ ...EMPTY_FILTERS, fingerprint: g.fingerprint });
                  setSearch("");
                  setPage(1);
                }}
                className={`rounded-xl border p-4 text-start transition hover:border-brand-300 ${
                  filters.fingerprint === g.fingerprint
                    ? "border-brand-500 ring-2 ring-brand-500/20"
                    : "border-gray-200 dark:border-gray-800"
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <LevelBadge level={g.level} />
                  <span className="text-xs text-gray-500 dark:text-gray-400">{t(SOURCE_LABELS[g.source])}</span>
                  <span className="ms-auto text-sm font-semibold text-gray-800 dark:text-white/90">
                    {t("{count} times", { count: g.count })}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm font-medium text-gray-800 dark:text-white/90">
                  {g.name}: {g.message}
                </p>
                {g.hint && <p className="mt-1 line-clamp-2 text-xs text-gray-600 dark:text-gray-400">{g.hint}</p>}
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {[
                    g.method && g.route ? `${g.method} ${g.route}` : g.where,
                    t("{count} users affected", { count: g.affectedUsers }),
                    t("last {when}", { when: formatWhen(g.lastSeen) }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label className={labelClass} htmlFor="err-search">{t("Search")}</label>
            <input
              id="err-search"
              className={inputClass}
              placeholder={t("Error code, message, page or user…")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="err-level">{t("Level")}</label>
            <select id="err-level" className={inputClass} value={filters.level} onChange={(e) => setFilter("level", e.target.value)}>
              <option value="">{t("Errors and warnings")}</option>
              <option value="error">{t("Errors only")}</option>
              <option value="warning">{t("Warnings only")}</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="err-source">{t("Source")}</label>
            <select id="err-source" className={inputClass} value={filters.source} onChange={(e) => setFilter("source", e.target.value)}>
              <option value="">{t("Everywhere")}</option>
              {(Object.keys(SOURCE_LABELS) as Source[]).map((s) => (
                <option key={s} value={s}>{t(SOURCE_LABELS[s])}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="err-from">{t("From")}</label>
            <DateInput id="err-from" className="w-full" clearable value={filters.from} max={filters.to || undefined} onChange={(v) => setFilter("from", v)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="err-to">{t("To")}</label>
            <DateInput id="err-to" className="w-full" clearable value={filters.to} min={filters.from || undefined} onChange={(v) => setFilter("to", v)} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span>
            {focusedGroup
              ? t("Showing every occurrence of: {name}", { name: `${focusedGroup.name}: ${focusedGroup.message}` })
              : data && t("{count} entries", { count: data.total })}
          </span>
          <div className="flex gap-3">
            {(filters.fingerprint || filters.search || filters.source || filters.from || filters.to || filters.level !== "error") && (
              <button
                type="button"
                className="text-brand-500 hover:underline"
                onClick={() => {
                  setSearch("");
                  setFilters({ ...EMPTY_FILTERS, level: "error" });
                  setPage(1);
                }}
              >
                {t("Clear filters")}
              </button>
            )}
            <button
              type="button"
              className="text-brand-500 hover:underline"
              onClick={() => {
                load();
                loadSummary();
              }}
            >
              {t("Refresh")}
            </button>
          </div>
        </div>

        {error && <LoadError message={error} onRetry={load} />}

        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 text-start font-medium">{t("When")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("Level")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("What happened")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("Where")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("User")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-800 dark:divide-gray-800 dark:text-white/90">
              {loading && !data && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">{t("Loading…")}</td>
                </tr>
              )}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">{t("No errors found. Everything looks fine.")}</td>
                </tr>
              )}
              {data?.items.map((entry) => {
                const isOpen = open === entry._id;
                return (
                  <React.Fragment key={entry._id}>
                    <tr
                      className="cursor-pointer align-top hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                      onClick={() => setOpen(isOpen ? null : entry._id)}
                      aria-expanded={isOpen}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">
                        {formatWhen(entry.createdAt)}
                        {entry.reference && <div className="font-mono text-xs text-gray-400">{entry.reference}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <LevelBadge level={entry.level} />
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t(SOURCE_LABELS[entry.source])}</div>
                      </td>
                      <td className="max-w-md px-4 py-3">
                        <div className="line-clamp-2 font-medium">{entry.message}</div>
                        {entry.hint && <div className="mt-0.5 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">{entry.hint}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                        {entry.method ? (
                          <code>
                            {entry.method} {entry.route ?? entry.path}
                            {entry.statusCode ? ` → ${entry.statusCode}` : ""}
                          </code>
                        ) : (
                          entry.context ?? entry.where ?? "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{entry.userName || entry.userEmail || "—"}</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-gray-50/60 dark:bg-white/[0.02]">
                        <td colSpan={5} className="px-4 py-4">
                          <ErrorDetails entry={entry} />
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
      </section>
    </div>
  );
}
