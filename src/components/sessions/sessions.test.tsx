import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import LoginSessionsView from "./LoginSessionsView";
import MySessions from "./MySessions";
import { endReasonLabel, formatWhen, type LoginSession } from "./sessionTypes";
import LoginSessionsPage from "@/app/(admin)/login-sessions/page";
import { API, server } from "@/test/server";
import { makeUser } from "@/test/factories";
import { answerConfirmDialog, renderWithProviders, screen, waitFor, within } from "@/test/render";
import { setLang } from "@/lib/i18n";

function makeSession(overrides: Partial<LoginSession> = {}): LoginSession {
  return {
    id: "s1",
    userId: "u2",
    userName: "Mia Manager",
    userEmail: "mia@test.dz",
    userRole: "manager",
    ip: "10.0.0.1",
    device: "Chrome on Windows",
    userAgent: "Mozilla/5.0",
    createdAt: "2026-03-01T08:00:00Z",
    lastSeenAt: "2026-03-01T09:30:00Z",
    accessTokenId: "abcdef1234567890",
    accessTokenExpiresAt: "2026-03-01T09:45:00Z",
    rotationCount: 3,
    idleExpiresAt: "2026-03-02T09:30:00Z",
    expiresAt: "2026-03-08T08:00:00Z",
    active: true,
    ...overrides,
  };
}

const realTz = process.env.TZ;
beforeEach(() => {
  process.env.TZ = "UTC";
});
afterEach(() => {
  process.env.TZ = realTz;
  setLang("en");
});

describe("sessionTypes", () => {
  it("formats a date in the current language, or a dash when missing", () => {
    expect(formatWhen("2026-03-01T08:05:00Z")).toBe("01 Mar, 08:05");
    expect(formatWhen(undefined)).toBe("—");
    expect(formatWhen(null)).toBe("—");
  });

  it("labels end reasons, keeping unknown ones as they are", () => {
    expect(endReasonLabel("refresh_token_reused")).toBe("Stolen token detected");
    expect(endReasonLabel("something_new")).toBe("something_new");
    expect(endReasonLabel(undefined)).toBe("");
  });
});

// ── Super admin: every login session ──────────────────────────────────────

const superAdmin = makeUser({ role: "superadmin", companyId: null });

function serveSessions(handler: (url: URL) => { items: LoginSession[]; total: number; page?: number; limit?: number }) {
  const urls: URL[] = [];
  server.use(
    http.get(`${API}/login-sessions`, ({ request }) => {
      const url = new URL(request.url);
      urls.push(url);
      const { items, total, page = 1, limit = 50 } = handler(url);
      return HttpResponse.json({ items, total, page, limit });
    })
  );
  return urls;
}

const renderSessions = () => renderWithProviders(<LoginSessionsView />, { user: superAdmin, company: null, url: "/login-sessions" });

describe("LoginSessionsView", () => {
  it("shows loading, then the active sessions with device, IP, token and expiry", async () => {
    const urls = serveSessions(() => ({
      items: [
        makeSession({ lastIp: "10.0.0.9" }),
        makeSession({ id: "s2", userName: undefined, userEmail: "kiosk@test.dz", userRole: "employee", device: undefined, ip: undefined }),
        makeSession({ id: "s3", userRole: "robot" }),
        makeSession({ id: "s4", userName: "No role", userRole: undefined }),
      ],
      total: 4,
    }));
    renderSessions();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByText("4 sessions")).toBeInTheDocument();
    const row = screen.getAllByText("Mia Manager")[0].closest("tr")!;
    expect(within(row).getByText("mia@test.dz · Manager")).toBeInTheDocument();
    expect(within(row).getByText("Chrome on Windows")).toHaveAttribute("title", "Mozilla/5.0");
    expect(within(row).getByText("10.0.0.1 → 10.0.0.9")).toBeInTheDocument();
    expect(within(row).getByText("abcdef12…")).toBeInTheDocument();
    expect(within(row).getByText("Renewed 3 times")).toBeInTheDocument();
    expect(within(row).getByText("Valid until 01 Mar, 09:45")).toBeInTheDocument();
    expect(within(row).getByText("or if idle until 02 Mar, 09:30")).toBeInTheDocument();

    const kiosk = screen.getAllByText("kiosk@test.dz")[0].closest("tr")!;
    expect(within(kiosk).getByText("kiosk@test.dz · Clock-in kiosk")).toBeInTheDocument();
    expect(within(kiosk).getByText("Unknown device")).toBeInTheDocument();
    expect(within(kiosk).getByText("?")).toBeInTheDocument();
    expect(screen.getByText("mia@test.dz · robot")).toBeInTheDocument();
    expect(within(screen.getByText("No role").closest("tr")!).getByText("mia@test.dz ·")).toBeInTheDocument();

    expect(urls[0].searchParams.get("status")).toBe("active");
    expect(urls[0].searchParams.get("page")).toBe("1");
    expect(urls[0].searchParams.get("limit")).toBe("50");
  });

  it("shows why and when an ended session ended", async () => {
    serveSessions(() => ({
      items: [
        makeSession({ active: false, endReason: "password_reset", endedAt: "2026-03-01T10:00:00Z" }),
        makeSession({ id: "s2", userName: "Other", active: false }),
      ],
      total: 2,
    }));
    renderSessions();
    expect(await screen.findByText("Password reset by an admin")).toBeInTheDocument();
    expect(screen.getByText("01 Mar, 10:00")).toBeInTheDocument();
    expect(within(screen.getByText("Other").closest("tr")!).getByText("Ended")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End session" })).not.toBeInTheDocument();
  });

  it("filters by status and goes back to page 1", async () => {
    const urls = serveSessions((url) => ({
      items: url.searchParams.get("status") === "ended" ? [] : [makeSession()],
      total: url.searchParams.get("status") === "ended" ? 0 : 120,
      page: Number(url.searchParams.get("page")),
    }));
    const { user } = renderSessions();
    await user.click(await screen.findByRole("button", { name: "Next" }));
    await waitFor(() => expect(urls.at(-1)?.searchParams.get("page")).toBe("2"));
    await user.click(screen.getByRole("button", { name: "Ended" }));
    expect(await screen.findByText("No sessions")).toBeInTheDocument();
    expect(urls.at(-1)?.searchParams.get("status")).toBe("ended");
    expect(urls.at(-1)?.searchParams.get("page")).toBe("1");
    await user.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() => expect(urls.at(-1)?.searchParams.get("status")).toBe("all"));
  });

  it("pages through many sessions", async () => {
    const urls = serveSessions(() => ({ items: [makeSession()], total: 120 }));
    const { user } = renderSessions();
    expect(await screen.findByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Page 2 of 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Page 3 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByText("Page 2 of 3")).toBeInTheDocument();
    expect(urls.map((u) => u.searchParams.get("page"))).toEqual(["1", "2", "3", "2"]);
  });

  it("hides paging for a single page and reloads on Refresh", async () => {
    const urls = serveSessions(() => ({ items: [makeSession()], total: 1 }));
    const { user } = renderSessions();
    await screen.findByText("1 sessions");
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(urls).toHaveLength(2));
  });

  it("shows a load error with a way to retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let fail = true;
    server.use(
      http.get(`${API}/login-sessions`, () =>
        fail
          ? HttpResponse.json({ message: "Super admins only" }, { status: 403 })
          : HttpResponse.json({ items: [], total: 0, page: 1, limit: 50 })
      )
    );
    const { user } = renderSessions();
    const alert = (await screen.findByText("Couldn't load the login sessions")).closest<HTMLElement>("[role=alert]")!;
    expect(alert).toHaveTextContent("Super admins only");
    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No sessions")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load the login sessions")).not.toBeInTheDocument();
  });

  it("ends a session after confirmation", async () => {
    let ended = false;
    serveSessions(() => ({ items: ended ? [] : [makeSession()], total: ended ? 0 : 1 }));
    server.use(http.delete(`${API}/login-sessions/s1`, () => { ended = true; return new HttpResponse(null, { status: 204 }); }));
    const { user } = renderSessions();
    await user.click(await screen.findByRole("button", { name: "End session" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Mia Manager will be signed out on Chrome on Windows.");
    await answerConfirmDialog(true);
    expect(await screen.findByText("Session ended")).toBeInTheDocument();
    expect(await screen.findByText("No sessions")).toBeInTheDocument();
  });

  it("names the email and an unknown device when the session lacks them", async () => {
    serveSessions(() => ({ items: [makeSession({ userName: undefined, device: undefined })], total: 1 }));
    const { user } = renderSessions();
    await user.click(await screen.findByRole("button", { name: "End session" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("mia@test.dz will be signed out on Unknown device.");
    await answerConfirmDialog(false);
  });

  it("doesn't end the session when cancelled", async () => {
    const deleted = vi.fn();
    serveSessions(() => ({ items: [makeSession({ userName: undefined, userEmail: undefined })], total: 1 }));
    server.use(http.delete(`${API}/login-sessions/s1`, () => { deleted(); return HttpResponse.json({}); }));
    const { user } = renderSessions();
    await user.click(await screen.findByRole("button", { name: "End session" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("will be signed out on Chrome on Windows.");
    await answerConfirmDialog(false);
    expect(deleted).not.toHaveBeenCalled();
  });

  it("explains a failed end", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    serveSessions(() => ({ items: [makeSession()], total: 1 }));
    server.use(http.delete(`${API}/login-sessions/s1`, () => HttpResponse.json({ message: "Already ended" }, { status: 409 })));
    const { user } = renderSessions();
    await user.click(await screen.findByRole("button", { name: "End session" }));
    await answerConfirmDialog(true);
    expect(await screen.findByText("Couldn't end the session. Already ended")).toBeInTheDocument();
  });

  it("renders inside the Login sessions page", async () => {
    serveSessions(() => ({ items: [], total: 0 }));
    renderWithProviders(<LoginSessionsPage />, { user: superAdmin, company: null });
    expect(await screen.findByText("No sessions")).toBeInTheDocument();
    expect(screen.getAllByText("Login sessions").length).toBeGreaterThan(0);
  });
});

// ── Everyone: their own sessions ──────────────────────────────────────────

function serveMine(...lists: LoginSession[][]) {
  let call = 0;
  server.use(http.get(`${API}/auth/sessions`, () => HttpResponse.json(lists[Math.min(call++, lists.length - 1)])));
}

describe("MySessions", () => {
  it("lists my devices, marking this one and only offering to end the others", async () => {
    serveMine([
      makeSession({ id: "me", current: true, device: "Firefox on Linux", lastIp: "1.1.1.1" }),
      makeSession({ id: "phone", device: undefined, ip: undefined, lastSeenAt: undefined }),
    ]);
    renderWithProviders(<MySessions />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    const mine = (await screen.findByText("This device")).closest("li")!;
    expect(mine).toHaveTextContent("Firefox on Linux");
    expect(mine).toHaveTextContent("IP 1.1.1.1 · Signed in 01 Mar, 08:00 · Last active 01 Mar, 09:30");
    expect(within(mine).queryByRole("button", { name: "End session" })).not.toBeInTheDocument();
    const phone = screen.getByText("Unknown device").closest("li")!;
    expect(phone).toHaveTextContent("IP ? ·");
    expect(phone).toHaveTextContent("Last active —");
    expect(within(phone).getByRole("button", { name: "End session" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out all other devices" })).toBeInTheDocument();
  });

  it("hides 'sign out all other devices' when there are none", async () => {
    serveMine([makeSession({ current: true })]);
    renderWithProviders(<MySessions />);
    await screen.findByText("This device");
    expect(screen.queryByRole("button", { name: "Sign out all other devices" })).not.toBeInTheDocument();
  });

  it("ends one other session", async () => {
    serveMine([makeSession({ id: "me", current: true }), makeSession({ id: "phone", device: "Phone" })], [makeSession({ id: "me", current: true })]);
    const deleted = vi.fn();
    server.use(http.delete(`${API}/auth/sessions/phone`, () => { deleted(); return new HttpResponse(null, { status: 204 }); }));
    const { user } = renderWithProviders(<MySessions />);
    await user.click(await screen.findByRole("button", { name: "End session" }));
    expect(await screen.findByText("Session ended")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Phone")).not.toBeInTheDocument());
    expect(deleted).toHaveBeenCalledOnce();
  });

  it("explains a failed end", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    serveMine([makeSession({ id: "phone" })]);
    server.use(http.delete(`${API}/auth/sessions/phone`, () => HttpResponse.json({}, { status: 404 })));
    const { user } = renderWithProviders(<MySessions />);
    await user.click(await screen.findByRole("button", { name: "End session" }));
    expect(await screen.findByText("Couldn't end the session. We couldn't find that. It may have been deleted.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End session" })).toBeEnabled();
  });

  it("signs out all other devices", async () => {
    serveMine([makeSession({ id: "me", current: true }), makeSession({ id: "phone", device: "Phone" })], [makeSession({ id: "me", current: true })]);
    const posted = vi.fn();
    server.use(http.post(`${API}/auth/logout-others`, () => { posted(); return HttpResponse.json({}); }));
    const { user } = renderWithProviders(<MySessions />);
    await user.click(await screen.findByRole("button", { name: "Sign out all other devices" }));
    expect(await screen.findByText("Signed out of all other devices")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Phone")).not.toBeInTheDocument());
    expect(posted).toHaveBeenCalledOnce();
  });

  it("explains a failed 'sign out all other devices'", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    serveMine([makeSession({ id: "phone" })]);
    server.use(http.post(`${API}/auth/logout-others`, () => HttpResponse.json({}, { status: 500 })));
    const { user } = renderWithProviders(<MySessions />);
    await user.click(await screen.findByRole("button", { name: "Sign out all other devices" }));
    expect(await screen.findByText(/^Couldn't sign out the other devices\. Something went wrong/)).toBeInTheDocument();
  });

  it("shows a load error and retries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let fail = true;
    server.use(http.get(`${API}/auth/sessions`, () => (fail ? HttpResponse.error() : HttpResponse.json([makeSession({ current: true })]))));
    const { user } = renderWithProviders(<MySessions />);
    // Toasts from earlier tests may still be on screen, so find this alert by its text
    const alert = (await screen.findByText("Couldn't load your sessions")).closest<HTMLElement>("[role=alert]")!;
    expect(alert).toHaveTextContent("Can't reach the server");
    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("This device")).toBeInTheDocument();
  });
});
