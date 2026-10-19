"use client";

import React, { useEffect, useSyncExternalStore } from "react";
import { Lang, dirFor, getLang, initLang, setLang, subscribeLang, t } from "@/lib/i18n";

/** Re-renders the component when the language changes. */
export function useI18n() {
  const lang = useSyncExternalStore(subscribeLang, getLang, () => "en" as Lang);
  return { lang, dir: dirFor(lang), setLang, t };
}

/**
 * Loads the saved language and re-mounts the app when it changes, so every
 * screen (including text built outside components) switches language.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { lang } = useI18n();
  useEffect(() => {
    initLang();
  }, []);
  return <React.Fragment key={lang}>{children}</React.Fragment>;
}
