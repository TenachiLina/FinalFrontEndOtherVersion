import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import React from "react";
import { API, server } from "@/test/server";
import { makeCompany, makeUser } from "@/test/factories";
import { AppProviders, signIn } from "@/test/render";
import { AuthProvider, useAuth } from "./AuthContext";
import { ThemeProvider, useTheme } from "./ThemeContext";
import { SidebarProvider, useSidebar } from "./SidebarContext";
import { I18nProvider, useI18n } from "./I18nContext";
import { getActingCompanyId, getToken } from "@/lib/auth";
import { payrollConfig } from "@/lib/payrollConfig";
import { getLang, setLang } from "@/lib/i18n";

const realLocation = window.location;
let location: { href: string; pathname: string; search: string };
beforeEach(() => {
  location = { href: "", pathname: "/home", search: "" };
  Object.defineProperty(window, "location", { value: location, configurable: true });
});
afterEach(() => {
  Object.defineProperty(window, "location", { value: realLocation, configurable: true });
  setLang("en");
  Object.assign(payrollConfig, { hoursPerDay: 8, workingDaysPerMonth: 26, weeklyAdvanceRatio: 0.5, currency: "DA" });
});

const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;

describe("AuthProvider", () => {
  it("is signed out and not loading without a stored token", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it("restores the session and confirms it with the backend", async () => {
    const company = makeCompany({ settings: { ...makeCompany().settings, currency: "EUR", language: "fr" }, slug: "roma" });
    signIn(makeUser({ name: "Cached" }), company);
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ user: makeUser({ name: "Fresh" }), company })));
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user?.name).toBe("Cached");
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.name).toBe("Fresh");
    expect(payrollConfig.currency).toBe("EUR");
    expect(getLang()).toBe("fr");
    expect(localStorage.getItem("last_company_slug")).toBe("roma");
  });

  it("doesn't remember the sign-in look for a super admin", async () => {
    signIn(makeUser({ role: "superadmin" }), makeCompany({ slug: "roma" }));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(localStorage.getItem("last_company_slug")).toBeNull();
  });

  it("clears the session when the backend says it has ended", async () => {
    signIn();
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ code: "SESSION_REVOKED" }, { status: 401 })));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(getToken()).toBeNull();
  });

  it("forgets a company the super admin can no longer open (403)", async () => {
    signIn(makeUser({ role: "superadmin" }));
    localStorage.setItem("acting_company_id", "gone");
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({}, { status: 403 })));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getActingCompanyId()).toBeNull();
  });

  it("keeps the cached identity when the backend is unreachable", async () => {
    signIn(makeUser({ name: "Cached" }));
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.error()));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.name).toBe("Cached");
  });

  it("keeps the cached identity on other errors", async () => {
    signIn(makeUser({ name: "Cached" }));
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({}, { status: 500 })));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.name).toBe("Cached");
  });

  it("login stores the session and returns who signed in", async () => {
    localStorage.setItem("acting_company_id", "old");
    let body: unknown;
    server.use(
      http.post(`${API}/auth/login`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ accessToken: "a", refreshToken: "r", user: makeUser(), company: makeCompany() });
      })
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let out: Awaited<ReturnType<typeof result.current.login>> | undefined;
    await act(async () => {
      out = await result.current.login("a@b.dz", "pw");
    });
    expect(body).toEqual({ email: "a@b.dz", password: "pw" });
    expect(out?.user.email).toBe("admin@test.dz");
    expect(result.current.company?.name).toBe("Test Pizza");
    expect(getToken()).toBe("a");
    expect(getActingCompanyId()).toBeNull();
  });

  it.each([
    [HttpResponse.json({ message: "Wrong password" }, { status: 401 }), "Wrong password"],
    [new HttpResponse("nope", { status: 500 }), "Could not sign in"],
    [HttpResponse.json({}, { status: 429 }), "Could not sign in"],
  ])("login throws the reason (%#)", async (response, message) => {
    server.use(http.post(`${API}/auth/login`, () => response));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.login("a", "b")).rejects.toThrow(message);
  });

  it("logout ends the session and goes to the company's sign-in page", async () => {
    signIn(makeUser(), makeCompany({ slug: "roma" }));
    server.use(http.post(`${API}/auth/logout`, () => new HttpResponse(null, { status: 204 })));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.logout());
    await waitFor(() => expect(location.href).toBe("/signin?company=roma"));
    expect(result.current.user).toBeNull();
  });

  it("switchCompany stores the company and reloads", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.switchCompany("c9"));
    expect(getActingCompanyId()).toBe("c9");
    expect(location.href).toBe("/home");
    act(() => result.current.switchCompany(null));
    expect(location.href).toBe("/companies");
  });

  it("refreshCompany reads the company again", async () => {
    signIn();
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ user: makeUser(), company: makeCompany({ name: "Renamed" }) })));
    await act(() => result.current.refreshCompany());
    expect(result.current.company?.name).toBe("Renamed");
  });

  it("useAuth outside the provider throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow("useAuth must be used inside AuthProvider");
  });
});

describe("ThemeProvider", () => {
  const themeWrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

  it("starts light and switches to dark, remembering the choice", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTheme(), { wrapper: themeWrapper });
    expect(result.current.theme).toBe("light");
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("theme-transition")).toBe(true);
    act(() => vi.advanceTimersByTime(200));
    expect(document.documentElement.classList.contains("theme-transition")).toBe(false);
    expect(localStorage.getItem("theme")).toBe("dark");
    act(() => result.current.toggleTheme());
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    vi.useRealTimers();
  });

  it("restores the saved theme", () => {
    localStorage.setItem("theme", "dark");
    const { result } = renderHook(() => useTheme(), { wrapper: themeWrapper });
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("switches instantly for people who ask for reduced motion", () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...original(q), matches: true })) as typeof window.matchMedia;
    const { result } = renderHook(() => useTheme(), { wrapper: themeWrapper });
    act(() => result.current.toggleTheme());
    expect(document.documentElement.classList.contains("theme-transition")).toBe(false);
    window.matchMedia = original;
  });

  it("useTheme outside the provider throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useTheme())).toThrow("useTheme must be used within a ThemeProvider");
  });
});

describe("SidebarProvider", () => {
  const sidebarWrapper = ({ children }: { children: React.ReactNode }) => <SidebarProvider>{children}</SidebarProvider>;
  const setWidth = (w: number) => {
    Object.defineProperty(window, "innerWidth", { value: w, configurable: true });
    window.dispatchEvent(new Event("resize"));
  };
  afterEach(() => setWidth(1024));

  it("toggles expansion, mobile menu, hover, active item and submenus", () => {
    setWidth(1280);
    const { result } = renderHook(() => useSidebar(), { wrapper: sidebarWrapper });
    expect(result.current.isExpanded).toBe(true);
    act(() => result.current.toggleSidebar());
    expect(result.current.isExpanded).toBe(false);
    act(() => result.current.toggleMobileSidebar());
    expect(result.current.isMobileOpen).toBe(true);
    act(() => result.current.setIsHovered(true));
    expect(result.current.isHovered).toBe(true);
    act(() => result.current.setActiveItem("Home"));
    expect(result.current.activeItem).toBe("Home");
    act(() => result.current.toggleSubmenu("Reporting"));
    expect(result.current.openSubmenu).toBe("Reporting");
    act(() => result.current.toggleSubmenu("Reporting"));
    expect(result.current.openSubmenu).toBeNull();
  });

  it("is never expanded on a phone, and closes the mobile menu on a wide screen", () => {
    setWidth(500);
    const { result } = renderHook(() => useSidebar(), { wrapper: sidebarWrapper });
    expect(result.current.isExpanded).toBe(false);
    act(() => result.current.toggleMobileSidebar());
    expect(result.current.isMobileOpen).toBe(true);
    act(() => setWidth(1280));
    expect(result.current.isMobileOpen).toBe(false);
    expect(result.current.isExpanded).toBe(true);
  });

  it("useSidebar outside the provider throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useSidebar())).toThrow("useSidebar must be used within a SidebarProvider");
  });
});

describe("I18nProvider", () => {
  function Probe() {
    const { lang, dir, t } = useI18n();
    return (
      <p>
        {lang}|{dir}|{t("Cancel")}
      </p>
    );
  }

  it("loads the saved language and re-renders on change", async () => {
    localStorage.setItem("lang", "ar");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );
    await waitFor(() => expect(screen.getByText(/^ar\|rtl\|/)).toBeInTheDocument());
    act(() => setLang("en"));
    expect(screen.getByText("en|ltr|Cancel")).toBeInTheDocument();
  });
});

describe("AppProviders (test helper sanity check)", () => {
  it("renders children with every provider", async () => {
    signIn();
    function Who() {
      const { user, loading } = useAuth();
      return <p>{loading ? "loading" : user?.name}</p>;
    }
    render(<Who />, { wrapper: AppProviders });
    expect(await screen.findByText("Admin")).toBeInTheDocument();
    await userEvent.setup().click(document.body);
  });
});
