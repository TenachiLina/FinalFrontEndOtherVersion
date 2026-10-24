import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";
import OverviewView from "./OverviewView";
import {
  AMINE,
  SARA,
  failGet,
  mockReportingApi,
  rangesRequested,
  rawAdvance,
  rawBonus,
  rawEmployee,
  rawRow,
  clearFeedbackAfterEachTest,
  fixTodayInEachTest,
  type ReportingData,
} from "./__testutils__/reportingApi";

// Same stub as the global one in src/test/setup.ts, but it also keeps the options
// each chart received, so the tooltip / axis formatters can be checked.
type Formatter = (v: number) => string;
interface ChartOptions {
  tooltip: { y: { formatter: Formatter } };
  yaxis: { labels: { formatter: Formatter } };
  xaxis: { categories: string[] };
}
const charts = vi.hoisted(() => [] as { type?: string; options: ChartOptions }[]);
vi.mock("react-apexcharts", async () => {
  const React = await import("react");
  return {
    default: (props: { type?: string; series?: unknown; options: ChartOptions }) => {
      charts.push({ type: props.type, options: props.options });
      return React.createElement("div", { "data-testid": "chart", "data-type": props.type, "data-series": JSON.stringify(props.series) });
    },
  };
});
const optionsOf = (type: string) => charts.filter((c) => c.type === type).at(-1)!.options;

fixTodayInEachTest(); // Wednesday 2026-03-11 → this week 03-09..03-15, previous 03-02..03-08
clearFeedbackAfterEachTest();

// Amine 200 DA/h, Sara 100 DA/h
const WEEK: ReportingData = {
  employees: [rawEmployee(AMINE), rawEmployee(SARA)],
  worktime: [
    rawRow({ emp_id: 101, work_date: "2026-03-09", work_hours: "08:00:00", late_minutes: 10, penalty: 200, consommation: 300 }),
    rawRow({ emp_id: 101, work_date: "2026-03-10", work_hours: "07:30:00", overtime_minutes: 30 }),
    rawRow({ emp_id: 102, work_date: "2026-03-09", work_hours: "06:00", consommation: 100 }),
    rawRow({ emp_id: 102, work_date: "2026-03-10", work_hours: 0, absent: true }),
    rawRow({ emp_id: 101, work_date: "2026-03-02", work_hours: "08:00:00", consommation: 500 }),
  ],
  advances: [rawAdvance({ emp_id: 101, amount: 1000, date: "2026-03-10" })],
  bonuses: [rawBonus({ emp_id: 102, amount: 500, date: "2026-03-11" })],
};

async function renderView(data: ReportingData = WEEK) {
  const requests = mockReportingApi(data);
  const view = renderWithProviders(<OverviewView />, { url: "/reporting/overview" });
  await waitFor(() => expect(screen.queryByText("Loading overview…")).not.toBeInTheDocument());
  return { ...view, requests };
}

/** The stat card with this label: its value, sub-line and comparison badge. */
function card(label: string) {
  const labelEl = screen.getByText(label, { selector: "div" });
  const box = labelEl.parentElement!;
  return { value: labelEl.nextElementSibling!.textContent, text: box.textContent, badge: box.lastElementChild as HTMLElement };
}

const chart = (type: string) =>
  JSON.parse(screen.getAllByTestId("chart").find((c) => c.dataset.type === type)!.dataset.series!);

describe("OverviewView", () => {
  it("compares with the previous period of the same length", async () => {
    await renderView();
    expect(screen.getByRole("heading", { name: "Reporting Overview" })).toBeInTheDocument();
    expect(screen.getByText(/compared with the previous one \(2026-03-02 → 2026-03-08\)/)).toBeInTheDocument();
  });

  it("shows the payroll figures", async () => {
    await renderView();
    // gross 15.5 × 200 + 6 × 100 = 3700; net 3700 + 500 − 1000 − 400 − 200 = 2600
    expect(card("Hours Worked").value).toBe("21.5 h");
    expect(card("Gross Payroll").value).toBe("3,700.00 DA");
    expect(card("Net Payroll").value).toBe("2,600.00 DA");
    expect(card("Advances Given").value).toBe("1,000.00 DA");
    expect(card("Advances Given").text).toContain("1 advance");
    expect(card("Bonuses Given").value).toBe("500.00 DA");
    expect(card("Bonuses Given").text).toContain("1 bonus");
    expect(card("Consumption").value).toBe("400.00 DA");
    expect(card("Penalties").value).toBe("200.00 DA");
  });

  it("shows attendance and workforce figures", async () => {
    await renderView();
    expect(card("Late Rate").value).toBe("25%");
    expect(card("Late Rate").text).toContain("1 late events");
    expect(card("Absence Rate").value).toBe("25%");
    expect(card("Total Late Minutes").value).toBe("10 min");
    expect(card("Overtime").value).toBe("0.5 h");
    expect(card("Active Employees").value).toBe("2");
    expect(card("Avg Hours / Employee").value).toBe("10.8 h");
  });

  it("shows how each figure changed, green when it is good news", async () => {
    await renderView();
    // previous week: 8 h, gross 1600, consumption 500, net 1100
    expect(card("Hours Worked").badge).toHaveTextContent("▲ 168.8% vs previous");
    expect(card("Gross Payroll").badge).toHaveTextContent("▲ 131.3% vs previous");
    expect(card("Net Payroll").badge).toHaveTextContent("▲ 136.4% vs previous");
    expect(card("Consumption").badge).toHaveTextContent("▼ 20.0% vs previous");
    expect(card("Consumption").badge.firstElementChild).toHaveClass("text-green-600");
    expect(card("Penalties").badge).toHaveTextContent("no previous data");
  });

  it("says when nothing changed", async () => {
    await renderView({
      employees: [rawEmployee(AMINE)],
      worktime: [rawRow({ work_date: "2026-03-09" }), rawRow({ work_date: "2026-03-02" })],
    });
    expect(card("Hours Worked").badge).toHaveTextContent("no change vs previous");
  });

  it("draws where the payroll goes and the daily trends", async () => {
    await renderView();
    expect(chart("donut")).toEqual([2600, 1000, 400, 200]);
    expect(screen.getByRole("heading", { name: "Hours worked (Daily)" })).toBeInTheDocument();
    expect(chart("area")).toEqual([{ name: "Hours", data: [14, 7.5, 0, 0, 0, 0, 0] }]);
    expect(chart("bar")).toEqual([
      { name: "Consumption", data: [400, 0, 0, 0, 0, 0, 0] },
      { name: "Penalties", data: [200, 0, 0, 0, 0, 0, 0] },
    ]);
    expect(chart("line")).toEqual([
      { name: "Late events", data: [1, 0, 0, 0, 0, 0, 0] },
      { name: "Absences", data: [0, 1, 0, 0, 0, 0, 0] },
    ]);
  });

  it("has no breakdown for a period without pay", async () => {
    await renderView({ employees: [rawEmployee(AMINE)] });
    expect(screen.getByText("No data for this period")).toBeInTheDocument();
    expect(screen.queryAllByTestId("chart").map((c) => c.dataset.type)).toEqual(["area", "bar", "line"]);
  });

  it("loads the month with weekly trends from the 'This Month' preset", async () => {
    const { user, requests } = await renderView();
    await user.click(screen.getByRole("button", { name: "This Month" }));
    expect(await screen.findByRole("heading", { name: "Hours worked (Weekly)" })).toBeInTheDocument();
    expect(rangesRequested(requests, "/worktime").slice(-2)).toEqual(["2026-03-01..2026-03-31", "2026-01-29..2026-02-28"]);
    expect(screen.getByText(/compared with the previous one \(2026-01-29 → 2026-02-28\)/)).toBeInTheDocument();
  });

  it("shows the error and loads again on 'Try again'", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockReportingApi(WEEK);
    failGet("/employees", 500);
    const { user } = renderWithProviders(<OverviewView />, { url: "/reporting/overview" });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load the overview");
    expect(alert).toHaveTextContent("Failed to load the overview.");
    mockReportingApi(WEEK);
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(card("Gross Payroll").value).toBe("3,700.00 DA"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("formats amounts, hours and counts in the chart tooltips and axes", async () => {
    await renderView();
    expect(optionsOf("donut").tooltip.y.formatter(1234.5)).toBe("1,234.50 DA");
    expect(optionsOf("area").tooltip.y.formatter(7.5)).toBe("7.5 h");
    expect(optionsOf("bar").tooltip.y.formatter(400)).toBe("400.00 DA");
    expect(optionsOf("line").yaxis.labels.formatter(2.6)).toBe("3");
    expect(optionsOf("area").xaxis.categories).toEqual([
      "Mon 9 Mar", "Tue 10 Mar", "Wed 11 Mar", "Thu 12 Mar", "Fri 13 Mar", "Sat 14 Mar", "Sun 15 Mar",
    ]);
  });

  // BUG-512: the % change divides by a negative previous value, so a rise is shown as a fall
  it.fails("shows a rise in net payroll as a rise when the previous net was negative", async () => {
    await renderView({
      ...WEEK,
      // previous week: gross 1600 − 500 consumption − 1500 advance = −400
      advances: [...WEEK.advances!, rawAdvance({ emp_id: 101, amount: 1500, date: "2026-03-03" })],
    });
    expect(card("Net Payroll").value).toBe("2,600.00 DA");
    expect(card("Net Payroll").badge).toHaveTextContent("▲");
  });
});
