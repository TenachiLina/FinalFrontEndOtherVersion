import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";
import AttendanceView from "./AttendanceView";
import {
  AMINE,
  SARA,
  failGet,
  mockReportingApi,
  rangesRequested,
  rawEmployee,
  rawRow,
  slowWorktimeFor,
  tableBody,
  fixTodayInEachTest,
  type ReportingData,
} from "./__testutils__/reportingApi";

fixTodayInEachTest(); // Wednesday 2026-03-11 → this week 03-09..03-15

const DATA: ReportingData = {
  employees: [rawEmployee(AMINE), rawEmployee(SARA)],
  worktime: [
    rawRow({ emp_id: 101, work_date: "2026-03-05", late_minutes: 40 }), // previous Thu-Wed week only
    rawRow({ emp_id: 101, work_date: "2026-03-09", late_minutes: 15 }),
    rawRow({ emp_id: 102, work_date: "2026-03-10", work_hours: 0, absent: true, absent_comment: "Sick" }),
    rawRow({ emp_id: 101, work_date: "2026-03-11" }),
  ],
};

/**
 * Opening the page loads two ranges at once (see BUG-515). Here the week shown by the
 * picker (this week) is made to answer last, so these tests see the page's intended state.
 */
async function renderView(data: ReportingData = DATA) {
  const requests = mockReportingApi(data);
  slowWorktimeFor("2026-03-09", 40, data, requests);
  const view = renderWithProviders(<AttendanceView />, { url: "/reporting/attendance" });
  await waitFor(() => expect(rangesRequested(requests, "/worktime")).toHaveLength(1)); // one load on open (BUG-515)
  await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
  return { ...view, requests };
}

const stat = (label: string) => screen.getByText(label).nextElementSibling!.textContent;

describe("AttendanceView", () => {
  it("shows this week's lateness and absences", async () => {
    await renderView();
    expect(screen.getByRole("heading", { name: "Attendance" })).toBeInTheDocument();
    expect(stat("Late Events")).toBe("1");
    expect(stat("Total Late Minutes")).toBe("15 min");
    expect(stat("Absences")).toBe("1");
    expect(tableBody()).toEqual([
      ["Amine Kaci", "2026-03-09", "15", "—", "—"],
      ["Sara Bel", "2026-03-10", "—", "Yes", "Sick"],
    ]);
  });

  it("shows every day when 'Only show issues' is unticked", async () => {
    const { user } = await renderView();
    await user.click(screen.getByRole("checkbox", { name: "Only show issues" }));
    expect(tableBody()).toHaveLength(3);
  });

  it("loads the range picked", async () => {
    const { user, requests } = await renderView();
    await user.click(screen.getByRole("button", { name: "This Month" }));
    await waitFor(() => expect(rangesRequested(requests, "/worktime").at(-1)).toBe("2026-03-01..2026-03-31"));
    await waitFor(() => expect(stat("Total Late Minutes")).toBe("55 min"));
  });

  it("says when there are no issues", async () => {
    await renderView({ ...DATA, worktime: [rawRow({ emp_id: 101, work_date: "2026-03-09" })] });
    expect(screen.getByText(/No attendance issues in this range/)).toBeInTheDocument();
  });

  it("shows the error and loads again on 'Try again'", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockReportingApi(DATA);
    failGet("/worktime", 500);
    const { user } = renderWithProviders(<AttendanceView />, { url: "/reporting/attendance" });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load the attendance");
    expect(alert).toHaveTextContent("Something went wrong on our side. Please try again in a moment.");
    mockReportingApi(DATA);
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Sara Bel")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // BUG-515: on open, the hook loads last Thursday-Wednesday while the page loads this week; the slower answer wins
  it("shows the week displayed in the picker even when the other request answers last", async () => {
    const requests = mockReportingApi(DATA);
    slowWorktimeFor("2026-03-05", 150, DATA);
    renderWithProviders(<AttendanceView />, { url: "/reporting/attendance" });
    await waitFor(() => expect(rangesRequested(requests, "/worktime").length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 250));
    expect(stat("Total Late Minutes")).toBe("15 min");
  });
});
