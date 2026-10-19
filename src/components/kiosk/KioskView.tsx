"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/config";
import { useAuth } from "@/context/AuthContext";
import { canOpen, homePathFor } from "@/lib/auth";
import { DEFAULT_BRAND } from "@/lib/branding";
import { fetchJson, friendlyError } from "@/lib/errors";
import { toast } from "@/lib/notify";
import LoadError from "@/components/ui/feedback/LoadError";
import LanguageSwitcher from "@/components/common/LanguageSwitcher";
import { locale, t } from "@/lib/i18n";

interface KioskEmployee {
  id: string;
  empNumber: number;
  firstName: string;
  lastName: string;
  photo: string | null;
  clockedIn: boolean;
  since: string | null;
}

const REFRESH_MS = 30_000;
// Go back to the list after a clock-in so the next person can use the screen
const AUTO_CLOSE_MS = 4_000;

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });

function initials(e: KioskEmployee) {
  return `${e.firstName?.[0] ?? ""}${e.lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

function Avatar({ e, size }: { e: KioskEmployee; size: string }) {
  return e.photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={e.photo} alt="" className={`${size} rounded-full object-cover`} />
  ) : (
    <span
      className={`${size} flex items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-600 dark:bg-brand-500/20 dark:text-brand-400`}
    >
      {initials(e)}
    </span>
  );
}

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);
  if (!now) return null;
  return (
    <div className="text-end">
      <div className="text-2xl font-semibold tabular-nums text-gray-800 dark:text-white/90">
        {now.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </div>
      <div className="text-sm text-gray-500 dark:text-gray-400">
        {now.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" })}
      </div>
    </div>
  );
}

/**
 * Clock-in kiosk: pick an employee, press Clock in or Clock out.
 * The saved time is the server's (see backend KioskController).
 */
export default function KioskView() {
  const { user, company, loading, logout } = useAuth();
  const router = useRouter();
  const [employees, setEmployees] = useState<KioskEmployee[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<KioskEmployee | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string; action: "in" | "out"; time: string } | null>(null);

  const allowed = !!user && canOpen("/kiosk", user, company);

  // Same rules as the rest of the app: login required, clock-in feature on
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/signin?next=%2Fkiosk");
    else if (!allowed) router.replace(homePathFor(user, company));
  }, [loading, user, company, allowed, router]);

  const load = useCallback(async () => {
    try {
      setEmployees(await fetchJson<KioskEmployee[]>(`${API_BASE_URL}/kiosk/employees`));
      setLoadError(null);
    } catch (err) {
      setLoadError(friendlyError(err, "Couldn't load the employees"));
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    const first = window.setTimeout(load, 0);
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [allowed, load]);

  // After a successful clock-in/out, show the confirmation then go back to the list
  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => {
      setDone(null);
      setSelected(null);
    }, AUTO_CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [done]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
        String(e.empNumber).includes(q)
    );
  }, [employees, search]);

  const clock = async (action: "in" | "out") => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const res = await fetchJson<{ time: string; employee: { name: string } }>(
        `${API_BASE_URL}/kiosk/clock`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ empNumber: selected.empNumber, action }),
        }
      );
      setDone({ name: res.employee.name, action, time: res.time });
      load();
    } catch (err) {
      toast.error(friendlyError(err, action === "in" ? "Couldn't clock in" : "Couldn't clock out"));
      load();
    } finally {
      setBusy(false);
    }
  };

  if (loading || !allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-400">
        {t("Loading…")}
      </div>
    );
  }

  const logo = company?.branding?.logo || DEFAULT_BRAND.logo;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="" className="h-10 w-10 shrink-0 rounded-lg object-contain" />
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-gray-800 dark:text-white/90">{company?.name}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{t("Clock in / Clock out")}</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <LiveClock />
          <LanguageSwitcher className="hidden sm:inline-flex" />
          {user?.role === "employee" ? (
            <button
              type="button"
              onClick={logout}
              className="rounded-lg px-3 py-2 text-sm text-gray-500 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/5"
            >
              {t("Sign out")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/clockinpagehistory")}
              className="rounded-lg px-3 py-2 text-sm text-gray-500 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/5"
            >
              {t("Exit kiosk")}
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <label htmlFor="kiosk-search" className="sr-only">
          {t("Find your name")}
        </label>
        <input
          id="kiosk-search"
          type="search"
          autoComplete="off"
          placeholder={t("Find your name or number…")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-6 h-14 w-full rounded-xl border border-gray-300 bg-white px-5 text-lg text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />

        {loadError && <LoadError className="mb-6" message={loadError} onRetry={load} />}
        {loadingList && <p className="text-gray-500 dark:text-gray-400">Loading…</p>}
        {!loadingList && !loadError && filtered.length === 0 && (
          <p className="text-gray-500 dark:text-gray-400">
            {employees.length === 0 ? t("No employees yet. An admin can add them.") : t("No one matches this search.")}
          </p>
        )}

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setSelected(e)}
                className="flex w-full items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-brand-300 hover:shadow-theme-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-brand-500/50"
              >
                <Avatar e={e} size="h-12 w-12" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-gray-800 dark:text-white/90">
                    {e.firstName} {e.lastName}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">#{e.empNumber}</span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                    e.clockedIn
                      ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500"
                      : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400"
                  }`}
                >
                  {e.clockedIn && e.since ? t("In since {time}", { time: timeOf(e.since) }) : t("Out")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </main>

      {selected && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm"
            onClick={() => !busy && (setSelected(null), setDone(null))}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("Clock in or out for {name}", { name: `${selected.firstName} ${selected.lastName}` })}
            className="relative w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-theme-xl dark:bg-gray-900"
          >
            {done ? (
              <div role="status">
                <div
                  className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-3xl text-white ${
                    done.action === "in" ? "bg-success-500" : "bg-brand-500"
                  }`}
                  aria-hidden
                >
                  ✓
                </div>
                <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
                  {done.action === "in" ? t("Clocked in") : t("Clocked out")}
                </h2>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                  {t("{name} at {time}", { name: done.name, time: timeOf(done.time) })}
                </p>
                <button
                  type="button"
                  onClick={() => (setDone(null), setSelected(null))}
                  className="mt-6 text-sm font-medium text-brand-500 hover:underline"
                >
                  {t("Done")}
                </button>
              </div>
            ) : (
              <>
                <div className="mx-auto mb-3 w-fit">
                  <Avatar e={selected} size="h-20 w-20 text-2xl" />
                </div>
                <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
                  {selected.firstName} {selected.lastName}
                </h2>
                <p className="mb-6 mt-1 text-gray-500 dark:text-gray-400">
                  {selected.clockedIn && selected.since
                    ? t("Clocked in since {time}", { time: timeOf(selected.since) })
                    : t("Not clocked in")}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={busy || selected.clockedIn}
                    onClick={() => clock("in")}
                    className="rounded-2xl bg-success-500 px-4 py-5 text-lg font-semibold text-white hover:bg-success-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("Clock in")}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !selected.clockedIn}
                    onClick={() => clock("out")}
                    className="rounded-2xl bg-error-500 px-4 py-5 text-lg font-semibold text-white hover:bg-error-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("Clock out")}
                  </button>
                </div>
                <p className="mt-4 text-xs text-gray-400">{t("The time is recorded by the server when you press the button.")}</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setSelected(null)}
                  className="mt-4 text-sm font-medium text-gray-500 hover:underline dark:text-gray-400"
                >
                  {t("Not me — go back")}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
