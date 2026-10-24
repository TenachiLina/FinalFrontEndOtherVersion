import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";
import AdvancesView from "./AdvancesView";
import {
  AMINE,
  SARA,
  captureWrites,
  failGet,
  mockReportingApi,
  rawAdvance,
  rawEmployee,
  tableBody,
  clearFeedbackAfterEachTest,
  fixTodayInEachTest,
  type ReportingData,
} from "./__testutils__/reportingApi";

fixTodayInEachTest(); // 2026-03-11 → March
clearFeedbackAfterEachTest();

const realLocation = window.location;
afterEach(() => {
  Object.defineProperty(window, "location", { value: realLocation, configurable: true });
});

const DATA: ReportingData = {
  employees: [rawEmployee(AMINE), rawEmployee(SARA)],
  advances: [
    rawAdvance({ _id: "a1", emp_id: 101, amount: 1000, date: "2026-03-10", reason: "Weekly advance" }),
    rawAdvance({ _id: "a2", emp_id: 102, amount: 250.5, date: "2026-02-03", reason: "Rent" }),
    rawAdvance({ _id: "a3", emp_id: 999, amount: 40, date: "2026-03-01", reason: "" }),
    rawAdvance({ _id: "a4", emp_id: 101, amount: 300, date: "2026-03-31T22:00:00.000Z", reason: "Emergency" }),
  ],
};

async function renderView(data: ReportingData = DATA) {
  mockReportingApi(data);
  const view = renderWithProviders(<AdvancesView />, { url: "/reporting/advances" });
  await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
  return view;
}

const total = () => screen.getByText("Total Advanced").nextElementSibling!.textContent;

describe("AdvancesView", () => {
  it("lists this month's advances with their total", async () => {
    await renderView();
    expect(tableBody()).toEqual([
      ["Amine Kaci", "1000.00 DA", "2026-03-10", "Weekly advance", "Revoke"],
      ["#999", "40.00 DA", "2026-03-01", "—", "Revoke"],
      ["Amine Kaci", "300.00 DA", "2026-03-31", "Emergency", "Revoke"],
    ]);
    expect(total()).toBe("1340.00 DA");
  });

  it("links known employees to their report", async () => {
    await renderView();
    expect(screen.getAllByRole("link", { name: "Amine Kaci" })[0]).toHaveAttribute("href", "/reporting/employee/101");
    expect(screen.queryByRole("link", { name: "#999" })).not.toBeInTheDocument();
  });

  it("shows another period from the range picker", async () => {
    const { user } = await renderView();
    await user.click(screen.getByRole("button", { name: "This Year" }));
    expect(tableBody()).toHaveLength(4);
    expect(total()).toBe("1590.50 DA");
  });

  it("filters by employee name", async () => {
    const { user } = await renderView();
    await user.click(screen.getByRole("button", { name: "This Year" }));
    await user.type(screen.getByPlaceholderText("Search…"), "sara");
    expect(tableBody()).toEqual([["Sara Bel", "250.50 DA", "2026-02-03", "Rent", "Revoke"]]);
    expect(total()).toBe("250.50 DA");
  });

  it("says when there is nothing in the range", async () => {
    await renderView({ ...DATA, advances: [] });
    expect(screen.getByText("No advances in this range")).toBeInTheDocument();
    expect(total()).toBe("0.00 DA");
  });

  it("revokes an advance", async () => {
    const { user } = await renderView();
    const deletes = captureWrites("delete", "/advances/:id");
    await user.click(within(screen.getByRole("row", { name: /1000\.00 DA/ })).getByRole("button", { name: "Revoke" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Advance removed.");
    expect(deletes.map((d) => d.url)).toEqual(["https://api.test/advances/a1"]);
    expect(tableBody()).toHaveLength(2);
    expect(total()).toBe("340.00 DA");
  });

  // BUG-508: revoking an advance is a single click, with no confirmation
  it.fails("asks for confirmation before revoking", async () => {
    const { user } = await renderView();
    const deletes = captureWrites("delete", "/advances/:id");
    await user.click(screen.getAllByRole("button", { name: "Revoke" })[0]);
    expect(deletes).toEqual([]);
    expect(await screen.findByRole("alertdialog", {}, { timeout: 300 })).toBeInTheDocument();
  });

  it("shows the error and reloads the page on 'Try again'", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...realLocation, reload }, configurable: true });
    mockReportingApi(DATA);
    failGet("/advances", 500);
    const { user } = renderWithProviders(<AdvancesView />, { url: "/reporting/advances" });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load the advances");
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalled();
  });
});
