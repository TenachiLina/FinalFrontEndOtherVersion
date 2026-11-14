import { afterEach, describe, expect, it } from "vitest";
import { applyCompanySettings, currency, payrollConfig } from "./payrollConfig";

// payrollConfig is one shared object: put the defaults back after each test
const DEFAULTS = {
  hoursPerDay: 8,
  workingDaysPerMonth: 26,
  weeklyAdvanceRatio: 0.5,
  currency: "DA",
};
afterEach(() => {
  Object.assign(payrollConfig, DEFAULTS);
});

describe("payrollConfig", () => {
  it("starts with the default settings", () => {
    expect(payrollConfig).toEqual(DEFAULTS);
    expect(currency()).toBe("DA");
  });

  // Pay is calculated by the server (GET /payroll/*): the app must not grow a second copy
  it("holds settings only, no formula", () => {
    expect(Object.values(payrollConfig).filter((v) => typeof v === "function")).toEqual([]);
  });
});

describe("applyCompanySettings", () => {
  it("applies every provided setting", () => {
    applyCompanySettings({ hoursPerDay: 7, workingDaysPerMonth: 22, weeklyAdvanceRatio: 0.4, currency: "EUR" });
    expect(payrollConfig).toMatchObject({ hoursPerDay: 7, workingDaysPerMonth: 22, weeklyAdvanceRatio: 0.4 });
    expect(currency()).toBe("EUR");
  });

  it("uses the defaults for missing settings", () => {
    applyCompanySettings({});
    expect(payrollConfig).toMatchObject(DEFAULTS);
  });

  it("goes back to the defaults when the next company has no value of its own", () => {
    applyCompanySettings({ hoursPerDay: 7, currency: "EUR" });
    applyCompanySettings({});
    expect(payrollConfig).toEqual(DEFAULTS);
  });

  it("refuses 0, negative and non-number hours and days", () => {
    applyCompanySettings({ hoursPerDay: 0, workingDaysPerMonth: -2 });
    expect(payrollConfig).toMatchObject({ hoursPerDay: 8, workingDaysPerMonth: 26 });
    applyCompanySettings({ hoursPerDay: "9" as unknown as number, weeklyAdvanceRatio: NaN });
    expect(payrollConfig).toMatchObject({ hoursPerDay: 8, weeklyAdvanceRatio: 0.5 });
  });

  // 0 is a real choice (no weekly advances), not "not set"
  it("accepts a weekly advance ratio of 0", () => {
    applyCompanySettings({ weeklyAdvanceRatio: 0.3 });
    applyCompanySettings({ weeklyAdvanceRatio: 0 });
    expect(payrollConfig.weeklyAdvanceRatio).toBe(0);
  });
});
