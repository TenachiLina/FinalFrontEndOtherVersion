import { afterEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import CompanySettingsForm from "./CompanySettingsForm";
import CompanySettingsPage from "@/app/(admin)/company-settings/page";
import { API, server } from "@/test/server";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import { setLang } from "@/lib/i18n";
import { payrollConfig } from "@/lib/payrollConfig";

afterEach(() => {
  setLang("en");
  Object.assign(payrollConfig, { hoursPerDay: 8, workingDaysPerMonth: 26, weeklyAdvanceRatio: 0.5, currency: "DA" });
});

describe("CompanySettingsForm", () => {
  it("renders nothing while signed out", () => {
    renderWithProviders(<CompanySettingsForm />, { user: null });
    expect(screen.queryByRole("button", { name: "Save settings" })).not.toBeInTheDocument();
  });

  it("fills the form from the current company", async () => {
    renderWithProviders(<CompanySettingsForm />);
    expect(await screen.findByLabelText("Company name")).toHaveValue("Test Pizza");
    expect(screen.getByLabelText("Default language")).toHaveValue("en");
    expect(screen.getByLabelText("Currency label")).toHaveValue("DA");
    expect(screen.getByLabelText("Clocking machine time zone")).toHaveValue("+01:00");
    expect(screen.getByLabelText("Hours per day")).toHaveValue(8);
    expect(screen.getByLabelText("Working days / month")).toHaveValue(26);
    expect(screen.getByLabelText("Weekly advance (%)")).toHaveValue(50);
  });

  it("saves the changed settings and re-reads the company", async () => {
    let body: unknown;
    let meCalls = 0;
    const countMe = ({ request }: { request: Request }) => {
      if (request.url.endsWith("/auth/me")) meCalls++;
    };
    server.events.on("request:start", countMe);
    server.use(
      http.patch(`${API}/company`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({});
      })
    );
    const { user } = renderWithProviders(<CompanySettingsForm />);
    await waitFor(() => expect(meCalls).toBe(1));
    const name = await screen.findByLabelText("Company name");
    await user.clear(name);
    await user.type(name, "Pizza Uno");
    await user.selectOptions(screen.getByLabelText("Default language"), "fr");
    await user.clear(screen.getByLabelText("Currency label"));
    await user.type(screen.getByLabelText("Currency label"), "EUR");
    await user.clear(screen.getByLabelText("Clocking machine time zone"));
    await user.type(screen.getByLabelText("Clocking machine time zone"), "+02:00");
    await user.clear(screen.getByLabelText("Hours per day"));
    await user.type(screen.getByLabelText("Hours per day"), "7");
    await user.clear(screen.getByLabelText("Working days / month"));
    await user.type(screen.getByLabelText("Working days / month"), "22");
    await user.clear(screen.getByLabelText("Weekly advance (%)"));
    await user.type(screen.getByLabelText("Weekly advance (%)"), "40");
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Settings saved.");
    expect(meCalls).toBe(2);
    server.events.removeListener("request:start", countMe);
    expect(body).toEqual({
      name: "Pizza Uno",
      settings: {
        language: "fr",
        currency: "EUR",
        utcOffset: "+02:00",
        hoursPerDay: 7,
        workingDaysPerMonth: 22,
        weeklyAdvanceRatio: 0.4,
      },
    });
  });

  it("shows the server's message when saving is refused", async () => {
    server.use(http.patch(`${API}/company`, () => HttpResponse.json({ message: "Invalid UTC offset" }, { status: 400 })));
    const { user } = renderWithProviders(<CompanySettingsForm />);
    await user.click(await screen.findByRole("button", { name: "Save settings" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Invalid UTC offset");
    expect(screen.getByRole("button", { name: "Save settings" })).toBeEnabled();
  });

  it("shows a generic message when the error has no body", async () => {
    server.use(http.patch(`${API}/company`, () => new HttpResponse(null, { status: 500 })));
    const { user } = renderWithProviders(<CompanySettingsForm />);
    await user.click(await screen.findByRole("button", { name: "Save settings" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Could not save settings");
  });

  it("renders inside the Company settings page", async () => {
    renderWithProviders(<CompanySettingsPage />);
    expect(await screen.findByLabelText("Company name")).toBeInTheDocument();
    expect(screen.getAllByText("Company settings").length).toBeGreaterThan(0);
  });
});
