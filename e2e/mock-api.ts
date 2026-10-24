import type { Page, Route } from "@playwright/test";

// A small in-memory backend for end-to-end tests. Every request the app makes
// to the API (https://api.e2e.test, set at build time in playwright.config.ts)
// is answered here, so the tests run without a real server or database.

export const API = "https://api.e2e.test";

type Role = "superadmin" | "admin" | "manager" | "employee";
const FEATURES = ["planning", "clockin", "faceRecognition", "reporting", "advances", "bonuses"];

export const company = {
  id: "c1",
  name: "Pizza Roma",
  slug: "roma",
  branding: {},
  active: true,
  features: FEATURES,
  settings: { currency: "DA", utcOffset: "+01:00", hoursPerDay: 8, workingDaysPerMonth: 26, weeklyAdvanceRatio: 0.5 },
};

export const users: Record<string, { id: string; email: string; name: string; role: Role; companyId: string | null }> = {
  "admin@roma.dz": { id: "u1", email: "admin@roma.dz", name: "Amina Admin", role: "admin", companyId: "c1" },
  "manager@roma.dz": { id: "u2", email: "manager@roma.dz", name: "Mehdi Manager", role: "manager", companyId: "c1" },
  "kiosk@roma.dz": { id: "u3", email: "kiosk@roma.dz", name: "Kiosk", role: "employee", companyId: "c1" },
};
export const PASSWORD = "correct-horse";

/** A JWT-shaped token that expires in `seconds`. */
export function jwt(seconds: number, sub = "u1") {
  const b64 = Buffer.from(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + seconds })).toString("base64url");
  return `e2e.${b64}.sig`;
}

export const employees = [
  { _id: "e1", empNumber: 101, firstName: "Karim", lastName: "Benali", baseSalary: 41600 },
  { _id: "e2", empNumber: 102, firstName: "Sara", lastName: "Haddad", baseSalary: 20800 },
];
const shifts = [{ _id: "s1", startTime: "08:00", endTime: "16:00" }];
const tasks = [{ _id: "t1", taskId: 1, taskName: "Pizzaiolo" }];

export interface MockState {
  /** Access tokens the server accepts. */
  validTokens: Set<string>;
  refreshCalls: number;
  kioskClockedIn: Set<number>;
  /** Saved planning per day: what POST /planning/bulk stored. */
  planning: Record<string, { shiftId: string; empId: string; backupEmpIds: string[]; taskId: number; tasks: unknown[] }[]>;
  bulkSaves: number;
  /** Worktime rows for reports. */
  worktime: Record<string, unknown>[];
  unhandled: string[];
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

export async function mockApi(page: Page, init: Partial<MockState> = {}): Promise<MockState> {
  const state: MockState = {
    validTokens: new Set(),
    refreshCalls: 0,
    kioskClockedIn: new Set(),
    planning: {},
    bulkSaves: 0,
    worktime: [],
    unhandled: [],
    ...init,
  };
  let signedIn: (typeof users)[string] | null = null;

  const authorized = (route: Route) => {
    const token = route.request().headers()["authorization"]?.replace("Bearer ", "");
    return !!token && state.validTokens.has(token);
  };

  // Some screens still ask a local clocking machine directly (see BUG-216)
  await page.route("**://localhost:3001/**", (route) => json(route, { connected: false }));

  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const body = req.postDataJSON?.() ?? null;

    // ── Auth ──
    if (path === "/auth/login" && method === "POST") {
      const user = users[body?.email];
      if (!user || body?.password !== PASSWORD) return json(route, { message: "Wrong email or password" }, 401);
      signedIn = user;
      const accessToken = jwt(600, user.id);
      state.validTokens.add(accessToken);
      return json(route, { accessToken, refreshToken: "refresh-1", user, company });
    }
    if (path === "/auth/refresh" && method === "POST") {
      state.refreshCalls++;
      const accessToken = jwt(600);
      state.validTokens.add(accessToken);
      return json(route, { accessToken, refreshToken: `refresh-${state.refreshCalls + 1}` });
    }
    if (path === "/auth/logout") return route.fulfill({ status: 204 });
    if (path.startsWith("/branding/")) return json(route, { name: company.name, slug: company.slug, branding: {} });
    if (path === "/error-logs/client") return route.fulfill({ status: 201 });

    // Everything below needs a valid token
    if (!authorized(route)) return json(route, { code: "TOKEN_EXPIRED" }, 401);

    if (path === "/auth/me") {
      const user = signedIn ?? users["admin@roma.dz"];
      return json(route, { user, company });
    }

    // ── Kiosk ──
    if (path === "/kiosk/employees") {
      return json(
        route,
        employees.map((e) => ({
          id: e._id,
          empNumber: e.empNumber,
          firstName: e.firstName,
          lastName: e.lastName,
          photo: null,
          clockedIn: state.kioskClockedIn.has(e.empNumber),
          since: state.kioskClockedIn.has(e.empNumber) ? new Date().toISOString() : null,
        }))
      );
    }
    if (path === "/kiosk/clock" && method === "POST") {
      const emp = employees.find((e) => e.empNumber === body.empNumber)!;
      if (body.action === "in") state.kioskClockedIn.add(emp.empNumber);
      else state.kioskClockedIn.delete(emp.empNumber);
      return json(route, { time: new Date().toISOString(), employee: { name: `${emp.firstName} ${emp.lastName}` } });
    }

    // ── Reference data ──
    if (path === "/employees") return json(route, employees);
    if (path === "/shifts") return json(route, shifts);
    if (path === "/tasks") return json(route, tasks);

    // ── Planning ──
    const importDay = /^\/planning\/import\/(\d{4}-\d{2}-\d{2})$/.exec(path);
    if (importDay) {
      const entries = state.planning[importDay[1]] ?? [];
      return json(
        route,
        entries.map((e, i) => {
          const emp = employees.find((x) => x._id === e.empId)!;
          return {
            id: `p-${importDay[1]}-${i}`,
            taskId: e.taskId,
            shiftId: e.shiftId,
            empId: e.empId,
            title: `${emp.firstName} ${emp.lastName}`,
            backups: [],
            tasks: e.tasks,
          };
        })
      );
    }
    if (path === "/planning/bulk" && method === "POST") {
      state.bulkSaves++;
      // The day's planning is replaced by what was sent
      state.planning[body.planDate] = body.entries;
      return json(route, { saved: body.entries.length });
    }
    if (path === "/planning") {
      const all = Object.entries(state.planning).flatMap(([day, entries]) =>
        entries.map((e) => ({ ...e, planDate: `${day}T00:00:00.000Z`, empId: employees.find((x) => x._id === e.empId) }))
      );
      return json(route, all);
    }

    // ── Reports ──
    if (path === "/worktime") {
      const start = url.searchParams.get("start");
      const end = url.searchParams.get("end");
      return json(
        route,
        state.worktime.filter((r) => (!start || String(r.work_date) >= start) && (!end || String(r.work_date) <= end))
      );
    }
    if (path === "/advances" || path === "/bonuses") return json(route, []);

    state.unhandled.push(`${method} ${path}`);
    return json(route, method === "GET" ? [] : {});
  });

  return state;
}

/** Signs in through the real sign-in form. */
export async function signInAs(page: Page, email: string, password = PASSWORD) {
  await page.goto("/signin");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("Enter your password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
