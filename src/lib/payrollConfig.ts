// ─────────────────────────────────────────────────────────────────────────
// Payroll settings shown by the app
//
// Pay itself is calculated by the server (GET /payroll/*, see lib/payrollApi):
// no formula lives here. This file only keeps the company's settings the
// screens display, mainly the currency label. They come from the company's
// settings (Company settings page) and are applied at login by
// applyCompanySettings(); the defaults below are used until then.
// ─────────────────────────────────────────────────────────────────────────

export interface PayrollConfig {
  /** Standard work hours per day (the server derives the hourly rate from it). */
  hoursPerDay: number;
  /** Standard working days per month (the server derives the hourly rate from it). */
  workingDaysPerMonth: number;
  /** Share of earned pay offered as a weekly advance; 0.5 = half. */
  weeklyAdvanceRatio: number;
  /** Currency label shown next to amounts, e.g. "DA". */
  currency: string;
}

const DEFAULT_SETTINGS: PayrollConfig = {
  hoursPerDay: 8,
  workingDaysPerMonth: 26,
  weeklyAdvanceRatio: 0.5,
  currency: "DA",
};

/** The logged-in company's settings. The same object for the whole session. */
export const payrollConfig: PayrollConfig = { ...DEFAULT_SETTINGS };

/** Applies the logged-in company's payroll settings (called by AuthContext). */
export function applyCompanySettings(settings: Partial<PayrollConfig>) {
  // Start from the defaults, so a setting this company doesn't have never
  // keeps the previous company's value (e.g. after a super admin switches).
  Object.assign(payrollConfig, DEFAULT_SETTINGS);
  const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
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
