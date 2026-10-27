import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, userEvent, within } from "@/test/render";
import DefaultModal from "./ModalExample/DefaultModal";
import FormInModal from "./ModalExample/FormInModal";
import FullScreenModal from "./ModalExample/FullScreenModal";
import ModalBasedAlerts from "./ModalExample/ModalBasedAlerts";
import VerticallyCenteredModal from "./ModalExample/VerticallyCenteredModal";

afterEach(() => {
  document.body.style.overflow = "";
});

describe.each([
  ["DefaultModal", DefaultModal, "Modal Heading"],
  ["VerticallyCenteredModal", VerticallyCenteredModal, "All Done! Success Confirmed"],
  ["FormInModal", FormInModal, "Personal Information"],
  ["FullScreenModal", FullScreenModal, "Modal Heading"],
])("%s", (_name, Example, heading) => {
  it("opens and closes with the Close button", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); // jsdom: form submission not implemented
    render(<Example />);
    expect(screen.queryByText(heading)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open Modal" }));
    expect(screen.getByText(heading)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText(heading)).not.toBeInTheDocument();
  });

  it("saves and closes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Open Modal" }));
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(log).toHaveBeenCalledWith("Saving changes...");
    expect(screen.queryByText(heading)).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Open Modal" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText(heading)).not.toBeInTheDocument();
  });
});

describe("FormInModal", () => {
  it("shows the personal information fields", async () => {
    render(<FormInModal />);
    await userEvent.click(screen.getByRole("button", { name: "Open Modal" }));
    expect(screen.getByPlaceholderText("Emirhan")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("emirhanboruch55@gmail.com")).toHaveAttribute("type", "email");
  });

  // BUG-708: Button has no type prop, so "Close" inside the modal's <form> is a submit button and submits (reloads) the page
  it("doesn't submit the form when Close is clicked", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<FormInModal />);
    await userEvent.click(screen.getByRole("button", { name: "Open Modal" }));
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    document.querySelector("form")!.addEventListener("submit", onSubmit);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("FullScreenModal", () => {
  it("has no backdrop to click", async () => {
    const { container } = render(<FullScreenModal />);
    await userEvent.click(screen.getByRole("button", { name: "Open Modal" }));
    expect(container.querySelector(".backdrop-blur-\\[32px\\]")).toBeNull();
  });
});

describe("ModalBasedAlerts", () => {
  it.each([
    ["Success Alert", "Well Done!"],
    ["Info Alert", "Information Alert!"],
    ["Warning Alert", "Warning Alert!"],
    ["Danger Alert", "Danger Alert!"],
  ])("%s opens its modal, which closes on Escape", async (button, heading) => {
    render(<ModalBasedAlerts />);
    await userEvent.click(screen.getByRole("button", { name: button }));
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("heading", { name: heading })).not.toBeInTheDocument();
  });

  it("closes a modal on a click on its backdrop", async () => {
    render(<ModalBasedAlerts />);
    await userEvent.click(screen.getByRole("button", { name: "Info Alert" }));
    const content = screen.getByRole("heading", { name: "Information Alert!" }).closest(".max-w-\\[600px\\]") as HTMLElement;
    await userEvent.click(content.previousElementSibling as HTMLElement);
    expect(screen.queryByRole("heading", { name: "Information Alert!" })).not.toBeInTheDocument();
  });

  // BUG-709: the "Okay, Got It" buttons of the alert modals have no click handler, so they don't close the modal
  it("closes the alert with Okay, Got It", async () => {
    render(<ModalBasedAlerts />);
    await userEvent.click(screen.getByRole("button", { name: "Success Alert" }));
    const modal = screen.getByRole("heading", { name: "Well Done!" }).parentElement!;
    await userEvent.click(within(modal).getByRole("button", { name: "Okay, Got It" }));
    expect(screen.queryByRole("heading", { name: "Well Done!" })).not.toBeInTheDocument();
  });
});
