"use client";

import React from "react";
import { useI18n } from "@/context/I18nContext";
import { LANGUAGES, Lang } from "@/lib/i18n";

/** Language picker (English / Français / العربية); the choice is remembered. */
export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <span className="sr-only">{t("Language")}</span>
      <svg
        aria-hidden
        className="pointer-events-none absolute start-3 h-4 w-4 text-gray-500 dark:text-gray-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className="h-11 cursor-pointer appearance-none rounded-full border border-gray-200 bg-white pe-4 ps-9 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
