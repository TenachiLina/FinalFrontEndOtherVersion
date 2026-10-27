import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { API, server } from "@/test/server";
import { toast } from "@/lib/notify";
import { useShiftGrid } from "./useNewPlanning";
import {
  ALICE,
  BOB,
  CARL,
  DELIVERY,
  EVENING,
  MORNING,
  PIZZAIOLO,
  fixTheClock,
  makeRecord,
  makeShiftTask,
  mockPlanningApi,
  renderPlanningHook,
} from "./useNewPlanning.fixtures";

fixTheClock();

describe("reference data", () => {
  it("turns tasks into posts and shifts into columns sorted by start time", async () => {
    const api = mockPlanningApi();
    const { result } = await renderPlanningHook(api);

    expect(result.current.loadingMeta).toBe(false);
    expect(result.current.metaError).toBeNull();
    expect(result.current.posts).toEqual([
      { id: 1, label: "Pizzaiolo", mongoId: "t1" },
      { id: 2, label: "Livreur", mongoId: "t2" },
    ]);
    expect(result.current.shifts).toEqual([
      { id: "s-morning", label: "06:00 - 14:00", sub: "" },
      { id: "s-evening", label: "16:00 - 23:00", sub: "" },
    ]);
    expect(result.current.employees.map((e) => e._id)).toEqual(["e1", "e2", "e3", "e4"]);
  });

  it("starts with an empty cell for every post and shift", async () => {
    const api = mockPlanningApi();
    const { result } = await renderPlanningHook(api);

    expect(result.current.grid).toEqual({
      1: { "s-morning": [], "s-evening": [] },
      2: { "s-morning": [], "s-evening": [] },
    });
  });

  it("shows a friendly error and loads no planning when the reference data fails", async () => {
    const api = mockPlanningApi();
    server.use(http.get(`${API}/shifts`, () => HttpResponse.json({ message: "boom" }, { status: 500 })));
    const { result } = renderHook(() => useShiftGrid());

    await waitFor(() => expect(result.current.loadingMeta).toBe(false));
    expect(result.current.metaError).toBe(
      "Couldn't load employees, shifts and posts. Something went wrong on our side. Please try again in a moment."
    );
    expect(api.loads).toEqual([]);
  });
});

describe("loading the selected day", () => {
  it("loads today's planning (Algiers date) into the right cells", async () => {
    const tasks = [makeShiftTask()];
    const api = mockPlanningApi({
      plannings: {
        "2026-10-24": [
          makeRecord(ALICE, { tasks, backups: [{ id: BOB._id, title: "Bob Brown" }] }),
          makeRecord(CARL, { taskId: DELIVERY.taskId, shiftId: EVENING._id }),
        ],
      },
    });
    const { result } = await renderPlanningHook(api);

    expect(api.loads).toEqual(["2026-10-24"]);
    expect(result.current.grid[PIZZAIOLO.taskId][MORNING._id]).toEqual([
      { id: "e1", title: "Alice Martin", backups: [{ id: "e2", title: "Bob Brown" }], tasks, planningId: "p-e1" },
    ]);
    expect(result.current.grid[DELIVERY.taskId][EVENING._id].map((c) => c.title)).toEqual(["Carl Cohen"]);
    expect(result.current.grid[PIZZAIOLO.taskId][EVENING._id]).toEqual([]);
  });

  it("fills in backup names from the employee list, or 'Unknown employee'", async () => {
    const api = mockPlanningApi({
      plannings: { "2026-10-24": [makeRecord(ALICE, { backups: [{ _id: BOB._id }, { id: "gone" }] })] },
    });
    const { result } = await renderPlanningHook(api);

    expect(result.current.grid[1]["s-morning"][0].backups).toEqual([
      { id: "e2", title: "Bob Brown" },
      { id: "gone", title: "Unknown employee" },
    ]);
  });

  it("reads backups saved as backupEmpIds (ids or populated employees)", async () => {
    const api = mockPlanningApi({
      plannings: {
        "2026-10-24": [makeRecord(ALICE, { backups: undefined, backupEmpIds: [BOB._id, { _id: CARL._id }] })],
      },
    });
    const { result } = await renderPlanningHook(api);

    expect(result.current.grid[1]["s-morning"][0].backups).toEqual([
      { id: "e2", title: "Bob Brown" },
      { id: "e3", title: "Carl Cohen" },
    ]);
  });

  it("reads the legacy single backup, as an id or a populated employee", async () => {
    const api = mockPlanningApi({
      plannings: {
        "2026-10-24": [
          makeRecord(ALICE, { backups: undefined, backupEmpId: BOB._id, backupTitle: "Bobby" }),
          makeRecord(CARL, { backups: undefined, backupEmpId: { _id: BOB._id } }),
        ],
      },
    });
    const { result } = await renderPlanningHook(api);

    const [alice, carl] = result.current.grid[1]["s-morning"];
    expect(alice.backups).toEqual([{ id: "e2", title: "Bobby" }]);
    expect(carl.backups).toEqual([{ id: "e2", title: "Bob Brown" }]);
  });

  it("has no backups and no tasks when the record has none", async () => {
    const api = mockPlanningApi({
      plannings: { "2026-10-24": [makeRecord(ALICE, { backups: undefined, tasks: undefined })] },
    });
    const { result } = await renderPlanningHook(api);

    expect(result.current.grid[1]["s-morning"][0]).toMatchObject({ backups: [], tasks: [] });
  });

  it("skips records for a post or shift that no longer exists", async () => {
    const api = mockPlanningApi({
      plannings: {
        "2026-10-24": [makeRecord(ALICE, { taskId: 99 }), makeRecord(BOB, { shiftId: "archived" }), makeRecord(CARL)],
      },
    });
    const { result } = await renderPlanningHook(api);

    const all = Object.values(result.current.grid).flatMap((row) => Object.values(row).flat());
    expect(all.map((c) => c.id)).toEqual(["e3"]);
  });

  // Regression for 5feb993 "CleanPlanningFromDuplicates"
  it("shows an employee stored twice in the same cell only once", async () => {
    const api = mockPlanningApi({
      plannings: {
        "2026-10-24": [makeRecord(ALICE, { id: "p1" }), makeRecord(ALICE, { id: "p2" }), makeRecord(BOB)],
      },
    });
    const { result } = await renderPlanningHook(api);

    expect(result.current.grid[1]["s-morning"].map((c) => c.planningId)).toEqual(["p1", "p-e2"]);
  });

  it("keeps the same employee when he is in two different cells", async () => {
    const api = mockPlanningApi({
      plannings: { "2026-10-24": [makeRecord(ALICE), makeRecord(ALICE, { shiftId: EVENING._id })] },
    });
    const { result } = await renderPlanningHook(api);

    expect(result.current.grid[1]["s-morning"]).toHaveLength(1);
    expect(result.current.grid[1]["s-evening"]).toHaveLength(1);
  });

  it("shows an empty day, without a toast, when the day can't be loaded", async () => {
    const error = vi.spyOn(toast, "error");
    const api = mockPlanningApi({ failingDays: { "2026-10-24": 500 } });
    const { result } = await renderPlanningHook(api);

    expect(result.current.grid[1]["s-morning"]).toEqual([]);
    expect(error).not.toHaveBeenCalled();
  });
});

describe("day navigation", () => {
  it("starts on today and formats the date", async () => {
    const api = mockPlanningApi();
    const { result } = await renderPlanningHook(api);

    expect(result.current.currentDate.toISOString()).toBe("2026-10-24T09:00:00.000Z");
    expect(result.current.formattedDate).toBe("24 October 2026");
  });

  it("loads the next and the previous day", async () => {
    const api = mockPlanningApi({ plannings: { "2026-10-25": [makeRecord(BOB)] } });
    const { result } = await renderPlanningHook(api);

    act(() => result.current.goNext());
    await waitFor(() => expect(result.current.grid[1]["s-morning"].map((c) => c.id)).toEqual(["e2"]));
    act(() => result.current.goPrev());
    act(() => result.current.goPrev());
    await waitFor(() => expect(api.loads).toEqual(["2026-10-24", "2026-10-25", "2026-10-24", "2026-10-23"]));
    await waitFor(() => expect(result.current.grid[1]["s-morning"]).toEqual([]));
  });

  it("goes back to today and shows its month in the mini calendar", async () => {
    const api = mockPlanningApi();
    const { result } = await renderPlanningHook(api);

    act(() => {
      result.current.setCurrentDate(new Date(2026, 0, 5));
      result.current.setCalendarMonth(new Date(2026, 0, 5));
    });
    act(() => result.current.goToToday());

    expect(result.current.currentDate.toDateString()).toBe(new Date().toDateString());
    expect(result.current.calendarMonth.getMonth()).toBe(9);
  });

  it("ignores the answer for a day the user has already left", async () => {
    const api = mockPlanningApi({
      slowDays: ["2026-10-25"],
      plannings: { "2026-10-25": [makeRecord(BOB)], "2026-10-26": [makeRecord(CARL)] },
    });
    const { result } = await renderPlanningHook(api);

    act(() => result.current.goNext());
    await waitFor(() => expect(api.loads).toContain("2026-10-25"));
    act(() => result.current.goNext());
    await waitFor(() => expect(result.current.grid[1]["s-morning"].map((c) => c.id)).toEqual(["e3"]));

    api.release("2026-10-25");
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.grid[1]["s-morning"].map((c) => c.id)).toEqual(["e3"]);
    expect(result.current.loadingGrid).toBe(false);
  });

  it("ignores a failure for a day the user has already left", async () => {
    const api = mockPlanningApi({
      slowDays: ["2026-10-25"],
      failingDays: { "2026-10-25": 500 },
      plannings: { "2026-10-26": [makeRecord(CARL)] },
    });
    const { result } = await renderPlanningHook(api);

    act(() => result.current.goNext());
    await waitFor(() => expect(api.loads).toContain("2026-10-25"));
    act(() => result.current.goNext());
    await waitFor(() => expect(result.current.grid[1]["s-morning"].map((c) => c.id)).toEqual(["e3"]));

    api.release("2026-10-25");
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.grid[1]["s-morning"].map((c) => c.id)).toEqual(["e3"]);
  });
});

describe("import from another date", () => {
  it("copies another day's planning into the grid without changing the selected day", async () => {
    const api = mockPlanningApi({ plannings: { "2026-10-17": [makeRecord(ALICE), makeRecord(BOB)] } });
    const { result } = await renderPlanningHook(api);

    await act(() => result.current.handleImportFromDate(new Date("2026-10-17")));

    expect(api.loads).toEqual(["2026-10-24", "2026-10-17"]);
    expect(result.current.grid[1]["s-morning"].map((c) => c.id)).toEqual(["e1", "e2"]);
    expect(result.current.currentDate.getDate()).toBe(24);
  });

  it("tells the user when the other day can't be loaded", async () => {
    const error = vi.spyOn(toast, "error");
    const api = mockPlanningApi({ failingDays: { "2026-10-17": 503 } });
    const { result } = await renderPlanningHook(api);

    await act(() => result.current.handleImportFromDate(new Date("2026-10-17")));

    expect(error).toHaveBeenCalledWith(
      "Couldn't import the planning. Something went wrong on our side. Please try again in a moment."
    );
    expect(result.current.grid[1]["s-morning"]).toEqual([]);
  });

  it("keeps the import modal fields", async () => {
    const api = mockPlanningApi();
    const { result } = await renderPlanningHook(api);

    act(() => {
      result.current.setIsImportModalOpen(true);
      result.current.setImportDate("2026-10-17");
    });

    expect(result.current.isImportModalOpen).toBe(true);
    expect(result.current.importDate).toBe("2026-10-17");
  });
});
