import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import AuthBrandPanel from "./AuthBrandPanel";
import AuthLayout from "@/app/(full-width-pages)/(auth)/layout";
import { API, server } from "@/test/server";
import { renderWithProviders, screen, waitFor } from "@/test/render";

// The branding of each slug is cached for the whole test file, so each test uses its own slug.

describe("AuthBrandPanel", () => {
  it("shows the product's look when no company is known", async () => {
    renderWithProviders(<AuthBrandPanel />, { user: null, url: "/signin" });
    expect(await screen.findByRole("heading", { name: "Nexo InOuty" })).toBeInTheDocument();
    expect(screen.getByText("Planning, clock-in and payroll for your team.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByAltText("Nexo InOuty logo").closest("[style]")).toHaveStyle({ backgroundColor: "#161950" }));
  });

  it("shows the company's logo, title, welcome text and colour", async () => {
    server.use(
      http.get(`${API}/branding/panel-roma`, () =>
        HttpResponse.json({
          name: "Pizza Roma",
          slug: "panel-roma",
          branding: { logo: "/roma.png", title: "Roma staff", subtitle: "Ciao!", color: "#ff0000" },
        })
      )
    );
    renderWithProviders(<AuthBrandPanel />, { user: null, url: "/signin?company=panel-roma" });
    expect(await screen.findByRole("heading", { name: "Roma staff" })).toBeInTheDocument();
    expect(screen.getByText("Ciao!")).toBeInTheDocument();
    expect(screen.getByAltText("Pizza Roma logo")).toHaveAttribute("src", "/roma.png");
    expect(screen.getByAltText("Pizza Roma logo").closest("[style]")).toHaveStyle({ backgroundColor: "#ff0000" });
  });

  it("uses the company remembered on this browser, without a welcome text by default", async () => {
    localStorage.setItem("last_company_slug", "panel-napoli");
    server.use(http.get(`${API}/branding/panel-napoli`, () => HttpResponse.json({ name: "Napoli", slug: "panel-napoli", branding: {} })));
    renderWithProviders(<AuthBrandPanel />, { user: null, url: "/signin" });
    expect(await screen.findByRole("heading", { name: "Napoli" })).toBeInTheDocument();
    expect(screen.queryByText("Planning, clock-in and payroll for your team.")).not.toBeInTheDocument();
  });

  it("falls back to the product's look for an unknown company", async () => {
    server.use(http.get(`${API}/branding/panel-unknown`, () => HttpResponse.json({}, { status: 404 })));
    renderWithProviders(<AuthBrandPanel />, { user: null, url: "/signin?company=panel-unknown" });
    expect(await screen.findByRole("heading", { name: "Nexo InOuty" })).toBeInTheDocument();
  });
});

describe("Auth layout", () => {
  it("shows the page next to the brand panel, with language and theme switches", async () => {
    const { user } = renderWithProviders(<AuthLayout><p>Sign-in form</p></AuthLayout>, { user: null, url: "/signin" });
    expect(screen.getByText("Sign-in form")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Nexo InOuty" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Language" })).toBeInTheDocument();
    const html = document.documentElement;
    const buttons = screen.getAllByRole("button");
    const themeToggle = buttons[buttons.length - 1];
    const wasDark = html.classList.contains("dark");
    await user.click(themeToggle);
    await waitFor(() => expect(html.classList.contains("dark")).toBe(!wasDark));
  });
});
