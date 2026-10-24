import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { useState } from "react";
import { act, fireEvent, render, screen, userEvent, within } from "@/test/render";
import DateInput from "./DateInput";
import Label from "./Label";
import MonthInput from "./MonthInput";
import MultiSelect from "./MultiSelect";
import Select from "./Select";
import TimeSelect from "./TimeSelect";
import DatePicker from "./date-picker";
import Checkbox from "./input/Checkbox";
import FileInput from "./input/FileInput";
import Input from "./input/InputField";
import Radio from "./input/Radio";
import TextArea from "./input/TextArea";
import Switch from "./switch/Switch";
import PhoneInput from "./group-input/PhoneInput";
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

describe("MultiSelect", () => {
  const options = [
    { value: "1", text: "Kitchen", selected: false },
    { value: "2", text: "Cashier", selected: false },
    { value: "3", text: "Delivery", selected: false },
  ];
  const field = () => screen.getByText("Posts").nextElementSibling!.querySelector(".mb-2") as HTMLElement;

  it("shows a placeholder when nothing is selected", () => {
    render(<MultiSelect label="Posts" options={options} />);
    expect(screen.getByDisplayValue("Select option")).toBeInTheDocument();
    expect(screen.queryByText("Kitchen")).not.toBeInTheDocument();
  });

  it("shows the pre-selected options as chips", () => {
    render(<MultiSelect label="Posts" options={options} defaultSelected={["1", "3"]} />);
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
    expect(screen.getByText("Delivery")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Select option")).not.toBeInTheDocument();
  });

  it("opens the list on a click in the field and selects/unselects options", async () => {
    const onChange = vi.fn();
    render(<MultiSelect label="Posts" options={options} onChange={onChange} />);
    await user().click(screen.getByDisplayValue("Select option"));
    await user().click(screen.getByText("Cashier"));
    expect(onChange).toHaveBeenLastCalledWith(["2"]);
    await user().click(screen.getAllByText("Kitchen")[0]);
    expect(onChange).toHaveBeenLastCalledWith(["2", "1"]);
    // the list stays open; clicking a selected option removes it
    const list = screen.getAllByText("Cashier").at(-1)!;
    expect(list.parentElement).toHaveClass("bg-primary/10");
    await user().click(list);
    expect(onChange).toHaveBeenLastCalledWith(["1"]);
  });

  it("closes the list on a second click in the field", async () => {
    render(<MultiSelect label="Posts" options={options} />);
    await user().click(screen.getByDisplayValue("Select option"));
    expect(screen.getByText("Delivery")).toBeInTheDocument();
    await user().click(screen.getByDisplayValue("Select option"));
    expect(screen.queryByText("Delivery")).not.toBeInTheDocument();
  });

  it("removes a chip with its cross", async () => {
    const onChange = vi.fn();
    render(<MultiSelect label="Posts" options={options} defaultSelected={["1", "2"]} onChange={onChange} />);
    const chip = screen.getByText("Kitchen").parentElement!;
    await user().click(within(chip).getByRole("button"));
    expect(onChange).toHaveBeenLastCalledWith(["2"]);
    expect(screen.queryAllByText("Kitchen").filter((el) => el.closest(".rounded-full"))).toHaveLength(0);
  });

  it("doesn't open when disabled", async () => {
    render(<MultiSelect label="Posts" options={options} disabled />);
    await user().click(screen.getByDisplayValue("Select option"));
    expect(screen.queryByText("Kitchen")).not.toBeInTheDocument();
  });

  // BUG-703: the chevron button toggles the list twice (its own onClick + the field's), so it never opens
  it.fails("opens the list with the arrow button", async () => {
    render(<MultiSelect label="Posts" options={options} />);
    await user().click(within(field()).getByRole("button"));
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
  });

  // BUG-704: removing a chip also opens the option list (the click bubbles to the field)
  it.fails("doesn't open the list when a chip is removed", async () => {
    render(<MultiSelect label="Posts" options={options} defaultSelected={["1", "2"]} />);
    const chip = screen.getByText("Kitchen").parentElement!;
    await user().click(within(chip).getByRole("button"));
    expect(screen.queryByText("Delivery")).not.toBeInTheDocument();
  });

  // BUG-705: a disabled MultiSelect still lets the user remove selected options
  it.fails("doesn't let a disabled field be changed", async () => {
    const onChange = vi.fn();
    render(<MultiSelect label="Posts" options={options} defaultSelected={["1"]} onChange={onChange} disabled />);
    const chip = screen.getByText("Kitchen").parentElement!;
    await user().click(within(chip).getByRole("button"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
  });
});

// ─── Select ──────────────────────────────────────────────────────────────

describe("Select", () => {
  const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
  ];

  it("starts on a disabled placeholder", () => {
    render(<Select options={options} onChange={() => {}} className="extra" />);
    const select = screen.getByRole("combobox");
    expect(select).toHaveValue("");
    expect(select).toHaveClass("text-gray-400", "extra");
    expect(screen.getByRole("option", { name: "Select an option" })).toBeDisabled();
  });

  it("reports the picked value and shows it", async () => {
    const onChange = vi.fn();
    render(<Select options={options} onChange={onChange} placeholder="Pick" />);
    await user().selectOptions(screen.getByRole("combobox"), "Beta");
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.getByRole("combobox")).toHaveValue("b");
    expect(screen.getByRole("combobox")).toHaveClass("text-gray-800");
  });

  it("starts on the default value", () => {
    render(<Select options={options} onChange={() => {}} defaultValue="a" />);
    expect(screen.getByRole("combobox")).toHaveValue("a");
  });
});

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

describe("DatePicker", () => {
  it("attaches a calendar to its labelled input with the default date", () => {
    render(<DatePicker id="when" label="When" placeholder="Pick a date" defaultDate="2026-03-15" />);
    const input = screen.getByLabelText("When") as HTMLInputElement & { _flatpickr?: unknown };
    expect(input).toHaveAttribute("placeholder", "Pick a date");
    expect(input._flatpickr).toBeDefined();
    expect(input).toHaveValue("2026-03-15");
  });

  it("works without a label, in range mode", () => {
    render(<DatePicker id="range" mode="range" />);
    const input = document.getElementById("range") as HTMLInputElement & { _flatpickr?: { config: { mode: string } } };
    expect(screen.queryByText("When")).not.toBeInTheDocument();
    expect(input._flatpickr?.config.mode).toBe("range");
  });

  it("reports picked dates", () => {
    const onChange = vi.fn();
    render(<DatePicker id="pick" onChange={onChange} />);
    const input = document.getElementById("pick") as HTMLInputElement & { _flatpickr: { setDate: (d: string, fire: boolean) => void } };
    act(() => input._flatpickr.setDate("2026-05-02", true));
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls[0][1]).toBe("2026-05-02");
  });

  it("removes the calendar when unmounted", () => {
    const { unmount } = render(<DatePicker id="gone" />);
    const input = document.getElementById("gone") as HTMLInputElement & { _flatpickr: { destroy: () => void } };
    const destroy = vi.spyOn(input._flatpickr, "destroy");
    unmount();
    expect(destroy).toHaveBeenCalled();
  });
});

// ─── Checkbox / Radio / FileInput / InputField / TextArea ────────────────

describe("Checkbox", () => {
  it("toggles through its label", async () => {
    const onChange = vi.fn();
    render(<Checkbox id="c" label="Remember me" checked={false} onChange={onChange} className="x" />);
    const box = screen.getByRole("checkbox", { name: "Remember me" });
    expect(box).toHaveClass("x");
    await user().click(screen.getByText("Remember me"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("shows a tick when checked and reports unchecking", async () => {
    const onChange = vi.fn();
    const { container } = render(<Checkbox checked onChange={onChange} />);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    await user().click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("can't be changed when disabled", async () => {
    const onChange = vi.fn();
    const { container } = render(<Checkbox label="Off" checked={false} onChange={onChange} disabled />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(container.firstElementChild).toHaveClass("cursor-not-allowed");
    await user().click(screen.getByText("Off"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Radio", () => {
  it("reports its value when picked through its label", async () => {
    const onChange = vi.fn();
    render(<Radio id="r1" name="g" value="a" label="Option A" checked={false} onChange={onChange} className="x" />);
    await user().click(screen.getByText("Option A"));
    expect(onChange).toHaveBeenCalledWith("a");
    expect(screen.getByRole("radio", { name: "Option A" })).not.toBeChecked();
  });

  it("shows the checked state", () => {
    render(<Radio id="r2" name="g" value="b" label="B" checked onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "B" })).toBeChecked();
    expect(screen.getByText("B").querySelector(".block")).toBeInTheDocument();
  });

  it("can't be picked when disabled", async () => {
    const onChange = vi.fn();
    render(<Radio id="r3" name="g" value="c" label="C" checked={false} onChange={onChange} disabled />);
    expect(screen.getByRole("radio", { name: "C" })).toBeDisabled();
    await user().click(screen.getByText("C"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores a change event while disabled", () => {
    const onChange = vi.fn();
    render(<Radio id="r4" name="g" value="d" label="D" checked={false} onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole("radio", { name: "D" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("FileInput", () => {
  it("passes the chosen file on", async () => {
    const onChange = vi.fn();
    const { container } = render(<FileInput onChange={onChange} className="custom" />);
    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    expect(input).toHaveClass("custom");
    await user().upload(input, new File(["x"], "photo.png", { type: "image/png" }));
    expect(onChange).toHaveBeenCalled();
    expect(input.files?.[0].name).toBe("photo.png");
  });
});

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

describe("TextArea", () => {
  it("reports typed text", async () => {
    function Box() {
      const [v, setV] = useState("");
      return <TextArea value={v} onChange={setV} rows={4} />;
    }
    render(<Box />);
    const area = screen.getByPlaceholderText("Enter your message");
    expect(area).toHaveAttribute("rows", "4");
    await user().type(area, "Hello");
    expect(area).toHaveValue("Hello");
  });

  it("ignores typing without a handler", async () => {
    render(<TextArea placeholder="Notes" />);
    await user().type(screen.getByPlaceholderText("Notes"), "x");
    expect(screen.getByPlaceholderText("Notes")).toHaveValue("");
  });

  it("shows an error hint", () => {
    render(<TextArea error hint="Required" />);
    expect(screen.getByText("Required")).toHaveClass("text-error-500");
    expect(screen.getByRole("textbox")).toHaveClass("focus:border-error-300");
  });

  it("shows a normal hint and can be disabled", () => {
    render(<TextArea disabled hint="Read only" />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByText("Read only")).toHaveClass("text-gray-500");
  });
});

// ─── Switch ──────────────────────────────────────────────────────────────

describe("Switch", () => {
  const track = (label: string) => screen.getByText(label).querySelector(".block") as HTMLElement;

  it("toggles on click and reports the new state", async () => {
    const onChange = vi.fn();
    render(<Switch label="Notifications" onChange={onChange} />);
    expect(track("Notifications")).toHaveClass("bg-gray-200");
    await user().click(screen.getByText("Notifications"));
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(track("Notifications")).toHaveClass("bg-brand-500");
    await user().click(screen.getByText("Notifications"));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("starts on and uses the gray colours", async () => {
    render(<Switch label="Dark" defaultChecked color="gray" />);
    expect(track("Dark")).toHaveClass("bg-gray-800");
    await user().click(screen.getByText("Dark"));
    expect(track("Dark")).toHaveClass("bg-gray-200");
  });

  it("works without a handler", async () => {
    render(<Switch label="Plain" />);
    await user().click(screen.getByText("Plain"));
    expect(track("Plain")).toHaveClass("bg-brand-500");
  });

  it("does nothing when disabled", async () => {
    const onChange = vi.fn();
    render(<Switch label="Locked" disabled onChange={onChange} />);
    await user().click(screen.getByText("Locked"));
    expect(onChange).not.toHaveBeenCalled();
    expect(track("Locked")).toHaveClass("bg-gray-100");
  });

  // BUG-706: Switch has no input or switch role, so it can't be reached or toggled with the keyboard
  it.fails("can be toggled with the keyboard", async () => {
    const onChange = vi.fn();
    render(<Switch label="Notifications" onChange={onChange} />);
    const u = user();
    await u.tab();
    await u.keyboard(" ");
    expect(screen.getByRole("switch", { name: "Notifications" })).toBeChecked();
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

// ─── PhoneInput ──────────────────────────────────────────────────────────

describe("PhoneInput", () => {
  const countries = [
    { code: "US", label: "+1" },
    { code: "GB", label: "+44" },
  ];

  it("starts with the US prefix and switches prefix with the country", async () => {
    const onChange = vi.fn();
    render(<PhoneInput countries={countries} onChange={onChange} />);
    const phone = screen.getByPlaceholderText("+1 (555) 000-0000");
    expect(phone).toHaveValue("+1");
    expect(phone).toHaveClass("pl-[84px]");
    await user().selectOptions(screen.getByRole("combobox"), "GB");
    expect(phone).toHaveValue("+44");
    expect(onChange).toHaveBeenLastCalledWith("+44");
  });

  it("reports typed numbers", async () => {
    const onChange = vi.fn();
    render(<PhoneInput countries={countries} onChange={onChange} placeholder="Phone" selectPosition="end" />);
    const phone = screen.getByPlaceholderText("Phone");
    expect(phone).toHaveClass("pr-[84px]");
    await user().type(phone, "5");
    expect(onChange).toHaveBeenLastCalledWith("+15");
  });

  it("works without a handler", async () => {
    render(<PhoneInput countries={countries} selectPosition="end" />);
    await user().selectOptions(screen.getByRole("combobox"), "GB");
    await user().type(screen.getByRole("textbox"), "7");
    expect(screen.getByRole("textbox")).toHaveValue("+447");
  });

  // BUG-707: PhoneInput always starts on "US"/"+1", even when the country list doesn't contain the US
  it.fails("starts on the first listed country's prefix", () => {
    render(<PhoneInput countries={[{ code: "DZ", label: "+213" }, { code: "FR", label: "+33" }]} />);
    expect(screen.getByRole("combobox")).toHaveValue("DZ");
    expect(screen.getByRole("textbox")).toHaveValue("+213");
  });
});
