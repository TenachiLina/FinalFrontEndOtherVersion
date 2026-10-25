import { describe, expect, it, vi } from "vitest";
import React from "react";
import { HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";
import WeeklyAdvancesView from "./WeeklyAdvancesView";
import {
  AMINE,
  NADIA,
  SARA,
  captureWrites,
  failGet,
  mockReportingApi,
  plan,
  rangesRequested,
  rawAdvance,
  rawEmployee,
  rawRow,
  tableBody,
  clearFeedbackAfterEachTest,
  fixTodayInEachTest,
  type ReportingData,
} from "./__testutils__/reportingApi";

fixTodayInEachTest(); // 2026-03-11 → week 03-09..03-15
clearFeedbackAfterEachTest();

// Amine 200 DA/h, Sara 100 DA/h, Nadia 125 DA/h
const WEEK: ReportingData = {
  employees: [rawEmployee(AMINE), rawEmployee(SARA), rawEmployee(NADIA)],
  planning: [plan(101, "2026-03-09"), plan(102, "2026-03-10"), plan(103, "2026-03-02")],
  worktime: [
    rawRow({ emp_id: 101, work_date: "2026-03-09", work_hours: "08:00:00", consommation: 300 }),
    rawRow({ emp_id: 101, work_date: "2026-03-10", work_hours: "07:30:00" }),
    rawRow({ emp_id: 101, work_date: "2026-03-11", work_hours: 0, absent: true }),
    rawRow({ emp_id: 102, work_date: "2026-03-09", work_hours: "06:00", consommation: 100 }),
    rawRow({ emp_id: 103, work_date: "2026-03-03", work_hours: "05:00" }),
  ],
  advances: [rawAdvance({ _id: "adv-102", emp_id: 102, amount: 250, date: "2026-03-10" })],
};

async function renderView(data: ReportingData = WEEK, url = "/reporting/weekly-advances") {
  const requests = mockReportingApi(data);
  const view = renderWithProviders(<WeeklyAdvancesView />, { url });
  await screen.findByText("Amine Kaci");
  return { ...view, requests };
}

const rowOf = (name: string) => screen.getByRole("row", { name: new RegExp(name) });

describe("WeeklyAdvancesView", () => {
  it("lists each scheduled employee's week, offer and status, with totals", async () => {
    await renderView();
    expect(screen.getByRole("heading", { name: "Weekly Advances" })).toBeInTheDocument();
    expect(tableBody()).toEqual([
      ["Amine Kaci", "200.00 DA/h", "15.5 h", "1", "3100.00 DA", "300 DA", "1400.00 DA", "Not given", "Give Advance", "Details"],
      ["Sara Bel", "100.00 DA/h", "6 h", "—", "600.00 DA", "100 DA", "250.00 DA", "Given", "Undo", "Details"],
      ["Total", "—", "21.5 h", "1", "3700.00 DA", "400.00 DA", "1650.00 DA", "1 / 2 given", "", ""],
    ]);
  });

  it("links each employee to their details on the same week", async () => {
    await renderView();
    expect(within(rowOf("Amine Kaci")).getByRole("link", { name: "Details" })).toHaveAttribute(
      "href",
      "/reporting/employee/101?tab=advance&start=2026-03-09&end=2026-03-15&from=weekly-advances"
    );
  });

  it("filters by name", async () => {
    const { user } = await renderView();
    await user.type(screen.getByPlaceholderText("Search employee…"), "sara");
    expect(screen.queryByText("Amine Kaci")).not.toBeInTheDocument();
    expect(tableBody().at(-1)).toContain("1 / 1 given");
  });

  it("says when nobody is found", async () => {
    mockReportingApi({ ...WEEK, planning: [], worktime: [] });
    renderWithProviders(<WeeklyAdvancesView />, { url: "/reporting/weekly-advances" });
    expect(await screen.findByText("No employees found")).toBeInTheDocument();
  });

  it("reopens the week given in the address", async () => {
    const requests = mockReportingApi(WEEK);
    renderWithProviders(<WeeklyAdvancesView />, { url: "/reporting/weekly-advances?start=2026-03-02&end=2026-03-08" });
    expect(await screen.findByText("Nadia Ouali")).toBeInTheDocument();
    expect(rangesRequested(requests, "/worktime")).toEqual(["2026-03-02..2026-03-08"]);
  });

  it("loads the week picked in the range picker", async () => {
    const { user, requests } = await renderView();
    const field = screen.getByPlaceholderText("YYYY-MM-DD");
    await user.clear(field);
    await user.type(field, "2026-03-02");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("Nadia Ouali")).toBeInTheDocument();
    expect(rangesRequested(requests, "/worktime").at(-1)).toBe("2026-03-02..2026-03-08");
  });

  it("gives an advance through the form", async () => {
    const { user } = await renderView();
    const posts = captureWrites("post", "/advances", () => HttpResponse.json({ _id: "adv-new" }));
    await user.click(within(rowOf("Amine Kaci")).getByRole("button", { name: "Give Advance" }));
    expect(screen.getByText(/Amine Kaci — suggested advance:/)).toHaveTextContent("1400.00 DA");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Give Advance" })).not.toBeInTheDocument());
    expect(posts.map((p) => p.body)).toEqual([
      { emp_id: 101, amount: 1400, date: "2026-03-11", reason: "Weekly advance (2026-03-09 to 2026-03-15)" },
    ]);
    expect(within(rowOf("Amine Kaci")).getByText("Given")).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("Advance given.");
  });

  it("keeps the form open with the reason when the advance is refused", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { user } = await renderView();
    captureWrites("post", "/advances", () => HttpResponse.json({ message: "An advance already exists" }, { status: 409 }));
    await user.click(within(rowOf("Amine Kaci")).getByRole("button", { name: "Give Advance" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("Couldn't save the advance. An advance already exists")).toBeInTheDocument();
    expect(within(rowOf("Amine Kaci")).getByText("Not given")).toBeInTheDocument();
  });

  it("closes the form on Cancel without giving anything", async () => {
    const { user } = await renderView();
    const posts = captureWrites("post", "/advances");
    await user.click(within(rowOf("Amine Kaci")).getByRole("button", { name: "Give Advance" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Give Advance" })).not.toBeInTheDocument();
    expect(posts).toEqual([]);
  });

  it("undoes a given advance", async () => {
    const { user } = await renderView();
    const deletes = captureWrites("delete", "/advances/:id");
    await user.click(within(rowOf("Sara Bel")).getByRole("button", { name: "Undo" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(deletes.map((d) => d.url)).toEqual(["https://api.test/advances/adv-102"]));
    expect(within(rowOf("Sara Bel")).getByText("Not given")).toBeInTheDocument();
  });

  // BUG-508: deleting an advance (money already handed over) is a single click, with no confirmation
  it("asks for confirmation before undoing an advance", async () => {
    const { user } = await renderView();
    const deletes = captureWrites("delete", "/advances/:id");
    await user.click(within(rowOf("Sara Bel")).getByRole("button", { name: "Undo" }));
    expect(deletes).toEqual([]);
    expect(await screen.findByRole("alertdialog", {}, { timeout: 300 })).toBeInTheDocument();
  });

  it("shows the error and loads again on 'Try again'", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockReportingApi(WEEK);
    failGet("/employees", 500);
    const { user } = renderWithProviders(<WeeklyAdvancesView />, { url: "/reporting/weekly-advances" });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load the weekly advances");
    expect(alert).toHaveTextContent("Something went wrong on our side. Please try again in a moment.");
    mockReportingApi(WEEK);
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Amine Kaci")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // BUG-509: the totals row adds rounded hours as floats and shows the binary noise
  it("shows the total hours rounded", async () => {
    await renderView({
      ...WEEK,
      worktime: [
        rawRow({ emp_id: 101, work_date: "2026-03-09", work_hours: "00:06:00" }),
        rawRow({ emp_id: 102, work_date: "2026-03-09", work_hours: "00:12:00" }),
      ],
    });
    expect(tableBody().at(-1)![2]).toBe("0.3 h");
  });
});
