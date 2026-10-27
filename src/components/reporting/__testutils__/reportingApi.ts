// Shared helpers for the reporting tests (hooks, screens and pages).
//
//  - Raw API factories (the wire shapes the backend returns)
//  - mockReportingApi(): MSW handlers for every endpoint the reporting screens call,
//    filtering by ?start/&end like the backend does, and recording each request
//  - fixTodayInEachTest(): Algiers time zone + a fixed "today", restored after each test
//  - clearFeedback(): toasts / confirm dialogs live in module state, so they are
//    emptied between tests (otherwise a toast left by one test hides the next one's,
//    because identical toasts are not stacked)
import { afterEach, beforeEach, vi } from "vitest";
import { configure } from "@testing-library/react";
import { http, HttpResponse, delay } from "msw";
import { API, server } from "@/test/server";
import type { AdvanceRecordRaw, EmployeeRaw, WorktimeRowRaw } from "@/components/reporting/types";
import { answerConfirm, dismissToast, getConfirm, getToasts, type ToastKind } from "@/lib/notify";

export interface BonusRaw {
  _id: string;
  emp_id: number | string;
  amount: number;
  date: string;
  reason?: string;
}

export interface PlanRaw {
  _id: string;
  empId: { empNumber: number } | number;
  planDate: string;
}

// The reporting screens fire 4-8 requests on open; when the machine is busy (coverage,
// other test files in parallel) the default 1 s wait for them can run out (kept under the 5 s test timeout).
configure({ asyncUtilTimeout: 4000 });

// ── Factories ──────────────────────────────────────────────────────────────

/** 41 600 DA / 8 h / 26 days = 200 DA per hour. */
export const AMINE = { empNumber: 101, firstName: "Amine", lastName: "Kaci", baseSalary: 41600 };
/** 20 800 DA / 8 / 26 = 100 DA per hour. */
export const SARA = { empNumber: 102, firstName: "Sara", lastName: "Bel", baseSalary: 20800 };
/** 26 000 DA / 8 / 26 = 125 DA per hour. */
export const NADIA = { empNumber: 103, firstName: "Nadia", lastName: "Ouali", baseSalary: 26000 };

export function rawEmployee(overrides: Partial<EmployeeRaw> = {}): EmployeeRaw {
  const empNumber = overrides.empNumber ?? 101;
  return { _id: `mongo-${empNumber}`, empNumber, firstName: "Amine", lastName: "Kaci", baseSalary: 41600, ...overrides };
}

export function rawRow(overrides: Partial<WorktimeRowRaw> = {}): WorktimeRowRaw {
  return {
    emp_id: 101,
    work_date: "2026-03-09",
    work_hours: "08:00:00",
    late_minutes: 0,
    overtime_minutes: 0,
    penalty: 0,
    consommation: 0,
    absent: false,
    absent_comment: "",
    ...overrides,
  };
}

let seq = 0;
export function rawAdvance(overrides: Partial<AdvanceRecordRaw> = {}): AdvanceRecordRaw {
  return { _id: `adv-${++seq}`, emp_id: 101, amount: 1000, date: "2026-03-10", reason: "Weekly advance", ...overrides };
}

export function rawBonus(overrides: Partial<BonusRaw> = {}): BonusRaw {
  return { _id: `bon-${++seq}`, emp_id: 101, amount: 250, date: "2026-03-05", reason: "Good work", ...overrides };
}

/** A planning entry for `empNumber` on `day` (populated employee, like GET /planning). */
export function plan(empNumber: number, day: string): PlanRaw {
  return { _id: `plan-${++seq}`, empId: { empNumber }, planDate: `${day}T00:00:00.000Z` };
}

// ── MSW handlers ───────────────────────────────────────────────────────────

export interface ReportingData {
  employees?: EmployeeRaw[];
  worktime?: WorktimeRowRaw[];
  advances?: AdvanceRecordRaw[];
  bonuses?: BonusRaw[];
  planning?: PlanRaw[];
}

const dayOf = (v: unknown) => String(v ?? "").split("T")[0];

function inRange<T>(list: T[], url: URL, pick: (x: T) => unknown): T[] {
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  return list.filter((x) => {
    const d = dayOf(pick(x));
    return (!start || d >= start) && (!end || d <= end);
  });
}

/**
 * Answers every GET the reporting screens make. Lists are filtered by ?start/&end
 * (like the backend). /worktime ignores ?empId, as the real API does.
 * Returns the URLs of all requests received, in order.
 */
export function mockReportingApi(data: ReportingData = {}) {
  const requests: URL[] = [];
  const log = (request: Request) => {
    const url = new URL(request.url);
    requests.push(url);
    return url;
  };
  server.use(
    http.get(`${API}/employees`, ({ request }) => {
      log(request);
      return HttpResponse.json(data.employees ?? []);
    }),
    http.get(`${API}/worktime`, ({ request }) => {
      const url = log(request);
      return HttpResponse.json(inRange(data.worktime ?? [], url, (r) => r.work_date));
    }),
    http.get(`${API}/advances`, ({ request }) => {
      const url = log(request);
      return HttpResponse.json(inRange(data.advances ?? [], url, (a) => a.date));
    }),
    http.get(`${API}/advances/employee/:id`, ({ request, params }) => {
      const url = log(request);
      const mine = (data.advances ?? []).filter((a) => String(a.emp_id) === String(params.id));
      return HttpResponse.json(inRange(mine, url, (a) => a.date));
    }),
    http.get(`${API}/bonuses`, ({ request }) => {
      const url = log(request);
      return HttpResponse.json(inRange(data.bonuses ?? [], url, (b) => b.date));
    }),
    http.get(`${API}/planning`, ({ request }) => {
      log(request);
      return HttpResponse.json(data.planning ?? []);
    })
  );
  return requests;
}

/** Requests to `path` (e.g. "/worktime"), as "start..end" strings. */
export function rangesRequested(requests: URL[], path: string): string[] {
  return requests
    .filter((u) => u.pathname === path)
    .map((u) => `${u.searchParams.get("start")}..${u.searchParams.get("end")}`);
}

/** Makes GET `path` fail with `status` (and an optional JSON message). */
export function failGet(path: string, status = 500, message?: string) {
  server.use(
    http.get(`${API}${path}`, () => HttpResponse.json(message ? { message } : {}, { status }))
  );
}

/** Delays /worktime answers for ranges starting on `start` by `ms` (logged in `requests` if given). */
export function slowWorktimeFor(start: string, ms: number, data: ReportingData, requests?: URL[]) {
  server.use(
    http.get(`${API}/worktime`, async ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.get("start") !== start) return undefined; // fall through to the normal handler
      requests?.push(url);
      await delay(ms);
      return HttpResponse.json(inRange(data.worktime ?? [], url, (r) => r.work_date));
    })
  );
}

/** Records POST / DELETE calls to `path` and answers with `respond`. */
export function captureWrites(
  method: "post" | "delete",
  path: string,
  respond: (body: unknown) => Response | Promise<Response> = () => HttpResponse.json({})
) {
  const calls: { url: string; body: unknown }[] = [];
  server.use(
    http[method](`${API}${path}`, async ({ request }) => {
      const text = await request.text();
      const body = text ? JSON.parse(text) : undefined;
      calls.push({ url: request.url, body });
      return respond(body);
    })
  );
  return calls;
}

// ── Time ───────────────────────────────────────────────────────────────────

/**
 * Fixes "today" (local Algiers time) for every test of the calling file.
 * 2026-03-11 is a Wednesday: this week = 03-09..03-15, this month = March.
 */
export function fixTodayInEachTest(day = "2026-03-11", tz = "Africa/Algiers") {
  let previousTz: string | undefined;
  beforeEach(() => {
    previousTz = process.env.TZ;
    process.env.TZ = tz;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${day}T10:00:00`));
  });
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = previousTz;
  });
}

/** Runs `fn` with the process time zone switched to `tz`. */
export function inTimeZone<T>(tz: string, fn: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    process.env.TZ = previous;
  }
}

// ── Feedback (toasts / confirm) ────────────────────────────────────────────

export function clearFeedback() {
  getToasts().forEach((t) => dismissToast(t.id));
  let pending = getConfirm();
  while (pending) {
    answerConfirm(pending.id, false);
    pending = getConfirm();
  }
}

/** Empties toasts and confirm dialogs after each test of the calling file. */
export function clearFeedbackAfterEachTest() {
  afterEach(clearFeedback);
}

export function toastMessages(kind?: ToastKind): string[] {
  return getToasts()
    .filter((t) => !kind || t.kind === kind)
    .map((t) => t.message);
}

// ── Tables ─────────────────────────────────────────────────────────────────

/** Text of every body cell of the (only / given) table, row by row. */
export function tableBody(table: HTMLElement = document.querySelector("table") as HTMLElement): string[][] {
  return [...table.querySelectorAll("tbody tr")].map((tr) =>
    [...tr.querySelectorAll("td")].map((td) => (td.textContent ?? "").replace(/\s+/g, " ").trim())
  );
}
