"use client";
import React from "react";
import { useAuth } from "@/context/AuthContext";
import { locale, t } from "@/lib/i18n";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });

/**
 * Across the top of every page: a warning in the last 7 days of the
 * company's trial or subscription, then that the account is read-only once
 * it has ended. Nothing for a company with time left or without an end date.
 */
export default function SubscriptionBanner() {
  const { user, company } = useAuth();
  const state = company?.subscription;
  // Kiosk and employee accounts can't do anything about it
  if (!user || !state || user.role === "employee" || user.role === "staff") return null;

  if (state.readOnly) {
    return (
      <div
        role="alert"
        data-testid="subscription-banner"
        className="border-b border-error-200 bg-error-50 px-4 py-2 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400 md:px-6"
      >
        <span className="font-semibold">
          {state.kind === "trial" ? t("Your free trial has ended.") : t("Your subscription has ended.")}
        </span>{" "}
        {t("The account is read-only: you can still see and export everything, but nothing can be changed. Contact us to renew.")}
      </div>
    );
  }

  if (!state.endingSoon || !state.endsAt) return null;
  const days = state.daysLeft ?? 0;
  const when =
    days <= 0
      ? t("today")
      : days === 1
        ? t("tomorrow")
        : t("in {days} days", { days });
  return (
    <div
      role="status"
      data-testid="subscription-banner"
      className="border-b border-warning-200 bg-warning-50 px-4 py-2 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400 md:px-6"
    >
      <span className="font-semibold">
        {state.kind === "trial"
          ? t("Your free trial ends {when} ({date}).", { when, date: day(state.endsAt) })
          : t("Your subscription ends {when} ({date}).", { when, date: day(state.endsAt) })}
      </span>{" "}
      {t("After that the account becomes read-only. Contact us to renew.")}
    </div>
  );
}
