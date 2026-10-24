import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import UsersView from "./UsersView";
import UsersPage from "@/app/(admin)/users/page";
import { API, server } from "@/test/server";
import { answerConfirmDialog, renderWithProviders, screen, waitFor, within } from "@/test/render";
import type { Role } from "@/lib/auth";

interface UserRow {
  _id: string;
  name: string;
  email: string;
  role: Role;
  companyId: string | null;
  active: boolean;
  employeeId?: string | null;
}

function makeUserRow(overrides: Partial<UserRow> = {}): UserRow {
  return { _id: "u2", name: "Mia Manager", email: "mia@test.dz", role: "manager", companyId: "c1", active: true, employeeId: null, ...overrides };
}

const me = makeUserRow({ _id: "u1", name: "Admin", email: "admin@test.dz", role: "admin" });
const employees = [
  { _id: "e2", empNumber: 2, firstName: "Zoe", lastName: "Z" },
  { _id: "e1", empNumber: 1, firstName: "Ali", lastName: "A" },
];

/** Answers GET /users with each list in turn (the last one repeats). */
function serveUsers(...lists: UserRow[][]) {
  let call = 0;
  server.use(
    http.get(`${API}/users`, () => HttpResponse.json(lists[Math.min(call++, lists.length - 1)])),
    http.get(`${API}/employees`, () => HttpResponse.json(employees))
  );
}

/** Records the body of every request to `method path`. */
function capture(method: "post" | "patch" | "delete", path: string, response: () => Response = () => HttpResponse.json({})) {
  const bodies: unknown[] = [];
  server.use(
    http[method](`${API}${path}`, async ({ request }) => {
      bodies.push(method === "delete" ? null : await request.json());
      return response();
    })
  );
  return bodies;
}

const rowOf = (name: string) => screen.getByText(name).closest("tr")!;

describe("UsersView list", () => {
  it("lists users with their role, linked employee and status", async () => {
    serveUsers([me, makeUserRow({ employeeId: "e1" }), makeUserRow({ _id: "u3", name: "Kiosk", role: "employee", active: false })]);
    renderWithProviders(<UsersView />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    await screen.findByText("Mia Manager");
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Role for Mia Manager")).toHaveValue("manager");
    expect(screen.getByLabelText("Employee record of Mia Manager")).toHaveValue("e1");
    expect(screen.getByLabelText("Role for Kiosk")).toHaveValue("employee");
    expect(within(rowOf("Kiosk")).getByText("Disabled")).toBeInTheDocument();
    expect(within(rowOf("Kiosk")).getByText("—")).toBeInTheDocument();
    expect(within(rowOf("Kiosk")).getByRole("button", { name: "Enable" })).toBeInTheDocument();
  });

  it("sorts the employees by name in the link list", async () => {
    serveUsers([makeUserRow()]);
    renderWithProviders(<UsersView />);
    const select = await screen.findByLabelText("Employee record of Mia Manager");
    const labels = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(labels).toEqual(["Not linked", "Ali A (#1)", "Zoe Z (#2)"]);
  });

  it("marks employees already linked to another manager as taken", async () => {
    serveUsers([makeUserRow({ employeeId: "e1" }), makeUserRow({ _id: "u3", name: "Sam" })]);
    renderWithProviders(<UsersView />);
    const select = await screen.findByLabelText("Employee record of Sam");
    const ali = within(select).getByRole("option", { name: "Ali A (#1) — Mia Manager" });
    expect(ali).toBeDisabled();
    // Not taken for the manager it is linked to
    expect(within(screen.getByLabelText("Employee record of Mia Manager")).getByRole("option", { name: "Ali A (#1)" })).toBeEnabled();
  });

  it("doesn't let you change your own role, disable or delete yourself", async () => {
    serveUsers([me]);
    renderWithProviders(<UsersView />);
    const row = (await screen.findByText("(you)")).closest("tr")!;
    expect(within(row).getByLabelText("Role for Admin")).toBeDisabled();
    expect(within(row).queryByRole("button", { name: "Disable" })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Reset password" })).toBeInTheDocument();
  });

  it("never offers the super admin role", async () => {
    serveUsers([makeUserRow()]);
    renderWithProviders(<UsersView />);
    const select = await screen.findByLabelText("Role for Mia Manager");
    expect(within(select).getAllByRole("option").map((o) => o.getAttribute("value"))).toEqual(["admin", "manager", "employee"]);
  });

  it("still lists users when the employee list can't be loaded", async () => {
    server.use(
      http.get(`${API}/users`, () => HttpResponse.json([makeUserRow()])),
      http.get(`${API}/employees`, () => HttpResponse.json({ message: "Forbidden" }, { status: 403 }))
    );
    renderWithProviders(<UsersView />);
    const select = await screen.findByLabelText("Employee record of Mia Manager");
    expect(within(select).getAllByRole("option")).toHaveLength(1);
  });

  it("shows the error when users can't be loaded", async () => {
    server.use(
      http.get(`${API}/users`, () => HttpResponse.json({ message: "Admins only" }, { status: 403 })),
      http.get(`${API}/employees`, () => HttpResponse.json([]))
    );
    renderWithProviders(<UsersView />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Admins only");
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("renders inside the Users page", async () => {
    serveUsers([]);
    renderWithProviders(<UsersPage />);
    expect(await screen.findByText("App users")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
  });
});

describe("UsersView create", () => {
  it("creates a manager linked to an employee", async () => {
    serveUsers([], [makeUserRow({ name: "Nina" })]);
    const bodies = capture("post", "/users");
    const { user } = renderWithProviders(<UsersView />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Add user" }));
    await user.type(screen.getByLabelText("Name"), "Nina");
    await user.type(screen.getByLabelText("Email"), "nina@test.dz");
    await user.type(screen.getByLabelText(/Temporary password/), "password1");
    await user.selectOptions(screen.getByLabelText("This manager is the employee"), "e2");
    await user.click(screen.getByRole("button", { name: "Create user" }));
    expect(await screen.findByText("Nina")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create user" })).not.toBeInTheDocument();
    expect(bodies).toEqual([{ name: "Nina", email: "nina@test.dz", password: "password1", role: "manager", employeeId: "e2" }]);
  });

  it("doesn't link an employee to an admin account", async () => {
    serveUsers([]);
    const bodies = capture("post", "/users");
    const { user } = renderWithProviders(<UsersView />);
    await user.click(screen.getByRole("button", { name: "Add user" }));
    await user.selectOptions(screen.getByLabelText("This manager is the employee"), "e1");
    await user.selectOptions(screen.getByLabelText("Role"), "admin");
    expect(screen.queryByLabelText("This manager is the employee")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create user" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ role: "admin", employeeId: null });
  });

  it("shows the server's validation errors and keeps the form open", async () => {
    serveUsers([]);
    capture("post", "/users", () =>
      HttpResponse.json({ message: ["email must be an email", "password too short"] }, { status: 400 })
    );
    const { user } = renderWithProviders(<UsersView />);
    await user.click(screen.getByRole("button", { name: "Add user" }));
    await user.type(screen.getByLabelText("Email"), "taken@test.dz");
    await user.click(screen.getByRole("button", { name: "Create user" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("email must be an email, password too short");
    expect(screen.getByRole("button", { name: "Create user" })).toBeEnabled();
  });

  it("closes the dialogs with the Escape key", async () => {
    serveUsers([makeUserRow()]);
    const { user } = renderWithProviders(<UsersView />);
    await user.click(await screen.findByRole("button", { name: "Reset password" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText(/New password/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add user" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Create user" })).not.toBeInTheDocument();
  });

  it("can be cancelled", async () => {
    serveUsers([]);
    const { user } = renderWithProviders(<UsersView />);
    await user.click(screen.getByRole("button", { name: "Add user" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Create user" })).not.toBeInTheDocument();
  });
});

describe("UsersView changes", () => {
  it("changes a user's role", async () => {
    serveUsers([makeUserRow()], [makeUserRow({ role: "admin" })]);
    const bodies = capture("patch", "/users/u2");
    const { user } = renderWithProviders(<UsersView />);
    await user.selectOptions(await screen.findByLabelText("Role for Mia Manager"), "admin");
    await waitFor(() => expect(screen.getByLabelText("Role for Mia Manager")).toHaveValue("admin"));
    expect(bodies).toEqual([{ role: "admin" }]);
  });

  it("links and unlinks the manager's employee record", async () => {
    serveUsers([makeUserRow()], [makeUserRow({ employeeId: "e2" })], [makeUserRow()]);
    const bodies = capture("patch", "/users/u2");
    const { user } = renderWithProviders(<UsersView />);
    const select = await screen.findByLabelText("Employee record of Mia Manager");
    await user.selectOptions(select, "e2");
    await waitFor(() => expect(select).toHaveValue("e2"));
    await user.selectOptions(select, "");
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies).toEqual([{ employeeId: "e2" }, { employeeId: null }]);
  });

  it("disables and enables a user", async () => {
    serveUsers([makeUserRow()], [makeUserRow({ active: false })]);
    const bodies = capture("patch", "/users/u2");
    const { user } = renderWithProviders(<UsersView />);
    await user.click(await screen.findByRole("button", { name: "Disable" }));
    expect(await screen.findByRole("button", { name: "Enable" })).toBeInTheDocument();
    expect(bodies).toEqual([{ active: false }]);
  });

  it("shows a toast when a change is refused", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    serveUsers([makeUserRow()]);
    capture("patch", "/users/u2", () => HttpResponse.json({ message: "Last admin can't be demoted" }, { status: 409 }));
    const { user } = renderWithProviders(<UsersView />);
    await user.click(await screen.findByRole("button", { name: "Disable" }));
    expect(await screen.findByText("Couldn't update the user. Last admin can't be demoted")).toBeInTheDocument();
  });

  it("deletes a user after confirmation", async () => {
    serveUsers([makeUserRow()], []);
    const deletes = capture("delete", "/users/u2", () => new HttpResponse(null, { status: 204 }));
    const { user } = renderWithProviders(<UsersView />);
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Delete Mia Manager?");
    await answerConfirmDialog(true);
    await waitFor(() => expect(screen.queryByText("Mia Manager")).not.toBeInTheDocument());
    expect(deletes).toHaveLength(1);
  });

  it("keeps the user when the delete is cancelled", async () => {
    serveUsers([makeUserRow()]);
    const deletes = capture("delete", "/users/u2");
    const { user } = renderWithProviders(<UsersView />);
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await answerConfirmDialog(false);
    expect(screen.getByText("Mia Manager")).toBeInTheDocument();
    expect(deletes).toHaveLength(0);
  });
});

describe("UsersView password reset", () => {
  it("sets a new password for a user", async () => {
    serveUsers([makeUserRow()]);
    const bodies = capture("post", "/users/u2/password");
    const { user } = renderWithProviders(<UsersView />);
    await user.click(await screen.findByRole("button", { name: "Reset password" }));
    expect(screen.getByText("Reset password for Mia Manager")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/New password/), "newpass99");
    await user.click(screen.getByRole("button", { name: "Set password" }));
    expect(await screen.findByText("Password updated for Mia Manager.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/New password/)).not.toBeInTheDocument();
    expect(bodies).toEqual([{ password: "newpass99" }]);
  });

  it("keeps the dialog open and explains a refused password", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    serveUsers([makeUserRow()]);
    capture("post", "/users/u2/password", () => HttpResponse.json({ message: "Password too short" }, { status: 400 }));
    const { user } = renderWithProviders(<UsersView />);
    await user.click(await screen.findByRole("button", { name: "Reset password" }));
    await user.type(screen.getByLabelText(/New password/), "x");
    await user.click(screen.getByRole("button", { name: "Set password" }));
    expect(await screen.findByText("Couldn't reset the password. Password too short")).toBeInTheDocument();
    expect(screen.getByLabelText(/New password/)).toHaveValue("x");
  });

  // BUG-601: a password typed then cancelled is pre-filled when resetting another user's password
  it.fails("starts with an empty password for the next user after a cancelled reset", async () => {
    serveUsers([makeUserRow(), makeUserRow({ _id: "u3", name: "Sam" })]);
    const { user } = renderWithProviders(<UsersView />);
    await screen.findByText("Sam");
    await user.click(within(rowOf("Mia Manager")).getByRole("button", { name: "Reset password" }));
    await user.type(screen.getByLabelText(/New password/), "meant-for-mia");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(within(rowOf("Sam")).getByRole("button", { name: "Reset password" }));
    expect(screen.getByLabelText(/New password/)).toHaveValue("");
  });
});
