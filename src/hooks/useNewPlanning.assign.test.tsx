import { describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { toast } from "@/lib/notify";
import type { Cell } from "@/components/calendar/types";
import {
  ALICE,
  BOB,
  CARL,
  DINA,
  EVENING,
  MORNING,
  fixTheClock,
  makeRecord,
  makeShiftTask,
  mockPlanningApi,
  renderPlanningHook,
} from "./useNewPlanning.fixtures";

fixTheClock();

const MORNING_CELL = { postId: 1, shiftId: MORNING._id };

/** Renders the hook with `records` saved for today. */
async function setup(records = [makeRecord(ALICE, { backups: [{ id: BOB._id, title: "Bob Brown" }], tasks: [makeShiftTask()] })]) {
  const api = mockPlanningApi({ plannings: { "2026-10-24": records } });
  const hook = await renderPlanningHook(api);
  return { ...hook, api };
}

const cellIds = (cells: Cell[]) => cells.map((c) => c.id);

describe("adding an employee to a cell", () => {
  it("opens the add modal on the clicked cell with empty fields", async () => {
    const { result } = await setup([]);
    act(() => {
      result.current.setEmpSearch("old");
      result.current.setBackupEmpSearch("old");
      result.current.addTask();
    });

    act(() => result.current.handleCellClick(1, MORNING._id));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.activeCell).toEqual(MORNING_CELL);
    expect(result.current.empSearch).toBe("");
    expect(result.current.backupEmpSearch).toBe("");
    expect(result.current.selectedEmployee).toBeNull();
    expect(result.current.addTasks).toEqual([]);
  });

  it("adds the chosen employee with his backups and tasks, then closes the modal", async () => {
    const { result } = await setup([]);
    act(() => result.current.handleCellClick(1, EVENING._id));
    act(() => result.current.setSelectedEmployee(CARL));
    act(() => result.current.addBackup(DINA));
    act(() => result.current.addTask());
    const taskId = result.current.addTasks[0].id;
    act(() => result.current.updateTask(taskId, { label: "Oven", startTime: "16:00", endTime: "18:00" }));

    act(() => result.current.handleSave());

    expect(result.current.grid[1][EVENING._id]).toEqual([
      {
        id: "e3",
        title: "Carl Cohen",
        backups: [{ id: "e4", title: "Dina Diaz" }],
        tasks: [{ id: taskId, label: "Oven", startTime: "16:00", endTime: "18:00" }],
      },
    ]);
    expect(result.current.isOpen).toBe(false);
    expect(result.current.activeCell).toBeNull();
    expect(result.current.selectedEmployee).toBeNull();
    expect(result.current.selectedBackupEmployees).toEqual([]);
    expect(result.current.addTasks).toEqual([]);
  });

  it("never stores the main employee as his own backup", async () => {
    const { result } = await setup([]);
    act(() => result.current.handleCellClick(1, MORNING._id));
    act(() => result.current.addBackup(CARL));
    act(() => result.current.addBackup(DINA));
    act(() => result.current.setSelectedEmployee(CARL));

    act(() => result.current.handleSave());

    expect(result.current.grid[1][MORNING._id].find((c) => c.id === "e3")?.backups).toEqual([
      { id: "e4", title: "Dina Diaz" },
    ]);
  });

  it("does nothing until an employee is chosen", async () => {
    const { result } = await setup([]);
    act(() => result.current.handleCellClick(1, MORNING._id));

    act(() => result.current.handleSave());

    expect(result.current.grid[1][MORNING._id]).toEqual([]);
    expect(result.current.isOpen).toBe(true);
  });

  it("does nothing without an active cell", async () => {
    const { result } = await setup([]);
    act(() => result.current.setSelectedEmployee(BOB));

    act(() => result.current.handleSave());

    expect(Object.values(result.current.grid).flatMap((r) => Object.values(r).flat())).toEqual([]);
  });

  it("refuses the same employee twice in the same cell", async () => {
    const warning = vi.spyOn(toast, "warning");
    const { result } = await setup();
    act(() => result.current.handleCellClick(1, MORNING._id));
    act(() => result.current.setSelectedEmployee(ALICE));

    act(() => result.current.handleSave());

    expect(warning).toHaveBeenCalledWith("This employee is already in this slot.");
    expect(cellIds(result.current.grid[1][MORNING._id])).toEqual(["e1"]);
    expect(result.current.isOpen).toBe(true);
  });

  it("refuses an employee added twice in a row before saving", async () => {
    const warning = vi.spyOn(toast, "warning");
    const { result } = await setup([]);
    for (let i = 0; i < 2; i++) {
      act(() => result.current.handleCellClick(1, MORNING._id));
      act(() => result.current.setSelectedEmployee(BOB));
      act(() => result.current.handleSave());
    }

    expect(cellIds(result.current.grid[1][MORNING._id])).toEqual(["e2"]);
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it("lets the same employee be planned in another cell", async () => {
    const { result } = await setup();
    act(() => result.current.handleCellClick(2, MORNING._id));
    act(() => result.current.setSelectedEmployee(ALICE));

    act(() => result.current.handleSave());

    expect(cellIds(result.current.grid[2][MORNING._id])).toEqual(["e1"]);
  });

  it("clears everything when the modal is closed", async () => {
    const { result } = await setup([]);
    act(() => result.current.handleCellClick(1, MORNING._id));
    act(() => {
      result.current.setEmpSearch("car");
      result.current.setSelectedEmployee(CARL);
      result.current.addBackup(DINA);
      result.current.setBackupEmpSearch("bo");
      result.current.addTask();
    });

    act(() => result.current.handleClose());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.activeCell).toBeNull();
    expect(result.current.empSearch).toBe("");
    expect(result.current.selectedEmployee).toBeNull();
    expect(result.current.selectedBackupEmployees).toEqual([]);
    expect(result.current.backupEmpSearch).toBe("");
    expect(result.current.addTasks).toEqual([]);
  });
});

describe("employee search", () => {
  it("matches first name, last name or employee number, ignoring case", async () => {
    const { result } = await setup([]);

    act(() => result.current.setEmpSearch("ALI"));
    expect(result.current.filteredEmployees).toEqual([ALICE]);
    act(() => result.current.setEmpSearch("brown"));
    expect(result.current.filteredEmployees).toEqual([BOB]);
    act(() => result.current.setEmpSearch("103"));
    expect(result.current.filteredEmployees).toEqual([CARL]);
    act(() => result.current.setEmpSearch(""));
    expect(result.current.filteredEmployees).toHaveLength(4);
  });

  it("offers as backups everyone but the main employee and the backups already added", async () => {
    const { result } = await setup([]);
    act(() => result.current.setSelectedEmployee(ALICE));
    act(() => result.current.addBackup(BOB));

    expect(result.current.filteredBackupEmployees).toEqual([CARL, DINA]);
    act(() => result.current.setBackupEmpSearch("  dina diaz "));
    expect(result.current.filteredBackupEmployees).toEqual([DINA]);
    act(() => result.current.setBackupEmpSearch("104"));
    expect(result.current.filteredBackupEmployees).toEqual([DINA]);
    act(() => result.current.setBackupEmpSearch("cohen"));
    expect(result.current.filteredBackupEmployees).toEqual([CARL]);
    act(() => result.current.setBackupEmpSearch("CAR"));
    expect(result.current.filteredBackupEmployees).toEqual([CARL]);
  });

  it("adds a backup only once, clears the search, and removes it", async () => {
    const { result } = await setup([]);
    act(() => result.current.setBackupEmpSearch("bob"));
    act(() => result.current.addBackup(BOB));
    act(() => result.current.addBackup(BOB));

    expect(result.current.selectedBackupEmployees).toEqual([BOB]);
    expect(result.current.backupEmpSearch).toBe("");
    act(() => result.current.removeBackup(BOB._id));
    expect(result.current.selectedBackupEmployees).toEqual([]);
  });

  it("adds, edits and removes tasks in the add modal", async () => {
    const { result } = await setup([]);
    act(() => result.current.addTask());
    act(() => result.current.addTask());
    const [first, second] = result.current.addTasks;

    act(() => result.current.updateTask(second.id, { label: "Cash" }));
    act(() => result.current.removeTask(first.id));

    expect(result.current.addTasks).toEqual([{ id: second.id, label: "Cash", startTime: "", endTime: "" }]);
    act(() => result.current.setAddTasks([]));
    expect(result.current.addTasks).toEqual([]);
  });
});

describe("editing an assignment", () => {
  async function openEditOnAlice() {
    const ctx = await setup();
    const alice = ctx.result.current.grid[1][MORNING._id][0];
    act(() => ctx.result.current.openEditModal(alice, MORNING_CELL));
    return ctx;
  }

  it("opens the edit modal filled with the assignment", async () => {
    const { result } = await openEditOnAlice();

    expect(result.current.isEditModalOpen).toBe(true);
    expect(result.current.editingEmployee?.id).toBe("e1");
    expect(result.current.editSelectedEmployee).toEqual(ALICE);
    expect(result.current.editTitle).toBe("Alice Martin");
    expect(result.current.editBackupEmployees).toEqual([BOB]);
    expect(result.current.editTasks).toEqual([makeShiftTask()]);
  });

  it("keeps the saved name and drops unknown backups for an employee no longer in the list", async () => {
    const { result } = await setup([]);
    const ghost = { id: "gone", title: "Old Worker", backups: [{ id: "also-gone", title: "?" }, { id: BOB._id, title: "Bob Brown" }] };

    act(() => result.current.openEditModal(ghost, MORNING_CELL));

    expect(result.current.editSelectedEmployee).toBeNull();
    expect(result.current.editTitle).toBe("Old Worker");
    expect(result.current.editBackupEmployees).toEqual([BOB]);
    expect(result.current.editTasks).toEqual([]);
  });

  it("replaces the main employee, backups and tasks", async () => {
    const { result } = await openEditOnAlice();
    act(() => result.current.setEditSelectedEmployee(CARL));
    act(() => result.current.addEditBackup(DINA));
    act(() => result.current.addEditBackup(CARL));
    act(() => result.current.removeEditTask("task-1"));
    act(() => result.current.addEditTask());
    const newTask = result.current.editTasks[0];
    act(() => result.current.updateEditTask(newTask.id, { label: "Cash" }));

    act(() => result.current.handleEdit());

    expect(result.current.grid[1][MORNING._id]).toEqual([
      {
        id: "e3",
        title: "Carl Cohen",
        backups: [
          { id: "e2", title: "Bob Brown" },
          { id: "e4", title: "Dina Diaz" },
        ],
        tasks: [{ ...newTask, label: "Cash" }],
        planningId: "p-e1",
      },
    ]);
    expect(result.current.isEditModalOpen).toBe(false);
    expect(result.current.editingEmployee).toBeNull();
    expect(result.current.activeCell).toBeNull();
  });

  it("saves the same employee again without calling it a duplicate", async () => {
    const warning = vi.spyOn(toast, "warning");
    const { result } = await openEditOnAlice();
    act(() => result.current.removeEditBackup(BOB._id));

    act(() => result.current.handleEdit());

    expect(warning).not.toHaveBeenCalled();
    expect(result.current.grid[1][MORNING._id][0]).toMatchObject({ id: "e1", title: "Alice Martin", backups: [] });
  });

  it("refuses to switch to an employee who is already in the cell", async () => {
    const warning = vi.spyOn(toast, "warning");
    const { result } = await setup([makeRecord(ALICE), makeRecord(BOB)]);
    act(() => result.current.openEditModal(result.current.grid[1][MORNING._id][0], MORNING_CELL));
    act(() => result.current.setEditSelectedEmployee(BOB));

    act(() => result.current.handleEdit());

    expect(warning).toHaveBeenCalledWith("This employee is already in this slot.");
    expect(cellIds(result.current.grid[1][MORNING._id])).toEqual(["e1", "e2"]);
    expect(result.current.isEditModalOpen).toBe(true);
  });

  it("does nothing when no assignment is being edited", async () => {
    const { result } = await setup();
    const before = result.current.grid;

    act(() => result.current.handleEdit());

    expect(result.current.grid).toBe(before);
  });

  // BUG-301: typing a new name without picking it from the list shows that name but keeps saving the old employee
  it("never shows a name that differs from the employee who will be saved", async () => {
    const { result } = await openEditOnAlice();
    act(() => result.current.setEditSelectedEmployee(null));
    act(() => result.current.setEditTitle("Bob Brown"));

    act(() => result.current.handleEdit());

    const cell = result.current.grid[1][MORNING._id][0];
    const saved = [ALICE, BOB, CARL, DINA].find((e) => e._id === cell.id)!;
    expect(cell.title).toBe(`${saved.firstName} ${saved.lastName}`);
  });

  it("searches the main employee only once something is typed", async () => {
    const { result } = await openEditOnAlice();
    act(() => result.current.setEditTitle(""));
    expect(result.current.filteredEditEmployees).toEqual([]);

    act(() => result.current.setEditTitle("bob b"));
    expect(result.current.filteredEditEmployees).toEqual([BOB]);
    act(() => result.current.setEditTitle("diaz"));
    expect(result.current.filteredEditEmployees).toEqual([DINA]);
    act(() => result.current.setEditTitle("103"));
    expect(result.current.filteredEditEmployees).toEqual([CARL]);
    act(() => result.current.setEditTitle("dina"));
    expect(result.current.filteredEditEmployees).toEqual([DINA]);
  });

  it("finds an employee without an employee number by name", async () => {
    const api = mockPlanningApi({
      employees: [{ ...ALICE, empNumber: undefined as unknown as number }],
    });
    const { result } = await renderPlanningHook(api);

    act(() => result.current.setEditTitle("alice"));
    expect(result.current.filteredEditEmployees).toHaveLength(1);
  });

  it("offers as backups everyone but the main employee and the current backups", async () => {
    const { result } = await openEditOnAlice();

    expect(result.current.filteredEditBackupEmployees).toEqual([CARL, DINA]);
    act(() => result.current.setEditSelectedEmployee(null));
    expect(result.current.filteredEditBackupEmployees).toEqual([CARL, DINA]);
    act(() => result.current.setEditBackupSearch("dina diaz"));
    expect(result.current.filteredEditBackupEmployees).toEqual([DINA]);
    act(() => result.current.setEditBackupSearch("104"));
    expect(result.current.filteredEditBackupEmployees).toEqual([DINA]);
    act(() => result.current.setEditBackupSearch("cohen"));
    expect(result.current.filteredEditBackupEmployees).toEqual([CARL]);
    act(() => result.current.setEditBackupSearch("CAR"));
    expect(result.current.filteredEditBackupEmployees).toEqual([CARL]);
  });

  it("offers every employee as backup when no main employee is known", async () => {
    const { result } = await setup([]);
    expect(result.current.filteredEditBackupEmployees).toHaveLength(4);
  });

  it("adds an edit backup only once and clears the search", async () => {
    const { result } = await openEditOnAlice();
    act(() => result.current.setEditBackupSearch("bob"));
    act(() => result.current.addEditBackup(BOB));

    expect(result.current.editBackupEmployees).toEqual([BOB]);
    expect(result.current.editBackupSearch).toBe("");
  });

  it("clears the edit modal on cancel and leaves the grid alone", async () => {
    const { result } = await openEditOnAlice();
    act(() => result.current.setEditSelectedEmployee(CARL));

    act(() => result.current.handleCloseEditModal());

    expect(result.current.isEditModalOpen).toBe(false);
    expect(result.current.editingEmployee).toBeNull();
    expect(result.current.editTitle).toBe("");
    expect(result.current.editBackupEmployees).toEqual([]);
    expect(result.current.editTasks).toEqual([]);
    expect(cellIds(result.current.grid[1][MORNING._id])).toEqual(["e1"]);
  });
});

describe("removing an employee", () => {
  it("removes the employee from the given cell only", async () => {
    const { result } = await setup([makeRecord(ALICE), makeRecord(BOB), makeRecord(ALICE, { shiftId: EVENING._id })]);

    act(() => result.current.handleDelete(ALICE._id, MORNING_CELL));

    expect(cellIds(result.current.grid[1][MORNING._id])).toEqual(["e2"]);
    expect(cellIds(result.current.grid[1][EVENING._id])).toEqual(["e1"]);
  });

  it("uses the active cell when none is given", async () => {
    const { result } = await setup();
    act(() => result.current.handleCellClick(1, MORNING._id));

    act(() => result.current.handleDelete(ALICE._id));

    expect(result.current.grid[1][MORNING._id]).toEqual([]);
    expect(result.current.isOpen).toBe(false);
    expect(result.current.activeCell).toBeNull();
  });

  it("does nothing without a cell", async () => {
    const { result } = await setup();

    act(() => result.current.handleDelete(ALICE._id));

    expect(cellIds(result.current.grid[1][MORNING._id])).toEqual(["e1"]);
  });
});

describe("list of a cell", () => {
  it("lists the employees of the chosen cell", async () => {
    const { result } = await setup([makeRecord(ALICE), makeRecord(BOB)]);
    expect(result.current.listEmployees).toEqual([]);

    act(() => {
      result.current.setListCell(MORNING_CELL);
      result.current.setIsListModalOpen(true);
    });

    expect(result.current.isListModalOpen).toBe(true);
    expect(cellIds(result.current.listEmployees)).toEqual(["e1", "e2"]);
    act(() => result.current.setListCell({ postId: 99, shiftId: "x" }));
    expect(result.current.listEmployees).toEqual([]);
  });
});
