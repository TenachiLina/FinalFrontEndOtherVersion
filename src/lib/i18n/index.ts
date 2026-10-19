// ─────────────────────────────────────────────────────────────────────────
// Translations (English, French, Arabic).
//
// The English text itself is the key:   t("Clock in")
// with placeholders:                     t("{name} is clocked in", { name })
// Missing translations fall back to English, so nothing ever shows a key.
//
// Each user's choice is remembered on the device; otherwise the company's
// default language (Company settings) is used, then English.
// ─────────────────────────────────────────────────────────────────────────

import fr from "./fr";
import ar from "./ar";

export type Lang = "en" | "fr" | "ar";

export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "ar", label: "العربية" },
];

const DICTIONARIES: Record<Exclude<Lang, "en">, Record<string, string>> = { fr, ar };
const STORAGE_KEY = "lang";

let current: Lang = "en";
const listeners = new Set<() => void>();

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "fr" || value === "ar";
}

export function getLang(): Lang {
  return current;
}

export function dirFor(lang: Lang): "ltr" | "rtl" {
  return lang === "ar" ? "rtl" : "ltr";
}

/** Translates English text into the current language. */
export function t(text: string, params?: Record<string, string | number>): string {
  const translated = current === "en" ? text : DICTIONARIES[current][text] ?? text;
  if (!params) return translated;
  return translated.replace(/\{(\w+)\}/g, (whole, key) =>
    params[key] !== undefined ? String(params[key]) : whole
  );
}

/** Locale for dates and numbers, e.g. toLocaleDateString(locale()). */
export function locale(): string {
  return current === "ar" ? "ar-DZ" : current === "fr" ? "fr-FR" : "en-GB";
}

function apply(lang: Lang) {
  current = lang;
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
    document.documentElement.dir = dirFor(lang);
  }
  listeners.forEach((l) => l());
}

/** The user picked a language: use it and remember it on this device. */
export function setLang(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* storage unavailable */
  }
  apply(lang);
}

export function getSavedLang(): Lang | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isLang(saved) ? saved : null;
  } catch {
    return null;
  }
}

/** Company default: only used when the user hasn't picked a language. */
export function applyDefaultLang(lang: Lang | null | undefined) {
  if (getSavedLang()) return;
  if (lang && lang !== current) apply(lang);
}

/** Called once on start-up in the browser. */
export function initLang() {
  const saved = getSavedLang();
  if (saved && saved !== current) apply(saved);
}

export function subscribeLang(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Runs before React loads (see app/layout.tsx) so Arabic pages start
 * right-to-left instead of flipping after the first paint.
 */
export const EARLY_DIR_SCRIPT = `try{var l=localStorage.getItem('${STORAGE_KEY}');if(l==='ar'||l==='fr'||l==='en'){document.documentElement.lang=l;document.documentElement.dir=l==='ar'?'rtl':'ltr'}}catch(e){}`;

/** Month name in the current language (0 = January). */
export function monthName(index: number, style: "long" | "short" = "long"): string {
  return new Date(2000, index, 1).toLocaleDateString(locale(), { month: style });
}

/** One-letter weekday in the current language (0 = Sunday). */
export function weekdayInitial(index: number): string {
  // 2000-01-02 was a Sunday
  return new Date(2000, 0, 2 + index).toLocaleDateString(locale(), { weekday: "narrow" });
}
