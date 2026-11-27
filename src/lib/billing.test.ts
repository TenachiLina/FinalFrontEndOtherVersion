import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { API, server } from "@/test/server";
import { ApiError } from "@/lib/errors";
import { makeCompany, makeUser } from "@/test/factories";
import { canOpen, isPageOff, pageForPath, PAGE_FEATURES, PAGE_LABELS } from "@/lib/auth";
import {
  addPayment,
  clearSubscription,
  createPack,
  deletePack,
  fetchPacks,
  setSubscription,
  standingOf,
  updatePack,
} from "./billing";

const NOW = new Date("2026-11-14T10:00:00.000Z");
const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();

describe("standingOf", () => {
  it("is 'none' without a subscription or an end date", () => {
    for (const none of [null, undefined, { status: "active" as const, endsAt: "" }]) {
      expect(standingOf(none, NOW)).toEqual({ status: "none", daysLeft: null, endingSoon: false });
    }
    expect(standingOf({ status: "active", endsAt: "soon" }, NOW).status).toBe("none");
  });

  it("tells a trial from a paid period, with the days left", () => {
    expect(standingOf({ status: "trial", endsAt: inDays(10) }, NOW)).toEqual({ status: "trial", daysLeft: 10, endingSoon: false });
    expect(standingOf({ status: "active", endsAt: inDays(30) }, NOW)).toEqual({ status: "active", daysLeft: 30, endingSoon: false });
  });

  it("is ending soon in the last 7 days, expired after the end", () => {
    expect(standingOf({ status: "active", endsAt: inDays(8) }, NOW).endingSoon).toBe(false);
    expect(standingOf({ status: "active", endsAt: inDays(7) }, NOW)).toEqual({ status: "active", daysLeft: 7, endingSoon: true });
    expect(standingOf({ status: "trial", endsAt: inDays(-1) }, NOW)).toEqual({ status: "expired", daysLeft: 0, endingSoon: false });
  });
});

describe("pack and subscription calls", () => {
  it("lists the packs, and copes with an answer that isn't a list", async () => {
    server.use(http.get(`${API}/packs`, () => HttpResponse.json([{ _id: "p1", name: "Starter" }])));
    expect(await fetchPacks()).toEqual([{ _id: "p1", name: "Starter" }]);
    server.use(http.get(`${API}/packs`, () => HttpResponse.json({})));
    expect(await fetchPacks()).toEqual([]);
    server.use(http.get(`${API}/packs`, () => HttpResponse.json({ message: "No" }, { status: 403 })));
    await expect(fetchPacks()).rejects.toBeInstanceOf(ApiError);
  });

  it("sends each change to its route with its body", async () => {
    const calls: { method: string; path: string; body: unknown }[] = [];
    server.use(
      http.all(`${API}/*`, async ({ request }) => {
        const text = await request.text();
        calls.push({
          method: request.method,
          path: new URL(request.url).pathname,
          body: text ? JSON.parse(text) : undefined,
        });
        return HttpResponse.json({ ok: true });
      })
    );
    await createPack({ name: "Starter", price: 3000 });
    await updatePack("p1", { active: false });
    await deletePack("p1");
    await setSubscription("c1", { packId: "p1", kind: "trial" });
    await addPayment("c1", { amount: 5000, months: 1 });
    await clearSubscription("c1");
    expect(calls).toEqual([
      { method: "POST", path: "/packs", body: { name: "Starter", price: 3000 } },
      { method: "PATCH", path: "/packs/p1", body: { active: false } },
      { method: "DELETE", path: "/packs/p1", body: undefined },
      { method: "PUT", path: "/companies/c1/subscription", body: { packId: "p1", kind: "trial" } },
      { method: "POST", path: "/companies/c1/subscription/payments", body: { amount: 5000, months: 1 } },
      { method: "DELETE", path: "/companies/c1/subscription", body: undefined },
    ]);
  });

  it("throws the server's refusal", async () => {
    server.use(http.post(`${API}/packs`, () => HttpResponse.json({ message: "Pack name is required" }, { status: 400 })));
    await expect(createPack({})).rejects.toEqual(new ApiError(400, "Pack name is required"));
  });
});

describe("pages switched off one by one", () => {
  it("every page has a name and a known feature", () => {
    expect(Object.keys(PAGE_LABELS).sort()).toEqual(Object.keys(PAGE_FEATURES).sort());
  });

  it.each([
    ["/kiosk", "kiosk"],
    ["/clock-in", "clockinManual"],
    ["/clock-in/history", "clockinHistory"],
    ["/planning/new", "planningNew"],
    ["/planning/view", "planningView"],
    ["/planning/shifts", "shifts"],
    ["/reporting/overview", "overview"],
    ["/reporting/monthly-payroll", "monthlyPayroll"],
    ["/reporting/payslips", "payslips"],
    ["/reporting/weekly-advances", "weeklyAdvances"],
    ["/reporting/advances", "advancesList"],
    ["/reporting/bonuses/give", "bonusesGive"],
    ["/reporting/bonuses/history", "bonusesHistory"],
    ["/reporting/attendance", "attendance"],
    ["/insured-employees", "insuredEmployees"],
    ["/insured-employees/new", "insuredEmployees"],
    ["/corrections", "corrections"],
  ])("%s belongs to %s", (path, page) => {
    expect(pageForPath(path)).toBe(page);
  });

  it("switching the manual clock-in page off leaves face clock-in open", () => {
    expect(pageForPath("/clock-in/face")).toBeNull();
    const company = makeCompany({ disabledPages: ["clockinManual"] });
    expect(canOpen("/clock-in", makeUser(), company)).toBe(false);
    expect(canOpen("/clock-in/face", makeUser(), company)).toBe(true);
    expect(canOpen("/clock-in/history", makeUser(), company)).toBe(true);
  });

  it("other paths belong to no page switch", () => {
    for (const path of ["/home", "/users", "/company-settings", "/reporting/employee/12", "/account", "/employees", "/employees/new"]) {
      expect(pageForPath(path)).toBeNull();
    }
  });

  it("clock-in on with the kiosk off: the kiosk is closed, the clock-in page open", () => {
    const company = makeCompany({ disabledPages: ["kiosk"] });
    const admin = makeUser();
    expect(isPageOff("/kiosk", company)).toBe(true);
    expect(canOpen("/kiosk", admin, company)).toBe(false);
    expect(canOpen("/clock-in", admin, company)).toBe(true);
    // The kiosk account has nowhere to go
    expect(canOpen("/kiosk", makeUser({ role: "employee" }), company)).toBe(false);
    expect(canOpen("/kiosk", makeUser({ role: "employee" }), makeCompany())).toBe(true);
  });

  it("a page switched off is closed to managers and admins alike", () => {
    const company = makeCompany({ disabledPages: ["payslips", "insuredEmployees"] });
    for (const role of ["admin", "manager"] as const) {
      const user = makeUser({ role });
      expect(canOpen("/reporting/payslips", user, company)).toBe(false);
      expect(canOpen("/insured-employees", user, company)).toBe(false);
      expect(canOpen("/reporting/monthly-payroll", user, company)).toBe(true);
    }
  });

  it("nothing is off for a company without the list", () => {
    expect(isPageOff("/kiosk", makeCompany())).toBe(false);
    expect(isPageOff("/kiosk", null)).toBe(false);
  });

  it("only the super admin opens the packs page, with or without a company", () => {
    const root = makeUser({ role: "superadmin", companyId: null });
    expect(canOpen("/packs", root, null)).toBe(true);
    expect(canOpen("/packs", root, makeCompany())).toBe(true);
    expect(canOpen("/packs", makeUser(), makeCompany())).toBe(false);
    expect(canOpen("/packs", makeUser({ role: "manager" }), makeCompany())).toBe(false);
  });
});
