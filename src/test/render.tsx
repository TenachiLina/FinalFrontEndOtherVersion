import React from "react";
import { expect } from "vitest";
import { render, screen, waitFor, type RenderOptions } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import { I18nProvider } from "@/context/I18nContext";
import { SidebarProvider } from "@/context/SidebarContext";
import FeedbackHost from "@/components/ui/feedback/FeedbackHost";
import type { AuthUser, CompanyInfo } from "@/lib/auth";
import { API, server } from "./server";
import { makeCompany, makeJwt, makeUser } from "./factories";
import { setUrl } from "./navigation";

export interface ProviderOptions {
  /** Signed-in user; `null` renders signed out. Default: an admin. */
  user?: AuthUser | null;
  /** Their company; `null` for a super admin outside any company. */
  company?: CompanyInfo | null;
  /** Current URL, e.g. "/reporting/overview?start=2026-03-01". */
  url?: string;
  /** Route params for useParams(), e.g. { id: "101" }. */
  params?: Record<string, string>;
}

/** Stores a session and answers /auth/me, the way a signed-in browser starts. */
export function signIn(user: AuthUser | null = makeUser(), company: CompanyInfo | null = makeCompany()) {
  if (user) {
    localStorage.setItem("auth_token", makeJwt(3600));
    localStorage.setItem("auth_refresh", "refresh");
    localStorage.setItem("auth_user", JSON.stringify(user));
    if (company) localStorage.setItem("auth_company", JSON.stringify(company));
  }
  server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ user, company })));
}

/** The app's real providers, as in app/layout.tsx, plus the toast/confirm host. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <I18nProvider>
          <SidebarProvider>{children}</SidebarProvider>
          <FeedbackHost />
        </I18nProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

/**
 * Renders `ui` signed in (admin of "Test Pizza" with every feature by default)
 * inside the app's providers. Returns the render result plus a `user` for
 * user-event interactions.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  { user, company, url = "/", params, ...options }: ProviderOptions & Omit<RenderOptions, "wrapper"> = {}
) {
  setUrl(url, params);
  signIn(user === undefined ? makeUser() : user, company === undefined ? makeCompany() : company);
  return { user: userEvent.setup(), ...render(ui, { wrapper: AppProviders, ...options }) };
}

/** Clicks the confirm dialog's confirm (or cancel) button. */
export async function answerConfirmDialog(ok: boolean) {
  const dialog = await screen.findByRole("alertdialog");
  const buttons = dialog.querySelectorAll("button");
  const target = ok ? buttons[buttons.length - 1] : buttons[0];
  await userEvent.click(target as HTMLElement);
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
}

export * from "@testing-library/react";
export { userEvent };
