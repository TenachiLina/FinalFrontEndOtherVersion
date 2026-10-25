// ─────────────────────────────────────────────────────────────────────────
// Payroll configuration
//
// This file isolates the business formulas so they can change per company
// without touching any UI or data-fetching code. The numbers come from the
// company's settings (Company settings page) and are applied at login by
// applyCompanySettings(); the defaults below are used until then.
// ─────────────────────────────────────────────────────────────────────────

import { Employee, WorktimeRow } from "@/components/reporting/types";
import { timeToDecimalHours } from "@/lib/reporting";

export interface PayrollConfig {
  /** Standard work hours per day, used to derive the hourly rate from monthly base salary. */
  hoursPerDay: number;
  /** Standard working days per month, used to derive the hourly rate from monthly base salary. */
  workingDaysPerMonth: number;
  /** Share of earned pay (after consommation) offered as a weekly advance; 0.5 = half. */
  weeklyAdvanceRatio: number;
  /** Currency label shown next to amounts, e.g. "DA". */
  currency: string;

  /** Hourly rate for an employee, derived from their base monthly salary. */
  hourlyRate(employee: Employee | undefined): number;

  /**
   * Weekly advance OFFER — the amount an employee may request mid-period.
   * Does NOT deduct penalties (those are only settled at month-end).
   */
  weeklyAdvance(params: { hours: number; hourlyRate: number; consommation: number }): number;

  /**
   * Monthly payout — the actual amount paid to the employee at month-end.
   * brut = gross (before deductions); net = take-home (after deductions).
   */
  monthlyPayout(params: {
    hours: number;
    hourlyRate: number;
    penalties: number;
    consommation: number;
    advancesGivenThisMonth: number;
  }): { brut: number; net: number };
}

/**
 * Default config — current company's rules.
 *   hourlyRate        = base_salary / 8 / 26
 *   weeklyAdvance     = (hours * hourlyRate - consommation) * weeklyAdvanceRatio (0.5)
 *   monthlyPayout.brut = hours * hourlyRate
 *   monthlyPayout.net  = brut - penalties - consommation - advancesGivenThisMonth
 */
export const defaultPayrollConfig: PayrollConfig = {
  hoursPerDay: 8,
  workingDaysPerMonth: 26,
  weeklyAdvanceRatio: 0.5,
  currency: "DA",

  hourlyRate(employee) {
    const baseSalary = Number(employee?.Base_salary || 0);
    return baseSalary / this.hoursPerDay / this.workingDaysPerMonth;
  },

  weeklyAdvance({ hours, hourlyRate, consommation }) {
    const brut = hours * hourlyRate;
    return (brut - consommation) * this.weeklyAdvanceRatio;
  },

  monthlyPayout({ hours, hourlyRate, penalties, consommation, advancesGivenThisMonth }) {
    const brut = hours * hourlyRate;
    const net = brut - penalties - consommation - advancesGivenThisMonth;
    return { brut, net };
  },
};

// The rest of the app only ever imports `payrollConfig` from here, never the
// formulas directly. Formulas that differ in shape (not just numbers) between
// companies would be selected here too.
export const payrollConfig: PayrollConfig = defaultPayrollConfig;

// The default numbers, copied once: payrollConfig is the same object as
// defaultPayrollConfig, so its values change with each company.
const DEFAULT_SETTINGS = {
  hoursPerDay: defaultPayrollConfig.hoursPerDay,
  workingDaysPerMonth: defaultPayrollConfig.workingDaysPerMonth,
  weeklyAdvanceRatio: defaultPayrollConfig.weeklyAdvanceRatio,
  currency: defaultPayrollConfig.currency,
};

/** Applies the logged-in company's payroll settings (called by AuthContext). */
export function applyCompanySettings(settings: {
  hoursPerDay?: number;
  workingDaysPerMonth?: number;
  weeklyAdvanceRatio?: number;
  currency?: string;
}) {
  // Start from the defaults, so a setting this company doesn't have never
  // keeps the previous company's value (e.g. after a super admin switches).
  Object.assign(payrollConfig, DEFAULT_SETTINGS);
  const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  // The hourly rate divides by these two, so they must be above 0
  if (isNumber(settings.hoursPerDay) && settings.hoursPerDay > 0) {
    payrollConfig.hoursPerDay = settings.hoursPerDay;
  }
  if (isNumber(settings.workingDaysPerMonth) && settings.workingDaysPerMonth > 0) {
    payrollConfig.workingDaysPerMonth = settings.workingDaysPerMonth;
  }
  // 0 is a real choice here (no weekly advances), not "not set"
  if (isNumber(settings.weeklyAdvanceRatio) && settings.weeklyAdvanceRatio >= 0) {
    payrollConfig.weeklyAdvanceRatio = settings.weeklyAdvanceRatio;
  }
  if (settings.currency) payrollConfig.currency = settings.currency;
}

/** The company's currency label, e.g. "DA". */
export function currency(): string {
  return payrollConfig.currency;
}

// ─────────────────────────────────────────────────────────────────────────
// Convenience helpers built on top of the active config
// ─────────────────────────────────────────────────────────────────────────

export function sumHours(rows: WorktimeRow[]): number {
  return rows.reduce((sum, r) => sum + timeToDecimalHours(r.work_hours), 0);
}

export function sumConsommation(rows: WorktimeRow[]): number {
  return rows.reduce((sum, r) => sum + (r.consommation || 0), 0);
}

export function sumPenalties(rows: WorktimeRow[]): number {
  return rows.reduce((sum, r) => sum + (r.penalty || 0), 0);
}

export function sumAbsences(rows: WorktimeRow[]): number {
  return rows.reduce((sum, r) => sum + (r.absent ? 1 : 0), 0);
}

export function sumLateMinutes(rows: WorktimeRow[]): number {
  return rows.reduce((sum, r) => sum + (r.late_minutes || 0), 0);
}