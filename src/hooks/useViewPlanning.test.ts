import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { API, server } from "@/test/server";
import { toast } from "@/lib/notify";
import type { EmployeeRecord, PlanningRecord, ShiftRecord, TaskRecord } from "@/components/calendar/types";
import { useViewPlanning } from "./useViewPlanning";

// ── Factories ──────────────────────────────────────────────────────────────

const makeTask = (o: Partial<TaskRecord> = {}): TaskRecord => ({ _id: "t1", taskId: 1, taskName: "Pizzaiolo", ...o });
const makeShift = (o: Partial<ShiftRecord> = {}): ShiftRecord => ({ _id: "s1", startTime: "08:00", endTime: "16:00", ...o });
const makeEmployee = (o: Partial<EmployeeRecord> = {}): EmployeeRecord => ({
  _id: "e1",
  empNumber: 1,
  firstName: "Ali",
  lastName: "Ben",
  baseSalary: 30000,
  ...o,
});
const makePlanning = (o: Partial<PlanningRecord> = {}): PlanningRecord => ({
  _id: "p1",
  shiftId: makeShift(),
  empId: makeEmployee(),
  taskId: 1,
  planDate: "2026-10-24T00:00:00.000Z",
  ...o,
});

const ali = makeEmployee();
const sara = makeEmployee({ _id: "e2", empNumber: 2, firstName: "Sara", lastName: "Kaci" });
const morning = makeShift();
const evening = makeShift({ _id: "s2", startTime: "16:00", endTime: "01:00" });

// ── Backend ────────────────────────────────────────────────────────────────

let planningCalls: number;

function backend({
  tasks = [makeTask()],
  shifts = [morning],
  employees = [ali, sara],
  planning = [] as PlanningRecord[],
}: { tasks?: TaskRecord[]; shifts?: ShiftRecord[]; employees?: EmployeeRecord[]; planning?: PlanningRecord[] } = {}) {
  server.use(
    http.get(`${API}/tasks`, () => HttpResponse.json(tasks)),
    http.get(`${API}/shifts`, () => HttpResponse.json(shifts)),
    http.get(`${API}/employees`, () => HttpResponse.json(employees)),
    http.get(`${API}/planning`, () => {
      planningCalls++;
      return HttpResponse.json(planning);
    })
  );
}

async function renderReady() {
  const hook = renderHook(() => useViewPlanning());
  await waitFor(() => expect(hook.result.current.loadingMeta).toBe(false));
  await waitFor(() => expect(planningCalls).toBeGreaterThan(0));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

const previousTZ = process.env.TZ;

beforeEach(() => {
  planningCalls = 0;
  process.env.TZ = "Africa/Algiers";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-24T10:00:00+01:00"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  process.env.TZ = previousTZ;
});

// ── Loading the posts, shifts and employees ───────────────────────────────

describe("meta data", () => {
  it("loads posts, shifts and employees, with shifts sorted by start time", async () => {
    backend({ shifts: [evening, morning] });
    const { result } = await renderReady();
    expect(result.current.tasks).toEqual([makeTask()]);
    expect(result.current.employees).toEqual([ali, sara]);
    expect(result.current.shifts.map((s) => s._id)).toEqual(["s1", "s2"]);
    expect(result.current.metaError).toBeNull();
  });

  it("starts with an empty cell for every post and shift", async () => {
    backend({ tasks: [makeTask(), makeTask({ _id: "t2", taskId: 2, taskName: "Livreur" })], shifts: [morning, evening] });
    const { result } = await renderReady();
    expect(result.current.grid).toEqual({ 1: { s1: [], s2: [] }, 2: { s1: [], s2: [] } });
  });

  it("is loading until the meta data arrives", async () => {
    backend();
    const { result } = renderHook(() => useViewPlanning());
    expect(result.current.loadingMeta).toBe(true);
    await waitFor(() => expect(result.current.loadingMeta).toBe(false));
  });

  it("reports a friendly error and loads no planning when a meta request fails", async () => {
    backend();
    server.use(http.get(`${API}/shifts`, () => new HttpResponse(null, { status: 500 })));
    const { result } = renderHook(() => useViewPlanning());
    await waitFor(() => expect(result.current.metaError).not.toBeNull());
    expect(result.current.metaError).toBe(
      "Couldn't load employees, shifts and posts. Something went wrong on our side. Please try again in a moment."
    );
    expect(result.current.loadingMeta).toBe(false);
    expect(planningCalls).toBe(0);
  });
});

// ── Planning of the selected day ──────────────────────────────────────────

describe("planning of the day", () => {
  it("places each employee of today in their post and shift", async () => {
    backend({
      shifts: [morning, evening],
      planning: [
        makePlanning({ tasks: [{ id: "x", label: "Dough", startTime: "08:00", endTime: "09:00" }] }),
        makePlanning({ _id: "p2", empId: sara, shiftId: evening }),
      ],
    });
    const { result } = await renderReady();
    expect(result.current.grid[1].s1).toEqual([
      {
        id: "e1",
        title: "Ali Ben",
        backups: [],
        backupEmployeeId: null,
        backupTitle: undefined,
        planningId: "p1",
        tasks: [{ id: "x", label: "Dough", startTime: "08:00", endTime: "09:00" }],
      },
    ]);
    expect(result.current.grid[1].s2.map((c) => c.title)).toEqual(["Sara Kaci"]);
    expect(result.current.error).toBeNull();
  });

  it("ignores entries of other days", async () => {
    backend({ planning: [makePlanning({ planDate: "2026-10-23T00:00:00.000Z" })] });
    const { result } = await renderReady();
    expect(result.current.grid[1].s1).toEqual([]);
  });

  it("shows an employee saved twice in the same cell only once", async () => {
    backend({ planning: [makePlanning(), makePlanning({ _id: "p-dup" })] });
    const { result } = await renderReady();
    expect(result.current.grid[1].s1.map((c) => c.planningId)).toEqual(["p1"]);
  });

  it("keeps the backups and the legacy backup of an entry", async () => {
    backend({ planning: [makePlanning({ backupEmpIds: [sara], backupEmpId: sara })] });
    const { result } = await renderReady();
    const [cell] = result.current.grid[1].s1;
    expect(cell.backups).toEqual([{ id: "e2", title: "Sara Kaci" }]);
    expect(cell.backupEmployeeId).toBe("e2");
    expect(cell.backupTitle).toBe("Sara Kaci");
  });

  it("skips entries whose post or shift no longer exists", async () => {
    backend({ planning: [makePlanning({ taskId: 99 }), makePlanning({ _id: "p2", shiftId: makeShift({ _id: "gone" }) })] });
    const { result } = await renderReady();
    expect(result.current.grid).toEqual({ 1: { s1: [] } });
  });

  it("reports a friendly error when the planning can't be loaded", async () => {
    backend();
    server.use(
      http.get(`${API}/planning`, () => {
        planningCalls++;
        return new HttpResponse(null, { status: 500 });
      })
    );
    const { result } = await renderReady();
    expect(result.current.error).toBe(
      "Couldn't load the planning. Something went wrong on our side. Please try again in a moment."
    );
  });

  it("loads the planning again for the new day", async () => {
    backend({ planning: [makePlanning({ planDate: "2026-10-25T00:00:00.000Z", empId: sara })] });
    const { result } = await renderReady();
    expect(result.current.grid[1].s1).toEqual([]);
    act(() => result.current.goNext());
    await waitFor(() => expect(result.current.grid[1].s1.map((c) => c.title)).toEqual(["Sara Kaci"]));
    expect(planningCalls).toBe(2);
  });

  // BUG-401: a slow answer for the previous day overwrites the grid of the day now selected
  it("shows the selected day even when the previous day's answer arrives last", async () => {
    let call = 0;
    backend();
    server.use(
      http.get(`${API}/planning`, async () => {
        call++;
        if (call === 1) await delay(150); // the answer for the 24th is slow
        return HttpResponse.json([
          makePlanning({ planDate: "2026-10-24T00:00:00.000Z", empId: ali }),
          makePlanning({ _id: "p2", planDate: "2026-10-25T00:00:00.000Z", empId: sara }),
        ]);
      })
    );
    const { result } = renderHook(() => useViewPlanning());
    await waitFor(() => expect(call).toBe(1));
    act(() => result.current.goNext()); // the 25th, answered at once
    await waitFor(() => expect(call).toBe(2));
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(result.current.currentDate.getDate()).toBe(25);
    expect(result.current.grid[1].s1.map((c) => c.title)).toEqual(["Sara Kaci"]);
  });

  // BUG-402: in a time zone ahead of Algeria a picked day shows the previous day's planning
  it("shows the picked day's planning for a manager in Paris in summer", async () => {
    process.env.TZ = "Europe/Paris";
    vi.setSystemTime(new Date("2026-07-15T10:00:00+02:00"));
    backend({
      planning: [
        makePlanning({ planDate: "2026-07-19T00:00:00.000Z", empId: ali }),
        makePlanning({ _id: "p2", planDate: "2026-07-20T00:00:00.000Z", empId: sara }),
      ],
    });
    const { result } = await renderReady();
    // What clicking "20" in the mini calendar does
    act(() => result.current.setCurrentDate(new Date(2026, 6, 20)));
    await waitFor(() => expect(planningCalls).toBe(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.grid[1].s1.map((c) => c.title)).toEqual(["Sara Kaci"]);
  });
});

// ── Day navigation ────────────────────────────────────────────────────────

describe("day navigation", () => {
  it("starts on today and formats it", async () => {
    backend();
    const { result } = await renderReady();
    expect(result.current.currentDate.toDateString()).toBe(new Date(2026, 9, 24).toDateString());
    expect(result.current.formattedDate).toContain("2026");
    expect(result.current.formattedDate).toMatch(/October/);
  });

  it("moves one day back and forward, across month ends", async () => {
    vi.setSystemTime(new Date("2026-10-31T10:00:00+01:00"));
    backend();
    const { result } = await renderReady();
    act(() => result.current.goNext());
    expect(result.current.currentDate.toDateString()).toBe(new Date(2026, 10, 1).toDateString());
    act(() => result.current.goPrev());
    act(() => result.current.goPrev());
    expect(result.current.currentDate.toDateString()).toBe(new Date(2026, 9, 30).toDateString());
  });

  it("goes back to today", async () => {
    backend();
    const { result } = await renderReady();
    act(() => result.current.setCurrentDate(new Date(2026, 0, 5)));
    act(() => result.current.goToToday());
    expect(result.current.currentDate.toDateString()).toBe(new Date(2026, 9, 24).toDateString());
  });

  it("changes the month shown in the mini calendar", async () => {
    backend();
    const { result } = await renderReady();
    act(() => result.current.setCalendarMonth(new Date(2026, 11, 1)));
    expect(result.current.calendarMonth.getMonth()).toBe(11);
  });
});

// ── Employee list of a cell ───────────────────────────────────────────────

describe("employee list of a cell", () => {
  it("opens the list of the clicked cell", async () => {
    backend({ planning: [makePlanning(), makePlanning({ _id: "p2", empId: sara })] });
    const { result } = await renderReady();
    expect(result.current.listEmployees).toEqual([]);
    act(() => result.current.handleListCellClick(1, "s1"));
    expect(result.current.isListModalOpen).toBe(true);
    expect(result.current.listCell).toEqual({ postId: 1, shiftId: "s1" });
    expect(result.current.listEmployees.map((c) => c.title)).toEqual(["Ali Ben", "Sara Kaci"]);
  });

  it("gives an empty list for a cell that doesn't exist", async () => {
    backend();
    const { result } = await renderReady();
    act(() => result.current.setListCell({ postId: 42, shiftId: "nope" }));
    expect(result.current.listEmployees).toEqual([]);
  });

  it("closes the details modal", async () => {
    backend();
    const { result } = await renderReady();
    act(() => result.current.handleCloseDetailsModal());
    expect(result.current.isDetailsModalOpen).toBe(false);
    expect(result.current.activeEmployee).toBeNull();
  });
});

// ── Export menus ──────────────────────────────────────────────────────────

describe("export menus", () => {
  it("opens one menu at a time and closes them all", async () => {
    backend();
    const { result } = await renderReady();
    act(() => result.current.toggleExportMenu());
    expect(result.current.showExportDayMenu).toBe(true);
    act(() => result.current.toggleWeeklyExportMenu());
    expect(result.current.showWeeklyExportMenu).toBe(true);
    expect(result.current.showExportDayMenu).toBe(false);
    act(() => result.current.toggleExportMenu());
    act(() => result.current.toggleWeeklyExportManagerMenu());
    expect(result.current.showWeeklyExportManagerMenu).toBe(true);
    expect(result.current.showExportDayMenu).toBe(false);
    act(() => result.current.closeMenus());
    expect(result.current.showExportDayMenu).toBe(false);
    expect(result.current.showWeeklyExportMenu).toBe(false);
    expect(result.current.showWeeklyExportManagerMenu).toBe(false);
  });

  it("toggles a menu closed when pressed twice", async () => {
    backend();
    const { result } = await renderReady();
    act(() => result.current.toggleWeeklyExportManagerMenu());
    act(() => result.current.toggleWeeklyExportManagerMenu());
    expect(result.current.showWeeklyExportManagerMenu).toBe(false);
  });
});

// ── Exports ───────────────────────────────────────────────────────────────

describe("exports", () => {
  let downloads: { url: string; name: string }[];
  let requested: string[];

  beforeEach(() => {
    downloads = [];
    requested = [];
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ url: this.href, name: this.download });
    });
    server.use(
      http.get(`${API}/planning/:kind`, ({ request }) => {
        requested.push(request.url.replace(API, ""));
        return new HttpResponse("file");
      })
    );
  });

  it.each([
    ["excel", "xlsx"],
    ["pdf", "pdf"],
  ] as const)("exports the selected day as %s", async (format, ext) => {
    backend();
    const { result } = await renderReady();
    act(() => result.current.handleExport(format));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(requested).toEqual([`/planning/export-current-day?year=2026&month=10&day=24&format=${format}`]);
    expect(downloads[0].name).toBe(`planning-2026-10-24.${ext}`);
  });

  it("exports the employees' week of the selected month", async () => {
    backend();
    const { result } = await renderReady();
    act(() => result.current.handleWeeklyExport("pdf"));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(requested).toEqual(["/planning/export-first-week?year=2026&month=9&format=pdf"]);
    expect(downloads[0].name).toBe("planning-week-2026-10.pdf");
  });

  it("exports the manager's week of the selected month", async () => {
    backend();
    const { result } = await renderReady();
    act(() => result.current.handleWeeklyExportManager("excel"));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(requested).toEqual(["/planning/export-first-week-manager?year=2026&month=9&format=excel"]);
    expect(downloads[0].name).toBe("planning-week-manager-2026-10.xlsx");
  });

  it("shows an error toast when the export fails", async () => {
    const toastError = vi.spyOn(toast, "error");
    server.use(
      http.get(`${API}/planning/export-current-day`, () =>
        HttpResponse.json({ message: "No planning for this day" }, { status: 404 })
      )
    );
    backend();
    const { result } = await renderReady();
    act(() => result.current.handleExport("pdf"));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Couldn't export the planning. No planning for this day")
    );
    expect(downloads).toEqual([]);
  });
});
