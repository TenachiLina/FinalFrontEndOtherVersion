// ─────────────────────────────────────────────────────────────────────────
// Payslip (fiche de paie)
//
// The amounts follow the company's FICHE DE PAIE.xlsx, not the hours-based
// Monthly Payroll, so the two nets can differ. They are calculated by the
// server (GET /payroll/payslips) and only laid out here.
// ─────────────────────────────────────────────────────────────────────────

import { EmployeeRaw } from "@/components/reporting/types";
import { CompanyInfo } from "@/lib/auth";

/** The amounts of one payslip, as the server calculated them. */
export interface PayslipMoney {
  days: number;
  baseSalary: number;
  postSalary: number;
  socialSecurity: number;
  net: number;
}

const NO_AMOUNTS: PayslipMoney = { days: 0, baseSalary: 0, postSalary: 0, socialSecurity: 0, net: 0 };
export const SOCIAL_SECURITY_RATE = 0.09;

const MONTHS_FR = [
  "JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN",
  "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE",
];

/** Details that can be changed by clicking them on the payslip. */
export const COMPANY_PAYSLIP_FIELDS: PayslipField[] = [
  "payslipActivity",
  "payslipAddress",
  "payslipContributorNumber",
];

export type PayslipField =
  | "jobTitle"
  | "familyStatus"
  | "birthDate"
  | "hireDate"
  | "socialSecurityNumber"
  | "payslipActivity"
  | "payslipAddress"
  | "payslipContributorNumber";

export interface Payslip {
  empNumber: number | string;
  company: { name: string; activity: string; address: string; contributorNumber: string };
  /** e.g. "MAI 2026" */
  period: string;
  employeeName: string;
  familyStatus: string;
  jobTitle: string;
  birthDate: string; // "YYYY-MM-DD"
  hireDate: string; // "YYYY-MM-DD"
  socialSecurityNumber: string;
  days: number;
  baseSalary: number;
  postSalary: number;
  socialSecurity: number;
  net: number;
}


/** "2026-05" → "MAI 2026" */
export function payslipPeriod(month: string): string {
  const [year, m] = month.split("-");
  return `${MONTHS_FR[Number(m) - 1] ?? ""} ${year}`.trim();
}

/** "2004-03-14" → "14/03/2004" */
export function formatPayslipDate(date: string): string {
  const [y, m, d] = date.split("-");
  return y && m && d ? `${d}/${m}/${y}` : date;
}

export function buildPayslip(
  employee: EmployeeRaw,
  company: Pick<CompanyInfo, "name"> & { settings?: Partial<CompanyInfo["settings"]> },
  month: string,
  // Missing while the amounts are loading: the sheet shows zeros, never a guess
  amounts: PayslipMoney = NO_AMOUNTS
): Payslip {
  const { days, baseSalary, postSalary, socialSecurity, net } = amounts;
  return {
    empNumber: employee.empNumber ?? "",
    company: {
      name: company.name,
      activity: company.settings?.payslipActivity ?? "",
      address: company.settings?.payslipAddress ?? "",
      contributorNumber: company.settings?.payslipContributorNumber ?? "",
    },
    period: payslipPeriod(month),
    employeeName: `${employee.lastName ?? ""} ${employee.firstName ?? ""}`.trim().toUpperCase(),
    familyStatus: employee.familyStatus ?? "",
    jobTitle: employee.jobTitle ?? "",
    birthDate: employee.birthDate ?? "",
    hireDate: employee.hireDate ?? "",
    socialSecurityNumber: employee.socialSecurityNumber ?? "",
    days,
    baseSalary,
    postSalary,
    socialSecurity,
    net,
  };
}

/** The details this payslip still lacks, as labels to show the user. */
export function missingPayslipFields(p: Payslip): string[] {
  return [
    ...(p.familyStatus ? [] : ["Family status"]),
    ...(p.jobTitle ? [] : ["Job title"]),
    ...(p.birthDate ? [] : ["Date of birth"]),
    ...(p.hireDate ? [] : ["Hire date"]),
    ...(p.socialSecurityNumber ? [] : ["Insurance number"]),
    ...(p.company.activity ? [] : ["Company activity"]),
    ...(p.company.address ? [] : ["Company address"]),
    ...(p.company.contributorNumber ? [] : ["Contributor number"]),
  ];
}
