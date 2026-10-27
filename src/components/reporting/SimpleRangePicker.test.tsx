import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderWithProviders, screen } from "@/test/render";
import SimpleRangePicker from "./SimpleRangePicker";
import { fixTodayInEachTest } from "./__testutils__/reportingApi";

fixTodayInEachTest(); // Wednesday 2026-03-11

const week = { start: "2026-03-09", end: "2026-03-15" };
const dateFields = () => screen.getAllByPlaceholderText("YYYY-MM-DD") as HTMLInputElement[];
const shown = () => screen.getByText("Selected range:").nextElementSibling!.textContent;

describe("SimpleRangePicker", () => {
  it("shows the applied range in the fields and below", () => {
    renderWithProviders(<SimpleRangePicker range={week} onApply={vi.fn()} />);
    expect(dateFields().map((f) => f.value)).toEqual(["2026-03-09", "2026-03-15"]);
    expect(shown()).toBe("Mon, 9 Mar 2026 → Sun, 15 Mar 2026");
  });

  it("shows a dash when a date is missing", () => {
    renderWithProviders(<SimpleRangePicker range={{ start: "", end: "" }} onApply={vi.fn()} />);
    expect(shown()).toBe("— → —");
  });

  it.each([
    ["This Week", { start: "2026-03-09", end: "2026-03-15" }],
    ["This Month", { start: "2026-03-01", end: "2026-03-31" }],
    ["This Year", { start: "2026-01-01", end: "2026-12-31" }],
  ])("'%s' applies at once and fills the fields", async (label, expected) => {
    const onApply = vi.fn();
    const { user } = renderWithProviders(<SimpleRangePicker range={{ start: "2025-01-01", end: "2025-01-02" }} onApply={onApply} />);
    await user.click(screen.getByRole("button", { name: label }));
    expect(onApply).toHaveBeenCalledWith(expected);
    expect(dateFields().map((f) => f.value)).toEqual([expected.start, expected.end]);
  });

  it("applies typed dates", async () => {
    const onApply = vi.fn();
    const { user } = renderWithProviders(<SimpleRangePicker range={week} onApply={onApply} />);
    await user.clear(dateFields()[0]);
    await user.type(dateFields()[0], "2026-02-01");
    await user.clear(dateFields()[1]);
    await user.type(dateFields()[1], "2026-02-28");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith({ start: "2026-02-01", end: "2026-02-28" });
  });
});
