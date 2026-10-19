"use client";

import React, { useMemo, useState } from "react";
import {
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  ChevronDownIcon,
  EnvelopeIcon,
  LifebuoyIcon,
  MagnifyingGlassIcon,
  PhoneIcon,
  QuestionMarkCircleIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/context/I18nContext";
import { canOpen } from "@/lib/auth";
import { FAQ, GUIDES, SUPPORT, Steps, Text } from "./content";

/** Collapsible section; native <details> keeps it keyboard-friendly. */
function Item({ id, title, children, open }: { id: string; title: React.ReactNode; children: React.ReactNode; open?: boolean }) {
  return (
    <details
      id={id}
      open={open}
      className="group rounded-2xl border border-gray-200 bg-white open:border-brand-200 dark:border-gray-800 dark:bg-white/[0.03] dark:open:border-brand-500/30"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-medium text-gray-800 dark:text-white/90 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDownIcon className="h-5 w-5 shrink-0 text-gray-400 transition group-open:rotate-180" aria-hidden />
      </summary>
      <div className="px-5 pb-5 text-sm text-gray-600 dark:text-gray-400">{children}</div>
    </details>
  );
}

/** Help & guides: step-by-step guides, FAQ and how to reach support. */
export default function HelpView() {
  const { user, company } = useAuth();
  const { lang, t } = useI18n();
  const [query, setQuery] = useState("");

  const tx = (x: Text) => x[lang];
  const steps = (x: Steps) => x[lang];
  const visible = (path?: string) => !path || (!!user && canOpen(path, user, company));

  const q = query.trim().toLowerCase();
  const matches = (...parts: string[]) => !q || parts.join(" ").toLowerCase().includes(q);

  const guides = useMemo(
    () => GUIDES.filter((g) => visible(g.path) && matches(tx(g.title), tx(g.intro), ...steps(g.steps))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, lang, user, company]
  );
  const faq = useMemo(
    () => FAQ.filter((f) => visible(f.path) && matches(tx(f.q), tx(f.a))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, lang, user, company]
  );
  const hasContact = !!(SUPPORT.email || SUPPORT.phone || SUPPORT.whatsapp);
  const waNumber = SUPPORT.whatsapp.replace(/[^\d]/g, "");

  return (
    <div className="space-y-8">
      {/* Header + search */}
      <div className="rounded-2xl bg-brand-500 px-6 py-8 text-white">
        <div className="flex items-center gap-3">
          <LifebuoyIcon className="h-8 w-8" aria-hidden />
          <h1 className="text-2xl font-semibold">{t("Help & guides")}</h1>
        </div>
        <p className="mt-2 max-w-2xl text-white/80">
          {t("Step-by-step guides for everything you can do, answers to common questions, and how to reach us.")}
        </p>
        <label className="relative mt-5 block max-w-xl">
          <span className="sr-only">{t("Search the help")}</span>
          <MagnifyingGlassIcon className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search, e.g. “clock out”, “payroll”, “password”…")}
            className="h-12 w-full rounded-xl border-0 bg-white pe-4 ps-11 text-gray-800 placeholder:text-gray-400 focus:outline-hidden focus:ring-4 focus:ring-white/30"
          />
        </label>
      </div>

      {/* Guides */}
      <section aria-labelledby="guides-heading">
        <h2 id="guides-heading" className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white/90">
          <BookOpenIcon className="h-5 w-5 text-brand-500" aria-hidden />
          {t("Guides")}
        </h2>
        {guides.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("No guide matches your search.")}</p>
        ) : (
          <div className="space-y-3">
            {guides.map((g, i) => (
              <Item
                key={g.id}
                id={`guide-${g.id}`}
                open={!!q || (i === 0 && !q)}
                title={
                  <span>
                    {tx(g.title)}
                    <span className="mt-0.5 block text-sm font-normal text-gray-500 dark:text-gray-400">{tx(g.intro)}</span>
                  </span>
                }
              >
                <ol className="mt-1 space-y-2">
                  {steps(g.steps).map((s, n) => (
                    <li key={n} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                        {n + 1}
                      </span>
                      <span className="pt-0.5">{s}</span>
                    </li>
                  ))}
                </ol>
              </Item>
            ))}
          </div>
        )}
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white/90">
          <QuestionMarkCircleIcon className="h-5 w-5 text-brand-500" aria-hidden />
          {t("Frequently asked questions")}
        </h2>
        {faq.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("No question matches your search.")}</p>
        ) : (
          <div className="space-y-3">
            {faq.map((f) => (
              <Item key={f.id} id={`faq-${f.id}`} open={!!q} title={tx(f.q)}>
                <p>{tx(f.a)}</p>
              </Item>
            ))}
          </div>
        )}
      </section>

      {/* Contact */}
      <section aria-labelledby="contact-heading" className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 id="contact-heading" className="flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white/90">
          <ChatBubbleLeftRightIcon className="h-5 w-5 text-brand-500" aria-hidden />
          {t("Still need help?")}
        </h2>
        {hasContact ? (
          <>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t("Contact our support team.")}
              {SUPPORT.hours && ` ${t("Hours: {hours}", { hours: SUPPORT.hours })}`}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {SUPPORT.email && (
                <a href={`mailto:${SUPPORT.email}`} className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-white/5">
                  <EnvelopeIcon className="h-5 w-5" aria-hidden />
                  <span dir="ltr">{SUPPORT.email}</span>
                </a>
              )}
              {SUPPORT.phone && (
                <a href={`tel:${SUPPORT.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-white/5">
                  <PhoneIcon className="h-5 w-5" aria-hidden />
                  <span dir="ltr">{SUPPORT.phone}</span>
                </a>
              )}
              {waNumber && (
                <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-success-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-success-600">
                  <ChatBubbleLeftRightIcon className="h-5 w-5" aria-hidden />
                  {t("WhatsApp")}
                </a>
              )}
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {user?.role === "admin" || user?.role === "superadmin"
              ? t("Contact the team that set up the app for your company.")
              : t("Ask an admin of your company.")}
          </p>
        )}
      </section>
    </div>
  );
}
