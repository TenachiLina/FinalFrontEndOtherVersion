"use client";

import React, { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/config";
import { ensureOk, fetchJson, friendlyError } from "@/lib/errors";
import { toast } from "@/lib/notify";
import LoadError from "@/components/ui/feedback/LoadError";
import Button from "@/components/ui/button/Button";
import { t } from "@/lib/i18n";
import { formatWhen, LoginSession } from "./sessionTypes";

/** The devices where you are signed in, with a way to sign them out. */
export default function MySessions() {
  const [sessions, setSessions] = useState<LoginSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSessions(await fetchJson<LoginSession[]>(`${API_BASE_URL}/auth/sessions`));
    } catch (err) {
      setError(friendlyError(err, "Couldn't load your sessions"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const end = async (id: string) => {
    setBusy(true);
    try {
      await ensureOk(await fetch(`${API_BASE_URL}/auth/sessions/${id}`, { method: "DELETE" }));
      toast.success(t("Session ended"));
      await load();
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't end the session"));
    } finally {
      setBusy(false);
    }
  };

  const endOthers = async () => {
    setBusy(true);
    try {
      await ensureOk(await fetch(`${API_BASE_URL}/auth/logout-others`, { method: "POST" }));
      toast.success(t("Signed out of all other devices"));
      await load();
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't sign out the other devices"));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <LoadError message={error} onRetry={load} />;
  if (!sessions) return <p className="text-sm text-gray-500">{t("Loading…")}</p>;
  const others = sessions.filter((s) => !s.current).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t("If you see a device you don't recognize, end its session and change your password.")}
      </p>
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <div className="font-medium text-gray-800 dark:text-white/90">
                {s.device ?? t("Unknown device")}
                {s.current && (
                  <span className="ms-2 rounded-full bg-success-50 px-2 py-0.5 text-xs text-success-700 dark:bg-success-500/15 dark:text-success-500">
                    {t("This device")}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t("IP {ip}", { ip: s.lastIp ?? s.ip ?? "?" })} · {t("Signed in {when}", { when: formatWhen(s.createdAt) })} ·{" "}
                {t("Last active {when}", { when: formatWhen(s.lastSeenAt) })}
              </div>
            </div>
            {!s.current && (
              <button
                type="button"
                disabled={busy}
                onClick={() => end(s.id)}
                className="text-sm text-error-600 hover:underline disabled:opacity-50 dark:text-error-500"
              >
                {t("End session")}
              </button>
            )}
          </li>
        ))}
      </ul>
      {others > 0 && (
        <Button size="sm" variant="outline" disabled={busy} onClick={endOthers}>
          {t("Sign out all other devices")}
        </Button>
      )}
    </div>
  );
}
