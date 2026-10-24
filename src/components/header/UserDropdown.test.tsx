import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import UserDropdown from "./UserDropdown";
import { API, server } from "@/test/server";
import { makeCompany, makeUser } from "@/test/factories";
import { renderWithProviders, screen, waitFor } from "@/test/render";

const realLocation = window.location;
let location: { href: string; pathname: string; search: string };
beforeEach(() => {
  location = { href: "", pathname: "/home", search: "" };
  Object.defineProperty(window, "location", { value: location, configurable: true });
});
afterEach(() => {
  Object.defineProperty(window, "location", { value: realLocation, configurable: true });
});

const toggle = () => screen.getByRole("button", { name: /Admin|Mia|Root|\?/ });

describe("UserDropdown", () => {
  it("shows my initials and name, and opens my details and links", async () => {
    const { user } = renderWithProviders(<UserDropdown />, { user: makeUser({ name: "Mia van Manager", role: "manager", email: "mia@test.dz" }) });
    const button = await screen.findByRole("button", { name: /Mia van Manager/ });
    expect(button).toHaveTextContent(/^MVMia van Manager$/);
    expect(screen.queryByText("mia@test.dz")).not.toBeInTheDocument();
    await user.click(button);
    expect(screen.getByText("mia@test.dz")).toBeInTheDocument();
    expect(screen.getByText("Manager")).toBeInTheDocument();
    expect(screen.getByText("Test Pizza")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Help & guides" })).toHaveAttribute("href", "/help");
    expect(screen.getByRole("link", { name: "Change password" })).toHaveAttribute("href", "/account");
    await user.click(button);
    expect(screen.queryByText("mia@test.dz")).not.toBeInTheDocument();
  });

  it.each([
    ["superadmin", "Super admin"],
    ["admin", "Admin"],
    ["employee", "Clock-in kiosk"],
  ] as const)("names the %s role", async (role, label) => {
    const { user } = renderWithProviders(<UserDropdown />, { user: makeUser({ role, name: "Root" }) });
    await user.click(await screen.findByRole("button", { name: /Root/ }));
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("doesn't show a company for a super admin outside any company", async () => {
    const { user } = renderWithProviders(<UserDropdown />, { user: makeUser({ role: "superadmin", name: "Root" }), company: null });
    await user.click(await screen.findByRole("button", { name: /Root/ }));
    expect(screen.queryByText("Test Pizza")).not.toBeInTheDocument();
  });

  it("shows a question mark while nobody is signed in", () => {
    renderWithProviders(<UserDropdown />, { user: null });
    expect(screen.getByRole("button")).toHaveTextContent("?");
  });

  it("closes when clicking outside or choosing a link", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); // jsdom can't follow links
    const { user } = renderWithProviders(
      <div>
        <p>Outside</p>
        <UserDropdown />
      </div>
    );
    await user.click(await screen.findByRole("button", { name: /Admin/ }));
    await user.click(screen.getByText("Outside"));
    expect(screen.queryByText("admin@test.dz")).not.toBeInTheDocument();
    await user.click(toggle());
    await user.click(screen.getByRole("link", { name: "Change password" }));
    expect(screen.queryByText("admin@test.dz")).not.toBeInTheDocument();
  });

  it("signs out on the server and goes to the company's sign-in page", async () => {
    const logout = vi.fn();
    server.use(http.post(`${API}/auth/logout`, () => { logout(); return HttpResponse.json({}); }));
    const { user } = renderWithProviders(<UserDropdown />, { company: makeCompany({ slug: "roma" }) });
    await user.click(await screen.findByRole("button", { name: /Admin/ }));
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(location.href).toBe("/signin?company=roma"));
    expect(logout).toHaveBeenCalledOnce();
    expect(localStorage.getItem("auth_token")).toBeNull();
  });
});
