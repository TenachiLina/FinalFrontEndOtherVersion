import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import SignInForm from "./SignInForm";
import SignInPage from "@/app/(full-width-pages)/(auth)/signin/page";
import { API, server } from "@/test/server";
import { makeCompany, makeUser } from "@/test/factories";
import { router } from "@/test/navigation";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import type { AuthUser, CompanyInfo } from "@/lib/auth";

/** Answers POST /auth/login with this user and company, and records the credentials sent. */
function serveLogin(user: AuthUser = makeUser(), company: CompanyInfo | null = makeCompany()) {
  const bodies: unknown[] = [];
  server.use(
    http.post(`${API}/auth/login`, async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ accessToken: "access", refreshToken: "refresh", user, company });
    })
  );
  return bodies;
}

const renderSignIn = (url = "/signin") => renderWithProviders(<SignInForm />, { user: null, url });

async function signInWith(user: ReturnType<typeof renderSignIn>["user"], email: string, password: string) {
  if (email) await user.type(screen.getByLabelText(/Email/), email);
  if (password) await user.type(screen.getByLabelText(/Password/), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("SignInForm", () => {
  it("shows the product's look when no company is known", async () => {
    renderSignIn();
    expect(await screen.findByRole("heading", { name: "Sign in to Nexo InOuty" })).toBeInTheDocument();
    expect(screen.getByAltText("Nexo InOuty logo")).toHaveAttribute("src", "/images/logo/King.png");
  });

  it("shows the company's name and logo from ?company=", async () => {
    server.use(
      http.get(`${API}/branding/form-roma`, () =>
        HttpResponse.json({ name: "Pizza Roma", slug: "form-roma", branding: { logo: "/roma.png" } })
      )
    );
    renderSignIn("/signin?company=form-roma");
    expect(await screen.findByRole("heading", { name: "Sign in to Pizza Roma" })).toBeInTheDocument();
    expect(screen.getByAltText("Pizza Roma logo")).toHaveAttribute("src", "/roma.png");
  });

  it("checks the fields before calling the server", async () => {
    const bodies = serveLogin();
    const { user } = renderSignIn();
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByText("Enter your email.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Email/), "not-an-email");
    expect(screen.queryByText("Enter your email.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByText("This doesn't look like an email address.")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Password/), "x");
    expect(screen.queryByText("Enter your password.")).not.toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it("signs in and goes to the home page", async () => {
    const bodies = serveLogin();
    const { user } = renderSignIn();
    await signInWith(user, "  admin@test.dz ", "secret");
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/home"));
    expect(bodies).toEqual([{ email: "admin@test.dz", password: "secret" }]);
    expect(localStorage.getItem("auth_token")).toBe("access");
    expect(localStorage.getItem("auth_refresh")).toBe("refresh");
  });

  it("forgets the company a super admin was working in", async () => {
    localStorage.setItem("acting_company_id", "c9");
    serveLogin(makeUser({ role: "superadmin" }), null);
    const { user } = renderSignIn();
    await signInWith(user, "root@test.dz", "secret");
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/companies"));
    expect(localStorage.getItem("acting_company_id")).toBeNull();
  });

  it("sends a kiosk account to the kiosk", async () => {
    serveLogin(makeUser({ role: "employee" }));
    const { user } = renderSignIn();
    await signInWith(user, "kiosk@test.dz", "secret");
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/kiosk"));
  });

  it("goes back to the page in ?next= when the user may open it", async () => {
    serveLogin();
    const { user } = renderSignIn("/signin?next=%2Freporting%2Foverview%3Fstart%3D2026-03-01");
    await signInWith(user, "admin@test.dz", "secret");
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/reporting/overview?start=2026-03-01"));
  });

  it.each([
    ["a page the role can't open", "/users", makeUser({ role: "manager" })],
    ["a super-admin page", "/companies", makeUser()],
    ["another site", "https://evil.example", makeUser()],
    ["a protocol-relative link", "//evil.example", makeUser()],
    ["the sign-in page itself", "/signin?next=/home", makeUser()],
  ])("ignores ?next= pointing to %s", async (_label, next, signedIn) => {
    serveLogin(signedIn);
    const { user } = renderSignIn(`/signin?next=${encodeURIComponent(next)}`);
    await signInWith(user, "someone@test.dz", "secret");
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/home"));
  });

  // BUG-605: "/\evil.example" passes the ?next= check, and browsers read "/\" as "//", so sign-in redirects off-site
  it.fails.each([
    ["a backslash", "/\\evil.example"],
    ["a tab", "/\t/evil.example"],
  ])("doesn't follow ?next= to another site disguised with %s", async (_label, next) => {
    serveLogin();
    const { user } = renderSignIn(`/signin?next=${encodeURIComponent(next)}`);
    await signInWith(user, "admin@test.dz", "secret");
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    const target = router.replace.mock.calls[0][0] as string;
    expect(new URL(target, "https://app.test").origin).toBe("https://app.test");
  });

  it("shows the server's reason when sign-in fails and lets the user try again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.post(`${API}/auth/login`, () => HttpResponse.json({ message: "Wrong email or password" }, { status: 401 })));
    const { user } = renderSignIn();
    await signInWith(user, "admin@test.dz", "bad");
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong email or password");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(localStorage.getItem("auth_token")).toBeNull();
  });

  it("explains an expired session until another error replaces it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.post(`${API}/auth/login`, () => new HttpResponse("nope", { status: 500 })));
    const { user } = renderSignIn("/signin?expired=1");
    expect(screen.getByRole("status")).toHaveTextContent("Your session expired. Please sign in again.");
    await signInWith(user, "admin@test.dz", "bad");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not sign in");
    expect(screen.queryByText("Your session expired. Please sign in again.")).not.toBeInTheDocument();
  });

  it("shows and hides the password", async () => {
    const { user } = renderSignIn();
    const password = screen.getByLabelText(/Password/);
    expect(password).toHaveAttribute("type", "password");
    await user.click(document.querySelector('[data-icon="eye-close"]')!.parentElement!);
    expect(password).toHaveAttribute("type", "text");
    await user.click(document.querySelector('[data-icon="eye"]')!.parentElement!);
    expect(password).toHaveAttribute("type", "password");
  });

  it("skips the form when already signed in", async () => {
    renderWithProviders(<SignInForm />, { url: "/signin?next=%2Fcalendar%2FViewPlanning" });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/calendar/ViewPlanning"));
  });

  it("renders from the sign-in page", async () => {
    renderWithProviders(<SignInPage />, { user: null, url: "/signin" });
    expect(await screen.findByRole("heading", { name: "Sign in to Nexo InOuty" })).toBeInTheDocument();
  });
});
