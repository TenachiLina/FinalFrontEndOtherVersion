"use client";
import React from "react";
import { FEATURE_LABELS, PAGE_FEATURES, PAGE_LABELS } from "@/lib/auth";
import type { Feature, Page } from "@/lib/auth";
import { t } from "@/lib/i18n";

const PAGES = Object.keys(PAGE_FEATURES) as Page[];

/** The groups shown: each feature with its pages, then the pages that need no feature. */
const GROUPS: { feature: Feature | null; pages: Page[] }[] = [
  ...(Object.keys(FEATURE_LABELS) as Feature[])
    .map((feature) => ({ feature, pages: PAGES.filter((p) => PAGE_FEATURES[p] === feature) }))
    .filter((g) => g.pages.length > 0),
  { feature: null, pages: PAGES.filter((p) => PAGE_FEATURES[p] === null) },
];

interface Props {
  /** The features that are switched on: the pages of the others can't be chosen */
  features: Feature[];
  /** Pages switched off */
  value: Page[];
  onChange: (disabled: Page[]) => void;
}

/**
 * One checkbox per page, ticked when the page is on. A page only counts
 * inside a feature that is on: with "Clock in / out" on, the kiosk can be
 * switched off on its own.
 */
export default function PageChecks({ features, value, onChange }: Props) {
  return (
    <div className="space-y-3">
      {GROUPS.map(({ feature, pages }) => {
        const featureOn = feature === null || features.includes(feature);
        return (
          <fieldset key={feature ?? "other"} disabled={!featureOn} className={featureOn ? "" : "opacity-50"}>
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {feature ? t(FEATURE_LABELS[feature]) : t("Other pages")}
              {!featureOn && ` (${t("feature off")})`}
            </legend>
            <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {pages.map((page) => (
                <label key={page} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={featureOn && !value.includes(page)}
                    onChange={(e) =>
                      onChange(e.target.checked ? value.filter((p) => p !== page) : [...value, page])
                    }
                  />
                  {t(PAGE_LABELS[page])}
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
