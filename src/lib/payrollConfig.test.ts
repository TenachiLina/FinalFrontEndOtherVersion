import { afterEach, describe, expect, it } from "vitest";
import { makeRow } from "@/test/factories";
import {
  applyCompanySettings,
  currency,
  defaultPayrollConfig,
  payrollConfig,
  sumAbsences,
  sumConsommation,
  sumHours,
  sumLateMinutes,
  sumPenalties,
} from "./payrollConfig";

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

describe("formulas", () => {
  it("hourlyRate = base salary / 8 / 26", () => {
    expect(payrollConfig.hourlyRate({ emp_id: 1, FirstName: "", LastName: "", Base_salary: 41600 })).toBe(200);
  });

  it("hourlyRate is 0 without an employee or salary", () => {
    expect(payrollConfig.hourlyRate(undefined)).toBe(0);
    expect(payrollConfig.hourlyRate({ emp_id: 1, FirstName: "", LastName: "", Base_salary: 0 })).toBe(0);
  });

  it("hourlyRate follows the company's hours and days", () => {
    applyCompanySettings({ hoursPerDay: 7, workingDaysPerMonth: 22 });
    expect(payrollConfig.hourlyRate({ emp_id: 1, FirstName: "", LastName: "", Base_salary: 15400 })).toBe(100);
  });

  it("weeklyAdvance = (hours × rate − consommation) × ratio", () => {
    expect(payrollConfig.weeklyAdvance({ hours: 40, hourlyRate: 200, consommation: 1000 })).toBe(3500);
  });

  it("monthlyPayout deducts penalties, consommation and advances from the gross", () => {
    expect(
      payrollConfig.monthlyPayout({
        hours: 208,
        hourlyRate: 200,
        penalties: 500,
        consommation: 1500,
        advancesGivenThisMonth: 10000,
      })
    ).toEqual({ brut: 41600, net: 29600 });
  });

  it("monthlyPayout can go below zero when advances exceed pay", () => {
    expect(
      payrollConfig.monthlyPayout({ hours: 10, hourlyRate: 100, penalties: 0, consommation: 0, advancesGivenThisMonth: 5000 }).net
    ).toBe(-4000);
  });

  it("the exported config is the default config", () => {
    expect(payrollConfig).toBe(defaultPayrollConfig);
  });
});

describe("applyCompanySettings", () => {
  it("applies every provided setting", () => {
    applyCompanySettings({ hoursPerDay: 7, workingDaysPerMonth: 22, weeklyAdvanceRatio: 0.4, currency: "EUR" });
    expect(payrollConfig).toMatchObject({ hoursPerDay: 7, workingDaysPerMonth: 22, weeklyAdvanceRatio: 0.4 });
    expect(currency()).toBe("EUR");
  });

  it("keeps the current values for missing settings", () => {
    applyCompanySettings({});
    expect(payrollConfig).toMatchObject(DEFAULTS);
  });

  // BUG-002: 0 is treated as "not set", so a company can't turn weekly advances off,
  // and after switching company the previous company's ratio stays in place
  it.fails("accepts a weekly advance ratio of 0", () => {
    applyCompanySettings({ weeklyAdvanceRatio: 0.3 });
    applyCompanySettings({ weeklyAdvanceRatio: 0 });
    expect(payrollConfig.weeklyAdvanceRatio).toBe(0);
  });
});

describe("row sums", () => {
  const rows = [
    makeRow({ work_hours: "08:30:00", consommation: 100, penalty: 50, absent: 0, late_minutes: 5 }),
    makeRow({ work_hours: 4, consommation: 0, penalty: 0, absent: 1, late_minutes: 0 }),
    makeRow({ work_hours: null, consommation: 25, penalty: 10, absent: 0, late_minutes: 12 }),
  ];

  it("adds up each column", () => {
    expect(sumHours(rows)).toBe(12.5);
    expect(sumConsommation(rows)).toBe(125);
    expect(sumPenalties(rows)).toBe(60);
    expect(sumAbsences(rows)).toBe(1);
    expect(sumLateMinutes(rows)).toBe(17);
  });

  it("returns 0 for no rows", () => {
    for (const sum of [sumHours, sumConsommation, sumPenalties, sumAbsences, sumLateMinutes]) {
      expect(sum([])).toBe(0);
    }
  });
});
