import { afterEach, describe, expect, it } from "vitest";
import React from "react";
import { fireEvent, renderWithProviders, screen } from "@/test/render";
import { makeCompany } from "@/test/factories";
import { DEFAULT_BRAND } from "@/lib/branding";
import AppHeader from "./AppHeader";
import Backdrop from "./Backdrop";

const realWidth = window.innerWidth;
afterEach(() => {
  Object.defineProperty(window, "innerWidth", { value: realWidth, configurable: true });
});

const setWidth = (px: number) => Object.defineProperty(window, "innerWidth", { value: px, configurable: true });

function renderHeader(options: Parameters<typeof renderWithProviders>[1] = {}) {
  const result = renderWithProviders(
    <>
      <AppHeader />
      <Backdrop />
    </>,
    options
  );
  const header = result.container.querySelector("header") as HTMLElement;
  const backdrop = () => result.container.querySelector(".bg-gray-900\\/50") as HTMLElement | null;
  // The "more" button sits right after the brand link (it has no accessible name, see BUG-713)
  const moreButton = () => screen.getByRole("link", { name: /logo/ }).nextElementSibling as HTMLElement;
  const appMenu = () => moreButton().parentElement!.nextElementSibling as HTMLElement;
  return { ...result, header, backdrop, moreButton, appMenu };
}

describe("AppHeader on a phone", () => {
  it("opens the mobile menu with the toggle, shows a close icon and a backdrop", async () => {
    setWidth(500);
    const { user, backdrop, header } = renderHeader({ url: "/home" });
    const toggle = screen.getByRole("button", { name: "Toggle Sidebar" });
    expect(backdrop()).toBeNull();
    const menuIcon = toggle.innerHTML;
    await user.click(toggle);
    expect(backdrop()).toBeInTheDocument();
    expect(toggle.innerHTML).not.toBe(menuIcon);
    expect(header.querySelector("svg")?.getAttribute("width")).toBe("24");
    await user.click(toggle);
    expect(backdrop()).toBeNull();
    expect(toggle.innerHTML).toBe(menuIcon);
  });

  it("closes the mobile menu with a tap on the backdrop", async () => {
    setWidth(500);
    const { user, backdrop } = renderHeader();
    await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
    await user.click(backdrop()!);
    expect(backdrop()).toBeNull();
  });

  it("shows and hides the application menu (theme, language, user)", async () => {
    setWidth(500);
    const { user, moreButton, appMenu } = renderHeader();
    expect(appMenu()).toHaveClass("hidden");
    await user.click(moreButton());
    expect(appMenu()).toHaveClass("flex");
    expect(appMenu()).not.toHaveClass("hidden");
    await user.click(moreButton());
    expect(appMenu()).toHaveClass("hidden");
  });

  it("shows the company's logo and name", async () => {
    renderHeader({ company: makeCompany({ name: "Roma Pizza", branding: { logo: "/roma.png" } }) });
    expect(screen.getByRole("img", { name: "Roma Pizza logo" })).toHaveAttribute("src", "/roma.png");
    expect(screen.getByRole("link", { name: /Roma Pizza/ })).toHaveAttribute("href", "/home");
  });

  it("falls back to the default brand outside a company", () => {
    renderHeader({ company: null });
    expect(screen.getByRole("img", { name: `${DEFAULT_BRAND.name} logo` })).toHaveAttribute("src", DEFAULT_BRAND.logo);
  });

  // BUG-713: the header's "more" (⋯) button on phones has no accessible name and no aria-expanded state
  it.fails("labels the application menu button", () => {
    setWidth(500);
    renderHeader();
    const more = screen.getByRole("button", { name: /menu|more|options/i });
    expect(more).toHaveAttribute("aria-expanded", "false");
  });
});

describe("AppHeader on a desktop", () => {
  it("collapses the sidebar instead of opening the mobile menu", async () => {
    setWidth(1280);
    const { user, backdrop } = renderHeader();
    await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
    expect(backdrop()).toBeNull();
  });

  it.each([
    ["/home", "Home"],
    ["/reporting/monthly-payroll", "Monthly Payroll"],
    ["/account", "Change password"],
    ["/somewhere-else", "Nexo InOuty"],
  ])("titles %s as %s", (url, title) => {
    renderHeader({ url });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(title);
  });

  it("keeps Ctrl+K and ⌘+K from reaching the browser", () => {
    renderHeader();
    const ctrl = fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    const meta = fireEvent.keyDown(document, { key: "k", metaKey: true });
    const plain = fireEvent.keyDown(document, { key: "k" });
    expect(ctrl).toBe(false); // default prevented
    expect(meta).toBe(false);
    expect(plain).toBe(true);
  });

  it("stops listening for shortcuts once unmounted", () => {
    const { unmount } = renderHeader();
    unmount();
    expect(fireEvent.keyDown(document, { key: "k", ctrlKey: true })).toBe(true);
  });
});
