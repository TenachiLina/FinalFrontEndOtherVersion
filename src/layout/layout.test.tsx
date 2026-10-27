import { afterEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import AdminLayout from "@/app/(admin)/layout";
import { API, server } from "@/test/server";
import { makeCompany, makeUser } from "@/test/factories";
import { router } from "@/test/navigation";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";

const realLocation = window.location;
afterEach(() => {
  Object.defineProperty(window, "location", { value: realLocation, configurable: true });
  Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true });
});

const page = <AdminLayout>Page content</AdminLayout>;

describe("AdminLayout route guard", () => {
  it("shows the page with sidebar and header for an allowed user", async () => {
    renderWithProviders(page, { url: "/reporting/overview" });
    expect(await screen.findByText("Page content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle Sidebar" })).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to sign in, remembering the page and company", async () => {
    localStorage.setItem("last_company_slug", "roma");
    renderWithProviders(page, { url: "/reporting/overview", user: null });
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/signin?company=roma&next=%2Freporting%2Foverview")
    );
    expect(screen.queryByText("Page content")).not.toBeInTheDocument();
  });

  it("sends a signed-out visitor to the generic sign-in page", async () => {
    renderWithProviders(page, { url: "/home", user: null });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/signin?next=%2Fhome"));
  });

  it("sends a manager away from an admin-only page", async () => {
    renderWithProviders(page, { url: "/users", user: makeUser({ role: "manager" }) });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/home"));
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("sends a kiosk account to the kiosk", async () => {
    renderWithProviders(page, { url: "/home", user: makeUser({ role: "employee" }) });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/kiosk"));
  });

  it("shows the super admin banner inside a company, with a way back", async () => {
    const location = { href: "", pathname: "/home", search: "" };
    Object.defineProperty(window, "location", { value: location, configurable: true });
    const { user } = renderWithProviders(page, { url: "/home", user: makeUser({ role: "superadmin" }) });
    expect(await screen.findByText("You are working inside Test Pizza as its admin.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to all companies" }));
    expect(location.href).toBe("/companies");
  });

  it.each([
    [500, "lg:ms-[90px]", true],
    [1280, "lg:ms-[290px]", false],
  ])("lays out the content for a %ipx-wide screen", async (width, margin) => {
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
    renderWithProviders(page, { url: "/home" });
    const content = await screen.findByText("Page content");
    expect(content.parentElement?.className).toContain(margin);
  });
});

describe("AppSidebar", () => {
  const linkNames = () => screen.getAllByRole("link").map((a) => a.getAttribute("href"));

  it("only lists pages the user can open", async () => {
    renderWithProviders(page, { url: "/home", user: makeUser({ role: "manager" }), company: makeCompany({ features: ["planning"] }) });
    await screen.findByText("Page content");
    const sidebar = screen.getByRole("complementary", { hidden: true }) ?? document.body;
    const text = sidebar.textContent ?? "";
    expect(text).toContain("Planning");
    expect(text).not.toContain("Reporting");
    expect(text).not.toContain("Users");
    expect(text).not.toContain("Companies");
    expect(linkNames()).not.toContain("/users");
  });

  it("shows the super admin's pages outside a company", async () => {
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ user: makeUser({ role: "superadmin" }), company: null })));
    renderWithProviders(page, { url: "/companies", user: makeUser({ role: "superadmin" }), company: null });
    await screen.findByText("Page content");
    const sidebar = screen.getByRole("complementary", { hidden: true });
    expect(within(sidebar).getByText("Companies")).toBeInTheDocument();
    expect(within(sidebar).queryByText("Planning")).not.toBeInTheDocument();
  });

  it("opens a submenu and shows its links", async () => {
    const { user } = renderWithProviders(page, { url: "/home" });
    await screen.findByText("Page content");
    const sidebar = screen.getByRole("complementary", { hidden: true });
    await user.click(within(sidebar).getByRole("button", { name: /Reporting/ }));
    expect(within(sidebar).getByRole("link", { name: /Overview/ })).toHaveAttribute("href", "/reporting/overview");
  });
});
