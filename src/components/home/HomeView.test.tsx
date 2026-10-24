import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomeView from "./HomeView";
import HomePage from "@/app/(admin)/home/page";
import { makeCompany, makeUser } from "@/test/factories";
import { renderWithProviders, screen, within } from "@/test/render";

const realTz = process.env.TZ;
beforeEach(() => {
  process.env.TZ = "UTC";
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  process.env.TZ = realTz;
});

const at = (iso: string) => vi.setSystemTime(new Date(iso));
const openLinks = () =>
  within(screen.getByRole("region", { name: "Where to start" }))
    .getAllByRole("link", { name: "Open" })
    .map((a) => a.getAttribute("href"));

describe("HomeView", () => {
  it.each([
    ["2026-03-02T08:00:00Z", "Good morning, Mia"],
    ["2026-03-02T13:00:00Z", "Good afternoon, Mia"],
    ["2026-03-02T19:00:00Z", "Good evening, Mia"],
  ])("greets by first name at %s", (now, greeting) => {
    at(now);
    renderWithProviders(<HomeView />, { user: makeUser({ name: "Mia Manager" }) });
    expect(screen.getByRole("heading", { name: greeting })).toBeInTheDocument();
    expect(screen.getByText(/^Monday,? 2 March 2026 · Test Pizza$/)).toBeInTheDocument();
  });

  it("shows an admin the whole cycle and every first step", () => {
    at("2026-03-02T08:00:00Z");
    renderWithProviders(<HomeView />);
    const flow = within(screen.getByRole("region", { name: "How Nexo InOuty works" })).getAllByRole("link");
    expect(flow.map((a) => a.getAttribute("href"))).toEqual(["/calendar/DoPlanning", "/kiosk", "/clockinpagehistory", "/reporting/monthly-payroll"]);
    expect(openLinks()).toEqual([
      "/company-settings",
      "/addEmployeeForm",
      "/calendar/ShiftsManagment",
      "/calendar/DoPlanning",
      "/kiosk",
      "/clockinpagehistory",
      "/reporting/monthly-payroll",
      "/users",
    ]);
    expect(screen.getAllByRole("link", { name: "Watch" })[0]).toHaveAttribute("href", "/help#guide-settings");
    expect(screen.getByRole("link", { name: "Help & guides" })).toHaveAttribute("href", "/help");
  });

  it("hides admin-only steps from a manager", () => {
    at("2026-03-02T08:00:00Z");
    renderWithProviders(<HomeView />, { user: makeUser({ role: "manager" }) });
    expect(openLinks()).not.toContain("/users");
    expect(openLinks()).not.toContain("/company-settings");
    expect(openLinks()).toContain("/addEmployeeForm");
  });

  it("hides steps for features the company doesn't have", () => {
    at("2026-03-02T08:00:00Z");
    renderWithProviders(<HomeView />, { company: makeCompany({ features: ["planning"] }) });
    const flow = within(screen.getByRole("region", { name: "How Nexo InOuty works" })).getAllByRole("link");
    expect(flow.map((a) => a.getAttribute("href"))).toEqual(["/calendar/DoPlanning"]);
    expect(openLinks()).not.toContain("/kiosk");
    expect(openLinks()).not.toContain("/reporting/monthly-payroll");
  });

  it("shows a super admin outside a company only the greeting", () => {
    at("2026-03-02T08:00:00Z");
    renderWithProviders(<HomeView />, { user: makeUser({ role: "superadmin", name: "Root" }), company: null });
    expect(screen.getByRole("heading", { name: "Good morning, Root" })).toBeInTheDocument();
    expect(screen.getByText(/^Monday,? 2 March 2026$/)).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("renders nothing while signed out", () => {
    renderWithProviders(<HomeView />, { user: null });
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("renders from the home page", () => {
    at("2026-03-02T08:00:00Z");
    renderWithProviders(<HomePage />);
    expect(screen.getByRole("heading", { name: "Good morning, Admin" })).toBeInTheDocument();
  });
});
