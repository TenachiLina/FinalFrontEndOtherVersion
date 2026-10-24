// Test data and a fake backend for useNewPlanning / NewPlanning tests.
// Not a test file itself: imported by the *.test.tsx files next to it.
import { afterEach, beforeEach, expect, vi } from "vitest";
import { http, HttpResponse, delay } from "msw";
import { API, server } from "@/test/server";
import { renderHook, waitFor } from "@testing-library/react";
import { useShiftGrid } from "@/hooks/useNewPlanning";
import type { EmployeeRecord, ShiftRecord, TaskRecord, ShiftTask } from "@/components/calendar/types";

export const makeEmployee = (n: number, firstName: string, lastName: string, extra: Partial<EmployeeRecord> = {}): EmployeeRecord => ({
  _id: `e${n}`,
  empNumber: 100 + n,
  firstName,
  lastName,
  baseSalary: 30000,
  ...extra,
});

export const ALICE = makeEmployee(1, "Alice", "Martin");
export const BOB = makeEmployee(2, "Bob", "Brown");
export const CARL = makeEmployee(3, "Carl", "Cohen");
export const DINA = makeEmployee(4, "Dina", "Diaz");
export const EMPLOYEES = [ALICE, BOB, CARL, DINA];

export const makeShift = (id: string, startTime: string, endTime: string): ShiftRecord => ({ _id: id, startTime, endTime });
// Returned out of order on purpose: the hook sorts them by start time
export const EVENING = makeShift("s-evening", "16:00", "23:00");
export const MORNING = makeShift("s-morning", "06:00", "14:00");
export const SHIFTS = [EVENING, MORNING];

export const makeTaskRecord = (taskId: number, taskName: string): TaskRecord => ({ _id: `t${taskId}`, taskId, taskName });
export const PIZZAIOLO = makeTaskRecord(1, "Pizzaiolo");
export const DELIVERY = makeTaskRecord(2, "Livreur");
export const TASKS = [PIZZAIOLO, DELIVERY];

export const makeShiftTask = (overrides: Partial<ShiftTask> = {}): ShiftTask => ({
  id: "task-1",
  label: "Dough",
  startTime: "06:00",
  endTime: "08:00",
  ...overrides,
});

/** A row as returned by GET /planning/import/:date (already flattened by the API). */
export interface ImportedRecord {
  id?: string;
  taskId: number;
  shiftId: string;
  empId: string;
  title: string;
  backups?: { id?: string; _id?: string; title?: string }[];
  backupEmpIds?: (string | { _id: string })[];
  backupEmpId?: string | { _id: string } | null;
  backupTitle?: string;
  tasks?: ShiftTask[];
}

export const makeRecord = (emp: EmployeeRecord, overrides: Partial<ImportedRecord> = {}): ImportedRecord => ({
  id: `p-${emp._id}`,
  taskId: PIZZAIOLO.taskId,
  shiftId: MORNING._id,
  empId: emp._id,
  title: `${emp.firstName} ${emp.lastName}`,
  backups: [],
  tasks: [],
  ...overrides,
});

export interface BulkBody {
  planDate: string;
  entries: { shiftId: string; empId: string; backupEmpIds: string[]; taskId: number; planDate: string; tasks: ShiftTask[] }[];
}

export interface PlanningApiOptions {
  tasks?: TaskRecord[];
  shifts?: ShiftRecord[];
  employees?: EmployeeRecord[];
  /** Saved planning per "YYYY-MM-DD" day. */
  plannings?: Record<string, ImportedRecord[]>;
  /** Days whose GET /planning/import answers with this HTTP status. */
  failingDays?: Record<string, number>;
  /** Days whose GET /planning/import waits until `release(day)` is called. */
  slowDays?: string[];
}

/** Fake backend for the planning screen. Records every load and save. */
export function mockPlanningApi(options: PlanningApiOptions = {}) {
  const { tasks = TASKS, shifts = SHIFTS, employees = EMPLOYEES, plannings = {}, failingDays = {}, slowDays = [] } = options;
  const loads: string[] = [];
  const saves: BulkBody[] = [];
  const copies: unknown[] = [];
  const gates = new Map<string, () => void>();
  const waits = new Map<string, Promise<void>>();
  slowDays.forEach((day) => waits.set(day, new Promise<void>((resolve) => gates.set(day, resolve))));

  server.use(
    http.get(`${API}/tasks`, () => HttpResponse.json(tasks)),
    http.get(`${API}/shifts`, () => HttpResponse.json(shifts)),
    http.get(`${API}/employees`, () => HttpResponse.json(employees)),
    http.get(`${API}/planning/import/:date`, async ({ params }) => {
      const day = String(params.date);
      loads.push(day);
      if (waits.has(day)) await waits.get(day);
      if (failingDays[day]) return HttpResponse.json({ message: "Planning service down" }, { status: failingDays[day] });
      return HttpResponse.json(plannings[day] ?? []);
    }),
    http.post(`${API}/planning/bulk`, async ({ request }) => {
      saves.push((await request.json()) as BulkBody);
      return HttpResponse.json({ ok: true });
    }),
    http.post(`${API}/planning/copy-month`, async ({ request }) => {
      copies.push(await request.json());
      return HttpResponse.json({ message: "Copied 31 days." });
    })
  );

  return {
    loads,
    saves,
    copies,
    release: (day: string) => gates.get(day)?.(),
  };
}

/** Makes POST /planning/bulk answer `status` (optionally only for some days), after `wait` ms. */
export function failSaves(status: number, onlyDays?: string[], wait = 0) {
  const saves: BulkBody[] = [];
  server.use(
    http.post(`${API}/planning/bulk`, async ({ request }) => {
      const body = (await request.json()) as BulkBody;
      saves.push(body);
      if (wait) await delay(wait);
      if (!onlyDays || onlyDays.includes(body.planDate)) {
        return HttpResponse.json({ message: "Database is read-only" }, { status });
      }
      return HttpResponse.json({ ok: true });
    })
  );
  return saves;
}

/** Saturday 24 October 2026, 10:00 in Algiers. */
export const TODAY = new Date("2026-10-24T10:00:00+01:00");

/**
 * Fixes "today" (Date only, so MSW and React timers keep running), the time
 * zone, and silences the hook's debug logging.
 */
export function fixTheClock(tz = "Africa/Algiers", now: Date = TODAY) {
  let previousTz: string | undefined;
  beforeEach(() => {
    previousTz = process.env.TZ;
    process.env.TZ = tz;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
  });
}

/** Renders the hook and waits until the reference data and the day's planning are loaded. */
export async function renderPlanningHook(api: { loads: string[] }) {
  const hook = renderHook(() => useShiftGrid());
  await waitFor(() => expect(api.loads.length).toBeGreaterThan(0));
  await waitFor(() => expect(hook.result.current.loadingGrid).toBe(false));
  return hook;
}
