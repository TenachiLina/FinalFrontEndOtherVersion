// ─────────────────────────────────────────────────────────────────────────
// Demo mode
//
// The Help page's guides show the real app, not drawings of it: each guide
// plays inside a frame that loads the real pages. Inside that frame (its
// window is named DEMO_FRAME) the app runs in demo mode:
//   - every request to the API is answered here from a sample company
//     ("Pizza Roma"), so nothing is read from or written to the real one;
//   - browser storage is replaced by a throw-away copy, so the demo never
//     touches the viewer's own session, language or theme.
// Nothing else in the app knows about demo mode.
// ─────────────────────────────────────────────────────────────────────────
import { API_BASE_URL } from "@/lib/config";

/** The name of the guide's frame; a second name shows the app signed out. */
export const DEMO_FRAME = "nexo-demo";
export const DEMO_FRAME_SIGNED_OUT = "nexo-demo-signed-out";

/**
 * True inside a guide's frame. Only a frame can be in demo mode: a tab's
 * own window never is, whatever its name.
 */
export function isDemo(
  win: { name?: string; self?: unknown; top?: unknown } | undefined = typeof window === "undefined" ? undefined : window
): boolean {
  return !!win && win.self !== win.top && (win.name === DEMO_FRAME || win.name === DEMO_FRAME_SIGNED_OUT);
}

// ── The sample company ─────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const utcMidnight = (day: string) => `${day}T00:00:00.000Z`;

export const DEMO_USER = { id: "demo-u1", email: "sara@pizzaroma.dz", name: "Sara Benali", role: "admin" as const, companyId: "demo-c1", photo: null };

export const DEMO_COMPANY = {
  id: "demo-c1",
  name: "Pizza Roma",
  slug: "pizza-roma",
  branding: {},
  active: true,
  features: ["planning", "clockin", "faceRecognition", "reporting", "advances", "bonuses"],
  disabledPages: [] as string[],
  settings: {
    language: "en",
    currency: "DA",
    utcOffset: "+01:00",
    hoursPerDay: 8,
    workingDaysPerMonth: 26,
    weeklyAdvanceRatio: 0.5,
    monthCloseDelayDays: 10,
    payslipActivity: "RESTAURATION RAPIDE",
    payslipAddress: "12 rue Didouche Mourad, Alger",
    payslipContributorNumber: "1612345678",
  },
  subscription: { status: "active", kind: "active", packName: "Pro", endsAt: null, daysLeft: 120, endingSoon: false, readOnly: false, maxEmployees: null },
};

const EMPLOYEES = [
  { _id: "demo-e1", empNumber: 101, firstName: "Yacine", lastName: "Haddad", baseSalary: 52000, jobTitle: "Pizzaiolo", phoneNumber: "0550 12 34 56", address: "Alger" },
  { _id: "demo-e2", empNumber: 102, firstName: "Amel", lastName: "Kaci", baseSalary: 41600, jobTitle: "Caissière", phoneNumber: "0661 22 33 44", address: "Bab Ezzouar" },
  { _id: "demo-e3", empNumber: 103, firstName: "Karim", lastName: "Saidi", baseSalary: 39000, jobTitle: "Livreur", phoneNumber: "0770 98 76 54", address: "Kouba" },
  { _id: "demo-e4", empNumber: 104, firstName: "Nadia", lastName: "Ferhat", baseSalary: 45500, jobTitle: "Chef de rang", phoneNumber: "0555 45 67 89", address: "Hydra" },
  { _id: "demo-e5", empNumber: 105, firstName: "Rami", lastName: "Cherif", baseSalary: 36400, jobTitle: "Commis", phoneNumber: "0662 11 22 33", address: "El Biar" },
  { _id: "demo-e6", empNumber: 106, firstName: "Lina", lastName: "Mansouri", baseSalary: 41600, jobTitle: "Serveuse", phoneNumber: "0771 55 44 33", address: "Birkhadem" },
].map((e) => ({ ...e, isArchived: false, insured: true, declaredSalary: null, familyStatus: "C", hireDate: "2024-03-01", birthDate: "1998-05-12", socialSecurityNumber: `98${e.empNumber}0012345` }));

const SHIFTS = [
  { _id: "demo-s1", startTime: "08:00", endTime: "16:00", isArchived: false },
  { _id: "demo-s2", startTime: "16:00", endTime: "23:00", isArchived: false },
];
const TASKS = [
  { _id: "demo-t1", taskId: 1, taskName: "Four", isArchived: false },
  { _id: "demo-t2", taskId: 2, taskName: "Caisse", isArchived: false },
  { _id: "demo-t3", taskId: 3, taskName: "Salle", isArchived: false },
  { _id: "demo-t4", taskId: 4, taskName: "Livraison", isArchived: false },
];

// Who works which shift and post on a normal day: [employee, shift, post]
const ROTA: [number, number, number][] = [
  [0, 0, 0],
  [1, 0, 1],
  [3, 0, 2],
  [2, 1, 3],
  [4, 1, 0],
  [5, 1, 2],
];

interface DemoData {
  today: string;
  planning: Record<string, unknown>[];
  worktime: Record<string, unknown>[];
  advances: Record<string, unknown>[];
  bonuses: Record<string, unknown>[];
}

let cache: DemoData | null = null;

/** The sample records, built around today so the demo always looks current. */
export function demoData(now: Date = new Date()): DemoData {
  const today = dayOf(now);
  if (cache && cache.today === today) return cache;
  const planning: Record<string, unknown>[] = [];
  const worktime: Record<string, unknown>[] = [];
  // The whole current month and the 7 days after: planned; the days before today: worked
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let d = first; dayOf(d) <= dayOf(addDays(now, 7)); d = addDays(d, 1)) {
    const day = dayOf(d);
    if (d.getDay() === 5) continue; // closed on Fridays
    ROTA.forEach(([e, s, tsk], i) => {
      const employee = EMPLOYEES[e];
      planning.push({
        _id: `demo-p-${day}-${i}`,
        planDate: utcMidnight(day),
        // The planning list comes with the shift and the employee filled in
        shiftId: SHIFTS[s],
        empId: employee,
        backupEmpIds: [],
        taskId: TASKS[tsk].taskId,
        tasks: [],
      });
      if (day >= today) return;
      const late = (d.getDate() + e) % 7 === 0 ? 15 : 0;
      const start = s === 0 ? 8 : 16;
      const hours = s === 0 ? 8 : 7;
      worktime.push({
        _id: `demo-w-${day}-${i}`,
        emp_id: employee.empNumber,
        shift_id: SHIFTS[s]._id,
        work_date: utcMidnight(day),
        clock_in: `${pad(start)}:${pad(late)}`,
        clock_out: `${pad(start + hours)}:00`,
        late_minutes: String(late),
        overtime_minutes: "0",
        work_hours: `${pad(hours)}:00`,
        consomation: (d.getDate() + e) % 5 === 0 ? 350 : 0,
        penalty: late ? 200 : 0,
        bonus: 0,
        absent: false,
        absent_comment: "",
      });
    });
  }
  const advances = [
    { _id: "demo-a1", emp_id: 101, amount: 5000, date: utcMidnight(dayOf(first)), reason: "Weekly advance" },
    { _id: "demo-a2", emp_id: 103, amount: 3000, date: utcMidnight(dayOf(addDays(first, 7))), reason: "Weekly advance" },
  ].filter((a) => a.date.slice(0, 10) <= today);
  const bonuses = [{ _id: "demo-b1", emp_id: 104, amount: 5000, date: dayOf(first), reason: "Great month" }];
  cache = { today, planning, worktime, advances, bonuses };
  return cache;
}

const hoursOf = (v: unknown) => {
  const [h, m = 0] = String(v ?? "0").split(":").map(Number);
  return (h || 0) + (m || 0) / 60;
};
const r2 = (n: number) => Number(n.toFixed(2));
const inside = (date: unknown, start: string, end: string) => {
  const d = String(date).slice(0, 10);
  return (!start || d >= start) && (!end || d <= end);
};

/** The sample company's pay for a period, with the server's formulas. */
function payroll(data: DemoData, start: string, end: string, empId: string | null) {
  const rows = EMPLOYEES.filter((e) => empId === null || String(e.empNumber) === empId).map((e) => {
    const work = data.worktime.filter((w) => w.emp_id === e.empNumber && inside(w.work_date, start, end));
    const advances = data.advances.filter((a) => a.emp_id === e.empNumber && inside(a.date, start, end));
    const bonuses = data.bonuses.filter((b) => b.emp_id === e.empNumber && inside(b.date, start, end));
    const sum = (list: Record<string, unknown>[], key: string) => list.reduce((t, x) => t + Number(x[key] ?? 0), 0);
    const hours = work.reduce((t, w) => t + hoursOf(w.work_hours), 0);
    const hourlyRate = e.baseSalary / 8 / 26;
    const gross = hours * hourlyRate;
    const penalties = sum(work, "penalty");
    const consommation = sum(work, "consomation");
    const adv = sum(advances, "amount");
    const bon = sum(bonuses, "amount");
    return {
      employeeId: e._id,
      empId: e.empNumber,
      firstName: e.firstName,
      lastName: e.lastName,
      baseSalary: e.baseSalary,
      scheduled: true,
      hourlyRate: r2(hourlyRate),
      hours: r2(hours),
      gross: r2(gross),
      penalties,
      consommation,
      absences: 0,
      lateMinutes: sum(work, "late_minutes"),
      lateDays: work.filter((w) => Number(w.late_minutes) > 0).length,
      overtimeMinutes: 0,
      records: work.length,
      advances: adv,
      advancesCount: advances.length,
      advanceId: (advances[0]?._id as string) ?? null,
      bonuses: bon,
      bonusesCount: bonuses.length,
      net: r2(gross - penalties - consommation - adv + bon),
      advanceOffer: r2((gross - consommation) * 0.5),
    };
  });
  const total = (key: keyof (typeof rows)[number]) => r2(rows.reduce((t, r) => t + Number(r[key] ?? 0), 0));
  return {
    start,
    end,
    closed: false,
    rows,
    totals: {
      hours: total("hours"),
      gross: total("gross"),
      penalties: total("penalties"),
      consommation: total("consommation"),
      advances: total("advances"),
      advancesCount: total("advancesCount"),
      bonuses: total("bonuses"),
      bonusesCount: total("bonusesCount"),
      net: total("net"),
      absences: 0,
      lateMinutes: total("lateMinutes"),
      lateDays: total("lateDays"),
      overtimeMinutes: 0,
      records: total("records"),
      activeEmployees: rows.filter((r) => r.hours > 0).length,
      employees: rows.length,
    },
  };
}

/** Today's board: the morning team is in (one late, one missing), the evening team is expected. */
function dashboard(data: DemoData, now: Date) {
  const person = (i: number, status: string, clockIn: string | null, late = 0) => {
    const [e, s] = ROTA[i];
    return {
      empNumber: EMPLOYEES[e].empNumber,
      name: `${EMPLOYEES[e].firstName} ${EMPLOYEES[e].lastName}`,
      status,
      shift: `${SHIFTS[s].startTime} – ${SHIFTS[s].endTime}`,
      clockIn,
      clockOut: null,
      late: late > 0,
      lateMinutes: late,
    };
  };
  const people = [
    person(2, "missing", null),
    person(0, "present", "08:00"),
    person(1, "present", "08:20", 20),
    person(3, "expected", null),
    person(4, "expected", null),
    person(5, "expected", null),
  ];
  const first = `${data.today.slice(0, 7)}-01`;
  const pay = payroll(data, first, data.today, null);
  return {
    day: data.today,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    attendance: {
      employees: EMPLOYEES.length,
      counts: { planned: 6, present: 2, left: 0, late: 1, absent: 0, missing: 1, expected: 3 },
      people,
    },
    pending: { corrections: 1 },
    month: {
      month: data.today.slice(0, 7),
      currency: "DA",
      hours: pay.totals.hours,
      gross: pay.totals.gross,
      advances: pay.totals.advances,
      bonuses: pay.totals.bonuses,
      net: pay.totals.net,
      employees: pay.totals.activeEmployees,
      closesAt: null,
    },
    subscription: { status: "active", endingSoon: false, readOnly: false, daysLeft: 120 },
  };
}

const USERS = [
  { _id: "demo-u1", name: "Sara Benali", email: "sara@pizzaroma.dz", role: "admin", companyId: "demo-c1", active: true, employeeId: null, isArchived: false },
  { _id: "demo-u2", name: "Mehdi Bouzid", email: "mehdi@pizzaroma.dz", role: "manager", companyId: "demo-c1", active: true, employeeId: null, isArchived: false },
  { _id: "demo-u3", name: "Kiosk", email: "kiosk@pizzaroma.dz", role: "employee", companyId: "demo-c1", active: true, employeeId: null, isArchived: false },
];

/** A token the app accepts as valid for a day (it is never sent anywhere). */
export function demoToken(now: Date = new Date()): string {
  const payload = btoa(JSON.stringify({ sub: DEMO_USER.id, exp: Math.floor(now.getTime() / 1000) + 86_400 }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `demo.${payload}.demo`;
}

export interface DemoAnswer {
  status: number;
  body: unknown;
}

/**
 * What the sample company answers to an API request. Reads give sample
 * records; changes are accepted and answer what was sent, saving nothing.
 */
export function demoResponse(
  method: string,
  path: string,
  query: URLSearchParams = new URLSearchParams(),
  body: unknown = null,
  now: Date = new Date(),
  signedOut = false
): DemoAnswer {
  const data = demoData(now);
  const ok = (value: unknown, status = 200): DemoAnswer => ({ status, body: value });
  const start = query.get("start") ?? "";
  const end = query.get("end") ?? "";

  // Signing in and out
  if (path === "/auth/login" && method === "POST") {
    return ok({ accessToken: demoToken(now), refreshToken: "demo-refresh", expiresIn: 900, user: DEMO_USER, company: DEMO_COMPANY });
  }
  if (path === "/auth/refresh") return ok({ accessToken: demoToken(now), refreshToken: "demo-refresh" });
  if (path === "/auth/logout" || path === "/auth/logout-others") return ok(null, 204);
  if (path.startsWith("/branding/")) return ok({ name: DEMO_COMPANY.name, slug: DEMO_COMPANY.slug, branding: {} });
  if (path === "/auth/me") {
    if (method !== "GET") return ok({ user: { ...DEMO_USER, ...(body as object) } });
    return signedOut ? { status: 401, body: { message: "Not logged in", code: "SESSION_ENDED" } } : ok({ user: DEMO_USER, company: DEMO_COMPANY });
  }

  if (method !== "GET") {
    // Nothing is saved: the page gets back what it sent, as if it had been
    if (path === "/kiosk/clock") {
      const employee = EMPLOYEES.find((e) => e.empNumber === Number((body as { empNumber?: unknown })?.empNumber)) ?? EMPLOYEES[0];
      return ok({ time: now.toISOString(), employee: { name: `${employee.firstName} ${employee.lastName}` } }, 201);
    }
    if (path === "/notifications/read") return ok(null, 204);
    return ok({ _id: "demo-new", ...(body && typeof body === "object" ? body : {}) }, method === "POST" ? 201 : 200);
  }

  switch (path) {
    case "/auth/sessions":
      return ok([]);
    case "/company":
      return ok(DEMO_COMPANY);
    case "/employees": {
      const status = query.get("status");
      return ok(status === "archived" ? [] : EMPLOYEES);
    }
    case "/shifts":
      // One old shift no longer used, so the Archived tab has something to show
      return ok(query.get("status") === "archived" ? [{ _id: "demo-s3", startTime: "12:00", endTime: "15:00", isArchived: true }] : SHIFTS);
    case "/tasks":
      return ok(TASKS);
    case "/users":
      return ok(USERS);
    case "/planning": {
      const day = query.get("planDate");
      const from = query.get("from") ?? "";
      const to = query.get("to") ?? "";
      return ok(
        data.planning.filter((p) => {
          const d = String(p.planDate).slice(0, 10);
          return day ? d === day.slice(0, 10) : inside(d, from, to);
        })
      );
    }
    case "/worktime":
    case "/worktime/report": {
      const day = query.get("work_date");
      return ok(
        data.worktime.filter((w) => (day ? String(w.work_date).slice(0, 10) === day.slice(0, 10) : inside(w.work_date, start, end)))
      );
    }
    case "/advances":
      return ok(data.advances.filter((a) => inside(a.date, start, end)));
    case "/bonuses":
      return ok(data.bonuses.filter((b) => inside(b.date, start, end)));
    case "/payroll/period":
      return ok(payroll(data, start, end, query.get("empId")));
    case "/payroll/payslips":
      return ok({
        month: query.get("month"),
        closed: false,
        payslips: EMPLOYEES.map((e) => ({
          employeeId: e._id,
          empId: e.empNumber,
          days: 30,
          baseSalary: e.baseSalary,
          postSalary: e.baseSalary,
          socialSecurity: r2(e.baseSalary * 0.09),
          net: r2(e.baseSalary * 0.91),
        })),
      });
    case "/dashboard":
      return ok(dashboard(data, now));
    case "/notifications":
      return ok({
        items: [
          {
            key: `missing:${data.today}:1-demo`,
            type: "missing",
            level: "danger",
            params: { count: 1, names: ["Karim Saidi"], day: data.today },
            href: "/clock-in/history",
            read: false,
          },
          {
            key: `late:${data.today}:1-demo`,
            type: "late",
            level: "warning",
            params: { count: 1, names: ["Amel Kaci"], day: data.today },
            href: "/clock-in/history",
            read: false,
          },
        ],
        unread: 2,
      });
    case "/corrections/count":
      return ok({ pending: 1 });
    case "/kiosk/employees":
      return ok(
        EMPLOYEES.map((e, i) => ({
          id: e._id,
          empNumber: e.empNumber,
          firstName: e.firstName,
          lastName: e.lastName,
          photo: null,
          clockedIn: i < 2,
          since: i < 2 ? now.toISOString() : null,
        }))
      );
    case "/packs":
      return ok([]);
    case "/companies":
      return ok([{ _id: DEMO_COMPANY.id, ...DEMO_COMPANY, devices: [] }]);
    case "/device/status":
      return ok({ connected: true, name: "Face Recognition Machine" });
  }

  const employee = /^\/employees\/([^/]+)$/.exec(path);
  if (employee) return ok(EMPLOYEES.find((e) => e._id === employee[1]) ?? EMPLOYEES[0]);
  const advancesOf = /^\/advances\/employee\/([^/]+)$/.exec(path);
  if (advancesOf) return ok(data.advances.filter((a) => String(a.emp_id) === advancesOf[1] && inside(a.date, start, end)));
  const closing = /^\/payroll\/closings\/(\d{4}-\d{2})$/.exec(path);
  if (closing) {
    const over = closing[1] < data.today.slice(0, 7);
    return ok({ month: closing[1], closed: false, auto: false, closedAt: null, closedBy: null, reopenedAt: null, reopenedBy: null, closesAt: null, canClose: over });
  }
  const importDay = /^\/planning\/import\/(\d{4}-\d{2}-\d{2})$/.exec(path);
  if (importDay) {
    return ok(
      data.planning
        .filter((p) => String(p.planDate).slice(0, 10) === importDay[1])
        .map((p) => {
          const e = p.empId as (typeof EMPLOYEES)[number];
          return { id: p._id, taskId: p.taskId, shiftId: (p.shiftId as (typeof SHIFTS)[number])._id, empId: e._id, title: `${e.firstName} ${e.lastName}`, backups: [], tasks: [] };
        })
    );
  }
  // Lists the demo has nothing to show in
  return ok([]);
}

// ── Running the app in demo mode ───────────────────────────────────────────

/** The keys the app keeps its session under (see lib/auth.ts). */
const SESSION = { token: "auth_token", refresh: "auth_refresh", user: "auth_user", company: "auth_company" };

/**
 * Replaces the frame's storage and its API requests. Called once, before
 * the app reads anything (see the end of this file).
 */
export function installDemo(win: Window & typeof globalThis): void {
  const marked = win as unknown as { __demoInstalled?: boolean };
  if (marked.__demoInstalled) return;
  marked.__demoInstalled = true;
  const signedOut = win.name === DEMO_FRAME_SIGNED_OUT;

  // 1. Storage: in-memory copies, for this frame only. They start with the
  //    viewer's language and theme, and a demo session unless the demo starts
  //    signed out. The viewer's own storage is never written.
  const memoryStorage = (initial: [string, string][]): Storage => {
    const memory = new Map(initial);
    return {
      get length() {
        return memory.size;
      },
      key: (i: number) => [...memory.keys()][i] ?? null,
      getItem: (key: string) => memory.get(String(key)) ?? null,
      setItem: (key: string, value: string) => void memory.set(String(key), String(value)),
      removeItem: (key: string) => void memory.delete(String(key)),
      clear: () => memory.clear(),
    };
  };
  const kept: [string, string][] = [];
  for (const key of ["lang", "theme"]) {
    try {
      const value = win.localStorage.getItem(key);
      if (value !== null) kept.push([key, value]);
    } catch {
      // storage refused (private mode): the demo starts with the defaults
    }
  }
  const session: [string, string][] = signedOut
    ? []
    : [
        [SESSION.token, demoToken()],
        [SESSION.refresh, "demo-refresh"],
        [SESSION.user, JSON.stringify(DEMO_USER)],
        [SESSION.company, JSON.stringify(DEMO_COMPANY)],
      ];
  const local = memoryStorage([...kept, ...session]);
  Object.defineProperty(win, "localStorage", { configurable: true, get: () => local });
  const sessionCopy = memoryStorage([]);
  Object.defineProperty(win, "sessionStorage", { configurable: true, get: () => sessionCopy });

  // 2. Requests to the API: answered from the sample company, with a short
  //    delay so loading states show as they do for real.
  const realFetch = win.fetch.bind(win);
  win.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const base = API_BASE_URL || win.location.origin;
    const isApi = API_BASE_URL ? url.startsWith(API_BASE_URL) : false;
    if (!isApi) return realFetch(input, init);
    const parsed = new URL(url, base);
    const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
    let body: unknown = null;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = null;
      }
    }
    const path = parsed.pathname.replace(new URL(base).pathname.replace(/\/$/, ""), "") || "/";
    const answer = demoResponse(method, path, parsed.searchParams, body, new Date(), signedOut && local.getItem(SESSION.token) === null);
    await new Promise((resolve) => setTimeout(resolve, 120));
    return new Response(answer.status === 204 ? null : JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

// The app imports this file before it reads storage or calls the API, so a
// frame named DEMO_FRAME is in demo mode from its first line of code.
if (typeof window !== "undefined" && isDemo(window)) installDemo(window);
