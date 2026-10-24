import { describe, expect, it, vi } from "vitest";
import React from "react";
import UserMetaCard from "./UserMetaCard";
import UserInfoCard from "./UserInfoCard";
import UserAddressCard from "./UserAddressCard";
import ProfilePage from "@/app/(admin)/(others-pages)/profile/page";
import { makeUser } from "@/test/factories";
import { renderWithProviders, screen } from "@/test/render";

describe.each([
  ["UserMetaCard", UserMetaCard],
  ["UserInfoCard", UserInfoCard],
  ["UserAddressCard", UserAddressCard],
] as [string, React.ComponentType][])("%s", (_name, Card) => {
  it("opens the edit dialog and closes it with Close", async () => {
    const { user } = renderWithProviders(<Card />);
    expect(screen.queryByRole("button", { name: "Save Changes" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("button", { name: "Save Changes" })).not.toBeInTheDocument();
  });

  it("closes the edit dialog on Save Changes", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { user } = renderWithProviders(<Card />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(screen.queryByRole("button", { name: "Save Changes" })).not.toBeInTheDocument();
  });
});

describe("Profile page", () => {
  // BUG-606: /profile shows a template's made-up person (name, email, phone, address, tax ID) instead of the signed-in user
  it.fails("shows the signed-in user's own name and email", () => {
    renderWithProviders(<ProfilePage />, { user: makeUser({ name: "Mia Manager", email: "mia@test.dz" }) });
    expect(screen.getByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(screen.queryByText("Musharof Chowdhury")).not.toBeInTheDocument();
    expect(screen.getAllByText("Mia Manager").length).toBeGreaterThan(0);
    expect(screen.getAllByText("mia@test.dz").length).toBeGreaterThan(0);
  });

  // BUG-606: the profile dialogs' "Save Changes" only logs to the console; nothing is saved
  it.fails("saves an edited first name", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { user } = renderWithProviders(<UserInfoCard />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const firstName = screen.getByDisplayValue("Musharof");
    await user.clear(firstName);
    await user.type(firstName, "Mia");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(screen.getByText("Mia")).toBeInTheDocument();
  });
});
