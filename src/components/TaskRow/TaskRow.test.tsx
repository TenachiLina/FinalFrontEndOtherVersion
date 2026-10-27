import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import TaskRow from "./TaskRow";

const makeTask = (o: Partial<{ id: string; startTime: string; endTime: string; label: string }> = {}) => ({
  id: "1",
  startTime: "09:00",
  endTime: "10:30",
  label: "Dough",
  ...o,
});

function renderRow(task = makeTask()) {
  const onUpdate = vi.fn();
  const onRemove = vi.fn();
  render(<TaskRow task={task} onUpdate={onUpdate} onRemove={onRemove} />);
  const [start, end] = screen.getAllByRole("combobox") as HTMLSelectElement[];
  return { onUpdate, onRemove, start, end, user: userEvent.setup() };
}

const optionValues = (select: HTMLSelectElement) => Array.from(select.options).map((o) => o.value);

describe("TaskRow", () => {
  it("shows the task's start, end and name", () => {
    const { start, end } = renderRow();
    expect(start).toHaveValue("09:00");
    expect(end).toHaveValue("10:30");
    expect(screen.getByPlaceholderText("Task Name")).toHaveValue("Dough");
  });

  it("offers every half hour of the day after an empty placeholder", () => {
    const { start } = renderRow();
    const values = optionValues(start);
    expect(values).toHaveLength(49);
    expect(values.slice(0, 4)).toEqual(["", "00:00", "00:30", "01:00"]);
    expect(values.at(-1)).toBe("23:30");
    expect(start.options[0]).toBeDisabled();
    expect(start.options[0]).toHaveTextContent("--:--");
  });

  it("shows the placeholder for a time that isn't set", () => {
    const { start } = renderRow(makeTask({ startTime: "" }));
    expect(start).toHaveValue("");
    expect(optionValues(start)).toHaveLength(49);
  });

  it("keeps a loaded time that isn't on the half hour, in order", () => {
    const { start, end } = renderRow(makeTask({ startTime: "09:15" }));
    expect(start).toHaveValue("09:15");
    const values = optionValues(start);
    expect(values.slice(values.indexOf("09:00"), values.indexOf("09:00") + 3)).toEqual(["09:00", "09:15", "09:30"]);
    expect(optionValues(end)).not.toContain("09:15");
  });

  it("reports a new start time", async () => {
    const { user, start, onUpdate } = renderRow();
    await user.selectOptions(start, "08:30");
    expect(onUpdate).toHaveBeenCalledWith({ startTime: "08:30" });
  });

  it("reports a new end time", async () => {
    const { user, end, onUpdate } = renderRow();
    await user.selectOptions(end, "12:00");
    expect(onUpdate).toHaveBeenCalledWith({ endTime: "12:00" });
  });

  it("reports the name as it is typed", async () => {
    const { user, onUpdate } = renderRow(makeTask({ label: "" }));
    await user.type(screen.getByPlaceholderText("Task Name"), "O");
    expect(onUpdate).toHaveBeenCalledWith({ label: "O" });
  });

  it("removes the task", async () => {
    const { user, onRemove } = renderRow();
    await user.click(screen.getByRole("button", { name: "✕" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
