import type { AuthUser, CompanyInfo, Feature } from "@/lib/auth";
import type { WorktimeRow } from "@/components/reporting/types";

export const ALL_FEATURES: Feature[] = [
  "planning",
  "clockin",
  "faceRecognition",
  "reporting",
  "advances",
  "bonuses",
];

export function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "u1",
    email: "admin@test.dz",
    name: "Admin",
    role: "admin",
    companyId: "c1",
    ...overrides,
  };
}

export function makeCompany(overrides: Partial<CompanyInfo> = {}): CompanyInfo {
  return {
    id: "c1",
    name: "Test Pizza",
    slug: "test-pizza",
    branding: {},
    active: true,
    features: [...ALL_FEATURES],
    settings: {
      currency: "DA",
      utcOffset: "+01:00",
      hoursPerDay: 8,
      workingDaysPerMonth: 26,
      weeklyAdvanceRatio: 0.5,
    },
    ...overrides,
  };
}

export function makeRow(overrides: Partial<WorktimeRow> = {}): WorktimeRow {
  return {
    emp_id: 101,
    work_date: "2026-03-01",
    work_hours: "08:00:00",
    late_minutes: 0,
    overtime_minutes: 0,
    penalty: 0,
    consommation: 0,
    absent: 0,
    absent_comment: "",
    is_empty: false,
    ...overrides,
  };
}

/** A JWT-shaped token whose payload expires `secondsFromNow` from now. */
export function makeJwt(secondsFromNow: number): string {
  const payload = { exp: Math.floor(Date.now() / 1000) + secondsFromNow };
  const b64 = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `header.${b64}.signature`;
}
