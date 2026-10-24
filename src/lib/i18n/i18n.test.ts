import { afterEach, describe, expect, it, vi } from "vitest";
import fr from "./fr";
import ar from "./ar";
import {
  EARLY_DIR_SCRIPT,
  LANGUAGES,
  applyDefaultLang,
  dirFor,
  getLang,
  getSavedLang,
  initLang,
  isLang,
  locale,
  monthName,
  setLang,
  subscribeLang,
  t,
  weekdayInitial,
} from "./index";

// The current language is module state: go back to English after each test
afterEach(() => {
  setLang("en");
  localStorage.clear();
});

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe("dictionaries", () => {
  it("French and Arabic translate exactly the same texts", () => {
    const frKeys = Object.keys(fr).sort();
    const arKeys = Object.keys(ar).sort();
    expect(frKeys.filter((k) => !(k in ar)), "missing in ar.ts").toEqual([]);
    expect(arKeys.filter((k) => !(k in fr)), "missing in fr.ts").toEqual([]);
  });

  it.each([
    ["fr", fr],
    ["ar", ar],
  ] as const)("%s keeps every {placeholder} of the English text", (_lang, dict) => {
    const broken = Object.entries(dict)
      .filter(([en, tr]) => placeholders(en).join() !== placeholders(tr).join())
      .map(([en]) => en);
    expect(broken).toEqual([]);
  });

  it.each([
    ["fr", fr],
    ["ar", ar],
  ] as const)("%s has no empty translations", (_lang, dict) => {
    expect(Object.entries(dict).filter(([, tr]) => !tr.trim()).map(([en]) => en)).toEqual([]);
  });
});

describe("t", () => {
  it("returns English as is", () => {
    expect(t("Clock in")).toBe("Clock in");
  });

  it("translates into the current language", () => {
    const [en, translated] = Object.entries(fr)[0];
    setLang("fr");
    expect(t(en)).toBe(translated);
  });

  it("falls back to English for unknown text", () => {
    setLang("ar");
    expect(t("Not a real key 123")).toBe("Not a real key 123");
  });

  it("fills placeholders and leaves unknown ones", () => {
    expect(t("{name} worked {hours}h {missing}", { name: "Amine", hours: 8 })).toBe("Amine worked 8h {missing}");
  });

  it("does not treat $ in values as a replacement pattern", () => {
    expect(t("Total: {v}", { v: "$&$1" })).toBe("Total: $&$1");
  });
});

describe("language state", () => {
  it("isLang accepts only the three languages", () => {
    expect(LANGUAGES.map((l) => l.code).every(isLang)).toBe(true);
    expect(isLang("de")).toBe(false);
    expect(isLang(null)).toBe(false);
  });

  it("setLang remembers the choice and sets the page direction", () => {
    setLang("ar");
    expect(getLang()).toBe("ar");
    expect(getSavedLang()).toBe("ar");
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    setLang("fr");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("getSavedLang ignores invalid stored values", () => {
    localStorage.setItem("lang", "de");
    expect(getSavedLang()).toBeNull();
  });

  it("applyDefaultLang uses the company language only when the user hasn't chosen", () => {
    localStorage.clear();
    applyDefaultLang("fr");
    expect(getLang()).toBe("fr");

    localStorage.setItem("lang", "ar");
    applyDefaultLang("en");
    expect(getLang()).toBe("fr");
  });

  it("applyDefaultLang ignores empty values", () => {
    localStorage.clear();
    applyDefaultLang(undefined);
    applyDefaultLang(null);
    expect(getLang()).toBe("en");
  });

  it("initLang restores the saved language", () => {
    localStorage.setItem("lang", "ar");
    initLang();
    expect(getLang()).toBe("ar");
    initLang(); // same language again: nothing changes
    expect(getLang()).toBe("ar");
  });

  it("notifies listeners until they unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLang(listener);
    setLang("fr");
    unsubscribe();
    setLang("ar");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getSavedLang()).toBeNull();
    setLang("fr");
    expect(getLang()).toBe("fr");
  });
});

describe("formatting helpers", () => {
  it("dirFor and locale", () => {
    expect(dirFor("ar")).toBe("rtl");
    expect(dirFor("en")).toBe("ltr");
    expect(locale()).toBe("en-GB");
    setLang("fr");
    expect(locale()).toBe("fr-FR");
    setLang("ar");
    expect(locale()).toBe("ar-DZ");
  });

  it("monthName and weekdayInitial", () => {
    expect(monthName(0)).toBe("January");
    expect(monthName(1, "short")).toBe("Feb");
    expect(weekdayInitial(0)).toBe("S");
    expect(weekdayInitial(1)).toBe("M");
  });

  it("EARLY_DIR_SCRIPT sets the direction before React loads", () => {
    localStorage.setItem("lang", "ar");
    document.documentElement.dir = "ltr";
    new Function(EARLY_DIR_SCRIPT)();
    expect(document.documentElement.dir).toBe("rtl");
  });
});
