import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import ChangePasswordForm from "./ChangePasswordForm";
import AccountPage from "@/app/(admin)/account/page";
import { API, server } from "@/test/server";
import { renderWithProviders, screen } from "@/test/render";

async function fill(user: ReturnType<typeof renderWithProviders>["user"], current: string, next: string, confirm: string) {
  await user.type(screen.getByLabelText("Current password"), current);
  await user.type(screen.getByLabelText(/^New password/), next);
  await user.type(screen.getByLabelText("Confirm new password"), confirm);
  await user.click(screen.getByRole("button", { name: "Change password" }));
}

describe("ChangePasswordForm", () => {
  it("refuses new passwords that don't match without calling the server", async () => {
    const { user } = renderWithProviders(<ChangePasswordForm />);
    await fill(user, "old-pass1", "new-pass1", "new-pass2");
    expect(screen.getByRole("status")).toHaveTextContent("The new passwords do not match.");
  });

  it("changes the password and clears the fields", async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/auth/change-password`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({});
      })
    );
    const { user } = renderWithProviders(<ChangePasswordForm />);
    await fill(user, "old-pass1", "new-pass1", "new-pass1");
    expect(await screen.findByRole("status")).toHaveTextContent("Your password has been changed. Your other devices were signed out.");
    expect(body).toEqual({ currentPassword: "old-pass1", newPassword: "new-pass1" });
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText(/^New password/)).toHaveValue("");
    expect(screen.getByLabelText("Confirm new password")).toHaveValue("");
  });

  it("shows the server's reason, e.g. a wrong current password, and keeps the fields", async () => {
    server.use(http.post(`${API}/auth/change-password`, () => HttpResponse.json({ message: "Current password is wrong" }, { status: 400 })));
    const { user } = renderWithProviders(<ChangePasswordForm />);
    await fill(user, "wrong", "new-pass1", "new-pass1");
    expect(await screen.findByRole("status")).toHaveTextContent("Current password is wrong");
    expect(screen.getByLabelText("Current password")).toHaveValue("wrong");
    expect(screen.getByRole("button", { name: "Change password" })).toBeEnabled();
  });

  it("shows a generic message when the server gives no reason", async () => {
    server.use(http.post(`${API}/auth/change-password`, () => new HttpResponse("bad gateway", { status: 502 })));
    const { user } = renderWithProviders(<ChangePasswordForm />);
    await fill(user, "a", "b", "b");
    expect(await screen.findByRole("status")).toHaveTextContent("Could not change password");
  });
});

describe("Account page", () => {
  it("shows the password form and my sessions", async () => {
    server.use(http.get(`${API}/auth/sessions`, () => HttpResponse.json([])));
    renderWithProviders(<AccountPage />);
    expect(screen.getByText("Change your password")).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
    expect(screen.getByText("Where you're signed in")).toBeInTheDocument();
    expect(await screen.findByText("If you see a device you don't recognize, end its session and change your password.")).toBeInTheDocument();
  });
});
