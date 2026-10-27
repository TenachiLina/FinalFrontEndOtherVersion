import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";
import MonthlyPayrollView from "./MonthlyPayrollView";
import {
  AMINE,
  SARA,
  failGet,
  mockReportingApi,
  plan,
  rangesRequested,
  rawAdvance,
  rawBonus,
  rawEmployee,
  rawRow,
  tableBody,
  clearFeedbackAfterEachTest,
  fixTodayInEachTest,
  type ReportingData,
} from "./__testutils__/reportingApi";

fixTodayInEachTest(); // 2026-03-11 → March
clearFeedbackAfterEachTest();

// Amine 200 DA/h, Sara 100 DA/h
const MARCH: ReportingData = {
  employees: [rawEmployee(AMINE), rawEmployee(SARA)],
  planning: [plan(101, "2026-03-02"), plan(102, "2026-03-09"), plan(101, "2026-02-10")],
  worktime: [
    rawRow({ emp_id: 101, work_date: "2026-03-02", work_hours: "08:00:00", penalty: 150 }),
    rawRow({ emp_id: 101, work_date: "2026-03-09", work_hours: "08:00:00", consommation: 300 }),
    rawRow({ emp_id: 101, work_date: "2026-03-10", work_hours: "07:30:00" }),
    rawRow({ emp_id: 102, work_date: "2026-03-09", work_hours: "06:00", consommation: 100 }),
    rawRow({ emp_id: 102, work_date: "2026-03-12", work_hours: "04:30" }),
    rawRow({ emp_id: 101, work_date: "2026-02-10", work_hours: "04:00" }),
  ],
  advances: [
    rawAdvance({ emp_id: 101, amount: 1000, date: "2026-03-10" }),
    rawAdvance({ emp_id: 101, amount: 500, date: "2026-03-03" }),
    rawAdvance({ emp_id: 102, amount: 200, date: "2026-03-16" }),
  ],
  bonuses: [rawBonus({ emp_id: 101, amount: 250, date: "2026-03-05" })],
};

async function renderView(data: ReportingData = MARCH, url = "/reporting/monthly-payroll") {
  const requests = mockReportingApi(data);
  const view = renderWithProviders(<MonthlyPayrollView />, { url });
  await screen.findByText("Amine Kaci");
  return { ...view, requests };
}

const pill = (label: string) =>
  screen.getAllByText(label).find((el) => el.tagName === "DIV")!.nextElementSibling!.textContent;

describe("MonthlyPayrollView", () => {
  it("shows each employee's pay for the month, with column totals", async () => {
    await renderView();
    expect(screen.getByRole("columnheader", { name: "Gross Salary March 2026" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Net Salary March 2026" })).toBeInTheDocument();
    expect(tableBody()).toEqual([
      // 23.5 h × 200 = 4700; net = 4700 − 150 − 300 − 1500 + 250 = 3000
      ["Amine Kaci", "41600.00 DA", "200.00 DA/h", "23.5 h", "1500.00 DA", "300.00 DA", "150.00 DA", "250.00 DA", "4700.00 DA", "3000.00 DA", "Details"],
      // 10.5 h × 100 = 1050; net = 1050 − 100 − 200 = 750
      ["Sara Bel", "20800.00 DA", "100.00 DA/h", "10.5 h", "200.00 DA", "100.00 DA", "0.00 DA", "0.00 DA", "1050.00 DA", "750.00 DA", "Details"],
      ["Total", "62400.00 DA", "—", "34 h", "1700.00 DA", "400.00 DA", "150.00 DA", "250.00 DA", "5750.00 DA", "3750.00 DA", ""],
    ]);
  });

  it("shows the headline totals", async () => {
    await renderView();
    expect(pill("Total Gross")).toBe("5750.00 DA");
    expect(pill("Total Advances")).toBe("1700.00 DA");
    expect(pill("Total Net Payout")).toBe("3750.00 DA");
  });

  it("links each employee to their payroll details for the month", async () => {
    await renderView();
    expect(within(screen.getByRole("row", { name: /Sara Bel/ })).getByRole("link", { name: "Details" })).toHaveAttribute(
      "href",
      "/reporting/employee/102?tab=payroll&start=2026-03-01&end=2026-03-31&from=monthly-payroll"
    );
  });

  it("filters by name, and the totals follow", async () => {
    const { user } = await renderView();
    await user.type(screen.getByPlaceholderText("Search employee…"), "amine");
    expect(screen.queryByText("Sara Bel")).not.toBeInTheDocument();
    expect(pill("Total Net Payout")).toBe("3000.00 DA");
    expect(tableBody().at(-1)![9]).toBe("3000.00 DA");
  });

  it("loads the month picked", async () => {
    const { user, requests } = await renderView();
    await user.selectOptions(screen.getAllByRole("combobox")[0], "1");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByRole("columnheader", { name: "Gross Salary February 2026" })).toBeInTheDocument();
    expect(rangesRequested(requests, "/worktime").at(-1)).toBe("2026-02-01..2026-02-28");
    expect(tableBody()[0]).toContain("800.00 DA");
  });

  it("reopens the month given in the address", async () => {
    const requests = mockReportingApi(MARCH);
    renderWithProviders(<MonthlyPayrollView />, { url: "/reporting/monthly-payroll?start=2026-02-01&end=2026-02-28" });
    expect(await screen.findByRole("columnheader", { name: "Net Salary February 2026" })).toBeInTheDocument();
    // The header shows the month straight away; the data request follows
    await waitFor(() => expect(rangesRequested(requests, "/worktime")).toEqual(["2026-02-01..2026-02-28"]));
  });

  it("says when nobody is found", async () => {
    mockReportingApi({ ...MARCH, planning: [], worktime: [] });
    renderWithProviders(<MonthlyPayrollView />, { url: "/reporting/monthly-payroll" });
    expect(await screen.findByText("No employees found")).toBeInTheDocument();
    expect(pill("Total Net Payout")).toBe("0.00 DA");
  });

  it("shows the error and loads again on 'Try again'", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockReportingApi(MARCH);
    failGet("/worktime", 500);
    const { user } = renderWithProviders(<MonthlyPayrollView />, { url: "/reporting/monthly-payroll" });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load the monthly payroll");
    mockReportingApi(MARCH);
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Amine Kaci")).toBeInTheDocument();
  });

  it("warns that totals may be incomplete when the advances can't be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockReportingApi(MARCH);
    failGet("/advances", 500);
    renderWithProviders(<MonthlyPayrollView />, { url: "/reporting/monthly-payroll" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Advances couldn't be loaded, so the totals shown may be incomplete. Try refreshing."
    );
    await waitFor(() => expect(pill("Total Net Payout")).toBe("5450.00 DA"));
  });

  // BUG-509: the totals row adds rounded hours as floats and shows the binary noise
  it("shows the total hours rounded", async () => {
    await renderView({
      ...MARCH,
      worktime: [
        rawRow({ emp_id: 101, work_date: "2026-03-09", work_hours: "00:06:00" }),
        rawRow({ emp_id: 102, work_date: "2026-03-09", work_hours: "00:12:00" }),
      ],
    });
    expect(tableBody().at(-1)![3]).toBe("0.3 h");
  });
});
