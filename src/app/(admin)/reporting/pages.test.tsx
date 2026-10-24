import { describe, expect, it } from "vitest";
import React from "react";
import { redirect } from "next/navigation";
import { renderWithProviders, screen } from "@/test/render";
import {
  AMINE,
  mockReportingApi,
  plan,
  rawEmployee,
  clearFeedbackAfterEachTest,
  fixTodayInEachTest,
} from "@/components/reporting/__testutils__/reportingApi";
import OverviewPage, { metadata as overviewMeta } from "./overview/page";
import WeeklyAdvancesPage, { metadata as weeklyMeta } from "./weekly-advances/page";
import MonthlyPayrollPage, { metadata as monthlyMeta } from "./monthly-payroll/page";
import AttendancePage, { metadata as attendanceMeta } from "./attendance/page";
import AdvancesPage, { metadata as advancesMeta } from "./advances/page";
import BonusesIndexPage from "./bonuses/page";
import GiveBonusesPage, { metadata as giveMeta } from "./bonuses/give/page";
import BonusesHistoryPage, { metadata as historyMeta } from "./bonuses/history/page";
import EmployeeReportPage, { metadata as employeeMeta } from "./employee/[id]/page";

fixTodayInEachTest();
clearFeedbackAfterEachTest();

const data = { employees: [rawEmployee(AMINE)], planning: [plan(101, "2026-03-10")] };

describe("reporting pages", () => {
  it.each([
    ["overview", OverviewPage, "Reporting Overview", overviewMeta, "Reporting Overview | Nexo InOuty"],
    ["weekly-advances", WeeklyAdvancesPage, "Weekly Advances", weeklyMeta, "Weekly Advances | Nexo InOuty"],
    ["monthly-payroll", MonthlyPayrollPage, "Monthly Payroll", monthlyMeta, "Monthly Payroll | Nexo InOuty"],
    ["attendance", AttendancePage, "Attendance", attendanceMeta, "Attendance | Nexo InOuty"],
    ["advances", AdvancesPage, "Advances", advancesMeta, "Advances | Nexo InOuty"],
    ["bonuses/give", GiveBonusesPage, "Give Bonuses", giveMeta, "Give Bonuses | Nexo InOuty"],
    ["bonuses/history", BonusesHistoryPage, "Bonus History", historyMeta, "Bonus History | Nexo InOuty"],
  ])("/reporting/%s shows its screen", async (path, Page, heading, meta, title) => {
    mockReportingApi(data);
    renderWithProviders(<Page />, { url: `/reporting/${path}` });
    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    expect(meta.title).toBe(title);
    // let the first loads finish so nothing updates after the test
    await screen.findAllByText(/Amine|No |Total/);
  });

  it("/reporting/bonuses sends old links to the give page", () => {
    BonusesIndexPage();
    expect(redirect).toHaveBeenCalledWith("/reporting/bonuses/give");
  });

  it("/reporting/employee/[id] shows that employee's report", async () => {
    mockReportingApi(data);
    const ui = await EmployeeReportPage({ params: Promise.resolve({ id: "101" }) });
    renderWithProviders(ui, { url: "/reporting/employee/101", params: { id: "101" } });
    expect(await screen.findByRole("heading", { level: 1, name: "Amine Kaci" })).toBeInTheDocument();
    expect(employeeMeta.title).toBe("Employee Report | Nexo InOuty");
  });
});
