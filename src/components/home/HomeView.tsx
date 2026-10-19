"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  BanknotesIcon,
  CalendarDaysIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  Cog6ToothIcon,
  DevicePhoneMobileIcon,
  GiftIcon,
  QuestionMarkCircleIcon,
  UserGroupIcon,
  UserPlusIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { API_BASE_URL } from "@/lib/config";
import { useAuth } from "@/context/AuthContext";
import { canOpen } from "@/lib/auth";
import { fetchJson, friendlyError } from "@/lib/errors";
import { locale, t } from "@/lib/i18n";
import LoadError from "@/components/ui/feedback/LoadError";

interface KioskEmployee {
  id: string;
  firstName: string;
  lastName: string;
  clockedIn: boolean;
  since: string | null;
}

interface PlanningRow {
  empId?: { _id?: string } | string | null;
  shiftId?: { _id?: string } | string | null;
}

type Icon = React.ComponentType<React.SVGProps<SVGSVGElement>>;

// Shortcuts; each only shows if the user may open the page (role + features)
const ACTIONS: { href: string; label: string; hint: string; icon: Icon }[] = [
  { href: "/kiosk", label: "Open the clock-in kiosk", hint: "Staff clock in and out on a tablet", icon: DevicePhoneMobileIcon },
  { href: "/clockinpagehistory", label: "Clock-in history", hint: "Check and correct clock-in times", icon: ClockIcon },
  { href: "/calendar/DoPlanning", label: "Plan the week", hint: "Assign employees to shifts and posts", icon: CalendarDaysIcon },
  { href: "/calendar/ViewPlanning", label: "View planning", hint: "See who works when, and export it", icon: ClipboardDocumentListIcon },
  { href: "/addEmployeeForm", label: "Add an employee", hint: "Create a new employee record", icon: UserPlusIcon },
  { href: "/basic-tables", label: "Employees", hint: "Edit or remove employees", icon: UserGroupIcon },
  { href: "/reporting/monthly-payroll", label: "Monthly payroll", hint: "Net pay for every employee", icon: BanknotesIcon },
  { href: "/reporting/weekly-advances", label: "Weekly advances", hint: "Give salary advances", icon: BanknotesIcon },
  { href: "/reporting/bonuses/give", label: "Give bonuses", hint: "Reward employees", icon: GiftIcon },
  { href: "/users", label: "Users", hint: "Who can sign in, and their role", icon: UsersIcon },
  { href: "/company-settings", label: "Company settings", hint: "Language, currency and payroll rules", icon: Cog6ToothIcon },
];

function todayKey() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning, {name}";
  if (h < 18) return "Good afternoon, {name}";
  return "Good evening, {name}";
}

const idOf = (v: PlanningRow["empId"]) => (v && typeof v === "object" ? v._id : v) ?? null;

function StatCard({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <div className="h-full rounded-2xl border border-gray-200 bg-white p-5 transition hover:border-brand-300 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-500/40">
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-gray-800 dark:text-white/90">{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

/** First page after sign-in: today at a glance and shortcuts for this user. */
export default function HomeView() {
  const { user, company } = useAuth();
  const [staff, setStaff] = useState<KioskEmployee[] | null>(null);
  const [planning, setPlanning] = useState<PlanningRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasClockin = !!company?.features.includes("clockin");
  const hasPlanning = !!company?.features.includes("planning");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, p] = await Promise.all([
        hasClockin ? fetchJson<KioskEmployee[]>(`${API_BASE_URL}/kiosk/employees`) : Promise.resolve(null),
        hasPlanning ? fetchJson<PlanningRow[]>(`${API_BASE_URL}/planning?planDate=${todayKey()}`) : Promise.resolve(null),
      ]);
      setStaff(s);
      setPlanning(Array.isArray(p) ? p : null);
    } catch (err) {
      setError(friendlyError(err, "Couldn't load today's summary"));
    }
  }, [hasClockin, hasPlanning]);

  useEffect(() => {
    const id = window.setTimeout(load, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  if (!user) return null;

  const clockedIn = staff?.filter((e) => e.clockedIn) ?? [];
  const plannedPeople = planning ? new Set(planning.map((p) => idOf(p.empId)).filter(Boolean)).size : 0;
  const plannedShifts = planning ? new Set(planning.map((p) => idOf(p.shiftId)).filter(Boolean)).size : 0;
  const actions = ACTIONS.filter((a) => canOpen(a.href, user, company));
  const firstName = user.name.split(" ")[0];
  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">{t(greeting(), { name: firstName })}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {new Date().toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            {company ? ` · ${company.name}` : ""}
          </p>
        </div>
        <Link
          href="/help"
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-500 ring-1 ring-inset ring-brand-200 hover:bg-brand-50 dark:ring-brand-500/30 dark:hover:bg-brand-500/10"
        >
          <QuestionMarkCircleIcon className="h-5 w-5" />
          {t("Help & guides")}
        </Link>
      </div>

      {error && <LoadError message={error} onRetry={load} />}

      {/* Today at a glance */}
      {(hasClockin || hasPlanning) && (
        <section aria-labelledby="today-heading">
          <h2 id="today-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("Today")}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {hasClockin && (
              <StatCard
                label={t("Clocked in now")}
                value={staff ? `${clockedIn.length} / ${staff.length}` : "…"}
                sub={t("employees")}
                href={canOpen("/clockinpagehistory", user, company) ? "/clockinpagehistory" : undefined}
              />
            )}
            {hasPlanning && (
              <StatCard
                label={t("Planned today")}
                value={planning ? String(plannedPeople) : "…"}
                sub={t(plannedShifts === 1 ? "in {n} shift" : "in {n} shifts", { n: plannedShifts })}
                href="/calendar/ViewPlanning"
              />
            )}
            {hasClockin && hasPlanning && (
              <StatCard
                label={t("Not yet in")}
                value={staff && planning ? String(Math.max(0, plannedPeople - clockedIn.length)) : "…"}
                sub={t("planned but not clocked in")}
              />
            )}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Shortcuts */}
        <section aria-labelledby="actions-heading" className="lg:col-span-2">
          <h2 id="actions-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("Quick actions")}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {actions.map(({ href, label, hint, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-brand-300 hover:shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-500/40"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400">
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-gray-800 dark:text-white/90">{t(label)}</span>
                  <span className="block text-sm text-gray-500 dark:text-gray-400">{t(hint)}</span>
                </span>
                <ArrowRightIcon className="h-4 w-4 shrink-0 text-gray-400 transition group-hover:text-brand-500 rtl:rotate-180" aria-hidden />
              </Link>
            ))}
          </div>
        </section>

        {/* Who's in + getting started */}
        <div className="space-y-6">
          {hasClockin && (
            <section aria-labelledby="in-heading" className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <h2 id="in-heading" className="mb-3 font-semibold text-gray-800 dark:text-white/90">{t("Who's in")}</h2>
              {!staff ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">{t("Loading…")}</p>
              ) : clockedIn.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">{t("No one is clocked in right now.")}</p>
              ) : (
                <ul className="space-y-2">
                  {clockedIn.slice(0, 8).map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-gray-700 dark:text-gray-300">{e.firstName} {e.lastName}</span>
                      {e.since && (
                        <span className="shrink-0 rounded-full bg-success-50 px-2 py-0.5 text-xs text-success-700 dark:bg-success-500/15 dark:text-success-500">
                          {t("since {time}", { time: timeOf(e.since) })}
                        </span>
                      )}
                    </li>
                  ))}
                  {clockedIn.length > 8 && (
                    <li className="text-xs text-gray-500 dark:text-gray-400">{t("and {n} more", { n: clockedIn.length - 8 })}</li>
                  )}
                </ul>
              )}
            </section>
          )}

          <section className="rounded-2xl bg-brand-500 p-5 text-white">
            <h2 className="font-semibold">{t("New to Nexo InOuty?")}</h2>
            <p className="mt-1 text-sm text-white/80">
              {t("Step-by-step guides show you how to plan shifts, clock in, and run payroll.")}
            </p>
            <Link href="/help" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-brand-600 hover:bg-white/90">
              {t("Open the guides")}
              <ArrowRightIcon className="h-4 w-4 rtl:rotate-180" aria-hidden />
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
