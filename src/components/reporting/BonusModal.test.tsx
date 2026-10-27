import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderWithProviders, screen } from "@/test/render";
import BonusModal from "./BonusModal";
import { fixTodayInEachTest } from "./__testutils__/reportingApi";
import { ApiError } from "@/lib/errors";

fixTodayInEachTest(); // 2026-03-11

function renderModal(props: Partial<React.ComponentProps<typeof BonusModal>> = {}) {
  const all = { isOpen: true, onClose: vi.fn(), employeeName: "Sara Bel", onConfirm: vi.fn(async () => {}), ...props };
  return { ...renderWithProviders(<BonusModal {...all} />), onClose: all.onClose, onConfirm: all.onConfirm };
}

const amountField = () => screen.getByRole("spinbutton");
const dateField = () => screen.getByPlaceholderText("YYYY-MM-DD");
const reasonField = () => screen.getByPlaceholderText("e.g. Perfect attendance, great performance…");
const confirm = () => screen.getByRole("button", { name: "Confirm" });

describe("BonusModal", () => {
  it("renders nothing while closed", () => {
    renderModal({ isOpen: false });
    expect(screen.queryByText("Give Bonus")).not.toBeInTheDocument();
  });

  it("opens empty, dated today, for the employee", () => {
    renderModal();
    expect(screen.getByRole("heading", { name: "Give Bonus" })).toBeInTheDocument();
    expect(screen.getByText("Sara Bel")).toBeInTheDocument();
    expect(amountField()).toHaveValue(null);
    expect(dateField()).toHaveValue("2026-03-11");
    expect(reasonField()).toHaveValue("");
  });

  it("gives the bonus with a rounded amount and a trimmed reason, then closes", async () => {
    const { user, onConfirm, onClose } = renderModal();
    await user.type(amountField(), "300.456");
    await user.type(reasonField(), "  Great week  ");
    await user.click(confirm());
    expect(onConfirm).toHaveBeenCalledWith(300.46, "2026-03-11", "Great week");
    expect(onClose).toHaveBeenCalled();
  });

  it("asks for an amount above 0", async () => {
    const { user, onConfirm } = renderModal();
    await user.type(amountField(), "0");
    await user.type(reasonField(), "x");
    await user.click(confirm());
    expect(screen.getByText("Enter an amount greater than 0.")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("asks for a date", async () => {
    const { user, onConfirm } = renderModal();
    await user.type(amountField(), "100");
    await user.clear(dateField());
    await user.click(confirm());
    expect(screen.getByText("Pick a date.")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("asks for a reason", async () => {
    const { user, onConfirm } = renderModal();
    await user.type(amountField(), "100");
    await user.type(reasonField(), "   ");
    await user.click(confirm());
    expect(screen.getByText("Add a reason for this bonus.")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("stays open and shows the reason when saving fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onConfirm = vi.fn(async () => {
      throw new ApiError(422, "Amount too high");
    });
    const { user, onClose } = renderModal({ onConfirm });
    await user.type(amountField(), "100");
    await user.type(reasonField(), "x");
    await user.click(confirm());
    expect(await screen.findByText("Couldn't save the bonus. Amount too high")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(confirm()).toBeEnabled();
  });

  it("closes on Cancel", async () => {
    const { user, onClose } = renderModal();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });
});
