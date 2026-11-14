// Shared helpers for the reporting tests (hooks, screens and pages).
//
//  - Raw API factories (the wire shapes the backend returns)
//  - mockReportingApi(): MSW handlers for every endpoint the reporting screens call,
//    filtering by ?start/&end like the backend does, and recording each request.
//    /payroll/period and /payroll/payslips answer what the real server would
//    calculate from the same records (the formulas of the backend's payroll.calc.ts)
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

/** A month's closing state as GET /payroll/closings/:month answers it. */
export interface MonthStatusRaw {
  month: string;
  closed: boolean;
  auto: boolean;
  closedAt: string | null;
  closedBy: string | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
  closesAt: string | null;
  canClose: boolean;
}

export interface ReportingData {
  /** Closing state by month ("YYYY-MM"); other months are open with nothing to show */
  closings?: Record<string, Partial<MonthStatusRaw>>;
  /** The company's payroll settings (defaults: 8 h, 26 days, half as weekly advance) */
  settings?: { hoursPerDay?: number; workingDaysPerMonth?: number; weeklyAdvanceRatio?: number };
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

// ── The server's payroll, for the tests ────────────────────────────────────

const hoursOf = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const text = String(v);
  if (!text.includes(":")) return parseFloat(text) || 0;
  const [h, m = 0, sec = 0] = text.split(":").map(Number);
  return h + m / 60 + sec / 3600;
};
const num = (v: unknown) => (Number.isFinite(Number(v ?? 0)) ? Number(v ?? 0) : 0);
const r2 = (n: number) => Number(n.toFixed(2));

/** What GET /payroll/period answers for these records (same formulas as the backend). */
export function serverPayroll(data: ReportingData, start: string, end: string, empId?: string | null) {
  const hoursPerDay = data.settings?.hoursPerDay ?? 8;
  const days = data.settings?.workingDaysPerMonth ?? 26;
  const ratio = data.settings?.weeklyAdvanceRatio ?? 0.5;
  const inside = (d: unknown) => dayOf(d) >= start && dayOf(d) <= end;
  const scheduled = new Set(
    (data.planning ?? [])
      .filter((p) => inside(p.planDate))
      .map((p) => String(typeof p.empId === "object" ? p.empId.empNumber : p.empId))
  );
  const exact = (data.employees ?? [])
    .filter((e) => !e.otherManager)
    .filter((e) => empId == null || String(e.empNumber) === String(empId))
    .map((e) => {
      const key = String(e.empNumber);
      const rows = (data.worktime ?? []).filter((r) => String(r.emp_id) === key && inside(r.work_date));
      // Latest first, like the backend
      const advances = (data.advances ?? [])
        .filter((a) => String(a.emp_id) === key && inside(a.date))
        .sort((a, b) => dayOf(b.date).localeCompare(dayOf(a.date)));
      const bonuses = (data.bonuses ?? []).filter((b) => String(b.emp_id) === key && inside(b.date));
      const hourlyRate = num(e.baseSalary) / hoursPerDay / days;
      const hours = rows.reduce((sum, r) => sum + hoursOf(r.work_hours), 0);
      const consommation = rows.reduce((sum, r) => sum + num(r.consommation ?? r.consomation), 0);
      const penalties = rows.reduce((sum, r) => sum + num(r.penalty), 0);
      const advancesTotal = advances.reduce((sum, a) => sum + num(a.amount), 0);
      const bonusesTotal = bonuses.reduce((sum, b) => sum + num(b.amount), 0);
      const gross = hours * hourlyRate;
      return {
        employeeId: String(e._id ?? ""),
        empId: e.empNumber as number,
        firstName: e.firstName ?? "",
        lastName: e.lastName ?? "",
        baseSalary: num(e.baseSalary),
        scheduled: scheduled.has(key),
        hourlyRate,
        hours,
        gross,
        penalties,
        consommation,
        absences: rows.filter((r) => r.absent).length,
        lateMinutes: rows.reduce((sum, r) => sum + num(r.late_minutes), 0),
        lateDays: rows.filter((r) => num(r.late_minutes) > 0).length,
        overtimeMinutes: rows.reduce((sum, r) => sum + num(r.overtime_minutes), 0),
        records: rows.length,
        advances: advancesTotal,
        advancesCount: advances.length,
        advanceId: advances[0]?._id ?? null,
        bonuses: bonusesTotal,
        bonusesCount: bonuses.length,
        net: gross - penalties - consommation - advancesTotal + bonusesTotal,
        advanceOffer: (gross - consommation) * ratio,
      };
    })
    .filter((r) => empId != null || r.scheduled || r.records > 0);
  type Line = (typeof exact)[number];
  const total = (pick: (l: Line) => number) => r2(exact.reduce((sum, l) => sum + pick(l), 0));
  return {
    start,
    end,
    rows: exact.map((l) => ({
      ...l,
      hourlyRate: r2(l.hourlyRate),
      hours: r2(l.hours),
      gross: r2(l.gross),
      penalties: r2(l.penalties),
      consommation: r2(l.consommation),
      advances: r2(l.advances),
      bonuses: r2(l.bonuses),
      net: r2(l.net),
      advanceOffer: r2(l.advanceOffer),
    })),
    totals: {
      hours: total((l) => l.hours),
      gross: total((l) => l.gross),
      penalties: total((l) => l.penalties),
      consommation: total((l) => l.consommation),
      advances: total((l) => l.advances),
      advancesCount: total((l) => l.advancesCount),
      bonuses: total((l) => l.bonuses),
      bonusesCount: total((l) => l.bonusesCount),
      net: total((l) => l.net),
      absences: total((l) => l.absences),
      lateMinutes: total((l) => l.lateMinutes),
      lateDays: total((l) => l.lateDays),
      overtimeMinutes: total((l) => l.overtimeMinutes),
      records: total((l) => l.records),
      activeEmployees: exact.filter((l) => l.hours > 0).length,
      employees: exact.length,
    },
  };
}

/** What GET /payroll/payslips answers for these employees (same formulas as the backend). */
export function serverPayslips(data: ReportingData, month: string) {
  return {
    month,
    payslips: (data.employees ?? [])
      .filter((e) => !e.otherManager)
      .map((e) => {
        const baseSalary = num(e.declaredSalary != null ? e.declaredSalary : e.baseSalary);
        const postSalary = r2((baseSalary / 30) * 30);
        const socialSecurity = r2(postSalary * 0.09);
        return {
          employeeId: String(e._id ?? ""),
          empId: e.empNumber,
          days: 30,
          baseSalary,
          postSalary,
          socialSecurity,
          net: r2(postSalary - socialSecurity),
        };
      }),
  };
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
    }),
    http.get(`${API}/payroll/period`, ({ request }) => {
      const q = log(request).searchParams;
      return HttpResponse.json(serverPayroll(data, q.get("start") ?? "", q.get("end") ?? "", q.get("empId")));
    }),
    http.get(`${API}/payroll/payslips`, ({ request }) => {
      const url = log(request);
      return HttpResponse.json(serverPayslips(data, url.searchParams.get("month") ?? ""));
    }),
    http.get(`${API}/payroll/closings/:month`, ({ params }) => {
      const month = String(params.month);
      return HttpResponse.json({
        month,
        closed: false,
        auto: false,
        closedAt: null,
        closedBy: null,
        reopenedAt: null,
        reopenedBy: null,
        closesAt: null,
        canClose: false,
        ...(data.closings?.[month] ?? {}),
      });
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

/** Delays /payroll/period answers for ranges starting on `start` by `ms` (logged in `requests` if given). */
export function slowPayrollFor(start: string, ms: number, data: ReportingData, requests?: URL[]) {
  server.use(
    http.get(`${API}/payroll/period`, async ({ request }) => {
      const url = new URL(request.url);
      const q = url.searchParams;
      if (q.get("start") !== start) return undefined; // fall through to the normal handler
      requests?.push(url);
      await delay(ms);
      return HttpResponse.json(serverPayroll(data, start, q.get("end") ?? "", q.get("empId")));
    })
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
