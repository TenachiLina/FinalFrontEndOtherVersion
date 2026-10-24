import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import BasicTableOne from "./BasicTableOne";
import { API, server } from "@/test/server";
import { answerConfirmDialog, renderWithProviders, screen, waitFor, within } from "@/test/render";
import { dismissToast, getToasts } from "@/lib/notify";

// These tests type into forms and wait for debounced saves: give them room on a busy machine.
vi.setConfig({ testTimeout: 20000 });

// ─── Data ─────────────────────────────────────────────────────────────────────

interface Employee {
  _id: string;
  empNumber: number;
  firstName: string;
  lastName: string;
  baseSalary: number;
  address?: string;
  phoneNumber?: string;
  personalImage?: string;
  otherManager?: boolean;
}

let nextId = 1;
const makeEmployee = (overrides: Partial<Employee> = {}): Employee => {
  const n = nextId++;
  return {
    _id: `e${n}`,
    empNumber: 100 + n,
    firstName: `First${n}`,
    lastName: `Last${n}`,
    baseSalary: 30000,
    ...overrides,
  };
};

const ali = () => makeEmployee({ _id: "ali", empNumber: 101, firstName: "Ali", lastName: "Zerrouki", baseSalary: 40000, address: "Oran", phoneNumber: "0550" });
const sara = () => makeEmployee({ _id: "sara", empNumber: 102, firstName: "Sara", lastName: "Amrani", baseSalary: 35000, address: "Alger", phoneNumber: "0660" });

let requests: { method: string; url: string; body: unknown }[];

function serve(list: Employee[]) {
  server.use(http.get(`${API}/employees`, () => HttpResponse.json(list)));
}

beforeEach(() => {
  nextId = 1;
  requests = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  const remember = async (request: Request) => {
    const text = await request.text();
    requests.push({ method: request.method, url: request.url.replace(API, ""), body: text ? JSON.parse(text) : undefined });
  };
  server.use(
    http.post(`${API}/employees`, async ({ request }) => {
      await remember(request);
      return HttpResponse.json({ _id: "new", ...(requests.at(-1)!.body as object) });
    }),
    http.put(`${API}/employees/:id`, async ({ request, params }) => {
      await remember(request);
      return HttpResponse.json({ _id: String(params.id), ...(requests.at(-1)!.body as object) });
    }),
    http.delete(`${API}/employees/:id`, async ({ request }) => {
      await remember(request);
      return HttpResponse.json({ deleted: true });
    })
  );
});

// Toasts live in a module-level store: clear them so one test can't see another's.
afterEach(() => getToasts().forEach((t) => dismissToast(t.id)));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const tableRows = () => within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row");
const firstNames = () => tableRows().map((r) => within(r).getAllByRole("cell")[2].textContent);

/** The drawer's labels aren't tied to their inputs (see BUG-204): find the input next to its label. */
const field = (label: string) => screen.getByText(label, { selector: "label" }).nextElementSibling as HTMLInputElement;

async function renderTable(list: Employee[]) {
  serve(list);
  const view = renderWithProviders(<BasicTableOne />, { url: "/basic-tables" });
  if (list.length) await screen.findByText(list[0].firstName);
  else await waitFor(() => expect(screen.queryByText("Loading employees…")).not.toBeInTheDocument());
  return view;
}

// ─── Loading ──────────────────────────────────────────────────────────────────

describe("BasicTableOne – loading", () => {
  it("shows a loading row, then the employees with their details", async () => {
    serve([ali()]);
    renderWithProviders(<BasicTableOne />);
    expect(screen.getByText("Loading employees…")).toBeInTheDocument();
    const row = (await screen.findByText("Ali")).closest("tr")!;
    expect(within(row).getByText("101")).toBeInTheDocument();
    expect(within(row).getByText("Zerrouki")).toBeInTheDocument();
    expect(within(row).getByText(`${(40000).toLocaleString()} DA`)).toBeInTheDocument();
    expect(within(row).getByText("Oran")).toBeInTheDocument();
    expect(within(row).getByText("0550")).toBeInTheDocument();
  });

  it("hides other managers' records", async () => {
    await renderTable([ali(), makeEmployee({ firstName: "Boss", otherManager: true })]);
    expect(screen.queryByText("Boss")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1–1 of 1 entries")).toBeInTheDocument();
  });

  it("shows initials without a photo and the photo when there is one", async () => {
    await renderTable([ali(), makeEmployee({ firstName: "Nadia", lastName: "Kaci", personalImage: "/nadia.png" })]);
    expect(screen.getByText("AZ")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Nadia" })).toHaveAttribute("src", "/nadia.png");
  });

  it("shows a dash for a missing address and phone", async () => {
    await renderTable([makeEmployee({ firstName: "Nadia" })]);
    expect(within(tableRows()[0]).getAllByText("—")).toHaveLength(2);
  });

  it("says when there are no employees", async () => {
    await renderTable([]);
    expect(screen.getByText("No employees found.")).toBeInTheDocument();
    expect(screen.getByText("Showing 0–0 of 0 entries")).toBeInTheDocument();
  });

  it("shows the reason when the list can't be loaded", async () => {
    server.use(http.get(`${API}/employees`, () => HttpResponse.json({ message: "Database offline" }, { status: 400 })));
    renderWithProviders(<BasicTableOne />);
    expect(await screen.findByText(/Couldn't load the employees/)).toHaveTextContent("Database offline");
  });
});

// ─── Search, sort, pages ──────────────────────────────────────────────────────

describe("BasicTableOne – search, sort and pages", () => {
  it.each([
    ["first name", "sara", ["Sara"]],
    ["last name", "zerr", ["Ali"]],
    ["employee number", "102", ["Sara"]],
    ["address", "oran", ["Ali"]],
    ["phone", "066", ["Sara"]],
  ])("searches by %s", async (_what, query, expected) => {
    const { user } = await renderTable([ali(), sara()]);
    await user.type(screen.getByPlaceholderText("Search..."), query);
    expect(firstNames()).toEqual(expected);
  });

  it("sorts by employee number, and reverses on a second click", async () => {
    const { user } = await renderTable([sara(), ali()]);
    expect(firstNames()).toEqual(["Ali", "Sara"]);
    await user.click(screen.getByRole("columnheader", { name: /Emp #/ }));
    expect(firstNames()).toEqual(["Sara", "Ali"]);
    await user.click(screen.getByRole("columnheader", { name: /Emp #/ }));
    expect(firstNames()).toEqual(["Ali", "Sara"]);
  });

  it("sorts by salary and by text columns", async () => {
    const { user } = await renderTable([ali(), sara()]);
    await user.click(screen.getByRole("columnheader", { name: /Base Salary/ }));
    expect(firstNames()).toEqual(["Sara", "Ali"]);
    await user.click(screen.getByRole("columnheader", { name: /Address/ }));
    expect(firstNames()).toEqual(["Sara", "Ali"]); // Alger < Oran
    await user.click(screen.getByRole("columnheader", { name: /Address/ }));
    expect(firstNames()).toEqual(["Ali", "Sara"]);
    await user.click(screen.getByRole("columnheader", { name: /First Name/ }));
    expect(firstNames()).toEqual(["Ali", "Sara"]);
  });

  it("keeps employees without a phone number in a phone sort", async () => {
    const { user } = await renderTable([ali(), makeEmployee({ firstName: "Nadia" })]);
    await user.click(screen.getByRole("columnheader", { name: /Phone/ }));
    expect(firstNames()).toEqual(["Nadia", "Ali"]);
  });

  it("doesn't sort on the photo or actions columns", async () => {
    const { user } = await renderTable([sara(), ali()]);
    await user.click(screen.getByRole("columnheader", { name: "Photo" }));
    await user.click(screen.getByRole("columnheader", { name: "Actions" }));
    expect(firstNames()).toEqual(["Ali", "Sara"]);
  });

  // BUG-201: clicking "Last Name" sorts by first name
  it.fails("sorts by last name from the Last Name header", async () => {
    const { user } = await renderTable([ali(), sara()]);
    await user.click(screen.getByRole("columnheader", { name: /Last Name/ }));
    expect(firstNames()).toEqual(["Sara", "Ali"]); // Amrani < Zerrouki
  });

  it("shows 5 per page and moves between pages", async () => {
    const list = Array.from({ length: 7 }, () => makeEmployee());
    const { user } = await renderTable(list);
    expect(tableRows()).toHaveLength(5);
    expect(screen.getByText("Showing 1–5 of 7 entries")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(firstNames()).toEqual(["First6", "First7"]);
    expect(screen.getByText("Showing 6–7 of 7 entries")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(tableRows()).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: "2" }));
    expect(tableRows()).toHaveLength(2);
  });

  it("goes back to page 1 when the page size or search changes", async () => {
    const list = Array.from({ length: 12 }, () => makeEmployee());
    const { user } = await renderTable(list);
    await user.click(screen.getByRole("button", { name: "3" }));
    await user.selectOptions(screen.getByRole("combobox"), "10");
    expect(screen.getByText("Showing 1–10 of 12 entries")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "2" }));
    await user.type(screen.getByPlaceholderText("Search..."), "First1");
    expect(screen.getByText("Showing 1–4 of 4 entries")).toBeInTheDocument(); // First1, First10-12
  });

  // BUG-203: deleting the only row of the last page leaves an empty page
  it.fails("shows the previous page after the last row of the last page is deleted", async () => {
    const list = Array.from({ length: 6 }, () => makeEmployee());
    const { user } = await renderTable(list);
    await user.click(screen.getByRole("button", { name: "2" }));
    await user.click(within(tableRows()[0]).getByRole("button", { name: "Delete" }));
    await answerConfirmDialog(true);
    await screen.findByText("Employee deleted.");
    expect(screen.queryByText("No employees found.")).not.toBeInTheDocument();
    expect(tableRows()).toHaveLength(5);
  });
});

// ─── Add / edit ───────────────────────────────────────────────────────────────

describe("BasicTableOne – add and edit", () => {
  it("adds an employee", async () => {
    const { user } = await renderTable([ali()]);
    await user.click(screen.getByRole("button", { name: "Add Employee" }));
    expect(screen.getByRole("heading", { name: "Add Employee" })).toBeInTheDocument();

    await user.type(field("Employee Number"), "150");
    await user.type(field("First Name"), "Nadia");
    await user.type(field("Last Name"), "Kaci");
    await user.type(field("Base Salary"), "32000");
    await user.type(field("Address"), "Blida");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Employee added.")).toBeInTheDocument();
    expect(requests).toEqual([
      {
        method: "POST",
        url: "/employees",
        body: { empNumber: 150, firstName: "Nadia", lastName: "Kaci", baseSalary: 32000, address: "Blida" },
      },
    ]);
    expect(screen.queryByRole("heading", { name: "Add Employee" })).not.toBeInTheDocument();
    expect(screen.getByText("Nadia")).toBeInTheDocument();
  });

  it("asks for the first and last name before saving", async () => {
    const { user } = await renderTable([ali()]);
    await user.click(screen.getByRole("button", { name: "Add Employee" }));
    await user.type(field("First Name"), "Nadia");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter the employee's first and last name.")).toBeInTheDocument();
    expect(requests).toEqual([]);
  });

  it("edits an employee with the form filled in", async () => {
    const { user } = await renderTable([ali()]);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Edit Employee" })).toBeInTheDocument();
    expect(field("First Name")).toHaveValue("Ali");
    expect(field("Phone")).toHaveValue("0550");

    await user.clear(field("Base Salary"));
    await user.type(field("Base Salary"), "45000");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByText("Employee updated.")).toBeInTheDocument();
    expect(requests[0]).toEqual({
      method: "PUT",
      url: "/employees/ali",
      body: { empNumber: 101, firstName: "Ali", lastName: "Zerrouki", baseSalary: 45000, address: "Oran", phoneNumber: "0550" },
    });
    expect(screen.getByText(`${(45000).toLocaleString()} DA`)).toBeInTheDocument();
  });

  it("starts an empty form after editing", async () => {
    const { user } = await renderTable([makeEmployee({ firstName: "Nadia", personalImage: "/n.png" })]);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(field("Address")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Add Employee" }));
    expect(field("First Name")).toHaveValue("");
  });

  it("closes the drawer with the close button or by clicking outside", async () => {
    const { user, container } = await renderTable([ali()]);
    await user.click(screen.getByRole("button", { name: "Add Employee" }));
    const heading = screen.getByRole("heading", { name: "Add Employee" });
    await user.click(heading.nextElementSibling as HTMLElement);
    expect(screen.queryByRole("heading", { name: "Add Employee" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add Employee" }));
    await user.click(container.querySelector(".backdrop-blur-sm") as HTMLElement);
    expect(screen.queryByRole("heading", { name: "Add Employee" })).not.toBeInTheDocument();
  });

  it("shows why a save failed inside the drawer", async () => {
    server.use(http.post(`${API}/employees`, () => HttpResponse.json({ message: "Number already used" }, { status: 409 })));
    const { user } = await renderTable([ali()]);
    await user.click(screen.getByRole("button", { name: "Add Employee" }));
    await user.type(field("First Name"), "Nadia");
    await user.type(field("Last Name"), "Kaci");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const drawer = screen.getByRole("heading", { name: "Add Employee" }).parentElement!.parentElement!;
    expect(await within(drawer).findByText(/Number already used/)).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "Save" })).toBeEnabled();
  });

  // BUG-202: after a failed save, closing the drawer leaves the table showing the error instead of the employees
  it.fails("still lists the employees after a failed save is cancelled", async () => {
    server.use(http.post(`${API}/employees`, () => HttpResponse.json({ message: "Number already used" }, { status: 409 })));
    const { user } = await renderTable([ali()]);
    await user.click(screen.getByRole("button", { name: "Add Employee" }));
    await user.type(field("First Name"), "Nadia");
    await user.type(field("Last Name"), "Kaci");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Ali")).toBeInTheDocument();
  });

  // BUG-204: the drawer's labels aren't linked to their inputs, so screen readers announce unnamed fields
  it.fails("names each form field by its label", async () => {
    const { user } = await renderTable([ali()]);
    await user.click(screen.getByRole("button", { name: "Add Employee" }));
    expect(screen.getByLabelText("First Name")).toBeInTheDocument();
  });
});

// ─── Delete ───────────────────────────────────────────────────────────────────

describe("BasicTableOne – delete", () => {
  it("asks before deleting, and does nothing when cancelled", async () => {
    const { user } = await renderTable([ali()]);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Delete Ali Zerrouki?");
    expect(dialog).toHaveTextContent("This removes the employee from the app. This can't be undone.");
    await answerConfirmDialog(false);
    expect(requests).toEqual([]);
    expect(screen.getByText("Ali")).toBeInTheDocument();
  });

  it("deletes the employee once confirmed", async () => {
    const { user } = await renderTable([ali(), sara()]);
    await user.click(within(screen.getByText("Ali").closest("tr")!).getByRole("button", { name: "Delete" }));
    await answerConfirmDialog(true);
    expect(await screen.findByText("Employee deleted.")).toBeInTheDocument();
    expect(requests).toEqual([{ method: "DELETE", url: "/employees/ali", body: undefined }]);
    expect(firstNames()).toEqual(["Sara"]);
  });

  it("keeps the employee and explains when the delete fails", async () => {
    server.use(http.delete(`${API}/employees/:id`, () => HttpResponse.json({ message: "Has worktime records" }, { status: 409 })));
    const { user } = await renderTable([ali()]);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await answerConfirmDialog(true);
    expect(await screen.findByText(/Has worktime records/)).toBeInTheDocument();
    expect(screen.getByText("Ali")).toBeInTheDocument();
  });
});
