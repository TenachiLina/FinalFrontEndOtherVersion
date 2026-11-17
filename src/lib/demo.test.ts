import { afterEach, describe, expect, it } from "vitest";
import { API_BASE_URL } from "@/lib/config";
import {
  DEMO_COMPANY,
  DEMO_FRAME,
  DEMO_FRAME_SIGNED_OUT,
  DEMO_USER,
  demoData,
  demoResponse,
  demoToken,
  installDemo,
  isDemo,
} from "./demo";

const NOW = new Date(2026, 10, 17, 10, 30); // Tuesday 17 November 2026, local time
const get = (path: string, query: Record<string, string> = {}, signedOut = false) =>
  demoResponse("GET", path, new URLSearchParams(query), null, NOW, signedOut);

describe("isDemo", () => {
  const frame = (name: string) => {
    const top = {};
    return { name, self: {}, top };
  };

  it("is on in a guide's frame, signed in or out", () => {
    expect(isDemo(frame(DEMO_FRAME))).toBe(true);
    expect(isDemo(frame(DEMO_FRAME_SIGNED_OUT))).toBe(true);
  });

  it("is never on in a tab's own window, whatever its name", () => {
    const tab = { name: DEMO_FRAME } as { name: string; self?: unknown; top?: unknown };
    tab.self = tab;
    tab.top = tab;
    expect(isDemo(tab)).toBe(false);
  });

  it("is off in any other frame, and on the server", () => {
    expect(isDemo(frame("other"))).toBe(false);
    expect(isDemo(frame(""))).toBe(false);
    expect(isDemo(undefined)).toBe(false);
  });

  it("is off in the app the tests run (a normal window)", () => {
    expect(isDemo()).toBe(false);
  });
});

describe("the sample company", () => {
  it("is planned for the whole month and the coming week, closed on Fridays", () => {
    const { today, planning } = demoData(NOW);
    expect(today).toBe("2026-11-17");
    const days = [...new Set(planning.map((p) => String(p.planDate).slice(0, 10)))].sort();
    expect(days[0]).toBe("2026-11-01");
    expect(days.at(-1)).toBe("2026-11-24");
    expect(days).not.toContain("2026-11-20"); // a Friday
    // Six people a day, with the shift and the employee filled in, like the real list
    expect(planning.filter((p) => String(p.planDate).startsWith("2026-11-17"))).toHaveLength(6);
    expect(planning[0]).toMatchObject({ shiftId: { startTime: "08:00" }, empId: { empNumber: 101 } });
  });

  it("has clocked in on the days before today only", () => {
    const { worktime } = demoData(NOW);
    const days = worktime.map((w) => String(w.work_date).slice(0, 10));
    expect(days.every((d) => d < "2026-11-17")).toBe(true);
    expect(worktime.some((w) => Number(w.late_minutes) > 0)).toBe(true);
  });

  it("is built once a day", () => {
    expect(demoData(NOW)).toBe(demoData(new Date(2026, 10, 17, 18, 0)));
    expect(demoData(new Date(2026, 10, 18, 9, 0)).today).toBe("2026-11-18");
  });
});

describe("what the sample company answers", () => {
  it("signs in as Sara Benali, admin of Pizza Roma", () => {
    const login = demoResponse("POST", "/auth/login", new URLSearchParams(), { email: "x", password: "y" }, NOW);
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ user: DEMO_USER, company: DEMO_COMPANY, refreshToken: "demo-refresh" });
    expect(get("/auth/me").body).toEqual({ user: DEMO_USER, company: DEMO_COMPANY });
    expect(demoResponse("POST", "/auth/refresh", undefined, null, NOW).body).toMatchObject({ refreshToken: "demo-refresh" });
    expect(demoResponse("POST", "/auth/logout", undefined, null, NOW).status).toBe(204);
  });

  it("is signed out on the sign-in page's frame", () => {
    expect(get("/auth/me", {}, true).status).toBe(401);
    expect(get("/branding/pizza-roma").body).toMatchObject({ name: "Pizza Roma" });
  });

  it("gives a token the app accepts for a day", () => {
    const [, payload] = demoToken(NOW).split(".");
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    expect(claims.exp - Math.floor(NOW.getTime() / 1000)).toBe(86_400);
  });

  it("lists employees, shifts, posts and users", () => {
    expect((get("/employees").body as unknown[]).length).toBe(6);
    expect(get("/employees", { status: "archived" }).body).toEqual([]);
    expect((get("/shifts").body as unknown[]).length).toBe(2);
    expect(get("/shifts", { status: "archived" }).body).toEqual([expect.objectContaining({ isArchived: true })]);
    expect((get("/tasks").body as unknown[]).length).toBe(4);
    expect((get("/users").body as { role: string }[]).map((u) => u.role)).toEqual(["admin", "manager", "employee"]);
    expect(get("/employees/demo-e2").body).toMatchObject({ firstName: "Amel" });
    expect(get("/employees/unknown").body).toMatchObject({ firstName: "Yacine" });
  });

  it("filters the planning and work time by day or by period", () => {
    expect((get("/planning", { planDate: "2026-11-17" }).body as unknown[]).length).toBe(6);
    expect((get("/planning", { from: "2026-11-16", to: "2026-11-17" }).body as unknown[]).length).toBe(12);
    expect((get("/worktime", { work_date: "2026-11-16" }).body as unknown[]).length).toBe(6);
    expect((get("/worktime", { start: "2026-11-16", end: "2026-11-16" }).body as unknown[]).length).toBe(6);
    expect((get("/worktime/report", { start: "2026-11-17", end: "2026-11-30" }).body as unknown[]).length).toBe(0);
    expect((get("/planning/import/2026-11-17").body as { title: string }[])[0]).toMatchObject({ title: "Yacine Haddad", shiftId: "demo-s1" });
  });

  it("calculates the pay of a period with the server's formulas", () => {
    const pay = get("/payroll/period", { start: "2026-11-16", end: "2026-11-16" }).body as {
      rows: { empId: number; hours: number; hourlyRate: number; gross: number; net: number }[];
      totals: { employees: number; records: number };
    };
    const yacine = pay.rows.find((r) => r.empId === 101)!;
    // 52 000 / 8 / 26 = 250 an hour, 8 hours
    expect(yacine).toMatchObject({ hourlyRate: 250, hours: 8, gross: 2000 });
    expect(pay.totals).toMatchObject({ employees: 6, records: 6 });
    const one = get("/payroll/period", { start: "2026-11-01", end: "2026-11-30", empId: "102" }).body as { rows: unknown[] };
    expect(one.rows).toHaveLength(1);
  });

  it("gives payslips, closings, the dashboard, notifications and the kiosk", () => {
    expect(get("/payroll/payslips", { month: "2026-11" }).body).toMatchObject({ month: "2026-11", payslips: expect.any(Array) });
    expect(get("/payroll/closings/2026-10").body).toMatchObject({ closed: false, canClose: true });
    expect(get("/payroll/closings/2026-11").body).toMatchObject({ canClose: false });
    expect(get("/dashboard").body).toMatchObject({
      day: "2026-11-17",
      time: "10:30",
      attendance: { counts: { planned: 6, present: 2, missing: 1, late: 1 } },
      pending: { corrections: 1 },
      month: { month: "2026-11", currency: "DA" },
    });
    expect(get("/notifications").body).toMatchObject({ unread: 2 });
    expect(get("/corrections/count").body).toEqual({ pending: 1 });
    expect((get("/kiosk/employees").body as { clockedIn: boolean }[]).filter((e) => e.clockedIn)).toHaveLength(2);
    expect(get("/device/status").body).toEqual({ connected: true, name: "Face Recognition Machine" });
  });

  it("filters advances and bonuses by period", () => {
    expect((get("/advances", { start: "2026-11-01", end: "2026-11-30" }).body as unknown[]).length).toBe(2);
    expect((get("/advances/employee/101", { start: "2026-11-01", end: "2026-11-30" }).body as unknown[]).length).toBe(1);
    expect((get("/bonuses", { start: "2026-11-01", end: "2026-11-30" }).body as unknown[]).length).toBe(1);
  });

  it("answers an empty list for anything else", () => {
    expect(get("/activity-log").body).toEqual([]);
  });

  it("accepts every change and saves nothing", () => {
    const before = (get("/employees").body as unknown[]).length;
    const add = demoResponse("POST", "/employees", undefined, { firstName: "New" }, NOW);
    expect(add).toEqual({ status: 201, body: { _id: "demo-new", firstName: "New" } });
    expect(demoResponse("PUT", "/employees/demo-e1", undefined, { firstName: "X" }, NOW).status).toBe(200);
    expect(demoResponse("DELETE", "/employees/demo-e1", undefined, null, NOW).status).toBe(200);
    expect((get("/employees").body as unknown[]).length).toBe(before);
    expect(demoResponse("PATCH", "/auth/me", undefined, { name: "Other" }, NOW).body).toMatchObject({ user: { name: "Other" } });
    expect(demoResponse("POST", "/kiosk/clock", undefined, { empNumber: 102, action: "in" }, NOW).body).toMatchObject({
      employee: { name: "Amel Kaci" },
    });
    expect(demoResponse("POST", "/notifications/read", undefined, { keys: ["x"] }, NOW).status).toBe(204);
  });
});

describe("installDemo", () => {
  // A window of its own, as a guide's frame is
  const frames: HTMLIFrameElement[] = [];
  const newFrame = (name: string) => {
    const frame = document.createElement("iframe");
    frame.name = name;
    document.body.appendChild(frame);
    frames.push(frame);
    const win = frame.contentWindow as unknown as Window & typeof globalThis;
    // Browsers give a frame its name and a fetch of its own; jsdom does neither
    win.name = name;
    win.fetch ??= (async () => new Response("")) as typeof fetch;
    return win;
  };
  afterEach(() => frames.splice(0).forEach((f) => f.remove()));

  it("gives the frame a throw-away storage with a demo session, and keeps the viewer's language", () => {
    localStorage.setItem("lang", "fr");
    const win = newFrame(DEMO_FRAME);
    win.localStorage.setItem("lang", "fr");
    installDemo(win);
    expect(win.localStorage.getItem("auth_token")).toMatch(/^demo\./);
    expect(JSON.parse(win.localStorage.getItem("auth_user")!)).toMatchObject({ name: "Sara Benali" });
    expect(win.localStorage.getItem("lang")).toBe("fr");
    win.localStorage.setItem("theme", "dark");
    win.localStorage.removeItem("auth_token");
    expect(win.localStorage.getItem("auth_token")).toBeNull();
    win.localStorage.clear();
    expect(win.localStorage.getItem("auth_user")).toBeNull();
    localStorage.removeItem("lang");
  });

  it("starts signed out in the sign-in frame", () => {
    const win = newFrame(DEMO_FRAME_SIGNED_OUT);
    installDemo(win);
    expect(win.localStorage.getItem("auth_token")).toBeNull();
  });

  it("answers the API from the sample company, and leaves other requests alone", async () => {
    const win = newFrame(DEMO_FRAME);
    let realCalls = 0;
    win.fetch = (async () => {
      realCalls++;
      return new Response("asset");
    }) as typeof fetch;
    installDemo(win);
    installDemo(win); // installing twice changes nothing
    const res = await win.fetch(`${API_BASE_URL}/employees`);
    expect(res.status).toBe(200);
    expect((await res.json()).length).toBe(6);
    const saved = await win.fetch(`${API_BASE_URL}/shifts`, { method: "POST", body: JSON.stringify({ startTime: "09:00" }) });
    expect(await saved.json()).toMatchObject({ startTime: "09:00" });
    const broken = await win.fetch(`${API_BASE_URL}/shifts`, { method: "POST", body: "not json" });
    expect(broken.status).toBe(201);
    const none = await win.fetch(`${API_BASE_URL}/auth/logout`, { method: "POST" });
    expect(none.status).toBe(204);
    await win.fetch("/_next/static/chunk.js");
    expect(realCalls).toBe(1);
  });
});
