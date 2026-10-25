import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderWithProviders, screen } from "@/test/render";
import RangePicker from "./RangePicker";
import { fixTodayInEachTest } from "./__testutils__/reportingApi";

fixTodayInEachTest(); // Wednesday 2026-03-11

const dateFields = () => screen.getAllByPlaceholderText("YYYY-MM-DD") as HTMLInputElement[];
const preview = () => screen.getByText("Selected range:").nextElementSibling!.textContent;

describe("RangePicker — week mode", () => {
  const week = { start: "2026-03-09", end: "2026-03-15" };

  it("shows the week it was opened on", () => {
    renderWithProviders(<RangePicker mode="week" range={week} onApply={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Pick a week" })).toBeInTheDocument();
    expect(screen.getByText("Week starting on")).toBeInTheDocument();
    expect(dateFields()[0]).toHaveValue("2026-03-09");
    expect(preview()).toBe("Mon, 9 Mar 2026 → Sun, 15 Mar 2026");
  });

  it("applies the 7 days starting on the chosen date", async () => {
    const onApply = vi.fn();
    const { user } = renderWithProviders(<RangePicker mode="week" range={week} onApply={onApply} />);
    await user.clear(dateFields()[0]);
    await user.type(dateFields()[0], "2026-03-26");
    expect(preview()).toBe("Thu, 26 Mar 2026 → Wed, 1 Apr 2026");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith({ start: "2026-03-26", end: "2026-04-01" });
  });

  it("applies a custom range", async () => {
    const onApply = vi.fn();
    const { user } = renderWithProviders(<RangePicker mode="week" range={week} onApply={onApply} />);
    await user.click(screen.getByRole("button", { name: "Custom range" }));
    expect(dateFields().map((f) => f.value)).toEqual(["2026-03-09", "2026-03-15"]);
    await user.clear(dateFields()[1]);
    await user.type(dateFields()[1], "2026-03-20");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith({ start: "2026-03-09", end: "2026-03-20" });
  });

  it("shows a dash for a missing date and can go back to the week picker", async () => {
    const { user } = renderWithProviders(<RangePicker mode="week" range={week} onApply={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Custom range" }));
    await user.clear(dateFields()[0]);
    expect(preview()).toBe("— → Sun, 15 Mar 2026");
    await user.click(screen.getByRole("button", { name: "Pick a week" }));
    expect(dateFields()).toHaveLength(1);
  });

  // BUG-507: the week end is computed from a UTC-parsed date, so west of UTC the week is 6 days
  it("ends the week 6 days later in a time zone behind UTC", async () => {
    process.env.TZ = "America/New_York"; // restored by fixTodayInEachTest
    const onApply = vi.fn();
    const { user } = renderWithProviders(<RangePicker mode="week" range={week} onApply={onApply} />);
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith({ start: "2026-03-09", end: "2026-03-15" });
  });
});

describe("RangePicker — month mode", () => {
  const march = { start: "2026-03-01", end: "2026-03-31" };

  it("offers every month and the years around this one", () => {
    renderWithProviders(<RangePicker mode="month" range={march} onApply={vi.fn()} />);
    const [month, year] = screen.getAllByRole("combobox") as HTMLSelectElement[];
    expect(month.options).toHaveLength(12);
    expect(month.options[0]).toHaveTextContent("January");
    expect([...year.options].map((o) => o.value)).toEqual([
      "2021", "2022", "2023", "2024", "2025", "2026", "2027", "2028", "2029", "2030", "2031",
    ]);
    expect(preview()).toBe("Sun, 1 Mar 2026 → Tue, 31 Mar 2026");
  });

  it("applies the whole calendar month chosen", async () => {
    const onApply = vi.fn();
    const { user } = renderWithProviders(<RangePicker mode="month" range={march} onApply={onApply} />);
    const [month, year] = screen.getAllByRole("combobox");
    await user.selectOptions(month, "1");
    await user.selectOptions(year, "2028");
    expect(preview()).toBe("Tue, 1 Feb 2028 → Tue, 29 Feb 2028");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith({ start: "2028-02-01", end: "2028-02-29" });
  });

  // BUG-510: the month/year selects start on today's month, not on the month being shown
  it("starts on the month it was opened on", () => {
    renderWithProviders(
      <RangePicker mode="month" range={{ start: "2026-01-01", end: "2026-01-31" }} onApply={vi.fn()} />
    );
    expect(screen.getAllByRole("combobox")[0]).toHaveValue("0");
    expect(preview()).toBe("Thu, 1 Jan 2026 → Sat, 31 Jan 2026");
  });
});
