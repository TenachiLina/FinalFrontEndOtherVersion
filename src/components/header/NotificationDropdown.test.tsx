import { describe, expect, it, vi } from "vitest";
import React from "react";
import { http, HttpResponse } from "msw";
import NotificationDropdown, { REFRESH_MS } from "./NotificationDropdown";
import { API, server } from "@/test/server";
import { makeCompany, makeUser } from "@/test/factories";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";
import { act } from "@testing-library/react";
import { fetchNotifications, markNotificationsRead, notificationText, type NotificationItem } from "@/lib/notifications";
import { setLang } from "@/lib/i18n";

const item = (overrides: Partial<NotificationItem>): NotificationItem => ({
  key: "k",
  type: "late",
  level: "warning",
  params: {},
  href: "/clock-in/history",
  read: false,
  ...overrides,
});

const MISSING = item({
  key: "missing:2026-11-14:2-abc",
  type: "missing",
  level: "danger",
  params: { count: 2, names: ["Amine Bensalah", "Sara Haddad"], day: "2026-11-14" },
});
const LATE = item({ key: "late:2026-11-14:1-x", params: { count: 1, names: ["Karim Meziane"], day: "2026-11-14" } });
const CLOSING = item({
  key: "closing:2026-10",
  type: "monthClosing",
  level: "info",
  params: { month: "2026-10", closesAt: "2026-11-16T12:00:00.000Z", daysLeft: 2 },
  href: "/reporting/monthly-payroll",
  read: true,
});

/** Answers the list (the last one repeats) and records what is marked read. */
function mockBell(...lists: NotificationItem[][]) {
  let call = 0;
  const read: string[][] = [];
  server.use(
    http.get(`${API}/notifications`, () => {
      const items = lists[Math.min(call++, lists.length - 1)];
      return HttpResponse.json({ items, unread: items.filter((i) => !i.read).length });
    }),
    http.post(`${API}/notifications/read`, async ({ request }) => {
      read.push(((await request.json()) as { keys: string[] }).keys);
      return new HttpResponse(null, { status: 204 });
    })
  );
  return { read, calls: () => call };
}

const bell = () => screen.findByRole("button", { name: /^Notifications/ });

describe("NotificationDropdown", () => {
  it("shows how many alerts are unread", async () => {
    mockBell([MISSING, LATE, CLOSING]);
    renderWithProviders(<NotificationDropdown />);
    expect(await screen.findByTestId("notification-badge")).toHaveTextContent("2");
    expect(await bell()).toHaveAccessibleName("Notifications, 2 unread");
  });

  it("has no badge when everything is read or there is nothing", async () => {
    mockBell([CLOSING]);
    renderWithProviders(<NotificationDropdown />);
    expect(await bell()).toHaveAccessibleName("Notifications");
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId("notification-badge")).toBeNull();
  });

  it("caps the badge at 9+", async () => {
    mockBell(Array.from({ length: 12 }, (_, i) => item({ key: `k${i}`, params: { count: 1, names: ["A"] } })));
    renderWithProviders(<NotificationDropdown />);
    expect(await screen.findByTestId("notification-badge")).toHaveTextContent("9+");
  });

  it("opens the list with each alert's sentence and a link to its page", async () => {
    mockBell([MISSING, LATE, CLOSING]);
    const { user } = renderWithProviders(<NotificationDropdown />);
    await screen.findByTestId("notification-badge");
    await user.click(await bell());
    const list = screen.getByRole("region", { name: "Notifications" });
    const links = within(list).getAllByRole("link");
    expect(links[0]).toHaveTextContent("2 people have not clocked in");
    expect(links[0]).toHaveTextContent("Planned today, shift started: Amine Bensalah, Sara Haddad");
    expect(links[0]).toHaveAttribute("href", "/clock-in/history");
    expect(links[1]).toHaveTextContent("1 late arrival today");
    expect(links[1]).toHaveTextContent("Karim Meziane");
    expect(links[2]).toHaveTextContent("October 2026 closes soon");
    expect(links[2]).toHaveAttribute("href", "/reporting/monthly-payroll");
  });

  it("opening the list marks the unread alerts as read, and clears the badge", async () => {
    const { read } = mockBell([MISSING, LATE, CLOSING]);
    const { user } = renderWithProviders(<NotificationDropdown />);
    await screen.findByTestId("notification-badge");
    await user.click(await bell());
    await waitFor(() => expect(read).toEqual([[MISSING.key, LATE.key]]));
    await waitFor(() => expect(screen.queryByTestId("notification-badge")).toBeNull());
    // The alerts stay in the list
    expect(screen.getByText("1 late arrival today")).toBeInTheDocument();
  });

  it("marks nothing when everything was already read", async () => {
    const { read } = mockBell([CLOSING]);
    const { user } = renderWithProviders(<NotificationDropdown />);
    await user.click(await bell());
    await screen.findByText("October 2026 closes soon");
    expect(read).toEqual([]);
  });

  it("says so when there is nothing to report", async () => {
    mockBell([]);
    const { user } = renderWithProviders(<NotificationDropdown />);
    await user.click(await bell());
    expect(screen.getByText("Nothing to report right now.")).toBeInTheDocument();
  });

  it("closes on Escape, on a click outside, and when an alert is followed", async () => {
    mockBell([LATE]);
    const { user } = renderWithProviders(
      <div>
        <NotificationDropdown />
        <p>elsewhere</p>
      </div>
    );
    const region = () => screen.queryByRole("region", { name: "Notifications" });
    await user.click(await bell());
    expect(region()).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(region()).toBeNull();

    await user.click(await bell());
    await user.click(screen.getByText("elsewhere"));
    expect(region()).toBeNull();

    await user.click(await bell());
    await user.click(screen.getByRole("link", { name: /1 late arrival today/ }));
    expect(region()).toBeNull();
  });

  it("shows an alert without a link when its page is closed to this user", async () => {
    mockBell([CLOSING]);
    const { user } = renderWithProviders(<NotificationDropdown />, {
      company: makeCompany({ features: ["planning", "clockin"] }),
    });
    await user.click(await bell());
    expect(screen.getByText("October 2026 closes soon")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("keeps what is shown when a refresh fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.get(`${API}/notifications`, () => HttpResponse.json({}, { status: 500 })));
    const { user } = renderWithProviders(<NotificationDropdown />);
    await user.click(await bell());
    expect(screen.getByText("Nothing to report right now.")).toBeInTheDocument();
  });

  it("asks again every minute, and stops when the page is left", async () => {
    const setTimer = vi.spyOn(window, "setInterval");
    const clearTimer = vi.spyOn(window, "clearInterval");
    const { calls } = mockBell([], [LATE]);
    const { unmount } = renderWithProviders(<NotificationDropdown />);
    await waitFor(() => expect(calls()).toBe(1));
    // The bell's own timer (the test library sets others)
    const mine = setTimer.mock.calls.findIndex(([, delay]) => delay === REFRESH_MS);
    expect(mine).toBeGreaterThanOrEqual(0);
    const refresh = setTimer.mock.calls[mine][0] as () => void;
    const timerId = setTimer.mock.results[mine].value;

    await act(async () => {
      refresh();
    });
    expect(await screen.findByTestId("notification-badge")).toHaveTextContent("1");
    expect(calls()).toBe(2);

    unmount();
    expect(clearTimer).toHaveBeenCalledWith(timerId);
    setTimer.mockRestore();
    clearTimer.mockRestore();
  });

  it.each([
    ["the kiosk account", makeUser({ role: "employee" }), makeCompany()],
    ["a super admin outside any company", makeUser({ role: "superadmin", companyId: null }), null],
    ["a signed-out visitor", null, null],
  ])("is not shown to %s", async (_who, user, company) => {
    const { calls } = mockBell([LATE]);
    renderWithProviders(<NotificationDropdown />, { user, company });
    await new Promise((r) => setTimeout(r, 40));
    expect(screen.queryByRole("button", { name: /^Notifications/ })).toBeNull();
    expect(calls()).toBe(0);
  });

  it("is shown to a manager and to a super admin working inside a company", async () => {
    for (const who of [makeUser({ role: "manager" }), makeUser({ role: "superadmin", companyId: null })]) {
      mockBell([LATE]);
      const { unmount } = renderWithProviders(<NotificationDropdown />, { user: who });
      expect(await screen.findByTestId("notification-badge")).toHaveTextContent("1");
      unmount();
    }
  });
});

describe("notificationText", () => {
  const text = (overrides: Partial<NotificationItem>) => notificationText(item(overrides));

  it("counts one or several people", () => {
    expect(text({ type: "missing", params: { count: 1, names: ["A"] } }).title).toBe("1 person has not clocked in");
    expect(text({ type: "late", params: { count: 3, names: ["A", "B", "C"] } })).toEqual({
      title: "3 late arrivals today",
      detail: "A, B, C",
    });
    expect(text({ type: "absent", params: { count: 1, names: ["A"] } }).title).toBe("1 absence today");
    expect(text({ type: "absent", params: { count: 2, names: ["A", "B"] } }).title).toBe("2 absences today");
  });

  it("names three people, then counts the rest", () => {
    expect(text({ type: "late", params: { count: 5, names: ["A", "B", "C", "D", "E"] } }).detail).toBe("A, B, C and 2 more");
    expect(text({ type: "late", params: { count: 0 } }).detail).toBe("");
  });

  it("writes the subscription and trial alerts", () => {
    expect(text({ type: "subscriptionEnding", params: { endsAt: "2026-11-20T12:00:00.000Z", kind: "active" } })).toEqual({
      title: "Your subscription ends on 20 November",
      detail: "After that the account becomes read-only. Contact us to renew.",
    });
    expect(text({ type: "subscriptionEnding", params: { endsAt: "2026-11-20T12:00:00.000Z", kind: "trial" } }).title).toBe(
      "Your free trial ends on 20 November"
    );
    expect(text({ type: "subscriptionEnded", params: { kind: "active" } })).toEqual({
      title: "Your subscription has ended.",
      detail: "The account is read-only until it is renewed.",
    });
    expect(text({ type: "subscriptionEnded", params: { kind: "trial" } }).title).toBe("Your free trial has ended.");
  });

  it("writes the month and machine alerts", () => {
    expect(text({ type: "monthClosing", params: { month: "2026-10", closesAt: "2026-11-16T12:00:00.000Z" } })).toEqual({
      title: "October 2026 closes soon",
      detail: "It closes automatically on 16 November. After that its hours and pay can no longer be changed.",
    });
    const machine = text({ type: "deviceSilent", params: { name: "Entrance", lastSeenAt: "2026-11-14T09:40:00.000Z" } });
    expect(machine.title).toBe("The clocking machine Entrance is not responding");
    expect(machine.detail).toMatch(/^Last contact: 14 Nov.* Check its power and network\.$/);
  });

  it("copes with a kind of alert it doesn't know yet", () => {
    expect(text({ type: "somethingNew" as NotificationItem["type"] })).toEqual({ title: "Notification", detail: "" });
  });

  it("is written in the user's language", () => {
    setLang("fr");
    try {
      expect(text({ type: "late", params: { count: 2, names: ["A", "B"] } }).title).toBe("2 retards aujourd'hui");
    } finally {
      setLang("en");
    }
  });
});

describe("notification calls", () => {
  it("counts the unread itself, and copes with an answer without a list", async () => {
    server.use(http.get(`${API}/notifications`, () => HttpResponse.json({ items: [LATE, CLOSING], unread: 99 })));
    expect(await fetchNotifications()).toEqual({ items: [LATE, CLOSING], unread: 1 });
    server.use(http.get(`${API}/notifications`, () => HttpResponse.json({})));
    expect(await fetchNotifications()).toEqual({ items: [], unread: 0 });
  });

  it("sends nothing when there is nothing to mark, and throws the server's refusal", async () => {
    let calls = 0;
    server.use(
      http.post(`${API}/notifications/read`, () => {
        calls++;
        return HttpResponse.json({ message: "No" }, { status: 403 });
      })
    );
    await markNotificationsRead([]);
    expect(calls).toBe(0);
    await expect(markNotificationsRead(["k"])).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
