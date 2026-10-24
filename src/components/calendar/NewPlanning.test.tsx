import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse, delay } from "msw";
import * as XLSX from "xlsx";
import { API, server } from "@/test/server";
import { fireEvent, renderWithProviders, screen, waitFor, within } from "@/test/render";
import { toast } from "@/lib/notify";
import NewPlanning from "./NewPlanning";
import {
  ALICE,
  BOB,
  CARL,
  DINA,
  DELIVERY,
  EVENING,
  fixTheClock,
  makeRecord,
  makeShiftTask,
  mockPlanningApi,
  type PlanningApiOptions,
} from "@/hooks/useNewPlanning.fixtures";

fixTheClock();

const TODAY_PLANNING = [
  makeRecord(ALICE, { backups: [{ id: BOB._id, title: "Bob Brown" }], tasks: [makeShiftTask()] }),
  makeRecord(BOB, { taskId: DELIVERY.taskId, shiftId: EVENING._id }),
  makeRecord(CARL, { taskId: DELIVERY.taskId, shiftId: EVENING._id }),
  makeRecord(DINA, { taskId: DELIVERY.taskId, shiftId: EVENING._id }),
];

async function renderPlanning(options: PlanningApiOptions = {}) {
  const api = mockPlanningApi({ plannings: { "2026-10-24": TODAY_PLANNING }, ...options });
  const view = renderWithProviders(<NewPlanning />, { url: "/DoPlanning" });
  await waitFor(() => expect(api.loads.length).toBeGreaterThan(0));
  await screen.findByText("Alice Martin");
  return { ...view, api };
}

/** The table cell of a post ("Pizzaiolo") and a shift column (0 = morning, 1 = evening). */
function cell(post: string, shift: 0 | 1) {
  const row = screen.getByText(post).closest("tr")!;
  return row.querySelectorAll("td")[shift + 1] as HTMLElement;
}

const addModal = () => screen.getByText("Add Assignment").closest("div.relative") as HTMLElement;
const editModal = () => screen.getByText("Edit Assignment").closest("div.relative") as HTMLElement;
const listModal = () => screen.getByText("Employees in Shift").closest("div.relative") as HTMLElement;

describe("loading", () => {
  it("shows a loading message, then the grid of posts and shifts", async () => {
    mockPlanningApi();
    renderWithProviders(<NewPlanning />);

    expect(screen.getByText("Loading shifts and tasks…")).toBeInTheDocument();
    expect(await screen.findByText("06:00 - 14:00")).toBeInTheDocument();
    expect(screen.getByText("16:00 - 23:00")).toBeInTheDocument();
    expect(screen.getByText("Pizzaiolo")).toBeInTheDocument();
    expect(screen.getByText("Livreur")).toBeInTheDocument();
    expect(screen.getAllByText("+ Add")).toHaveLength(4);
  });

  it("shows why the screen can't be used when the reference data fails", async () => {
    mockPlanningApi();
    server.use(http.get(`${API}/tasks`, () => HttpResponse.json({ message: "x" }, { status: 500 })));
    renderWithProviders(<NewPlanning />);

    expect(
      await screen.findByText(/Couldn't load employees, shifts and posts\. Something went wrong on our side/)
    ).toBeInTheDocument();
  });

  it("shows each employee with backups and tasks, and how many more are hidden", async () => {
    await renderPlanning();

    const morning = cell("Pizzaiolo", 0);
    expect(within(morning).getByText("Alice Martin")).toBeInTheDocument();
    expect(within(morning).getByText("Backup: Bob Brown")).toBeInTheDocument();
    expect(within(morning).getByText("06:00-08:00 Dough")).toBeInTheDocument();

    const evening = cell("Livreur", 1);
    expect(within(evening).getByText("Bob Brown")).toBeInTheDocument();
    expect(within(evening).getAllByText("Backup: No backup")).toHaveLength(2);
    expect(within(evening).queryByText("Dina Diaz")).not.toBeInTheDocument();
    expect(within(evening).getByText("+1")).toBeInTheDocument();
  });
});

describe("day selection", () => {
  it("shows the month and lets the user browse months", async () => {
    const { user } = await renderPlanning();

    expect(screen.getByText("October 2026")).toBeInTheDocument();
    const [prevMonth, nextMonth] = screen.getByText("October 2026").parentElement!.querySelectorAll("button");
    await user.click(nextMonth);
    expect(screen.getByText("November 2026")).toBeInTheDocument();
    await user.click(prevMonth);
    await user.click(prevMonth);
    expect(screen.getByText("September 2026")).toBeInTheDocument();
  });

  it("loads the day clicked in the mini calendar", async () => {
    const { user, api } = await renderPlanning({ plannings: { "2026-10-24": TODAY_PLANNING, "2026-10-20": [makeRecord(CARL)] } });

    await user.click(screen.getByRole("button", { name: "20" }));

    await waitFor(() => expect(within(cell("Pizzaiolo", 0)).getByText("Carl Cohen")).toBeInTheDocument());
    expect(api.loads).toEqual(["2026-10-24", "2026-10-20"]);
    expect(screen.getByRole("button", { name: "20" })).toHaveClass("bg-brand-500");
  });

  // BUG-303: in a time zone ahead of Algiers the days are built at local midnight, which is the previous day in Algiers
  it.fails("loads the clicked day, not the day before, for a manager whose browser is in Paris", async () => {
    const previous = process.env.TZ;
    process.env.TZ = "Europe/Paris";
    try {
      const { user, api } = await renderPlanning();

      await user.click(screen.getByRole("button", { name: "20" }));

      await waitFor(() => expect(api.loads).toHaveLength(2));
      expect(api.loads[1]).toBe("2026-10-20");
    } finally {
      process.env.TZ = previous;
    }
  });

  it("moves one day back or forward and back to today", async () => {
    const { user, api } = await renderPlanning();
    const nav = screen.getByRole("button", { name: "Today" }).closest("div.grid") as HTMLElement;
    const [, prev, next] = within(nav).getAllByRole("button");

    await user.click(next);
    await waitFor(() => expect(api.loads).toContain("2026-10-25"));
    expect(screen.getByRole("button", { name: "Save to every Sunday" })).toBeInTheDocument();
    await user.click(prev);
    await user.click(prev);
    await waitFor(() => expect(api.loads).toContain("2026-10-23"));
    await user.click(screen.getByRole("button", { name: "Today" }));

    await waitFor(() => expect(api.loads.at(-1)).toBe("2026-10-24"));
    expect(screen.getByRole("button", { name: "Save to every Saturday" })).toBeInTheDocument();
  });
});

describe("adding an employee", () => {
  it("adds a main employee with a backup and a task to the clicked cell", async () => {
    const { user } = await renderPlanning();
    await user.click(cell("Pizzaiolo", 1));

    const modal = addModal();
    expect(within(modal).getByText("Pizzaiolo: 16:00 - 23:00")).toBeInTheDocument();
    expect(within(modal).getByRole("button", { name: "Add" })).toBeDisabled();
    await user.type(within(modal).getByPlaceholderText("Type a name or employee number…"), "car");
    await user.click(within(modal).getByText("Carl Cohen"));
    expect(within(modal).getByText(/✓ Carl Cohen/)).toBeInTheDocument();

    await user.type(within(modal).getByPlaceholderText("Search backup employee..."), "dina{Enter}");
    expect(within(modal).getByText("#104")).toBeInTheDocument();
    await user.click(within(modal).getByRole("button", { name: "+ Add task" }));
    await user.type(within(modal).getByPlaceholderText("Task Name"), "Oven");
    const [start, end] = within(modal).getAllByRole("combobox");
    await user.selectOptions(start, "16:00");
    await user.selectOptions(end, "18:00");
    await user.click(within(modal).getByRole("button", { name: "Add" }));

    expect(screen.queryByText("Add Assignment")).not.toBeInTheDocument();
    const evening = cell("Pizzaiolo", 1);
    expect(within(evening).getByText("Carl Cohen")).toBeInTheDocument();
    expect(within(evening).getByText("Backup: Dina Diaz")).toBeInTheDocument();
    expect(within(evening).getByText("16:00-18:00 Oven")).toBeInTheDocument();
  });

  it("lets the user undo choices before adding", async () => {
    const { user } = await renderPlanning();
    await user.click(cell("Pizzaiolo", 1));
    const modal = addModal();

    await user.type(within(modal).getByPlaceholderText("Type a name or employee number…"), "zzz");
    expect(within(modal).getByText("No employees found")).toBeInTheDocument();
    await user.clear(within(modal).getByPlaceholderText("Type a name or employee number…"));
    await user.type(within(modal).getByPlaceholderText("Type a name or employee number…"), "102");
    await user.click(within(modal).getByText("Bob Brown"));
    await user.click(within(modal).getByRole("button", { name: "✕" }));
    expect(within(modal).getByRole("button", { name: "Add" })).toBeDisabled();

    const backup = within(modal).getByPlaceholderText("Search backup employee...");
    await user.type(backup, "nobody{Enter}");
    expect(within(modal).getAllByText("No employees found")).toHaveLength(1);
    await user.clear(backup);
    await user.type(backup, "{Enter}");
    await user.type(backup, "alice");
    await user.click(within(modal).getByText("Alice Martin"));
    expect(within(modal).getByText("#101")).toBeInTheDocument();
    await user.click(within(modal).getByRole("button", { name: "✕" }));
    expect(within(modal).queryByText("#101")).not.toBeInTheDocument();

    await user.click(within(modal).getByRole("button", { name: "+ Add task" }));
    expect(within(modal).queryByText(/No tasks yet/)).not.toBeInTheDocument();
    await user.click(within(modal).getByRole("button", { name: "✕" }));
    expect(within(modal).getByText(/No tasks yet/)).toBeInTheDocument();

    await user.click(within(modal).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Add Assignment")).not.toBeInTheDocument();
  });

  it("warns and keeps the modal open when the employee is already in the cell", async () => {
    const warning = vi.spyOn(toast, "warning");
    const { user } = await renderPlanning();
    await user.click(cell("Pizzaiolo", 0));
    const modal = addModal();

    await user.type(within(modal).getByPlaceholderText("Type a name or employee number…"), "alice");
    await user.click(within(modal).getByText("Alice Martin"));
    await user.click(within(modal).getByRole("button", { name: "Add" }));

    expect(warning).toHaveBeenCalledWith("This employee is already in this slot.");
    expect(screen.getByText("Add Assignment")).toBeInTheDocument();
    expect(within(cell("Pizzaiolo", 0)).getAllByText("Alice Martin")).toHaveLength(1);
  });
});

describe("list, edit and remove", () => {
  it("lists every employee of a cell, including the hidden ones", async () => {
    const { user } = await renderPlanning();

    await user.click(within(cell("Livreur", 1)).getByText("+1"));

    const modal = listModal();
    expect(within(modal).getByText("3 assigned employee(s)")).toBeInTheDocument();
    expect(within(modal).getByText("Dina Diaz")).toBeInTheDocument();
    await user.click(within(modal).getByRole("button", { name: "Hide details" }));
    expect(screen.queryByText("Employees in Shift")).not.toBeInTheDocument();
  });

  it("closes the list with the Escape key", async () => {
    const { user } = await renderPlanning();
    await user.click(within(cell("Pizzaiolo", 0)).getByText("Alice Martin"));

    await user.keyboard("{Escape}");

    expect(screen.queryByText("Employees in Shift")).not.toBeInTheDocument();
  });

  it("removes an employee from the list and closes it when the cell is empty", async () => {
    const { user } = await renderPlanning();
    await user.click(within(cell("Pizzaiolo", 0)).getByText("Alice Martin"));
    const modal = listModal();
    expect(within(modal).getByText("Bob Brown")).toBeInTheDocument();
    expect(within(modal).getByText("06:00-08:00 Dough")).toBeInTheDocument();

    await user.click(within(modal).getByRole("button", { name: "Remove" }));

    expect(screen.queryByText("Employees in Shift")).not.toBeInTheDocument();
    expect(within(cell("Pizzaiolo", 0)).queryByText("Alice Martin")).not.toBeInTheDocument();
  });

  it("keeps the list open while other employees remain", async () => {
    const { user } = await renderPlanning();
    await user.click(within(cell("Livreur", 1)).getByText("Bob Brown"));

    await user.click(within(listModal()).getAllByRole("button", { name: "Remove" })[0]);

    expect(within(listModal()).getByText("2 assigned employee(s)")).toBeInTheDocument();
    expect(within(listModal()).getAllByText(/No backup/)).toHaveLength(2);
  });

  it("changes the main employee, backups and tasks of an assignment", async () => {
    const { user } = await renderPlanning();
    await user.click(within(cell("Pizzaiolo", 0)).getByText("Alice Martin"));
    await user.click(within(listModal()).getByRole("button", { name: "Edit" }));

    const modal = editModal();
    const main = within(modal).getByPlaceholderText("Search employee...");
    expect(main).toHaveValue("Alice Martin");
    await user.click(within(modal).getAllByRole("button", { name: "Remove" })[0]);
    await user.type(main, "zz");
    expect(within(modal).getByText("No employees found")).toBeInTheDocument();
    await user.clear(main);
    await user.type(main, "carl");
    await user.click(within(modal).getByText("#103"));
    expect(main).toHaveValue("Carl Cohen");

    const backup = within(modal).getByPlaceholderText("Search backup employee...");
    await user.type(backup, "nobody");
    expect(within(modal).getByText("No employees found")).toBeInTheDocument();
    await user.clear(backup);
    await user.type(backup, "{Enter}");
    await user.type(backup, "dina{Enter}");
    await user.type(backup, "ali");
    await user.click(within(modal).getByText("Alice Martin"));
    const bobRow = within(modal).getByText("#102").closest("div") as HTMLElement;
    await user.click(within(bobRow).getByRole("button", { name: "✕" }));

    const taskRow = within(modal).getByDisplayValue("Dough").closest("div") as HTMLElement;
    await user.click(within(taskRow).getByRole("button", { name: "✕" }));
    expect(within(modal).getByText(/No tasks yet/)).toBeInTheDocument();
    await user.click(within(modal).getByRole("button", { name: "+ Add task" }));
    await user.type(within(modal).getByPlaceholderText("Task Name"), "Cash");
    await user.selectOptions(within(modal).getAllByRole("combobox")[0], "07:00");
    await user.selectOptions(within(modal).getAllByRole("combobox")[1], "09:30");
    await user.click(within(modal).getByRole("button", { name: "Update" }));

    expect(screen.queryByText("Edit Assignment")).not.toBeInTheDocument();
    const morning = cell("Pizzaiolo", 0);
    expect(within(morning).getByText("Carl Cohen")).toBeInTheDocument();
    expect(within(morning).getByText("Backup: Dina Diaz, Alice Martin")).toBeInTheDocument();
    expect(within(morning).getByText("07:00-09:30 Cash")).toBeInTheDocument();
  });

  it("leaves the assignment unchanged when the edit is cancelled", async () => {
    const { user } = await renderPlanning();
    await user.click(within(cell("Pizzaiolo", 0)).getByText("Alice Martin"));
    await user.click(within(listModal()).getByRole("button", { name: "Edit" }));
    await user.click(within(editModal()).getByRole("button", { name: "+ Add task" }));

    await user.click(within(editModal()).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Edit Assignment")).not.toBeInTheDocument();
    expect(within(cell("Pizzaiolo", 0)).getByText("Alice Martin")).toBeInTheDocument();
  });
});

describe("saving", () => {
  it("saves the day and confirms it", async () => {
    const success = vi.spyOn(toast, "success");
    const { user, api } = await renderPlanning();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(success).toHaveBeenCalledWith("Planning saved."));
    expect(api.saves).toHaveLength(1);
    expect(api.saves[0].entries.map((e) => e.empId)).toEqual(["e1", "e2", "e3", "e4"]);
  });

  // Regression for 5feb993 "CleanPlanningFromDuplicates"
  it("disables every save button while a save is running", async () => {
    const { user } = await renderPlanning();
    const saves: unknown[] = [];
    let finishSave!: () => void;
    const saveFinished = new Promise<void>((resolve) => (finishSave = resolve));
    server.use(
      http.post(`${API}/planning/bulk`, async ({ request }) => {
        saves.push(await request.json());
        await saveFinished;
        return HttpResponse.json({});
      })
    );
    const save = screen.getByRole("button", { name: "Save" });

    await user.click(save);

    expect(save).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save to every Saturday" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save to the next Saturdays" })).toBeDisabled();
    await user.click(save);
    finishSave();
    await waitFor(() => expect(save).toBeEnabled());
    expect(saves).toHaveLength(1);
  });

  it("saves to every Saturday and to the next Saturdays", async () => {
    const { user, api } = await renderPlanning();

    await user.click(screen.getByRole("button", { name: "Save to every Saturday" }));
    await waitFor(() => expect(api.saves).toHaveLength(5));
    await user.click(screen.getByRole("button", { name: "Save to the next Saturdays" }));

    await waitFor(() => expect(api.saves).toHaveLength(7));
    expect(api.saves.slice(5).map((s) => s.planDate).sort()).toEqual(["2026-10-24", "2026-10-31"]);
  });
});

describe("table only view", () => {
  it("hides the calendar and the actions, and shows every employee of a cell", async () => {
    const { user } = await renderPlanning();

    await user.click(screen.getByRole("button", { name: "Show table only" }));

    expect(screen.queryByText("October 2026")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show table only" })).toBeDisabled();
    const evening = cell("Livreur", 1);
    expect(within(evening).getByText("Dina Diaz")).toBeInTheDocument();
    expect(within(cell("Pizzaiolo", 0)).getByText("06:00-08:00 Dough")).toBeInTheDocument();
    expect(within(cell("Pizzaiolo", 1)).getByText("+ Add")).toBeInTheDocument();

    await user.click(within(evening).getByText("Dina Diaz"));
    expect(within(listModal()).getByText("3 assigned employee(s)")).toBeInTheDocument();
    await user.click(within(listModal()).getByRole("button", { name: "Hide details" }));
    await user.click(cell("Pizzaiolo", 1));
    expect(screen.getByText("Add Assignment")).toBeInTheDocument();
    await user.click(within(addModal()).getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Back to normal view" }));
    expect(screen.getByText("October 2026")).toBeInTheDocument();
  });
});

describe("importing", () => {
  function excelFile(rows: string[][]) {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Planning");
    return new File([XLSX.write(book, { type: "array", bookType: "xlsx" })], "planning.xlsx");
  }

  it("opens the Excel or PDF file picker from the import menu", async () => {
    const { user, container } = await renderPlanning();
    const excel = container.querySelector('input[accept=".xlsx,.xls"]') as HTMLInputElement;
    const pdf = container.querySelector('input[accept=".pdf"]') as HTMLInputElement;
    const excelClick = vi.spyOn(excel, "click").mockImplementation(() => {});
    const pdfClick = vi.spyOn(pdf, "click").mockImplementation(() => {});

    await user.click(screen.getByRole("button", { name: "Import from File" }));
    await user.click(screen.getByRole("button", { name: /Import from Excel/ }));
    expect(excelClick).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Import from PDF/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Import from File" }));
    await user.click(screen.getByRole("button", { name: /Import from PDF/ }));
    expect(pdfClick).toHaveBeenCalled();
  });

  it("shows the planning read from an Excel file", async () => {
    const { container } = await renderPlanning();
    const excel = container.querySelector('input[accept=".xlsx,.xls"]') as HTMLInputElement;

    fireEvent.change(excel, { target: { files: [excelFile([["Hour"], ["16H", "Dina Diaz\nBackup: Alice Martin"]])] } });

    await waitFor(() => expect(within(cell("Pizzaiolo", 1)).getByText("Dina Diaz")).toBeInTheDocument());
    expect(within(cell("Pizzaiolo", 1)).getByText("Backup: Alice Martin")).toBeInTheDocument();
    expect(within(cell("Pizzaiolo", 0)).queryByText("Alice Martin")).not.toBeInTheDocument();
  });

  it("imports the planning of another date", async () => {
    const { user, api } = await renderPlanning({
      plannings: { "2026-10-24": TODAY_PLANNING, "2026-10-17": [makeRecord(BOB)] },
    });
    await user.click(screen.getByRole("button", { name: "Import from Date" }));
    const modal = screen.getByText("Import Planning").closest("div.relative") as HTMLElement;
    expect(within(modal).getByRole("button", { name: "Import" })).toBeDisabled();

    await user.type(within(modal).getByPlaceholderText("YYYY-MM-DD"), "2026-10-17");
    await user.click(within(modal).getByRole("button", { name: "Import" }));

    await waitFor(() => expect(screen.queryByText("Import Planning")).not.toBeInTheDocument());
    expect(api.loads).toEqual(["2026-10-24", "2026-10-17"]);
    expect(within(cell("Pizzaiolo", 0)).getByText("Bob Brown")).toBeInTheDocument();
    expect(within(cell("Pizzaiolo", 0)).queryByText("Alice Martin")).not.toBeInTheDocument();
  });

  it("closes the import-from-date window with the Escape key", async () => {
    const { user } = await renderPlanning();
    await user.click(screen.getByRole("button", { name: "Import from Date" }));

    await user.keyboard("{Escape}");

    expect(screen.queryByText("Import Planning")).not.toBeInTheDocument();
  });

  it("closes the import-from-date window on cancel", async () => {
    const { user, api } = await renderPlanning();
    await user.click(screen.getByRole("button", { name: "Import from Date" }));

    await user.click(within(screen.getByText("Import Planning").closest("div.relative") as HTMLElement).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Import Planning")).not.toBeInTheDocument();
    expect(api.loads).toEqual(["2026-10-24"]);
  });
});

describe("copying a month", () => {
  it("copies the chosen month to another one", async () => {
    const { user, api } = await renderPlanning();
    await user.click(screen.getByRole("button", { name: "Copy Month" }));
    const modal = screen.getByText("Copy Monthly Planning").parentElement as HTMLElement;
    const copy = within(modal).getByRole("button", { name: "Copy Month" });
    expect(copy).toBeDisabled();

    const [sourceMonth, destinationMonth] = within(modal).getAllByRole("combobox", { name: "Month" });
    const [sourceYear] = within(modal).getAllByRole("combobox", { name: "Year" });
    await user.selectOptions(sourceMonth, "09");
    await user.selectOptions(sourceYear, "2026");
    await user.selectOptions(destinationMonth, "11");
    await user.click(copy);

    await waitFor(() => expect(screen.queryByText("Copy Monthly Planning")).not.toBeInTheDocument());
    expect(api.copies).toEqual([{ sourceMonth: "2026-09", destinationMonth: "2026-11" }]);
  });

  it("shows that the copy is running", async () => {
    const { user } = await renderPlanning();
    server.use(
      http.post(`${API}/planning/copy-month`, async () => {
        await delay(100);
        return HttpResponse.json({ message: "Done" });
      })
    );
    await user.click(screen.getByRole("button", { name: "Copy Month" }));
    const modal = screen.getByText("Copy Monthly Planning").parentElement as HTMLElement;
    const [source, destination] = within(modal).getAllByRole("combobox", { name: "Month" });
    await user.selectOptions(source, "09");
    await user.selectOptions(destination, "10");

    await user.click(within(modal).getByRole("button", { name: "Copy Month" }));

    expect(within(modal).getByRole("button", { name: "Copying…" })).toBeDisabled();
    expect(within(modal).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await waitFor(() => expect(screen.queryByText("Copy Monthly Planning")).not.toBeInTheDocument());
  });

  it("closes without copying on cancel", async () => {
    const { user, api } = await renderPlanning();
    await user.click(screen.getByRole("button", { name: "Copy Month" }));

    await user.click(within(screen.getByText("Copy Monthly Planning").parentElement as HTMLElement).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Copy Monthly Planning")).not.toBeInTheDocument();
    expect(api.copies).toEqual([]);
  });
});
