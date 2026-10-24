import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import CompaniesView from "./CompaniesView";
import CompaniesPage from "@/app/(admin)/companies/page";
import { API, server } from "@/test/server";
import { makeUser } from "@/test/factories";
import { answerConfirmDialog, fireEvent, renderWithProviders, screen, waitFor, within } from "@/test/render";
import type { Feature } from "@/lib/auth";

interface CompanyRow {
  _id: string;
  name: string;
  active: boolean;
  features: Feature[];
  devices: { serial: string; name?: string }[];
  slug?: string;
  branding?: { logo?: string; title?: string; subtitle?: string; color?: string };
}

const ALL: Feature[] = ["planning", "clockin", "faceRecognition", "reporting", "advances", "bonuses"];

function makeCompanyRow(overrides: Partial<CompanyRow> = {}): CompanyRow {
  return { _id: "c1", name: "Pizza Roma", active: true, features: [...ALL], devices: [], ...overrides };
}

const superAdmin = makeUser({ role: "superadmin", companyId: null });
const realLocation = window.location;
let location: { href: string; origin: string; pathname: string; search: string };

beforeEach(() => {
  location = { href: "", origin: "https://app.test", pathname: "/companies", search: "" };
  Object.defineProperty(window, "location", { value: location, configurable: true });
});
afterEach(() => {
  Object.defineProperty(window, "location", { value: realLocation, configurable: true });
});

function serveCompanies(...lists: CompanyRow[][]) {
  let call = 0;
  server.use(
    http.get(`${API}/companies`, () => HttpResponse.json(lists[Math.min(call++, lists.length - 1)]))
  );
}

const renderView = () => renderWithProviders(<CompaniesView />, { user: superAdmin, company: null, url: "/companies" });

describe("CompaniesView list", () => {
  it("shows loading, then each company with its features, devices and status", async () => {
    serveCompanies([
      makeCompanyRow({ slug: "roma", devices: [{ serial: "ZK1" }, { serial: "ZK2", name: "Back" }], branding: { logo: "data:image/png;base64,AA" } }),
      makeCompanyRow({ _id: "c2", name: "Napoli", active: false, features: ["planning", "reporting"] }),
      makeCompanyRow({ _id: "c3", name: "Empty Co", features: [] }),
    ]);
    renderView();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    const roma = (await screen.findByText("Pizza Roma")).closest("tr")!;
    expect(within(roma).getByText("/signin?company=roma")).toBeInTheDocument();
    expect(within(roma).getByText("All")).toBeInTheDocument();
    expect(within(roma).getByText("ZK1, ZK2")).toBeInTheDocument();
    expect(within(roma).getByText("Active")).toBeInTheDocument();
    expect(within(roma).getByRole("button", { name: "Suspend" })).toBeInTheDocument();

    const napoli = screen.getByText("Napoli").closest("tr")!;
    expect(within(napoli).getByText("Planning & shifts, Reporting & payroll")).toBeInTheDocument();
    expect(within(napoli).getByText("—")).toBeInTheDocument();
    expect(within(napoli).getByText("Suspended")).toBeInTheDocument();
    expect(within(napoli).getByRole("button", { name: "Reactivate" })).toBeInTheDocument();

    expect(within(screen.getByText("Empty Co").closest("tr")!).getByText("None")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("says when there are no companies yet", async () => {
    serveCompanies([]);
    renderView();
    expect(await screen.findByText("No companies yet.")).toBeInTheDocument();
  });

  it("shows the server's message when the list can't be loaded", async () => {
    server.use(http.get(`${API}/companies`, () => HttpResponse.json({ message: ["Forbidden", "really"] }, { status: 403 })));
    renderView();
    expect(await screen.findByRole("alert")).toHaveTextContent("Forbidden, really");
  });

  it("falls back to the status when the error isn't JSON", async () => {
    server.use(http.get(`${API}/companies`, () => new HttpResponse("oops", { status: 502 })));
    renderView();
    expect(await screen.findByRole("alert")).toHaveTextContent("Request failed (502)");
  });

  it("opens a company as its admin", async () => {
    serveCompanies([makeCompanyRow({ _id: "c9" })]);
    const { user } = renderView();
    await user.click(await screen.findByRole("button", { name: "Open" }));
    expect(localStorage.getItem("acting_company_id")).toBe("c9");
    expect(location.href).toBe("/home");
  });

  it("renders inside the Companies page", async () => {
    serveCompanies([]);
    renderWithProviders(<CompaniesPage />, { user: superAdmin, company: null });
    expect(await screen.findByText("Customer companies")).toBeInTheDocument();
    expect(await screen.findByText("No companies yet.")).toBeInTheDocument();
  });
});

describe("CompaniesView create", () => {
  it("creates a company with its first admin and devices, then reloads the list", async () => {
    serveCompanies([], [makeCompanyRow({ name: "New Co" })]);
    let body: unknown;
    server.use(
      http.post(`${API}/companies`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ _id: "c1" });
      })
    );
    const { user } = renderView();
    await screen.findByText("No companies yet.");
    await user.click(screen.getByRole("button", { name: "Add company" }));
    await user.type(screen.getByLabelText("Company name"), "New Co");
    await user.click(screen.getByRole("checkbox", { name: "Bonuses" }));
    await user.type(screen.getByLabelText(/ZKTeco device serials/), "ZK1, Main, door{enter}{enter}ZK2");
    await user.type(screen.getByLabelText("Name"), "Boss");
    await user.type(screen.getByLabelText("Email"), "boss@new.co");
    await user.type(screen.getByLabelText(/Temporary password/), "secret123");
    await user.click(screen.getByRole("button", { name: "Create company" }));

    expect(await screen.findByText("New Co")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create company" })).not.toBeInTheDocument();
    expect(body).toEqual({
      name: "New Co",
      features: ["planning", "clockin", "faceRecognition", "reporting", "advances"],
      devices: [
        { serial: "ZK1", name: "Main, door" },
        { serial: "ZK2" },
      ],
      admin: { name: "Boss", email: "boss@new.co", password: "secret123" },
    });
  });

  it("keeps the form open and shows the server's validation error", async () => {
    serveCompanies([]);
    server.use(
      http.post(`${API}/companies`, () =>
        HttpResponse.json({ message: ["password must be longer than or equal to 8 characters"] }, { status: 400 })
      )
    );
    const { user } = renderView();
    await user.click(screen.getByRole("button", { name: "Add company" }));
    await user.type(screen.getByLabelText("Company name"), "X");
    await user.click(screen.getByRole("checkbox", { name: "Planning & shifts" }));
    await user.click(screen.getByRole("button", { name: "Create company" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("password must be longer than or equal to 8 characters");
    expect(screen.getByLabelText("Company name")).toHaveValue("X");
  });

  it("can be cancelled", async () => {
    serveCompanies([]);
    const { user } = renderView();
    await user.click(screen.getByRole("button", { name: "Add company" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Company name")).not.toBeInTheDocument();
  });
});

describe("CompaniesView edit", () => {
  it("saves features, devices, slug and branding", async () => {
    serveCompanies(
      [makeCompanyRow({ devices: [{ serial: "ZK1", name: "Front" }, { serial: "ZK2" }], branding: { title: "Roma" } })],
      [makeCompanyRow({ name: "Pizza Roma", slug: "pizza-roma" })]
    );
    let body: Record<string, unknown> | undefined;
    server.use(
      http.patch(`${API}/companies/c1`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({});
      })
    );
    const { user } = renderView();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText(/ZKTeco device serials/)).toHaveValue("ZK1, Front\nZK2");
    await user.click(screen.getByRole("checkbox", { name: "Advances" }));
    await user.type(screen.getByLabelText(/ZKTeco device serials/), "{enter}ZK3");
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Roma!");
    await user.type(screen.getByLabelText("Sign-in link name"), "Pizza-Roma");
    expect(screen.getByText("https://app.test/signin?company=pizza-roma")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Welcome text"), "Hello team");
    fireEvent.input(screen.getByLabelText("Colour"), { target: { value: "#ff0000" } });
    expect(screen.getAllByText("Hello team").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("/signin?company=pizza-roma");
    expect(body).toEqual({
      features: ["planning", "clockin", "faceRecognition", "reporting", "bonuses"],
      devices: [{ serial: "ZK1", name: "Front" }, { serial: "ZK2" }, { serial: "ZK3" }],
      slug: "pizza-roma",
      branding: { title: "Roma!", subtitle: "Hello team", color: "#ff0000" },
    });
  });

  it("doesn't send an empty slug", async () => {
    serveCompanies([makeCompanyRow()]);
    let body: Record<string, unknown> | undefined;
    server.use(
      http.patch(`${API}/companies/c1`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({});
      })
    );
    const { user } = renderView();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.type(screen.getByLabelText("Sign-in link name"), "   ");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(body).toBeDefined());
    expect(body).not.toHaveProperty("slug");
  });

  it("shows the server's error, e.g. a slug already taken", async () => {
    serveCompanies([makeCompanyRow()]);
    server.use(http.patch(`${API}/companies/c1`, () => HttpResponse.json({ message: "Slug already in use" }, { status: 409 })));
    const { user } = renderView();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.type(screen.getByLabelText("Sign-in link name"), "taken");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Slug already in use");
    expect(screen.getByLabelText("Sign-in link name")).toBeInTheDocument();
  });

  it("can be cancelled without saving", async () => {
    serveCompanies([makeCompanyRow()]);
    const { user } = renderView();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Sign-in link name")).not.toBeInTheDocument();
  });

  it("closes with the Escape key", async () => {
    serveCompanies([makeCompanyRow()]);
    const { user } = renderView();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("Sign-in link name")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add company" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("Company name")).not.toBeInTheDocument();
  });

  it("accepts a small PNG logo and lets it be removed", async () => {
    serveCompanies([makeCompanyRow()]);
    const { user } = renderView();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const file = new File(["png"], "logo.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Upload logo"), file);
    await waitFor(() => expect(screen.getByAltText("Logo preview").getAttribute("src")).toMatch(/^data:image\/png/));
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByAltText("Logo preview")).toHaveAttribute("src", "/images/logo/King.png");
  });

  it("refuses a logo that isn't an image", async () => {
    serveCompanies([makeCompanyRow()]);
    const { user } = renderWithProviders(<CompaniesView />, { user: superAdmin, company: null });
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const input = screen.getByLabelText("Upload logo");
    fireEvent.change(input, { target: { files: [new File(["x"], "doc.pdf", { type: "application/pdf" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Logo must be a PNG, JPEG, WebP or SVG image.");
  });

  it("refuses a logo over 300 KB", async () => {
    serveCompanies([makeCompanyRow()]);
    const { user } = renderView();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const big = new File([new Uint8Array(300 * 1024 + 1)], "big.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Upload logo"), { target: { files: [big] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Logo must be under 300 KB.");
  });

  it("ignores an empty file selection", async () => {
    serveCompanies([makeCompanyRow()]);
    const { user } = renderView();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Upload logo"), { target: { files: [] } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("CompaniesView suspend / reactivate", () => {
  it("asks before suspending and does nothing when cancelled", async () => {
    serveCompanies([makeCompanyRow()]);
    const patch = vi.fn();
    server.use(http.patch(`${API}/companies/c1`, () => { patch(); return HttpResponse.json({}); }));
    const { user } = renderView();
    await user.click(await screen.findByRole("button", { name: "Suspend" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Suspend Pizza Roma?");
    await answerConfirmDialog(false);
    expect(patch).not.toHaveBeenCalled();
  });

  it("suspends after confirmation", async () => {
    serveCompanies([makeCompanyRow()], [makeCompanyRow({ active: false })]);
    let body: unknown;
    server.use(http.patch(`${API}/companies/c1`, async ({ request }) => { body = await request.json(); return HttpResponse.json({}); }));
    const { user } = renderView();
    await user.click(await screen.findByRole("button", { name: "Suspend" }));
    await answerConfirmDialog(true);
    expect(await screen.findByText("Pizza Roma suspended.")).toBeInTheDocument();
    expect(body).toEqual({ active: false });
    expect(screen.getByRole("button", { name: "Reactivate" })).toBeInTheDocument();
  });

  it("reactivates without asking", async () => {
    serveCompanies([makeCompanyRow({ active: false })], [makeCompanyRow()]);
    let body: unknown;
    server.use(http.patch(`${API}/companies/c1`, async ({ request }) => { body = await request.json(); return HttpResponse.json({}); }));
    const { user } = renderView();
    await user.click(await screen.findByRole("button", { name: "Reactivate" }));
    expect(await screen.findByText("Pizza Roma reactivated.")).toBeInTheDocument();
    expect(body).toEqual({ active: true });
  });

  it.each([
    [true, "Suspend", "Couldn't suspend the company"],
    [false, "Reactivate", "Couldn't reactivate the company"],
  ])("shows an error toast when the change fails (active=%s)", async (active, button, message) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    serveCompanies([makeCompanyRow({ active })]);
    server.use(http.patch(`${API}/companies/c1`, () => HttpResponse.json({ message: "Nope" }, { status: 400 })));
    const { user } = renderView();
    await user.click(await screen.findByRole("button", { name: button }));
    if (active) await answerConfirmDialog(true);
    expect(await screen.findByText(`${message}. Nope`)).toBeInTheDocument();
  });
});
