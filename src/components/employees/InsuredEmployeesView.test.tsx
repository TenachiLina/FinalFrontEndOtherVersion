import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import InsuredEmployeesView from "./InsuredEmployeesView";
import { API, server } from "@/test/server";
import { answerConfirmDialog, renderWithProviders, screen, waitFor, within } from "@/test/render";
import { dismissToast, getToasts } from "@/lib/notify";

const ali = { _id: "ali", empNumber: 101, firstName: "Ali", lastName: "Zerrouki", baseSalary: 40000 };
const sara = {
  _id: "sara", empNumber: 102, firstName: "Sara", lastName: "Amrani", baseSalary: 35000,
  insured: true, declaredSalary: 24000, socialSecurityNumber: "111111111111",
};
const other = { _id: "other", empNumber: 103, firstName: "Other", lastName: "Manager", otherManager: true };

let puts: { url: string; body: unknown }[];

beforeEach(() => {
  puts = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  server.use(
    http.get(`${API}/employees`, () => HttpResponse.json([ali, sara, other])),
    http.put(`${API}/employees/:id`, async ({ request }) => {
      puts.push({ url: request.url.replace(API, ""), body: await request.json() });
      return HttpResponse.json({});
    })
  );
});

afterEach(() => getToasts().forEach((t) => dismissToast(t.id)));

const open = async () => {
  const result = renderWithProviders(<InsuredEmployeesView />);
  await screen.findByText("Sara Amrani");
  return result;
};

describe("Insured employees", () => {
  it("lists only insured employees, with their declared salary and number", async () => {
    await open();
    const row = screen.getByRole("row", { name: /Sara Amrani/ });
    expect(row).toHaveTextContent("24");
    expect(row).toHaveTextContent("111111111111");
    expect(screen.queryByRole("row", { name: /Ali Zerrouki/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a new insured employee" })).toHaveAttribute("href", "/insured-employees/new");
  });

  it("marks an existing employee as insured", async () => {
    const { user } = await open();
    const picker = screen.getByLabelText("Employee");
    // Only employees not yet insured, and never another manager
    expect(within(picker).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Choose an employee",
      "101 — Ali Zerrouki",
    ]);
    await user.selectOptions(picker, "ali");
    await user.type(screen.getByLabelText("Declared salary: *"), "20000");
    await user.type(screen.getByLabelText("Insurance number (N° SS):"), "111");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(puts).toEqual([
        { url: "/employees/ali", body: { insured: true, declaredSalary: 20000, socialSecurityNumber: "111" } },
      ])
    );
    expect(await screen.findByRole("row", { name: /Ali Zerrouki/ })).toBeInTheDocument();
  });

  it("asks for an employee and a declared salary", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose an employee.");
    await user.selectOptions(screen.getByLabelText("Employee"), "ali");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter the declared salary.");
    expect(puts).toEqual([]);
  });

  it("edits an insured employee's details", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Edit Sara Amrani" }));
    const salary = screen.getByLabelText("Declared salary: *");
    expect(salary).toHaveValue(24000);
    await user.clear(salary);
    await user.type(salary, "26000");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(puts).toEqual([
        { url: "/employees/sara", body: { insured: true, declaredSalary: 26000, socialSecurityNumber: "111111111111" } },
      ])
    );
  });

  it("removes an employee from the list after confirming, keeping their number", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Remove Sara Amrani" }));
    await answerConfirmDialog(true);
    await waitFor(() =>
      expect(puts).toEqual([{ url: "/employees/sara", body: { insured: false, declaredSalary: null } }])
    );
    await waitFor(() => expect(screen.queryByRole("row", { name: /Sara Amrani/ })).not.toBeInTheDocument());
  });
});
