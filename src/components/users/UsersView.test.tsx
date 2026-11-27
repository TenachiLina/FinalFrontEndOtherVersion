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

  it("shows a mobile app employee with the employee it belongs to", async () => {
    serveUsers([me, makeUserRow({ _id: "u4", name: "Ali App", role: "staff", employeeId: "e1" })]);
    renderWithProviders(<UsersView />);
    expect(await screen.findByLabelText("Role for Ali App")).toHaveValue("staff");
    const link = screen.getByLabelText("Employee record of Ali App");
    expect(link).toHaveValue("e1");
    // Always linked: no "Not linked" choice
    expect(within(link).queryByRole("option", { name: "Not linked" })).not.toBeInTheDocument();
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
    expect(within(select).getAllByRole("option").map((o) => o.getAttribute("value"))).toEqual(["admin", "manager", "employee", "staff"]);
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

  it("creates a mobile app employee account linked to an employee", async () => {
    serveUsers([], [makeUserRow({ _id: "u5", name: "Zoe", role: "staff", employeeId: "e2" })]);
    const bodies = capture("post", "/users");
    const { user } = renderWithProviders(<UsersView />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Add user" }));
    await user.type(screen.getByLabelText("Name"), "Zoe");
    await user.type(screen.getByLabelText("Email"), "zoe@test.dz");
    await user.type(screen.getByLabelText(/Temporary password/), "password1");
    await user.selectOptions(screen.getByLabelText("Role"), "staff");
    expect(screen.queryByLabelText("This manager is the employee")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("This account is for the employee"), "e2");
    await user.click(screen.getByRole("button", { name: "Create user" }));
    expect(await screen.findByText("Zoe")).toBeInTheDocument();
    expect(bodies).toEqual([{ name: "Zoe", email: "zoe@test.dz", password: "password1", role: "staff", employeeId: "e2" }]);
  });

  it("asks for the employee before creating a mobile app employee account", async () => {
    serveUsers([]);
    const bodies = capture("post", "/users");
    const { user } = renderWithProviders(<UsersView />);
    await user.click(screen.getByRole("button", { name: "Add user" }));
    await user.selectOptions(screen.getByLabelText("Role"), "staff");
    await user.click(screen.getByRole("button", { name: "Create user" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose the employee this account belongs to");
    expect(bodies).toEqual([]);
    expect(screen.getByRole("button", { name: "Create user" })).toBeEnabled();
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
  it("starts with an empty password for the next user after a cancelled reset", async () => {
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

describe("UsersView sign-in details for mobile app employees", () => {
  const amineEmployee = { _id: "e9", empNumber: 9, firstName: "Amine", lastName: "B", phoneNumber: "0550 12 34 56" };
  const staffRow = makeUserRow({ _id: "u9", name: "Amine", email: "amine@test.dz", role: "staff", employeeId: "e9" });

  function serveWithPhone(...lists: UserRow[][]) {
    serveUsers(...lists);
    server.use(http.get(`${API}/employees`, () => HttpResponse.json([...employees, amineEmployee])));
  }

  it("shows them right after creating the account, ready to send by WhatsApp to the employee's phone", async () => {
    serveWithPhone([], [staffRow]);
    capture("post", "/users");
    const { user } = renderWithProviders(<UsersView />);
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Add user" }));
    await user.type(screen.getByLabelText("Name"), "Amine");
    await user.type(screen.getByLabelText("Email"), "Amine@Test.dz");
    await user.type(screen.getByLabelText(/Temporary password/), "Good-pass-42");
    await user.selectOptions(screen.getByLabelText("Role"), "staff");
    await user.selectOptions(screen.getByLabelText("This account is for the employee"), "e9");
    await user.click(screen.getByRole("button", { name: "Create user" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Send sign-in details to Amine")).toBeInTheDocument();
    expect(within(dialog).getByTestId("share-email")).toHaveTextContent("amine@test.dz");
    expect(within(dialog).getByTestId("share-password")).toHaveTextContent("Good-pass-42");
    const message = (within(dialog).getByLabelText("Message") as HTMLTextAreaElement).value;
    expect(message).toContain("Temporary password: Good-pass-42");
    const whatsapp = within(dialog).getByRole("link", { name: "WhatsApp" });
    expect(whatsapp.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/213550123456\?text=/);
    expect(decodeURIComponent(whatsapp.getAttribute("href")!)).toContain("Good-pass-42");
    expect(within(dialog).getByRole("link", { name: "SMS" })).toHaveAttribute("href", expect.stringMatching(/^sms:\+213550123456\?body=/));
    expect(within(dialog).getByRole("link", { name: "Email" })).toHaveAttribute("href", expect.stringMatching(/^mailto:amine%40test\.dz\?subject=/));

    // The message can be switched to French or Arabic
    await user.click(within(dialog).getByRole("button", { name: "Français" }));
    expect((within(dialog).getByLabelText("Message") as HTMLTextAreaElement).value).toContain("Mot de passe provisoire : Good-pass-42");
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("aren't offered for other roles", async () => {
    serveUsers([], [makeUserRow({ name: "Nina" })]);
    capture("post", "/users");
    const { user } = renderWithProviders(<UsersView />);
    await user.click(await screen.findByRole("button", { name: "Add user" }));
    await user.type(screen.getByLabelText("Name"), "Nina");
    await user.type(screen.getByLabelText("Email"), "nina@test.dz");
    await user.type(screen.getByLabelText(/Temporary password/), "password1");
    await user.click(screen.getByRole("button", { name: "Create user" }));
    expect(await screen.findByText("Nina")).toBeInTheDocument();
    expect(screen.queryByText(/Send sign-in details to/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send sign-in details" })).not.toBeInTheDocument();
  });

  it("are sent again with a new temporary password, after a warning", async () => {
    serveWithPhone([me, staffRow]);
    const bodies = capture("post", "/users/u9/password", () => new HttpResponse(null, { status: 204 }));
    const { user } = renderWithProviders(<UsersView />);
    await user.click(await screen.findByRole("button", { name: "Send sign-in details" }));
    await answerConfirmDialog(false);
    expect(bodies).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Send sign-in details" }));
    await answerConfirmDialog(true);
    const dialog = await screen.findByRole("dialog");
    expect(bodies).toHaveLength(1);
    const { password } = bodies[0] as { password: string };
    expect(password).toMatch(/^[a-zA-Z]{6}-[2-9]{4}$/);
    expect(within(dialog).getByTestId("share-password")).toHaveTextContent(password);
  });

  it("says when the new password can't be saved", async () => {
    serveWithPhone([me, staffRow]);
    capture("post", "/users/u9/password", () => HttpResponse.json({ message: "User not found" }, { status: 404 }));
    const { user } = renderWithProviders(<UsersView />);
    await user.click(await screen.findByRole("button", { name: "Send sign-in details" }));
    await answerConfirmDialog(true);
    expect(await screen.findByText(/Couldn't create a new password/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("are offered after a manual password reset of an employee account", async () => {
    serveWithPhone([me, staffRow]);
    capture("post", "/users/u9/password", () => new HttpResponse(null, { status: 204 }));
    const { user } = renderWithProviders(<UsersView />);
    const row = (await screen.findByText("amine@test.dz")).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Reset password" }));
    await user.type(screen.getByLabelText(/New password/), "Other-pass-7");
    await user.click(screen.getByRole("button", { name: "Set password" }));
    const dialog = await screen.findByText("Send sign-in details to Amine");
    expect(screen.getByTestId("share-password")).toHaveTextContent("Other-pass-7");
    expect(dialog).toBeInTheDocument();
  });

  it("copies the message, and says when the employee has no phone", async () => {
    serveWithPhone([me, makeUserRow({ ...staffRow, employeeId: "e1" })]);
    capture("post", "/users/u9/password", () => new HttpResponse(null, { status: 204 }));
    const { user } = renderWithProviders(<UsersView />);
    await user.click(await screen.findByRole("button", { name: "Send sign-in details" }));
    await answerConfirmDialog(true);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/No phone number on this employee's record/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "WhatsApp" }).getAttribute("href")).toMatch(/^https:\/\/wa\.me\/\?text=/);
    await user.click(within(dialog).getByRole("button", { name: "Copy message" }));
    expect(await navigator.clipboard.readText()).toContain("Hello Amine,");
    expect(await screen.findByText("Message copied")).toBeInTheDocument();

    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new Error("denied"));
    await user.click(within(dialog).getAllByRole("button", { name: "Copy" })[1]);
    expect(await screen.findByText("Couldn't copy. Select the text and copy it by hand.")).toBeInTheDocument();
  });

  it("generates a strong temporary password in the form", async () => {
    serveUsers([]);
    const { user } = renderWithProviders(<UsersView />);
    await user.click(await screen.findByRole("button", { name: "Add user" }));
    await user.click(screen.getByRole("button", { name: "Generate" }));
    expect((screen.getByLabelText(/Temporary password/) as HTMLInputElement).value).toMatch(/^[a-zA-Z]{6}-[2-9]{4}$/);
  });
});

describe("UsersView archive", () => {
  const archived = { ...makeUserRow({ _id: "u3", name: "Old Manager", email: "old@test.dz", active: false }), isArchived: true };

  it("archives a user after a confirmation, and reloads the list", async () => {
    const calls: string[] = [];
    serveUsers([me, makeUserRow()], [me, { ...makeUserRow({ active: false }), isArchived: true } as UserRow]);
    server.use(
      http.patch(`${API}/users/:id/:action`, ({ params }) => {
        calls.push(`${params.action} ${params.id}`);
        return HttpResponse.json({});
      })
    );
    const { user } = renderWithProviders(<UsersView />);
    await user.click(within(await screen.findByText("Mia Manager").then((el) => el.closest("tr")!)).getByRole("button", { name: "Archive" }));
    expect(calls).toEqual([]);
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Archive Mia Manager?");
    expect(dialog).toHaveTextContent("They are signed out and can no longer sign in.");
    await answerConfirmDialog(true);
    await waitFor(() => expect(calls).toEqual(["archive u2"]));
    await waitFor(() => expect(within(rowOf("Mia Manager")).getByText("Archived")).toBeInTheDocument());
  });

  it("does nothing when the confirmation is cancelled", async () => {
    const calls: string[] = [];
    serveUsers([me, makeUserRow()]);
    server.use(
      http.patch(`${API}/users/:id/:action`, ({ params }) => {
        calls.push(String(params.action));
        return HttpResponse.json({});
      })
    );
    const { user } = renderWithProviders(<UsersView />);
    await user.click(within(await screen.findByText("Mia Manager").then((el) => el.closest("tr")!)).getByRole("button", { name: "Archive" }));
    await answerConfirmDialog(false);
    expect(calls).toEqual([]);
  });

  it("an archived user is marked, and can only be restored or deleted", async () => {
    const calls: string[] = [];
    serveUsers([me, archived as UserRow], [me, makeUserRow({ _id: "u3", name: "Old Manager" })]);
    server.use(
      http.patch(`${API}/users/:id/:action`, ({ params }) => {
        calls.push(`${params.action} ${params.id}`);
        return HttpResponse.json({});
      })
    );
    const { user } = renderWithProviders(<UsersView />);
    const row = (await screen.findByText("Old Manager")).closest("tr")!;
    expect(within(row).getByText("Archived")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Archive" })).toBeNull();
    expect(within(row).queryByRole("button", { name: "Enable" })).toBeNull();
    await user.click(within(row).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(calls).toEqual(["restore u3"]));
    await waitFor(() => expect(within(rowOf("Old Manager")).getByText("Active")).toBeInTheDocument());
  });

  it("only offers employees who work here now when linking an account", async () => {
    const asked: string[] = [];
    serveUsers([me]);
    server.use(
      http.get(`${API}/employees`, ({ request }) => {
        asked.push(new URL(request.url).search);
        return HttpResponse.json(employees);
      })
    );
    renderWithProviders(<UsersView />);
    await screen.findByText("admin@test.dz");
    expect(asked).toEqual(["?status=active"]);
  });
});
