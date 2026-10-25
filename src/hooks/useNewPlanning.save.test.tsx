import { describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { http, HttpResponse, delay } from "msw";
import { API, server } from "@/test/server";
import { toast } from "@/lib/notify";
import {
  ALICE,
  BOB,
  CARL,
  DELIVERY,
  EVENING,
  MORNING,
  PIZZAIOLO,
  fixTheClock,
  failSaves,
  makeRecord,
  makeShiftTask,
  mockPlanningApi,
  renderPlanningHook,
  type ImportedRecord,
} from "./useNewPlanning.fixtures";

fixTheClock();

const SATURDAYS_OF_OCTOBER = ["2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31"];

async function setup(records: ImportedRecord[] = [makeRecord(ALICE)], options: Parameters<typeof mockPlanningApi>[0] = {}) {
  const api = mockPlanningApi({ plannings: { "2026-10-24": records }, ...options });
  const hook = await renderPlanningHook(api);
  return { ...hook, api };
}

describe("saving the selected day", () => {
  it("sends every planned employee of the day in one request", async () => {
    const success = vi.spyOn(toast, "success");
    const tasks = [makeShiftTask()];
    const { result, api } = await setup([
      makeRecord(CARL, { taskId: DELIVERY.taskId, shiftId: EVENING._id }),
      makeRecord(ALICE, { backups: [{ id: BOB._id, title: "Bob Brown" }], tasks }),
    ]);

    await act(() => result.current.handleSavePlanning());

    expect(api.saves).toEqual([
      {
        planDate: "2026-10-24",
        entries: [
          { shiftId: MORNING._id, empId: "e1", backupEmpIds: ["e2"], taskId: PIZZAIOLO.taskId, planDate: "2026-10-24", tasks },
          { shiftId: EVENING._id, empId: "e3", backupEmpIds: [], taskId: DELIVERY.taskId, planDate: "2026-10-24", tasks: [] },
        ],
      },
    ]);
    expect(success).toHaveBeenCalledWith("Planning saved.");
  });

  it("sends each backup once and never the main employee as his own backup", async () => {
    const { result, api } = await setup([
      makeRecord(ALICE, {
        backups: [
          { id: BOB._id, title: "Bob Brown" },
          { id: BOB._id, title: "Bob Brown" },
          { id: ALICE._id, title: "Alice Martin" },
        ],
      }),
    ]);

    await act(() => result.current.handleSavePlanning());

    expect(api.saves[0].entries[0].backupEmpIds).toEqual(["e2"]);
  });

  it("saves the day shown, after moving to another day", async () => {
    const { result, api } = await setup([], { plannings: { "2026-10-25": [makeRecord(BOB)] } });
    act(() => result.current.goNext());
    await waitFor(() => expect(result.current.grid[1][MORNING._id]).toHaveLength(1));

    await act(() => result.current.handleSavePlanning());

    expect(api.saves.map((s) => s.planDate)).toEqual(["2026-10-25"]);
    expect(api.saves[0].entries.map((e) => e.empId)).toEqual(["e2"]);
  });

  it("asks for at least one employee instead of saving an empty day", async () => {
    const warning = vi.spyOn(toast, "warning");
    const { result, api } = await setup([]);

    await act(() => result.current.handleSavePlanning());

    expect(warning).toHaveBeenCalledWith("Add at least one employee to this day before saving.");
    expect(api.saves).toEqual([]);
  });

  it("shows the server's reason when the save is refused", async () => {
    const error = vi.spyOn(toast, "error");
    const { result } = await setup();
    failSaves(400);

    await act(() => result.current.handleSavePlanning());

    expect(error).toHaveBeenCalledWith("Couldn't save the planning. Database is read-only");
    expect(result.current.isSaving).toBe(false);
  });

  // Regression for 5feb993 "CleanPlanningFromDuplicates"
  it("sends the day only once when Save is clicked twice quickly", async () => {
    const { result } = await setup();
    const saves = failSaves(200, [], 50);

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.handleSavePlanning();
      second = result.current.handleSavePlanning();
    });
    await waitFor(() => expect(result.current.isSaving).toBe(true));
    await act(() => Promise.all([first, second]));

    expect(saves).toHaveLength(1);
    expect(result.current.isSaving).toBe(false);
  });

  // Regression for 5feb993 "CleanPlanningFromDuplicates"
  it("ignores 'Save to every weekday' while a save is still running", async () => {
    const { result } = await setup();
    const saves = failSaves(200, [], 50);

    let first!: Promise<void>;
    act(() => {
      first = result.current.handleSavePlanning();
    });
    await act(() => result.current.handleSaveToAllWeekdays());
    await act(() => result.current.handleSaveToNextWeekdays());
    await act(() => first);

    expect(saves.map((s) => s.planDate)).toEqual(["2026-10-24"]);
  });

  it("can save again after a save has finished", async () => {
    const { result, api } = await setup();

    await act(() => result.current.handleSavePlanning());
    await act(() => result.current.handleSavePlanning());

    expect(api.saves).toHaveLength(2);
  });

  // BUG-302: Save is possible while the next day is loading, and writes the previous day's employees onto it
  it("does not save the previous day's employees onto a day that is still loading", async () => {
    const { result, api } = await setup([makeRecord(ALICE)], {
      slowDays: ["2026-10-25"],
      plannings: { "2026-10-24": [makeRecord(ALICE)], "2026-10-25": [makeRecord(BOB)] },
    });
    act(() => result.current.goNext());
    await waitFor(() => expect(api.loads).toContain("2026-10-25"));

    await act(() => result.current.handleSavePlanning());
    api.release("2026-10-25");
    await waitFor(() => expect(result.current.loadingGrid).toBe(false));

    const aliceOn25th = api.saves.filter((s) => s.planDate === "2026-10-25" && s.entries.some((e) => e.empId === "e1"));
    expect(aliceOn25th).toEqual([]);
  });
});

describe("save to every weekday of the month", () => {
  it("saves the day's planning on every Saturday of October", async () => {
    const success = vi.spyOn(toast, "success");
    const { result, api } = await setup([makeRecord(ALICE, { backups: [{ id: BOB._id, title: "Bob Brown" }] })]);

    await act(() => result.current.handleSaveToAllWeekdays());

    expect(api.saves.map((s) => s.planDate).sort()).toEqual(SATURDAYS_OF_OCTOBER);
    const tenth = api.saves.find((s) => s.planDate === "2026-10-10")!;
    expect(tenth.entries).toEqual([
      { shiftId: MORNING._id, empId: "e1", backupEmpIds: ["e2"], taskId: 1, tasks: [], planDate: "2026-10-10" },
    ]);
    expect(success).toHaveBeenCalledWith("Planning copied to 5 days (Saturday).");
  });

  it("warns instead of copying an empty day", async () => {
    const warning = vi.spyOn(toast, "warning");
    const { result, api } = await setup([]);

    await act(() => result.current.handleSaveToAllWeekdays());

    expect(warning).toHaveBeenCalledWith("There is no one planned on this day to copy.");
    expect(api.saves).toEqual([]);
  });

  it("says how many days were saved when some of them fail", async () => {
    const error = vi.spyOn(toast, "error");
    const { result } = await setup();
    const saves = failSaves(500, ["2026-10-10"]);

    await act(() => result.current.handleSaveToAllWeekdays());

    expect(saves).toHaveLength(5);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toMatch(/^Copied to 4 of 5 days \(Saturday\)\. /);
  });

  // BUG-304: a failed day shows the raw "date: status {json}" text in the toast
  it("explains a failed day in plain words, without the raw server reply", async () => {
    const error = vi.spyOn(toast, "error");
    const { result } = await setup();
    failSaves(500, ["2026-10-10"]);

    await act(() => result.current.handleSaveToAllWeekdays());

    expect(error).toHaveBeenCalledWith(
      "Copied to 4 of 5 days (Saturday). Something went wrong on our side. Please try again in a moment."
    );
  });

  it("reports a network failure", async () => {
    const error = vi.spyOn(toast, "error");
    const { result } = await setup();
    server.use(http.post(`${API}/planning/bulk`, () => HttpResponse.error()));

    await act(() => result.current.handleSaveToAllWeekdays());

    expect(error.mock.calls[0][0]).toMatch(/^Copied to 0 of 5 days \(Saturday\)\. /);
  });

  // BUG-303: in a time zone ahead of Algiers the days are built at local midnight, which is the previous day in Algiers
  it("saves on Saturdays, not Fridays, for a manager whose browser is in Paris", async () => {
    const previous = process.env.TZ;
    process.env.TZ = "Europe/Paris";
    try {
      const { result, api } = await setup();

      await act(() => result.current.handleSaveToAllWeekdays());

      expect(api.saves.map((s) => s.planDate).sort()).toEqual(SATURDAYS_OF_OCTOBER);
    } finally {
      process.env.TZ = previous;
    }
  });
});

describe("save to the next weekdays", () => {
  it("saves on the selected Saturday and the following ones of the month", async () => {
    const success = vi.spyOn(toast, "success");
    const { result, api } = await setup();

    await act(() => result.current.handleSaveToNextWeekdays());

    expect(api.saves.map((s) => s.planDate).sort()).toEqual(["2026-10-24", "2026-10-31"]);
    expect(api.saves[0].entries[0]).toMatchObject({ empId: "e1", shiftId: MORNING._id, taskId: 1 });
    expect(success).toHaveBeenCalledWith("Planning saved to 2 days (Saturday), starting from the selected day.");
  });

  it("only saves the selected day when it is the last one of the month", async () => {
    const { result, api } = await setup([], { plannings: { "2026-10-31": [makeRecord(ALICE)] } });
    act(() => result.current.setCurrentDate(new Date("2026-10-31T10:00:00+01:00")));
    await waitFor(() => expect(result.current.grid[1][MORNING._id]).toHaveLength(1));

    await act(() => result.current.handleSaveToNextWeekdays());

    expect(api.saves.map((s) => s.planDate)).toEqual(["2026-10-31"]);
  });

  it("warns instead of copying an empty day", async () => {
    const warning = vi.spyOn(toast, "warning");
    const { result, api } = await setup([]);

    await act(() => result.current.handleSaveToNextWeekdays());

    expect(warning).toHaveBeenCalledWith("There is no one planned on this day to copy.");
    expect(api.saves).toEqual([]);
  });

  it("says how many days were saved when some of them fail", async () => {
    const error = vi.spyOn(toast, "error");
    const success = vi.spyOn(toast, "success");
    const { result } = await setup();
    failSaves(500, ["2026-10-31"]);

    await act(() => result.current.handleSaveToNextWeekdays());

    expect(error.mock.calls[0][0]).toMatch(/^Saved to 1 of 2 days \(Saturday\)\. /);
    expect(success).not.toHaveBeenCalled();
  });
});

describe("copying a month", () => {
  it("opens the copy modal with empty months", async () => {
    const { result } = await setup();
    act(() => {
      result.current.setCopySourceMonth("2026-09");
      result.current.setCopyDestinationMonth("2026-10");
    });

    act(() => result.current.handleCopyMonthClick());

    expect(result.current.isCopyMonthModalOpen).toBe(true);
    expect(result.current.copySourceMonth).toBe("");
    expect(result.current.copyDestinationMonth).toBe("");
  });

  it("asks for both months", async () => {
    const warning = vi.spyOn(toast, "warning");
    const { result, api } = await setup();
    act(() => result.current.setCopySourceMonth("2026-09"));

    await act(() => result.current.handleCopyMonth());

    expect(warning).toHaveBeenCalledWith("Choose both the month to copy from and the month to copy to.");
    expect(api.copies).toEqual([]);
  });

  it("refuses to copy a month onto itself", async () => {
    const warning = vi.spyOn(toast, "warning");
    const { result, api } = await setup();
    act(() => {
      result.current.setCopySourceMonth("2026-10");
      result.current.setCopyDestinationMonth("2026-10");
    });

    await act(() => result.current.handleCopyMonth());

    expect(warning).toHaveBeenCalledWith("Choose two different months.");
    expect(api.copies).toEqual([]);
  });

  it("copies the month, shows the server's message and closes the modal", async () => {
    const success = vi.spyOn(toast, "success");
    const { result, api } = await setup();
    act(() => {
      result.current.handleCopyMonthClick();
      result.current.setCopySourceMonth("2026-09");
      result.current.setCopyDestinationMonth("2026-10");
    });

    await act(() => result.current.handleCopyMonth());

    expect(api.copies).toEqual([{ sourceMonth: "2026-09", destinationMonth: "2026-10" }]);
    expect(success).toHaveBeenCalledWith("Copied 31 days.");
    expect(result.current.isCopyMonthModalOpen).toBe(false);
    expect(result.current.copySourceMonth).toBe("");
    expect(result.current.isCopyingMonth).toBe(false);
  });

  it("shows a default message when the server sends none, and is busy meanwhile", async () => {
    const success = vi.spyOn(toast, "success");
    const { result } = await setup();
    server.use(
      http.post(`${API}/planning/copy-month`, async () => {
        await delay(30);
        return HttpResponse.json({});
      })
    );
    act(() => {
      result.current.setCopySourceMonth("2026-09");
      result.current.setCopyDestinationMonth("2026-10");
    });

    let copy!: Promise<void>;
    act(() => {
      copy = result.current.handleCopyMonth();
    });
    await waitFor(() => expect(result.current.isCopyingMonth).toBe(true));
    await act(() => copy);

    expect(success).toHaveBeenCalledWith("Planning copied.");
    expect(result.current.isCopyingMonth).toBe(false);
  });

  it("keeps the modal open and explains a failure", async () => {
    const error = vi.spyOn(toast, "error");
    const { result } = await setup();
    server.use(http.post(`${API}/planning/copy-month`, () => HttpResponse.json({ message: "Nothing to copy" }, { status: 409 })));
    act(() => {
      result.current.handleCopyMonthClick();
      result.current.setCopySourceMonth("2026-09");
      result.current.setCopyDestinationMonth("2026-10");
    });

    await act(() => result.current.handleCopyMonth());

    expect(error).toHaveBeenCalledWith("Couldn't copy the planning. Nothing to copy");
    expect(result.current.isCopyMonthModalOpen).toBe(true);
    expect(result.current.copySourceMonth).toBe("2026-09");
  });
});
