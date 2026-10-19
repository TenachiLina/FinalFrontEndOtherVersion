"use client";

import React from "react";
import { t } from "@/lib/i18n";

/** Shown in place of content that failed to load, with a way to retry. */
export default function LoadError({
  title = "Couldn't load this",
  message,
  onRetry,
  className = "",
}: {
  title?: string;
  message?: string | null;
  onRetry?: () => void;
  className?: string;
}) {
  // Messages from friendlyError() start with what failed ("Couldn't load X. <reason>"):
  // use that part as the title instead of repeating it.
  const split = message ? /^(Couldn't [^.]+)\.\s*([\s\S]*)$/.exec(message) : null;
  if (split) {
    title = split[1];
    message = split[2];
  }
  return (
    <div
      role="alert"
      className={`flex flex-col items-start gap-3 rounded-xl border border-error-200 bg-error-50 p-4 text-sm dark:border-error-500/30 dark:bg-error-500/10 sm:flex-row sm:items-center ${className}`}
    >
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-error-500 font-bold text-white"
      >
        !
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-gray-800 dark:text-white/90">{t(title)}</p>
        {message && <p className="text-gray-600 dark:text-gray-400">{t(message)}</p>}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-lg bg-white px-4 py-2 font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700"
        >
          {t("Try again")}
        </button>
      )}
    </div>
  );
}
