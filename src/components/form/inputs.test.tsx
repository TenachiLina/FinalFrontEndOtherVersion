import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { useState } from "react";
import { act, fireEvent, render, screen, userEvent, within } from "@/test/render";
import DateInput from "./DateInput";
import Label from "./Label";
import MonthInput from "./MonthInput";
import TimeSelect from "./TimeSelect";
import Input from "./input/InputField";
import { setLang } from "@/lib/i18n";

/** Keeps a controlled field's value in state, like a real form does. */
function Controlled<T extends string>({
  initial,
  onChange,
  render: renderField,
}: {
  initial: T;
  onChange?: (v: string) => void;
  render: (value: string, set: (v: string) => void) => React.ReactElement;
}) {
  const [value, setValue] = useState<string>(initial);
  return renderField(value, (v) => {
    setValue(v);
    onChange?.(v);
  });
}

const user = () => userEvent.setup();

// ─── DateInput ───────────────────────────────────────────────────────────

describe("DateInput", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 2, 15, 10, 0)); // Sunday 15 March 2026
  });
  afterEach(() => vi.useRealTimers());

  const renderDate = (props: Partial<React.ComponentProps<typeof DateInput>> = {}, initial = "") => {
    const onChange = vi.fn();
    render(
      <Controlled
        initial={initial}
        onChange={onChange}
        render={(value, set) => <DateInput id="d" value={value} onChange={set} {...props} />}
      />
    );
    return { onChange, input: screen.getByPlaceholderText("YYYY-MM-DD") };
  };
  const calendar = () => screen.getByText(/\d{4}$/).closest("div.absolute") as HTMLElement;

  it("opens a calendar on today's month when the field is empty", async () => {
    const { input } = renderDate();
    await user().click(input);
    expect(screen.getByText("March 2026")).toBeInTheDocument();
    expect(within(calendar()).getByRole("button", { name: "15" })).toHaveClass("text-brand-500");
    expect(within(calendar()).getAllByText("S")).toHaveLength(2);
  });

  it("opens on the selected date's month and highlights it", async () => {
    const { input } = renderDate({}, "2025-12-03");
    await user().click(input);
    expect(screen.getByText("December 2025")).toBeInTheDocument();
    expect(within(calendar()).getByRole("button", { name: "3" })).toHaveClass("bg-brand-500");
  });

  it("puts the first day under the right weekday", async () => {
    const { input } = renderDate({}, "2026-04-10"); // 1 April 2026 is a Wednesday
    await user().click(input);
    const grid = within(calendar()).getByRole("button", { name: "1" }).parentElement!;
    const cells = Array.from(grid.children).slice(7); // after the weekday labels
    expect(cells.slice(0, 3).every((c) => c.tagName === "DIV" && c.textContent === "")).toBe(true);
    expect(cells[3]).toHaveTextContent("1");
    expect(within(calendar()).getAllByRole("button", { name: /^\d+$/ })).toHaveLength(30);
  });

  it("writes the picked day and closes", async () => {
    const { input, onChange } = renderDate({}, "2026-03-01");
    await user().click(input);
    await user().click(within(calendar()).getByRole("button", { name: "20" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-03-20");
    expect(input).toHaveValue("2026-03-20");
    expect(screen.queryByText("March 2026")).not.toBeInTheDocument();
  });

  it("moves between months and across years", async () => {
    const { input, onChange } = renderDate({}, "2026-01-10");
    await user().click(input);
    await user().click(screen.getByRole("button", { name: "‹" }));
    expect(screen.getByText("December 2025")).toBeInTheDocument();
    await user().click(screen.getByRole("button", { name: "›" }));
    await user().click(screen.getByRole("button", { name: "›" }));
    expect(screen.getByText("February 2026")).toBeInTheDocument();
    expect(within(calendar()).getAllByRole("button", { name: /^\d+$/ })).toHaveLength(28);
    await user().click(within(calendar()).getByRole("button", { name: "5" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-02-05");
  });

  it("can be typed into", async () => {
    const { input, onChange } = renderDate();
    await user().type(input, "2026-03-09");
    expect(onChange).toHaveBeenLastCalledWith("2026-03-09");
  });

  it("opens on today's month when the typed text is not a date", async () => {
    const { input } = renderDate({}, "next week");
    await user().click(input);
    expect(screen.getByText("March 2026")).toBeInTheDocument();
  });

  it("disables days outside min and max", async () => {
    const { input } = renderDate({ min: "2026-03-10", max: "2026-03-20" }, "2026-03-12");
    await user().click(input);
    expect(within(calendar()).getByRole("button", { name: "9" })).toBeDisabled();
    expect(within(calendar()).getByRole("button", { name: "10" })).toBeEnabled();
    expect(within(calendar()).getByRole("button", { name: "20" })).toBeEnabled();
    expect(within(calendar()).getByRole("button", { name: "21" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Today" })).toBeEnabled();
  });

  it("picks today with the Today button", async () => {
    const { input, onChange } = renderDate({}, "2025-01-01");
    await user().click(input);
    await user().click(screen.getByRole("button", { name: "Today" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-03-15");
    expect(screen.queryByRole("button", { name: "Today" })).not.toBeInTheDocument();
  });

  it.each([
    ["after max", { max: "2026-03-01" }],
    ["before min", { min: "2026-04-01" }],
  ])("disables Today when today is %s", async (_label, range) => {
    const { input } = renderDate(range, "2026-03-01");
    await user().click(input);
    expect(screen.getByRole("button", { name: "Today" })).toBeDisabled();
  });

  it("offers Clear only when clearable and set", async () => {
    const { input, onChange } = renderDate({ clearable: true }, "2026-03-05");
    await user().click(input);
    await user().click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenLastCalledWith("");
    await user().click(input);
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("toggles with the calendar button", async () => {
    renderDate();
    const button = screen.getByRole("button", { name: "Open calendar" });
    await user().click(button);
    expect(screen.getByText("March 2026")).toBeInTheDocument();
    await user().click(button);
    expect(screen.queryByText("March 2026")).not.toBeInTheDocument();
  });

  it("doesn't reopen on a second click in the field", async () => {
    const { input } = renderDate();
    await user().click(input);
    await user().click(screen.getByRole("button", { name: "›" }));
    await user().click(input);
    expect(screen.getByText("April 2026")).toBeInTheDocument();
  });

  it("closes on Escape and on a click outside, not on other keys", async () => {
    const { input } = renderDate();
    await user().click(input);
    await user().keyboard("x");
    expect(screen.getByText("March 2026")).toBeInTheDocument();
    await user().keyboard("{Escape}");
    expect(screen.queryByText("March 2026")).not.toBeInTheDocument();
    await user().click(input);
    await user().click(document.body);
    expect(screen.queryByText("March 2026")).not.toBeInTheDocument();
  });

  it("stays shut when disabled", async () => {
    const { input } = renderDate({ disabled: true });
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open calendar" })).toBeDisabled();
    fireEvent.click(input);
    expect(screen.queryByText("March 2026")).not.toBeInTheDocument();
  });

  it("shows French month names", async () => {
    setLang("fr");
    try {
      const { input } = renderDate({}, "2026-03-01");
      await user().click(input);
      expect(screen.getByText("mars 2026")).toBeInTheDocument();
    } finally {
      act(() => setLang("en"));
    }
  });
});

// ─── Label ───────────────────────────────────────────────────────────────

describe("Label", () => {
  it("labels its field and merges classes", () => {
    render(
      <>
        <Label htmlFor="name" className="mb-0">
          Name
        </Label>
        <input id="name" />
      </>
    );
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    const label = screen.getByText("Name");
    expect(label).toHaveClass("mb-0", "text-sm");
    expect(label).not.toHaveClass("mb-1.5");
  });
});

// ─── MonthInput ──────────────────────────────────────────────────────────

describe("MonthInput", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 6, 10)); // July 2026
  });
  afterEach(() => vi.useRealTimers());

  const renderMonth = (initial = "") => {
    const onChange = vi.fn();
    render(
      <Controlled initial={initial} onChange={onChange} render={(v, set) => <MonthInput id="m" value={v} onChange={set} className="x" />} />
    );
    return { onChange, month: screen.getByRole("combobox", { name: "Month" }), year: screen.getByRole("combobox", { name: "Year" }) };
  };

  it("starts empty with 12 months and years around this one", () => {
    const { month, year } = renderMonth();
    expect(month).toHaveValue("");
    expect(month).toHaveClass("x");
    expect(within(month).getAllByRole("option")).toHaveLength(13);
    const years = within(year).getAllByRole("option").map((o) => o.textContent);
    expect(years[1]).toBe("2021");
    expect(years[years.length - 1]).toBe("2031");
  });

  it("fills the year with this year when only a month is picked", async () => {
    const { month, onChange } = renderMonth();
    await user().selectOptions(month, "March");
    expect(onChange).toHaveBeenLastCalledWith("2026-03");
  });

  it("fills the month with this month when only a year is picked", async () => {
    const { year, onChange } = renderMonth();
    await user().selectOptions(year, "2025");
    expect(onChange).toHaveBeenLastCalledWith("2025-07");
  });

  it("keeps the other part when one changes", async () => {
    const { month, year, onChange } = renderMonth("2024-02");
    expect(month).toHaveValue("02");
    await user().selectOptions(year, "2027");
    expect(onChange).toHaveBeenLastCalledWith("2027-02");
    await user().selectOptions(month, "December");
    expect(onChange).toHaveBeenLastCalledWith("2027-12");
  });

  it("adds a year outside the usual range so it can be shown", () => {
    const { year } = renderMonth("2010-05");
    expect(year).toHaveValue("2010");
    expect(within(year).getAllByRole("option")[1]).toHaveTextContent("2010");
  });
});

// ─── MultiSelect ─────────────────────────────────────────────────────────


// ─── Select ──────────────────────────────────────────────────────────────


// ─── TimeSelect ──────────────────────────────────────────────────────────

describe("TimeSelect", () => {
  const renderTime = (initial = "", props: Partial<React.ComponentProps<typeof TimeSelect>> = {}) => {
    const onChange = vi.fn();
    render(<Controlled initial={initial} onChange={onChange} render={(v, set) => <TimeSelect value={v} onChange={set} {...props} />} />);
    return { onChange, hour: screen.getByRole("combobox", { name: "Hour" }), minute: screen.getByRole("combobox", { name: "Minute" }) };
  };

  it("offers 24 hours and every minute by default", () => {
    const { hour, minute } = renderTime();
    expect(within(hour).getAllByRole("option")).toHaveLength(25);
    expect(within(minute).getAllByRole("option")).toHaveLength(61);
  });

  it("defaults the minute to 00 when only the hour is picked", async () => {
    const { hour, onChange } = renderTime();
    await user().selectOptions(hour, "09");
    expect(onChange).toHaveBeenLastCalledWith("09:00");
  });

  it("defaults the hour to 00 when only the minute is picked", async () => {
    const { minute, onChange } = renderTime();
    await user().selectOptions(minute, "30");
    expect(onChange).toHaveBeenLastCalledWith("00:30");
  });

  it("keeps the other part when one changes", async () => {
    const { hour, minute, onChange } = renderTime("08:45", { minuteStep: 15 });
    await user().selectOptions(hour, "17");
    expect(onChange).toHaveBeenLastCalledWith("17:45");
    await user().selectOptions(minute, "15");
    expect(onChange).toHaveBeenLastCalledWith("17:15");
  });

  it("uses the minute step and keeps an off-grid minute", () => {
    const { minute } = renderTime("09:17", { minuteStep: 15 });
    expect(within(minute).getAllByRole("option").map((o) => o.textContent)).toEqual(["--", "00", "15", "17", "30", "45"]);
    expect(minute).toHaveValue("17");
  });

  it("can be disabled", () => {
    const { hour, minute } = renderTime("", { disabled: true, id: "t", className: "w-20" });
    expect(hour).toBeDisabled();
    expect(minute).toBeDisabled();
    expect(hour).toHaveAttribute("id", "t");
    expect(hour).toHaveClass("w-20");
  });
});

// ─── DatePicker (flatpickr) ──────────────────────────────────────────────


// ─── Checkbox / Radio / FileInput / InputField / TextArea ────────────────




describe("Input", () => {
  it("passes attributes through and reports typing", async () => {
    const onChange = vi.fn();
    render(<Input id="n" name="n" type="number" placeholder="Hours" min="0" max="24" step={0.5} defaultValue={8} onChange={onChange} />);
    const input = screen.getByPlaceholderText("Hours");
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("min", "0");
    expect(input).toHaveAttribute("max", "24");
    expect(input).toHaveAttribute("step", "0.5");
    expect(input).toHaveValue(8);
    await user().type(input, "1");
    expect(onChange).toHaveBeenCalled();
  });

  it("defaults to a text field with neutral styles and no hint", () => {
    const { container } = render(<Input />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveClass("border-gray-300", "bg-transparent");
    expect(container.querySelector("p")).toBeNull();
  });

  it.each([
    [{ error: true }, "border-error-500", "text-error-500"],
    [{ success: true }, "border-success-400", "text-success-500"],
    [{}, "border-gray-300", "text-gray-500"],
  ])("styles the field and hint for %o", (state, fieldClass, hintClass) => {
    render(<Input {...state} hint="Hint text" />);
    expect(screen.getByRole("textbox")).toHaveClass(fieldClass);
    expect(screen.getByText("Hint text")).toHaveClass(hintClass);
  });

  it("is disabled, which wins over error", () => {
    render(<Input disabled error />);
    const input = screen.getByRole("textbox");
    expect(input).toBeDisabled();
    expect(input).toHaveClass("cursor-not-allowed");
    expect(input).not.toHaveClass("border-error-500");
  });
});


// ─── Switch ──────────────────────────────────────────────────────────────


// ─── PhoneInput ──────────────────────────────────────────────────────────

