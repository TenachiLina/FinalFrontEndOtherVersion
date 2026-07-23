// ─────────────────────────────────────────────────────────────────────────
// Payroll configuration
//
// This file isolates the business formulas so they can be swapped per
// company without touching any UI or data-fetching code. Today it's
// hardcoded to one company's rules; to support another company, create a
// different config object with the same shape and swap which one is
// imported (e.g. via an env var or a per-tenant lookup) — nothing else
// in the app needs to change.
// ─────────────────────────────────────────────────────────────────────────

import { Employee, WorktimeRow } from "@/components/reporting/types";
import { timeToDecimalHours } from "@/lib/reporting";

export interface PayrollConfig {
  /** Standard work hours per day, used to derive the hourly rate from monthly base salary. */
  hoursPerDay: number;
  /** Standard working days per month, used to derive the hourly rate from monthly base salary. */
  workingDaysPerMonth: number;

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
 *   weeklyAdvance     = (hours * hourlyRate - consommation) / 2
 *   monthlyPayout.brut = hours * hourlyRate
 *   monthlyPayout.net  = brut - penalties - consommation - advancesGivenThisMonth
 */
export const defaultPayrollConfig: PayrollConfig = {
  hoursPerDay: 8,
  workingDaysPerMonth: 26,

  hourlyRate(employee) {
    const baseSalary = Number(employee?.Base_salary || 0);
    return baseSalary / this.hoursPerDay / this.workingDaysPerMonth;
  },

  weeklyAdvance({ hours, hourlyRate, consommation }) {
    const brut = hours * hourlyRate;
    return (brut - consommation) / 2;
  },

  monthlyPayout({ hours, hourlyRate, penalties, consommation, advancesGivenThisMonth }) {
    const brut = hours * hourlyRate;
    const net = brut - penalties - consommation - advancesGivenThisMonth;
    return { brut, net };
  },
};

// ⚠️ To onboard a different company with different rules, define a new
// PayrollConfig object (e.g. `acmeCorpPayrollConfig`) and select it based
// on tenant/company at the call site — the rest of the app only ever
// imports `payrollConfig` from here, never the formulas directly.
export const payrollConfig: PayrollConfig = defaultPayrollConfig;

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