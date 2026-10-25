import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { HttpResponse } from "msw";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";
import BonusesGiveView from "./BonusesGiveView";
import BonusesHistoryView from "./BonusesHistoryView";
import {
  AMINE,
  NADIA,
  SARA,
  captureWrites,
  failGet,
  mockReportingApi,
  rangesRequested,
  rawBonus,
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
  employees: [rawEmployee(AMINE), rawEmployee(SARA), rawEmployee(NADIA)],
  bonuses: [
    rawBonus({ _id: "b1", emp_id: 101, amount: 250, date: "2026-03-05", reason: "Perfect attendance" }),
    rawBonus({ _id: "b2", emp_id: 101, amount: 100.5, date: "2026-03-20", reason: "Extra shift" }),
    rawBonus({ _id: "b3", emp_id: 102, amount: 500, date: "2026-03-12", reason: "" }),
    rawBonus({ _id: "feb", emp_id: 102, amount: 1000, date: "2026-02-14", reason: "Valentine rush" }),
  ],
};

const rowOf = (name: string | RegExp) => screen.getByRole("row", { name: typeof name === "string" ? new RegExp(name) : name });

describe("BonusesGiveView", () => {
  async function renderView(data: ReportingData = DATA) {
    const requests = mockReportingApi(data);
    const view = renderWithProviders(<BonusesGiveView />, { url: "/reporting/bonuses/give" });
    await screen.findByText("Amine Kaci");
    return { ...view, requests };
  }

  it("shows this month's bonuses per employee, with totals", async () => {
    const { requests } = await renderView();
    expect(rangesRequested(requests, "/bonuses")).toEqual(["2026-03-01..2026-03-31"]);
    expect(screen.getByText(/This month:/)).toHaveTextContent("This month: 2026-03-01 → 2026-03-31");
    expect(tableBody()).toEqual([
      ["Amine Kaci", "2", "350.50 DA", "Give Bonus"],
      ["Sara Bel", "1", "500.00 DA", "Give Bonus"],
      ["Nadia Ouali", "—", "—", "Give Bonus"],
      ["Total", "3", "850.50 DA", ""],
    ]);
    expect(screen.getByText("Total Bonuses (this month)").nextElementSibling).toHaveTextContent("850.50 DA");
  });

  it("filters employees by name", async () => {
    const { user } = await renderView();
    await user.type(screen.getByPlaceholderText("Search employee…"), "nadia");
    expect(tableBody().map((r) => r[0])).toEqual(["Nadia Ouali", "Total"]);
  });

  it("says when no employee matches", async () => {
    const { user } = await renderView();
    await user.type(screen.getByPlaceholderText("Search employee…"), "zzz");
    expect(screen.getByText("No employees found")).toBeInTheDocument();
  });

  it("gives a bonus through the form and counts it", async () => {
    const { user } = await renderView();
    const posts = captureWrites("post", "/bonuses", (body) => HttpResponse.json({ _id: "new", ...(body as object) }));
    await user.click(within(rowOf("Nadia Ouali")).getByRole("button", { name: "Give Bonus" }));
    expect(screen.getByRole("heading", { name: "Give Bonus" })).toBeInTheDocument();
    await user.type(screen.getByRole("spinbutton"), "300");
    await user.type(screen.getByPlaceholderText("e.g. Perfect attendance, great performance…"), "Great week");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Bonus given.");
    expect(posts.map((p) => p.body)).toEqual([{ emp_id: 103, amount: 300, date: "2026-03-11", reason: "Great week" }]);
    expect(screen.queryByRole("heading", { name: "Give Bonus" })).not.toBeInTheDocument();
    expect(tableBody()[2]).toEqual(["Nadia Ouali", "1", "300.00 DA", "Give Bonus"]);
  });

  it("keeps the form open with the reason when the bonus is refused", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { user } = await renderView();
    captureWrites("post", "/bonuses", () => HttpResponse.json({ message: "Bonuses are closed" }, { status: 400 }));
    await user.click(within(rowOf("Sara Bel")).getByRole("button", { name: "Give Bonus" }));
    await user.type(screen.getByRole("spinbutton"), "300");
    await user.type(screen.getByPlaceholderText("e.g. Perfect attendance, great performance…"), "x");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("Couldn't save the bonus. Bonuses are closed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Give Bonus" })).not.toBeInTheDocument();
  });

  it("shows the error and reloads the page on 'Try again'", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...realLocation, reload }, configurable: true });
    mockReportingApi(DATA);
    failGet("/bonuses", 500);
    const { user } = renderWithProviders(<BonusesGiveView />, { url: "/reporting/bonuses/give" });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load the bonuses");
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalled();
  });

  // BUG-511: the totals row counts the listed employees but adds up everyone's bonuses
  it("totals only the employees listed", async () => {
    const { user } = await renderView();
    await user.type(screen.getByPlaceholderText("Search employee…"), "amine");
    expect(tableBody().at(-1)).toEqual(["Total", "2", "350.50 DA", ""]);
  });
});

describe("BonusesHistoryView", () => {
  async function renderView(data: ReportingData = DATA) {
    const requests = mockReportingApi(data);
    const view = renderWithProviders(<BonusesHistoryView />, { url: "/reporting/bonuses/history" });
    await screen.findByText("Perfect attendance");
    return { ...view, requests };
  }

  it("lists the month's bonuses, newest first, with the total", async () => {
    await renderView();
    expect(screen.getByRole("heading", { name: "Bonus History" })).toBeInTheDocument();
    expect(tableBody()).toEqual([
      ["Amine Kaci", "100.50 DA", "2026-03-20", "Extra shift", "Revoke"],
      ["Sara Bel", "500.00 DA", "2026-03-12", "—", "Revoke"],
      ["Amine Kaci", "250.00 DA", "2026-03-05", "Perfect attendance", "Revoke"],
      ["Total (3)", "850.50 DA", "", "", ""],
    ]);
    expect(screen.getByText("Total Bonuses").nextElementSibling).toHaveTextContent("850.50 DA");
  });

  it("filters by employee name", async () => {
    const { user } = await renderView();
    await user.type(screen.getByPlaceholderText("Search employee…"), "sara");
    expect(tableBody()).toEqual([
      ["Sara Bel", "500.00 DA", "2026-03-12", "—", "Revoke"],
      ["Total (1)", "500.00 DA", "", "", ""],
    ]);
  });

  it("loads the range picked", async () => {
    const { user, requests } = await renderView();
    await user.click(screen.getByRole("button", { name: "This Year" }));
    expect(await screen.findByText("Valentine rush")).toBeInTheDocument();
    expect(rangesRequested(requests, "/bonuses").at(-1)).toBe("2026-01-01..2026-12-31");
    expect(tableBody().at(-1)).toEqual(["Total (4)", "1850.50 DA", "", "", ""]);
  });

  it("says when there is nothing in the range", async () => {
    mockReportingApi({ ...DATA, bonuses: [] });
    renderWithProviders(<BonusesHistoryView />, { url: "/reporting/bonuses/history" });
    expect(await screen.findByText("No bonuses in this range")).toBeInTheDocument();
  });

  it("revokes a bonus", async () => {
    const { user } = await renderView();
    const deletes = captureWrites("delete", "/bonuses/:id");
    await user.click(within(rowOf(/Extra shift/)).getByRole("button", { name: "Revoke" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Revoke" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Bonus removed.");
    expect(deletes.map((d) => d.url)).toEqual(["https://api.test/bonuses/b2"]);
    expect(tableBody().at(-1)).toEqual(["Total (2)", "750.00 DA", "", "", ""]);
  });

  // BUG-508: revoking a bonus is a single click, with no confirmation
  it("asks for confirmation before revoking", async () => {
    const { user } = await renderView();
    const deletes = captureWrites("delete", "/bonuses/:id");
    await user.click(within(rowOf(/Extra shift/)).getByRole("button", { name: "Revoke" }));
    expect(deletes).toEqual([]);
    expect(await screen.findByRole("alertdialog", {}, { timeout: 300 })).toBeInTheDocument();
  });

  it("shows the error and loads again on 'Try again'", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockReportingApi(DATA);
    failGet("/bonuses", 500);
    const { user } = renderWithProviders(<BonusesHistoryView />, { url: "/reporting/bonuses/history" });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load the bonus history");
    mockReportingApi(DATA);
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Perfect attendance")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
