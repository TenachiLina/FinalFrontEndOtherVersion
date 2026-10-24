import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import EmployeeDataForm from "./page";
import AddEmployeePage from "../add-employee/page";
import { API, server } from "@/test/server";
import { router } from "@/test/navigation";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/test/render";

type User = ReturnType<typeof renderWithProviders>["user"];

/** Records each POST /employees body and answers with `response`. */
function serveCreate(response: () => Response = () => HttpResponse.json({ _id: "e1" })) {
  const bodies: unknown[] = [];
  server.use(
    http.post(`${API}/employees`, async ({ request }) => {
      bodies.push(await request.json());
      return response();
    })
  );
  return bodies;
}

async function fillRequired(user: User, { num = "101", first = "Amina", last = "Bouzenada", salary = "50000" } = {}) {
  if (num) await user.type(screen.getByLabelText("Employee Number: *"), num);
  if (first) await user.type(screen.getByLabelText("First Name: *"), first);
  if (last) await user.type(screen.getByLabelText("Last Name: *"), last);
  if (salary) await user.type(screen.getByLabelText("Base Salary: *"), salary);
}

const save = (user: User) => user.click(screen.getByRole("button", { name: "Save" }));
const photoInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;

describe("Add employee form", () => {
  it("says what is missing, focuses the first problem and sends nothing", async () => {
    const bodies = serveCreate();
    const { user } = renderWithProviders(<EmployeeDataForm />);
    await save(user);
    expect(screen.getByText("Enter the employee number.")).toBeInTheDocument();
    expect(screen.getByText("Enter the first name.")).toBeInTheDocument();
    expect(screen.getByText("Enter the last name.")).toBeInTheDocument();
    expect(screen.getByText("Enter the base salary (0 if none).")).toBeInTheDocument();
    expect(screen.getByLabelText("Employee Number: *")).toHaveFocus();
    expect(screen.getByLabelText("Employee Number: *")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Employee Number: *")).toHaveAttribute("aria-describedby", "empNumber-error");
    expect(bodies).toHaveLength(0);
  });

  it("clears a field's message as soon as it is edited", async () => {
    const { user } = renderWithProviders(<EmployeeDataForm />);
    await save(user);
    await user.type(screen.getByLabelText("First Name: *"), "A");
    expect(screen.queryByText("Enter the first name.")).not.toBeInTheDocument();
    expect(screen.getByText("Enter the last name.")).toBeInTheDocument();
  });

  it.each([
    ["a number of 0", { num: "0" }, "Use a whole number above 0, e.g. 101."],
    ["a decimal number", { num: "1.5" }, "Use a whole number above 0, e.g. 101."],
    ["a negative salary", { salary: "-5" }, "Use a number of 0 or more."],
  ])("refuses %s", async (_label, values, message) => {
    const bodies = serveCreate();
    const { user } = renderWithProviders(<EmployeeDataForm />);
    await fillRequired(user, values);
    await save(user);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it("refuses a phone number with letters", async () => {
    const bodies = serveCreate();
    const { user } = renderWithProviders(<EmployeeDataForm />);
    await fillRequired(user);
    await user.type(screen.getByLabelText("Phone:"), "call me");
    await save(user);
    expect(screen.getByText("Use digits only, e.g. 0555123456.")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone:")).toHaveFocus();
    expect(bodies).toHaveLength(0);
  });

  it("adds the employee with a photo, confirms it and clears the form", async () => {
    const bodies = serveCreate();
    const { user } = renderWithProviders(<EmployeeDataForm />);
    await fillRequired(user, { salary: "0" });
    await user.type(screen.getByPlaceholderText("e.g. 12 Rue Didouche, Algiers"), "12 Rue Didouche");
    await user.type(screen.getByLabelText("Phone:"), "+213 555-123456");
    await user.upload(photoInput(), new File(["img"], "me.png", { type: "image/png" }));
    const preview = await screen.findByAltText("Preview");
    expect(preview.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
    await save(user);

    expect(await screen.findByText("Amina Bouzenada was added.")).toBeInTheDocument();
    expect(bodies).toEqual([
      {
        empNumber: 101,
        firstName: "Amina",
        lastName: "Bouzenada",
        baseSalary: 0,
        address: "12 Rue Didouche",
        phoneNumber: "+213 555-123456",
        personalImage: preview.getAttribute("src"),
      },
    ]);
    expect(screen.getByLabelText("Employee Number: *")).toHaveValue(null);
    expect(screen.getByLabelText("First Name: *")).toHaveValue("");
    expect(screen.queryByAltText("Preview")).not.toBeInTheDocument();
    expect(photoInput().value).toBe("");
  });

  it("leaves the optional fields out when they are empty", async () => {
    const bodies = serveCreate();
    const { user } = renderWithProviders(<EmployeeDataForm />);
    await fillRequired(user);
    await save(user);
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ empNumber: 101, firstName: "Amina", lastName: "Bouzenada", baseSalary: 50000 });
  });

  it("puts a duplicate employee number next to the number field", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    serveCreate(() => HttpResponse.json({ message: "An employee with employee number 101 already exists" }, { status: 409 }));
    const { user } = renderWithProviders(<EmployeeDataForm />);
    await fillRequired(user);
    await save(user);
    expect(await screen.findByText("Another employee already has this number.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("First Name: *")).toHaveValue("Amina");
  });

  it("shows other server errors in a banner and keeps what was typed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    serveCreate(() => HttpResponse.json({ message: "Salary is above the company limit" }, { status: 400 }));
    const { user } = renderWithProviders(<EmployeeDataForm />);
    await fillRequired(user);
    await save(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save the employee. Salary is above the company limit");
    expect(screen.getByLabelText("Last Name: *")).toHaveValue("Bouzenada");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("refuses a photo that isn't an image", async () => {
    renderWithProviders(<EmployeeDataForm />);
    fireEvent.change(photoInput(), { target: { files: [new File(["%PDF"], "cv.pdf", { type: "application/pdf" })] } });
    expect(screen.getByText("Choose an image file (JPG, PNG…).")).toBeInTheDocument();
    expect(photoInput()).toHaveAttribute("aria-invalid", "true");
  });

  it("refuses a photo over 500 KB, and accepts a smaller one after", async () => {
    renderWithProviders(<EmployeeDataForm />);
    fireEvent.change(photoInput(), { target: { files: [new File([new Uint8Array(500 * 1024 + 1)], "big.jpg", { type: "image/jpeg" })] } });
    expect(screen.getByText("This photo is too large. Use one under 500 KB.")).toBeInTheDocument();
    fireEvent.change(photoInput(), { target: { files: [new File(["img"], "small.jpg", { type: "image/jpeg" })] } });
    expect(screen.queryByText("This photo is too large. Use one under 500 KB.")).not.toBeInTheDocument();
    expect(await screen.findByAltText("Preview")).toBeInTheDocument();
  });

  it("ignores an empty photo selection", () => {
    renderWithProviders(<EmployeeDataForm />);
    fireEvent.change(photoInput(), { target: { files: [] } });
    expect(screen.queryByAltText("Preview")).not.toBeInTheDocument();
  });

  it("goes back on Cancel", async () => {
    const { user } = renderWithProviders(<EmployeeDataForm />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(router.back).toHaveBeenCalledOnce();
  });

  it("is also served at /add-employee", () => {
    renderWithProviders(<AddEmployeePage />);
    expect(screen.getByRole("heading", { name: "Add Employee" })).toBeInTheDocument();
  });
});
