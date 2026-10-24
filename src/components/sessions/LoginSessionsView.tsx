"use client";

import React, { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/config";
import { ensureOk, fetchJson, friendlyError } from "@/lib/errors";
import { confirmDialog, toast } from "@/lib/notify";
import LoadError from "@/components/ui/feedback/LoadError";
import { t } from "@/lib/i18n";
import { endReasonLabel, formatWhen, LoginSession } from "./sessionTypes";

interface SessionPage {
  items: LoginSession[];
  total: number;
  page: number;
  limit: number;
}

type Status = "active" | "ended" | "all";

const STATUSES: [Status, string][] = [
  ["active", "Active"],
  ["ended", "Ended"],
  ["all", "All"],
];

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super admin",
  admin: "Admin",
  manager: "Manager",
  employee: "Clock-in kiosk",
};

const PAGE_SIZE = 50;

/**
 * Super admin only: every sign-in of every company (or of the company they
 * are working inside), from the login_sessions collection: device, IP, the token
 * in use and its expiry, how often it was renewed, and why it ended.
 */
export default function LoginSessionsView() {
  const [status, setStatus] = useState<Status>("active");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SessionPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status, page: String(page), limit: String(PAGE_SIZE) });
      setData(await fetchJson<SessionPage>(`${API_BASE_URL}/login-sessions?${params}`));
    } catch (err) {
      setError(friendlyError(err, "Couldn't load the login sessions"));
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const end = async (s: LoginSession) => {
    const ok = await confirmDialog({
      title: t("End this session?"),
      message: t("{name} will be signed out on {device}.", {
        name: s.userName ?? s.userEmail ?? "",
        device: s.device ?? t("Unknown device"),
      }),
      confirmLabel: t("End session"),
      danger: true,
    });
    if (!ok) return;
    try {
      await ensureOk(await fetch(`${API_BASE_URL}/login-sessions/${s.id}`, { method: "DELETE" }));
      toast.success(t("Session ended"));
      await load();
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't end the session"));
    }
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t(
          "Every sign-in, with the device and IP address it came from. Tokens are renewed automatically every few minutes; the token ID shows which one is in use."
        )}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 text-sm">
          {STATUSES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
              className={`rounded-full px-3 py-1 ring-1 ring-inset ${
                status === value
                  ? "bg-brand-500 text-white ring-brand-500"
                  : "text-gray-600 ring-gray-300 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-white/[0.03]"
              }`}
            >
              {t(label)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
          {data && t("{count} sessions", { count: data.total })}
          <button type="button" className="text-brand-500 hover:underline" onClick={load}>
            {t("Refresh")}
          </button>
        </div>
      </div>

      {error && <LoadError message={error} onRetry={load} />}

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
            <tr>
              <th className="px-4 py-3 text-start font-medium">{t("User")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("Device & IP")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("Signed in")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("Current token")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("Session ends")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("Status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-800 dark:divide-gray-800 dark:text-white/90">
            {loading && !data ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">{t("Loading…")}</td>
              </tr>
            ) : data?.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">{t("No sessions")}</td>
              </tr>
            ) : (
              data?.items.map((s) => (
                <tr key={s.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium">{s.userName || s.userEmail}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {s.userEmail} · {t(ROLE_LABELS[s.userRole ?? ""] ?? s.userRole ?? "")}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div title={s.userAgent}>{s.device ?? t("Unknown device")}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {s.ip ?? "?"}
                      {s.lastIp && s.lastIp !== s.ip && ` → ${s.lastIp}`}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div>{formatWhen(s.createdAt)}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {t("Last active {when}", { when: formatWhen(s.lastSeenAt) })}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <code className="text-xs" title={s.accessTokenId}>
                      {s.accessTokenId.slice(0, 8)}…
                    </code>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {t("Valid until {when}", { when: formatWhen(s.accessTokenExpiresAt) })}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {t("Renewed {count} times", { count: s.rotationCount })}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div>{formatWhen(s.expiresAt)}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {t("or if idle until {when}", { when: formatWhen(s.idleExpiresAt) })}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {s.active ? (
                      <div className="flex flex-col items-start gap-1">
                        <span className="rounded-full bg-success-50 px-2 py-0.5 text-xs text-success-700 dark:bg-success-500/15 dark:text-success-500">
                          {t("Active")}
                        </span>
                        <button
                          type="button"
                          onClick={() => end(s)}
                          className="text-xs text-error-600 hover:underline dark:text-error-500"
                        >
                          {t("End session")}
                        </button>
                      </div>
                    ) : (
                      <div>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-white/[0.05] dark:text-gray-400">
                          {endReasonLabel(s.endReason) || t("Ended")}
                        </span>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatWhen(s.endedAt)}</div>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-3 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="text-brand-500 hover:underline disabled:opacity-40">
            {t("Previous")}
          </button>
          <span className="text-gray-500">{t("Page {page} of {pages}", { page, pages })}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="text-brand-500 hover:underline disabled:opacity-40">
            {t("Next")}
          </button>
        </div>
      )}
    </div>
  );
}
