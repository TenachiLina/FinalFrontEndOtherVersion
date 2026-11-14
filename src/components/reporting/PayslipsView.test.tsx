import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import PayslipsView from "./PayslipsView";
import { API, server } from "@/test/server";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import { dismissToast, getToasts } from "@/lib/notify";

const employee = { _id: "e1", empNumber: 101, firstName: "Ali", lastName: "Zerrouki", baseSalary: 24000 };

// What the server calculated for this employee: 24 000 × 9 % = 2 160
const amounts = { employeeId: "e1", empId: 101, days: 30, baseSalary: 24000, postSalary: 24000, socialSecurity: 2160, net: 21840 };

let puts: { url: string; body: unknown }[];
let monthsAsked: (string | null)[];
let patches: unknown[];

beforeEach(() => {
  puts = [];
  patches = [];
  monthsAsked = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  server.use(
    http.get(`${API}/employees`, () => HttpResponse.json([employee])),
    http.get(`${API}/payroll/payslips`, ({ request }) => {
      const month = new URL(request.url).searchParams.get("month");
      monthsAsked.push(month);
      return HttpResponse.json({ month, payslips: [amounts] });
    }),
    http.put(`${API}/employees/:id`, async ({ request }) => {
      puts.push({ url: request.url.replace(API, ""), body: await request.json() });
      return HttpResponse.json({});
    }),
    http.patch(`${API}/company`, async ({ request }) => {
      patches.push(await request.json());
      return HttpResponse.json({});
    })
  );
});

afterEach(() => getToasts().forEach((t) => dismissToast(t.id)));

const open = async (options = {}) => {
  const result = renderWithProviders(<PayslipsView />, options);
  await screen.findByRole("button", { name: "Edit Job title" });
  return result;
};

describe("editing the payslip by clicking it", () => {
  it("saves an empty employee field on the employee, and shows it", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Edit Job title" }));
    await user.type(screen.getByRole("textbox", { name: "Job title" }), "AGENT DE CUISINE{Enter}");

    await waitFor(() =>
      expect(puts).toEqual([{ url: "/employees/e1", body: { jobTitle: "AGENT DE CUISINE" } }])
    );
    expect(await screen.findByRole("button", { name: "Edit Job title" })).toHaveTextContent("AGENT DE CUISINE");
  });

  it("saves company details on the company", async () => {
    const { user } = await open({ user: { id: "u1", email: "a@b.c", name: "A", role: "admin", companyId: "c1" } });
    await user.click(screen.getByRole("button", { name: "Edit Contributor number" }));
    await user.type(screen.getByRole("textbox", { name: "Contributor number" }), "2573{Enter}");
    await waitFor(() => expect(patches).toEqual([{ settings: { payslipContributorNumber: "2573" } }]));
  });

  it("doesn't let a manager change company details", async () => {
    await open({ user: { id: "u2", email: "m@b.c", name: "M", role: "manager", companyId: "c1" } });
    expect(screen.queryByRole("button", { name: "Edit Contributor number" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Job title" })).toBeInTheDocument();
  });

  it("saves nothing on Escape", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Edit Job title" }));
    await user.type(screen.getByRole("textbox", { name: "Job title" }), "CHEF{Escape}");
    expect(await screen.findByRole("button", { name: "Edit Job title" })).toHaveTextContent("Click to fill in");
    expect(puts).toEqual([]);
  });

  it("picks the family status from a list", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Edit Family status" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Family status" }), "M");
    await waitFor(() => expect(puts).toEqual([{ url: "/employees/e1", body: { familyStatus: "M" } }]));
  });

  it("shows the amounts the server calculated, for the month on screen", async () => {
    await open();
    expect(await screen.findAllByText(/21[\s\u202f\u00a0.,]?840/)).not.toHaveLength(0);
    expect(monthsAsked.at(-1)).toMatch(/^\d{4}-\d{2}$/);
  });

  it("says so when the amounts can't be loaded, and shows no made-up amount", async () => {
    server.use(http.get(`${API}/payroll/payslips`, () => HttpResponse.json({ message: "No" }, { status: 500 })));
    await open();
    await waitFor(() => expect(getToasts().map((t) => t.kind)).toEqual(["error"]));
    expect(screen.queryByText(/21[\s\u202f\u00a0.,]?840/)).toBeNull();
  });

  it("says so when saving fails, and keeps the field empty", async () => {
    server.use(http.put(`${API}/employees/:id`, () => HttpResponse.json({ message: "No" }, { status: 500 })));
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Edit Job title" }));
    await user.type(screen.getByRole("textbox", { name: "Job title" }), "CHEF{Enter}");
    await waitFor(() => expect(getToasts()).toHaveLength(1));
    expect(await screen.findByRole("button", { name: "Edit Job title" })).toHaveTextContent("Click to fill in");
  });
});
