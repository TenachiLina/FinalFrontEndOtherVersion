"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  BanknotesIcon,
  CalendarDaysIcon,
  ClipboardDocumentCheckIcon,
  ClockIcon,
  Cog6ToothIcon,
  DevicePhoneMobileIcon,
  PlayCircleIcon,
  QuestionMarkCircleIcon,
  Squares2X2Icon,
  UserPlusIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/context/AuthContext";
import { canOpen } from "@/lib/auth";
import { locale, t } from "@/lib/i18n";

type Icon = React.ComponentType<React.SVGProps<SVGSVGElement>>;

// How the app works, in the order the work happens
const FLOW: { href: string; title: string; text: string; icon: Icon }[] = [
  { href: "/calendar/DoPlanning", title: "Plan", text: "Decide who works which shift, day by day.", icon: CalendarDaysIcon },
  { href: "/kiosk", title: "Clock in", text: "Staff clock in and out on the kiosk or the face-recognition machine.", icon: ClockIcon },
  { href: "/clockinpagehistory", title: "Check", text: "Worked hours, lateness and overtime are calculated; fix any mistakes.", icon: ClipboardDocumentCheckIcon },
  { href: "/reporting/monthly-payroll", title: "Pay", text: "Advances, bonuses and the monthly payroll come from those hours.", icon: BanknotesIcon },
];

// Where to start: each step opens its page and has a video guide on the Help page
const START: { href: string; guide: string; title: string; text: string; icon: Icon }[] = [
  { href: "/company-settings", guide: "settings", title: "Set up your company", text: "Choose the language, currency and payroll rules.", icon: Cog6ToothIcon },
  { href: "/addEmployeeForm", guide: "employees", title: "Add your employees", text: "One record per person, with the same number as on the clocking machine.", icon: UserPlusIcon },
  { href: "/calendar/ShiftsManagment", guide: "shifts", title: "Create your shifts", text: "The time slots you plan with, for example 08:00 – 16:00.", icon: Squares2X2Icon },
  { href: "/calendar/DoPlanning", guide: "plan-week", title: "Plan the week", text: "Put employees on shifts and posts, then copy the plan to other days.", icon: CalendarDaysIcon },
  { href: "/kiosk", guide: "kiosk", title: "Start clocking in", text: "Open the kiosk on a tablet at the entrance, or use the face-recognition machine.", icon: DevicePhoneMobileIcon },
  { href: "/clockinpagehistory", guide: "history", title: "Check the clock-ins", text: "Correct forgotten or wrong clock-ins so the hours are right.", icon: ClockIcon },
  { href: "/reporting/monthly-payroll", guide: "payroll", title: "Pay your team", text: "Give weekly advances, then check the monthly payroll.", icon: BanknotesIcon },
  { href: "/users", guide: "users", title: "Invite your team", text: "Give managers and the kiosk tablet their own sign-in.", icon: UsersIcon },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning, {name}";
  if (h < 18) return "Good afternoon, {name}";
  return "Good evening, {name}";
}

/** First page after sign-in: how the app works and where to start. */
export default function HomeView() {
  const { user, company } = useAuth();
  if (!user) return null;

  const allowed = (href: string) => canOpen(href, user, company);
  const flow = FLOW.filter((f) => allowed(f.href));
  const start = START.filter((s) => allowed(s.href));
  const firstName = user.name.split(" ")[0];

  return (
    <div className="space-y-8">
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

      {/* How it works */}
      {flow.length > 0 && (
        <section aria-labelledby="flow-heading">
          <h2 id="flow-heading" className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {t("How {app} works", { app: "Nexo InOuty" })}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("Every week follows the same cycle. Each step feeds the next one.")}
          </p>
          <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {flow.map(({ href, title, text, icon: Icon }, i) => (
              <li key={href} className="relative">
                <Link
                  href={href}
                  className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 transition hover:border-brand-300 hover:shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-500/40"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{i + 1}</span>
                  </span>
                  <span className="mt-3 font-semibold text-gray-800 dark:text-white/90">{t(title)}</span>
                  <span className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t(text)}</span>
                </Link>
                {i < flow.length - 1 && (
                  <ArrowRightIcon
                    className="absolute -end-3 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 rounded-full bg-gray-50 p-1 text-brand-500 dark:bg-gray-900 lg:block rtl:rotate-180"
                    aria-hidden
                  />
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Where to start */}
      {start.length > 0 && (
        <section aria-labelledby="start-heading">
          <h2 id="start-heading" className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {t("Where to start")}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("New here? Follow these steps in order. Each one has a short video guide.")}
          </p>
          <ol className="mt-4 divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-white/[0.03]">
            {start.map(({ href, guide, title, text, icon: Icon }, i) => (
              <li key={href} className="flex flex-wrap items-center gap-4 p-4 sm:flex-nowrap">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                  {i + 1}
                </span>
                <Icon className="hidden h-6 w-6 shrink-0 text-gray-400 sm:block" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-gray-800 dark:text-white/90">{t(title)}</span>
                  <span className="block text-sm text-gray-500 dark:text-gray-400">{t(text)}</span>
                </span>
                <span className="flex w-full shrink-0 gap-2 ps-13 sm:w-auto sm:ps-0">
                  <Link
                    href={`/help#guide-${guide}`}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-white/5"
                  >
                    <PlayCircleIcon className="h-5 w-5 text-brand-500" aria-hidden />
                    {t("Watch")}
                  </Link>
                  <Link
                    href={href}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
                  >
                    {t("Open")}
                    <ArrowRightIcon className="h-4 w-4 rtl:rotate-180" aria-hidden />
                  </Link>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
