import { describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import TodayDashboard, { REFRESH_MS } from "./TodayDashboard";
import HomeView from "./HomeView";
import { API, server } from "@/test/server";
import { makeCompany, makeUser } from "@/test/factories";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";
import type { Dashboard, PersonToday } from "@/lib/dashboard";
import { setLang } from "@/lib/i18n";

const person = (overrides: Partial<PersonToday>): PersonToday => ({
  empNumber: 1,
  name: "Amine Test",
  status: "present",
  shift: "08:00 – 16:00",
  clockIn: "08:00",
  clockOut: null,
  late: false,
  lateMinutes: 0,
  ...overrides,
});

const BUSY: Dashboard = {
  day: "2026-11-14",
  time: "10:42",
  attendance: {
    employees: 12,
    counts: { planned: 5, present: 2, left: 1, late: 1, absent: 1, missing: 1, expected: 1 },
    people: [
      person({ empNumber: 2, name: "Sara Test", status: "missing", clockIn: null }),
      person({ empNumber: 5, name: "Nadia Test", status: "absent", clockIn: null, shift: null }),
      person({ empNumber: 1, name: "Amine Test", clockIn: "08:20", late: true, lateMinutes: 20 }),
      person({ empNumber: 6, name: "Extra Test", shift: null, clockIn: "09:00" }),
      person({ empNumber: 3, name: "Karim Test", status: "expected", clockIn: null, shift: "14:00 – 22:00" }),
      person({ empNumber: 4, name: "Lina Test", status: "left", clockIn: "06:00", clockOut: "10:00" }),
    ],
  },
  pending: { corrections: 2 },
  month: {
    month: "2026-11",
    currency: "DA",
    hours: 412.5,
    gross: 103125,
    advances: 20000,
    bonuses: 1500,
    net: 82300,
    employees: 11,
    closesAt: null,
  },
  subscription: { status: "active", endingSoon: false, readOnly: false, daysLeft: 200 },
};

/** Answers /dashboard with each board in turn (the last repeats); counts the calls. */
function mockDashboard(...boards: Dashboard[]) {
  let call = 0;
  server.use(http.get(`${API}/dashboard`, () => HttpResponse.json(boards[Math.min(call++, boards.length - 1)])));
  return () => call;
}

const tile = (label: string) => screen.getByText(label, { selector: "dt" }).parentElement!;

describe("TodayDashboard", () => {
  it("counts where everyone stands today", async () => {
    mockDashboard(BUSY);
    renderWithProviders(<TodayDashboard />);
    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(tile("Present")).toHaveTextContent("2");
    expect(tile("Present")).toHaveTextContent("of 5 planned");
    expect(tile("Late arrivals")).toHaveTextContent("1");
    expect(tile("Not clocked in")).toHaveTextContent("1");
    expect(tile("Absent")).toHaveTextContent("1");
    expect(tile("Expected later")).toHaveTextContent("1");
    expect(tile("Left")).toHaveTextContent("1");
    expect(screen.getByText("Updated at 10:42")).toBeInTheDocument();
  });

  it("lists each person with their shift, clock times and status, attention first", async () => {
    mockDashboard(BUSY);
    renderWithProviders(<TodayDashboard />);
    await screen.findByText("Who is where");
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((r) => within(r).getAllByText(/Test$/)[0].textContent)).toEqual([
      "Sara Test",
      "Nadia Test",
      "Amine Test",
      "Extra Test",
      "Karim Test",
      "Lina Test",
    ]);
    expect(rows[0]).toHaveTextContent("08:00 – 16:00");
    expect(rows[0]).toHaveTextContent("Not clocked in");
    expect(rows[1]).toHaveTextContent("Not planned");
    expect(rows[1]).toHaveTextContent("Absent");
    expect(rows[2]).toHaveTextContent("08:20");
    expect(rows[2]).toHaveTextContent("20 min late");
    expect(rows[2]).toHaveTextContent("Present");
    expect(rows[4]).toHaveTextContent("Expected later");
    expect(rows[5]).toHaveTextContent("06:00 → 10:00");
    expect(rows[5]).toHaveTextContent("Left");
    expect(screen.getByRole("link", { name: "Open the clock-in history" })).toHaveAttribute("href", "/clock-in/history");
  });

  it("shows an admin the pay of the month so far", async () => {
    mockDashboard(BUSY);
    renderWithProviders(<TodayDashboard />);
    const card = (await screen.findByRole("heading", { name: "November 2026 so far" })).closest("div")!.parentElement!;
    expect(card).toHaveTextContent(/Gross103[\s,.  ]?125[.,]00 DA/);
    expect(card).toHaveTextContent(/Advances20[\s,.  ]?000[.,]00 DA/);
    expect(card).toHaveTextContent(/Net to pay82[\s,.  ]?300[.,]00 DA/);
    expect(card).toHaveTextContent("412.5 hours worked by 11 employees.");
    expect(within(card).getByRole("link", { name: "Open the payroll" })).toHaveAttribute("href", "/reporting/monthly-payroll");
  });

  it("shows no money when the server sends none (a manager)", async () => {
    mockDashboard({ ...BUSY, month: null });
    renderWithProviders(<TodayDashboard />, { user: makeUser({ role: "manager" }) });
    await screen.findByText("Who is where");
    expect(screen.queryByText(/so far/)).toBeNull();
    expect(screen.queryByText(/Net to pay/)).toBeNull();
  });

  it("points to the correction requests waiting for an answer", async () => {
    mockDashboard(BUSY);
    renderWithProviders(<TodayDashboard />);
    expect(await screen.findByText("2 correction requests from employees are waiting for an answer.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Answer them" })).toHaveAttribute("href", "/corrections");
  });

  it("says '1 correction request', and nothing when none is waiting", async () => {
    mockDashboard({ ...BUSY, pending: { corrections: 1 } });
    const first = renderWithProviders(<TodayDashboard />);
    expect(await screen.findByText("1 correction request from an employee is waiting for an answer.")).toBeInTheDocument();
    first.unmount();
    mockDashboard({ ...BUSY, pending: { corrections: 0 } });
    renderWithProviders(<TodayDashboard />);
    await screen.findByText("Who is where");
    expect(screen.queryByText("Waiting for you")).toBeNull();
  });

  it("says so on a day with nobody planned or clocked in", async () => {
    renderWithProviders(<TodayDashboard />);
    expect(await screen.findByText("Nobody is planned or clocked in today.")).toBeInTheDocument();
    expect(tile("Present")).toHaveTextContent("0");
  });

  it("explains when clock-in is switched off for the company", async () => {
    mockDashboard({ ...BUSY, attendance: null });
    renderWithProviders(<TodayDashboard />);
    expect(await screen.findByText(/Clock-in is switched off for this company/)).toBeInTheDocument();
    expect(screen.queryByText("Who is where")).toBeNull();
    // The month card is still there
    expect(screen.getByRole("heading", { name: "November 2026 so far" })).toBeInTheDocument();
  });

  it("leaves out links to pages this user can't open", async () => {
    mockDashboard(BUSY);
    renderWithProviders(<TodayDashboard />, {
      company: makeCompany({ disabledPages: ["clockinHistory", "monthlyPayroll", "corrections"] }),
    });
    await screen.findByText("Who is where");
    expect(screen.queryByRole("link", { name: "Open the clock-in history" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open the payroll" })).toBeNull();
    expect(screen.queryByText("Waiting for you")).toBeNull();
  });

  it("shows an error with a retry when the figures can't be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.get(`${API}/dashboard`, () => HttpResponse.json({}, { status: 500 })));
    const { user } = renderWithProviders(<TodayDashboard />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load today's figures");
    mockDashboard(BUSY);
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Who is where")).toBeInTheDocument();
  });

  it("keeps the figures on screen when a later refresh fails, and says so", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockDashboard(BUSY);
    const { user } = renderWithProviders(<TodayDashboard />);
    await screen.findByText("Who is where");
    server.use(http.get(`${API}/dashboard`, () => HttpResponse.json({}, { status: 500 })));
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load today's figures");
    expect(tile("Present")).toHaveTextContent("2");
  });

  it("refreshes on the button, and by itself every minute", async () => {
    const setTimer = vi.spyOn(window, "setInterval");
    const clearTimer = vi.spyOn(window, "clearInterval");
    const calls = mockDashboard(BUSY, {
      ...BUSY,
      time: "10:43",
      attendance: { ...BUSY.attendance!, counts: { ...BUSY.attendance!.counts, present: 3 } },
    });
    const { user, unmount } = renderWithProviders(<TodayDashboard />);
    await screen.findByText("Updated at 10:42");
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(tile("Present")).toHaveTextContent("3"));
    expect(screen.getByText("Updated at 10:43")).toBeInTheDocument();
    expect(calls()).toBe(2);

    const mine = setTimer.mock.calls.findIndex(([, delay]) => delay === REFRESH_MS);
    expect(mine).toBeGreaterThanOrEqual(0);
    await act(async () => {
      (setTimer.mock.calls[mine][0] as () => void)();
    });
    await waitFor(() => expect(calls()).toBe(3));
    unmount();
    expect(clearTimer).toHaveBeenCalledWith(setTimer.mock.results[mine].value);
    setTimer.mockRestore();
    clearTimer.mockRestore();
  });

  it.each([
    ["the kiosk account", makeUser({ role: "employee" }), makeCompany()],
    ["a super admin outside any company", makeUser({ role: "superadmin", companyId: null }), null],
    ["a signed-out visitor", null, null],
  ])("is not shown to %s", async (_who, user, company) => {
    const calls = mockDashboard(BUSY);
    renderWithProviders(<TodayDashboard />, { user, company });
    await new Promise((r) => setTimeout(r, 40));
    expect(screen.queryByRole("heading", { name: "Today" })).toBeNull();
    expect(calls()).toBe(0);
  });

  it("is written in the user's language", async () => {
    mockDashboard(BUSY);
    setLang("fr");
    try {
      renderWithProviders(<TodayDashboard />);
      expect(await screen.findByRole("heading", { name: "Aujourd'hui" })).toBeInTheDocument();
      expect(screen.getByText("Qui est où")).toBeInTheDocument();
    } finally {
      setLang("en");
    }
  });
});

describe("the Home page", () => {
  it("opens on today's dashboard, with the getting-started guide below", async () => {
    mockDashboard(BUSY);
    renderWithProviders(<HomeView />);
    const today = await screen.findByRole("heading", { name: "Today" });
    const guide = screen.getByRole("heading", { name: "Where to start" });
    expect(today.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
