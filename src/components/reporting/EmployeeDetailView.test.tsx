import { describe, expect, it, vi } from "vitest";
import React from "react";
import { HttpResponse, delay } from "msw";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";
import EmployeeDetailView from "./EmployeeDetailView";
import {
  AMINE,
  SARA,
  captureWrites,
  failGet,
  mockReportingApi,
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

fixTodayInEachTest(); // Wednesday 2026-03-11 → week 03-09..03-15, month March
clearFeedbackAfterEachTest();

// Amine: 200 DA/h
const DATA: ReportingData = {
  employees: [rawEmployee(AMINE), rawEmployee(SARA)],
  worktime: [
    rawRow({ emp_id: 101, work_date: "2026-03-02", work_hours: "08:00:00", penalty: 150, late_minutes: 5 }),
    rawRow({ emp_id: 101, work_date: "2026-03-09", work_hours: "08:00:00", consommation: 300 }),
    rawRow({ emp_id: 101, work_date: "2026-03-10", work_hours: "07:30:00", overtime_minutes: 30 }),
    rawRow({ emp_id: 101, work_date: "2026-03-20", work_hours: 0, absent: true, absent_comment: "Sick" }),
    rawRow({ emp_id: 102, work_date: "2026-03-09", work_hours: "06:00:00" }),
  ],
  advances: [rawAdvance({ _id: "adv-mar-3", emp_id: 101, amount: 500, date: "2026-03-03" })],
  bonuses: [rawBonus({ emp_id: 101, amount: 250, date: "2026-03-05" })],
};

async function renderView(url = "/reporting/employee/101", data: ReportingData = DATA, empId = "101") {
  const requests = mockReportingApi(data);
  const view = renderWithProviders(<EmployeeDetailView empId={empId} />, { url, params: { id: empId } });
  await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
  return { ...view, requests };
}

const summary = (label: string) => screen.getByText(label, { selector: "div" }).nextElementSibling!.textContent;

describe("EmployeeDetailView — header", () => {
  it("shows the employee's name once loaded", async () => {
    mockReportingApi(DATA);
    renderWithProviders(<EmployeeDetailView empId="101" />, { url: "/reporting/employee/101" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Loading…");
    expect(await screen.findByRole("heading", { name: "Amine Kaci" })).toBeInTheDocument();
  });

  it("shows the number of an unknown employee", async () => {
    await renderView("/reporting/employee/999", DATA, "999");
    expect(screen.getByRole("heading", { name: "Employee #999" })).toBeInTheDocument();
  });

  it.each([
    ["/reporting/employee/101", "← Back to Overview", "/reporting/overview"],
    [
      "/reporting/employee/101?tab=advance&start=2026-03-02&end=2026-03-08&from=weekly-advances",
      "← Back to Weekly Advances",
      "/reporting/weekly-advances?start=2026-03-02&end=2026-03-08",
    ],
    [
      "/reporting/employee/101?tab=payroll&start=2026-02-01&end=2026-02-28&from=monthly-payroll",
      "← Back to Monthly Payroll",
      "/reporting/monthly-payroll?start=2026-02-01&end=2026-02-28",
    ],
    ["/reporting/employee/101?from=monthly-payroll", "← Back to Monthly Payroll", "/reporting/monthly-payroll"],
  ])("from %s goes back with '%s'", async (url, label, href) => {
    await renderView(url);
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
  });
});

describe("EmployeeDetailView — weekly advance tab", () => {
  it("shows this week's offer, hours and days", async () => {
    await renderView();
    expect(screen.getByText("2026-03-09 → 2026-03-15")).toBeInTheDocument();
    // (15.5 h × 200 − 300) × 0.5 = 1400
    expect(screen.getByText("Advance Offer This Week").nextElementSibling).toHaveTextContent("1400.00 DA");
    expect(summary("Hours This Week")).toBe("15.50 h");
    expect(summary("Consumption")).toBe("300.00 DA");
    expect(tableBody().map((cells) => cells.slice(0, 6))).toEqual([
      ["Mon, 2026-03-09", "08:00:00h", "0", "0", "0", "300"],
      ["Tue, 2026-03-10", "07:30:00h", "0", "30", "0", "0"],
    ]);
  });

  // BUG-514: `{r.absent && …}` renders the number 0, so every day worked shows "0" as absent
  it("leaves the Absent column empty on days worked", async () => {
    await renderView();
    expect(tableBody().map((cells) => cells[6])).toEqual(["", ""]);
  });

  it("opens on the week given in the address", async () => {
    const { requests } = await renderView("/reporting/employee/101?tab=advance&start=2026-03-02&end=2026-03-08");
    expect(rangesRequested(requests, "/worktime")[0]).toBe("2026-03-02..2026-03-08");
    expect(screen.getByPlaceholderText("YYYY-MM-DD")).toHaveValue("2026-03-02");
    expect(summary("Hours This Week")).toBe("8.00 h");
  });

  it("loads the week picked in the calendar", async () => {
    const { user, requests } = await renderView();
    await user.click(screen.getByPlaceholderText("YYYY-MM-DD"));
    await user.click(screen.getByRole("button", { name: "16" }));
    expect(await screen.findByText("2026-03-16 → 2026-03-22")).toBeInTheDocument();
    expect(rangesRequested(requests, "/worktime")).toContain("2026-03-16..2026-03-22");
    expect(tableBody()).toEqual([["Fri, 2026-03-20", "—", "0", "0", "0", "0", "YesSick"]]);
  });

  // BUG-507: the week end is computed from a UTC-parsed date, so west of UTC the week is 6 days
  it("ends the picked week 6 days later in a time zone behind UTC", async () => {
    process.env.TZ = "America/New_York"; // restored by fixTodayInEachTest
    const { user, requests } = await renderView();
    await user.click(screen.getByPlaceholderText("YYYY-MM-DD"));
    await user.click(screen.getByRole("button", { name: "16" }));
    await waitFor(() => expect(rangesRequested(requests, "/worktime").at(-1)).toMatch(/^2026-03-16\.\./));
    expect(rangesRequested(requests, "/worktime").at(-1)).toBe("2026-03-16..2026-03-22");
  });

  it("gives the advance and can undo it", async () => {
    const { user } = await renderView();
    const posts = captureWrites("post", "/advances", () => HttpResponse.json({ _id: "adv-new" }));
    const deletes = captureWrites("delete", "/advances/:id");
    await user.click(screen.getByRole("button", { name: "Give Advance" }));
    expect(await screen.findByText("✓ Advance given for this week")).toBeInTheDocument();
    expect(posts.map((p) => p.body)).toEqual([
      { emp_id: "101", amount: 1400, date: "2026-03-09", reason: "Weekly advance (2026-03-09 to 2026-03-15)" },
    ]);
    expect(await screen.findByRole("status")).toHaveTextContent("Advance given.");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("button", { name: "Give Advance" })).toBeInTheDocument();
    expect(deletes.map((d) => d.url)).toEqual(["https://api.test/advances/adv-new"]);
  });

  it("shows when the week can't be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { user } = await renderView();
    failGet("/worktime", 500);
    await user.click(screen.getByPlaceholderText("YYYY-MM-DD"));
    await user.click(screen.getByRole("button", { name: "16" }));
    expect(
      await screen.findByText("Couldn't load this week. Something went wrong on our side. Please try again in a moment.")
    ).toBeInTheDocument();
  });

  // BUG-504: the button stays active while the advance is being saved, so a double click gives it twice
  it("gives the advance only once on a double click", async () => {
    const { user } = await renderView();
    const posts = captureWrites("post", "/advances", async () => {
      await delay(100);
      return HttpResponse.json({ _id: `adv-${Math.random()}` });
    });
    const button = screen.getByRole("button", { name: "Give Advance" });
    await user.click(button);
    await user.click(button);
    await screen.findByText("✓ Advance given for this week");
    await new Promise((r) => setTimeout(r, 150));
    expect(posts).toHaveLength(1);
  });

  // BUG-513: typing in "Week starting" loads a range per keystroke and the answers overwrite what is being typed
  it("loads the week whose start date is typed", async () => {
    const { user, requests } = await renderView();
    const field = screen.getByPlaceholderText("YYYY-MM-DD");
    await user.clear(field);
    await user.type(field, "2026-03-16");
    await new Promise((r) => setTimeout(r, 100)); // let the last answers arrive
    expect(field).toHaveValue("2026-03-16");
    expect(screen.getByText("2026-03-16 → 2026-03-22")).toBeInTheDocument();
    const ranges = rangesRequested(requests, "/worktime");
    expect(ranges.filter((r) => !/^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/.test(r))).toEqual([]);
  });
});

describe("EmployeeDetailView — monthly payroll tab", () => {
  it("shows the month's take-home pay and its breakdown", async () => {
    const { user } = await renderView();
    await user.click(screen.getByRole("button", { name: "Monthly Payroll" }));
    expect(screen.getByText(/Pay period:/)).toHaveTextContent("Pay period: 2026-03-01 → 2026-03-31");
    // 23.5 h × 200 = 4700; net 4700 − 150 − 300 − 500 + 250 = 4000
    expect(screen.getByText("Net Payout (Take-Home)").nextElementSibling).toHaveTextContent("4000.00 DA");
    expect(summary("Gross Salary")).toBe("4700.00 DA");
    expect(summary("Total Hours")).toBe("23.50 h");
    expect(summary("Penalties")).toBe("150.00 DA");
    expect(summary("Consumption")).toBe("300.00 DA");
    expect(summary("Advances Deducted")).toBe("500.00 DA");
    expect(summary("Bonuses")).toBe("250.00 DA");
    expect(summary("Absences")).toBe("1");
    expect(summary("Late Minutes")).toBe("5 min");
  });

  it("lists the advances deducted and every day", async () => {
    const { user } = await renderView();
    await user.click(screen.getByRole("button", { name: "Monthly Payroll" }));
    const list = screen.getByRole("heading", { name: "Advances Deducted This Month" }).nextElementSibling as HTMLElement;
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["2026-03-03500.00 DA"]);
    const days = tableBody();
    expect(days).toHaveLength(4);
    expect(days[3]).toEqual(["Fri, 2026-03-20", "—", "0", "0", "0", "0", "YesSick"]);
  });

  it("opens on the month given in the address", async () => {
    await renderView("/reporting/employee/101?tab=payroll&start=2026-02-01&end=2026-02-28&from=monthly-payroll");
    expect(screen.getByText(/Pay period:/)).toHaveTextContent("2026-02-01 → 2026-02-28");
    expect(screen.getByText("Net Payout (Take-Home)").nextElementSibling).toHaveTextContent("0.00 DA");
    expect(screen.queryByRole("heading", { name: "Advances Deducted This Month" })).not.toBeInTheDocument();
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("shows when the month can't be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockReportingApi(DATA);
    failGet("/worktime", 500);
    renderWithProviders(<EmployeeDetailView empId="101" />, { url: "/reporting/employee/101?tab=payroll" });
    expect(
      await screen.findByText("Couldn't load this month. Something went wrong on our side. Please try again in a moment.")
    ).toBeInTheDocument();
  });
});
