import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import AdvanceModal from "./AdvanceModal";
import { fixTodayInEachTest } from "./__testutils__/reportingApi";
import { ApiError } from "@/lib/errors";

fixTodayInEachTest(); // 2026-03-11

const week = { start: "2026-03-09", end: "2026-03-15" };

function renderModal(props: Partial<React.ComponentProps<typeof AdvanceModal>> = {}) {
  const onClose = vi.fn();
  const onConfirm = vi.fn(async () => {});
  const all = { isOpen: true, onClose, employeeName: "Amine Kaci", offer: 1400, range: week, onConfirm, ...props };
  const view = renderWithProviders(<AdvanceModal {...all} />);
  return { ...view, onClose: all.onClose, onConfirm: all.onConfirm };
}

const amountField = () => screen.getByRole("spinbutton");
const dateField = () => screen.getByPlaceholderText("YYYY-MM-DD");

describe("AdvanceModal", () => {
  it("renders nothing while closed", () => {
    renderModal({ isOpen: false });
    expect(screen.queryByText("Give Advance")).not.toBeInTheDocument();
  });

  it("suggests the offer and today's date", () => {
    renderModal();
    expect(screen.getByRole("heading", { name: "Give Advance" })).toBeInTheDocument();
    expect(screen.getByText(/Amine Kaci — suggested advance:/)).toHaveTextContent("1400.00 DA");
    expect(amountField()).toHaveValue(1400);
    expect(dateField()).toHaveValue("2026-03-11");
  });

  it.each([
    [{ start: "2026-03-16", end: "2026-03-22" }, "2026-03-16"],
    [{ start: "2026-03-02", end: "2026-03-08" }, "2026-03-08"],
  ])("defaults to the closest day of a week that isn't this one (%o)", (range, expected) => {
    renderModal({ range });
    expect(dateField()).toHaveValue(expected);
  });

  it("gives the amount and date chosen, rounded to cents, then closes", async () => {
    const { user, onConfirm, onClose } = renderModal();
    await user.clear(amountField());
    await user.type(amountField(), "1200.456");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledWith(1200.46, "2026-03-11");
    expect(onClose).toHaveBeenCalled();
  });

  it("warns, but allows, an amount above the offer", async () => {
    const { user, onConfirm } = renderModal();
    await user.clear(amountField());
    await user.type(amountField(), "1500");
    expect(screen.getByText("This is higher than the suggested advance (1400.00 DA).")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledWith(1500, "2026-03-11");
  });

  it.each(["0", "-5", ""])("refuses an amount of %j", async (value) => {
    const { user, onConfirm } = renderModal();
    await user.clear(amountField());
    if (value) await user.type(amountField(), value);
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByText("Enter an amount greater than 0.")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("refuses a negative offer left as is", async () => {
    const { user, onConfirm } = renderModal({ offer: -200 });
    expect(amountField()).toHaveValue(-200);
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByText("Enter an amount greater than 0.")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("asks for a date", async () => {
    const { user, onConfirm } = renderModal();
    await user.clear(dateField());
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByText("Pick a date.")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("refuses a date outside the week", async () => {
    const { user, onConfirm } = renderModal();
    await user.clear(dateField());
    await user.type(dateField(), "2026-03-20");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByText("Date must be between 2026-03-09 and 2026-03-15.")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows 'Saving…' and blocks the buttons while saving", async () => {
    let finish!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((r) => (finish = r)));
    const { user, onClose } = renderModal({ onConfirm });
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
    finish();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("stays open and shows the reason when saving fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onConfirm = vi.fn(async () => {
      throw new ApiError(409, "An advance already exists for this week");
    });
    const { user, onClose } = renderModal({ onConfirm });
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("Couldn't save the advance. An advance already exists for this week")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();
  });

  it("closes on Cancel", async () => {
    const { user, onClose } = renderModal();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("starts again from the offer when reopened", async () => {
    const props = { isOpen: true, onClose: vi.fn(), employeeName: "Amine Kaci", offer: 1400, range: week, onConfirm: vi.fn(async () => {}) };
    const { user, rerender } = renderWithProviders(<AdvanceModal {...props} />);
    await user.clear(amountField());
    await user.type(amountField(), "5");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    rerender(<AdvanceModal {...props} isOpen={false} />);
    rerender(<AdvanceModal {...props} offer={250} />);
    expect(amountField()).toHaveValue(250);
  });
});
