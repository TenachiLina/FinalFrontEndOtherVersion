import { describe, expect, it, vi } from "vitest";
import React from "react";
import { http, HttpResponse } from "msw";
import ProfileForm, { initialsOf, MAX_PHOTO_BYTES } from "./ProfileForm";
import AccountPage from "@/app/(admin)/account/page";
import UserDropdown from "@/components/header/UserDropdown";
import { API, server } from "@/test/server";
import { makeCompany, makeUser } from "@/test/factories";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/test/render";

const me = makeUser({ name: "Mia Manager", email: "mia@test.dz", role: "manager" });
const png = (size = 10, type = "image/png", name = "me.png") => new File([new Uint8Array(size)], name, { type });

/**
 * Records what is saved; after a save, GET /auth/me answers the saved name
 * and photo, as the real server does.
 */
function mockProfile(initial: { name?: string; photo?: string | null } = {}) {
  let current = { ...me, ...initial };
  const saves: { name?: string; photo?: string }[] = [];
  server.use(
    http.get(`${API}/auth/me`, () => HttpResponse.json({ user: current, company: makeCompany() })),
    http.patch(`${API}/auth/me`, async ({ request }) => {
      const body = (await request.json()) as { name?: string; photo?: string };
      saves.push(body);
      current = { ...current, name: body.name ?? current.name, photo: body.photo || null };
      return HttpResponse.json({ user: current });
    })
  );
  return saves;
}

/** Renders signed in as `user`, then installs the profile mock (render sets its own /auth/me). */
function renderProfile(initial: { name?: string; photo?: string | null } = {}) {
  const view = renderWithProviders(<ProfileForm />, { user: { ...me, ...initial } });
  const saves = mockProfile(initial);
  return { ...view, saves };
}

describe("initialsOf", () => {
  it("takes up to two initials", () => {
    expect(initialsOf("Mia Manager")).toBe("MM");
    expect(initialsOf("  ali  ben  salah ")).toBe("AB");
    expect(initialsOf("Root")).toBe("R");
    expect(initialsOf("")).toBe("");
  });
});

describe("ProfileForm", () => {
  it("shows who is signed in: name to edit, email, role and company to read", async () => {
    renderProfile();
    expect(await screen.findByLabelText("Name")).toHaveValue("Mia Manager");
    expect(screen.getByText("mia@test.dz")).toBeInTheDocument();
    expect(screen.getByText("Manager")).toBeInTheDocument();
    expect(screen.getByText("Test Pizza")).toBeInTheDocument();
    expect(screen.getByText("MM")).toBeInTheDocument();
    // Nothing to save yet
    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add a photo" })).toBeInTheDocument();
  });

  it("renders nothing while signed out", () => {
    renderWithProviders(<ProfileForm />, { user: null });
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("saves a new name", async () => {
    const { user, saves } = renderProfile();
    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.type(name, "  Mia Benali ");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Profile saved.");
    expect(saves).toEqual([{ name: "Mia Benali", photo: "" }]);
    // The form now holds the saved name: nothing left to save
    await waitFor(() => expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled());
    expect(screen.getByLabelText("Name")).toHaveValue("Mia Benali");
  });

  it("adds a photo and saves it", async () => {
    const { user, saves } = renderProfile();
    await screen.findByLabelText("Name");
    await user.upload(screen.getByLabelText("Photo file"), png());
    const picture = await screen.findByRole("img", { name: "Your photo" });
    expect(picture.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0].name).toBe("Mia Manager");
    expect(saves[0].photo).toMatch(/^data:image\/png;base64,/);
  });

  it("removes the photo", async () => {
    const { user, saves } = renderProfile({ photo: "data:image/png;base64,AAAA" });
    expect(await screen.findByRole("img", { name: "Your photo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change photo" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(screen.queryByRole("img", { name: "Your photo" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(saves).toEqual([{ name: "Mia Manager", photo: "" }]));
  });

  it("refuses a file that is not an image, or too large, before sending anything", async () => {
    const { saves } = renderProfile();
    await screen.findByLabelText("Name");
    const input = screen.getByLabelText("Photo file");
    // Dropped or picked through "All files": the file chooser's filter can be bypassed
    fireEvent.change(input, { target: { files: [png(10, "application/pdf", "cv.pdf")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a PNG, JPEG or WebP image.");
    fireEvent.change(input, { target: { files: [png(MAX_PHOTO_BYTES + 1)] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The photo must be at most 200 KB."));
    expect(screen.queryByRole("img", { name: "Your photo" })).toBeNull();
    expect(saves).toEqual([]);
  });

  it("asks for a name before saving", async () => {
    const { user, saves } = renderProfile();
    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.type(name, "   ");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Name is required");
    expect(saves).toEqual([]);
  });

  it("shows the server's refusal and keeps what was typed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { user } = renderProfile();
    server.use(
      http.patch(`${API}/auth/me`, () =>
        HttpResponse.json({ message: "Name must be at most 80 characters" }, { status: 400 })
      )
    );
    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Someone Else");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Name must be at most 80 characters");
    expect(name).toHaveValue("Someone Else");
    expect(screen.getByRole("button", { name: "Save profile" })).toBeEnabled();
  });

  it("names each kind of account", async () => {
    for (const [role, label] of [
      ["superadmin", "Super admin"],
      ["admin", "Admin"],
      ["employee", "Clock-in kiosk"],
      ["staff", "Mobile app employee"],
    ] as const) {
      const { unmount } = renderWithProviders(<ProfileForm />, { user: makeUser({ role }) });
      expect(await screen.findByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it("shows a dash for a super admin outside any company", async () => {
    renderWithProviders(<ProfileForm />, { user: makeUser({ role: "superadmin", companyId: null }), company: null });
    expect(await screen.findByText("—")).toBeInTheDocument();
  });
});

describe("the account page and the user menu", () => {
  it("the page shows the profile, the password form and the sessions", async () => {
    server.use(http.get(`${API}/auth/sessions`, () => HttpResponse.json([])));
    renderWithProviders(<AccountPage />, { user: me });
    expect(await screen.findByText("Your profile")).toBeInTheDocument();
    expect(screen.getByText("Change your password")).toBeInTheDocument();
    expect(screen.getByText("Where you're signed in")).toBeInTheDocument();
  });

  it("the menu shows the photo when there is one, the initials otherwise", async () => {
    const withPhoto = renderWithProviders(<UserDropdown />, { user: { ...me, photo: "data:image/png;base64,AAAA" } });
    expect(await screen.findByTestId("user-photo")).toHaveAttribute("src", "data:image/png;base64,AAAA");
    withPhoto.unmount();
    renderWithProviders(<UserDropdown />, { user: me });
    expect(await screen.findByText("MM")).toBeInTheDocument();
    expect(screen.queryByTestId("user-photo")).toBeNull();
  });
});
