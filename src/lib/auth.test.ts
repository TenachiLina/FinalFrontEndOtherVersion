import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { API, server } from "@/test/server";
import { ALL_FEATURES, makeCompany, makeJwt, makeUser } from "@/test/factories";
import type { Feature, Role } from "./auth";

type Auth = typeof import("./auth");

// installAuthFetch() wraps window.fetch once per page load and keeps the
// refresh in progress in module state, so each test gets a fresh module
let auth: Auth;
const realLocation = window.location;
let realFetch: typeof fetch;
let location: { pathname: string; search: string; href: string };

beforeEach(async () => {
  // Saved here, not at import time, so it is the fetch MSW has already patched
  realFetch = window.fetch;
  vi.resetModules();
  auth = await import("./auth");
  location = { pathname: "/reporting/overview", search: "?start=2026-03-01", href: "" };
  Object.defineProperty(window, "location", { value: location, configurable: true });
});

afterEach(() => {
  window.fetch = realFetch;
  Object.defineProperty(window, "location", { value: realLocation, configurable: true });
  Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
});

// ── Access rules ───────────────────────────────────────────────────────────

describe("path helpers", () => {
  it("isAdminOnlyPath matches the page and its sub-pages only", () => {
    expect(auth.isAdminOnlyPath("/users")).toBe(true);
    expect(auth.isAdminOnlyPath("/users/42")).toBe(true);
    expect(auth.isAdminOnlyPath("/users-report")).toBe(false);
    expect(auth.isAdminOnlyPath("/reporting")).toBe(false);
  });

  it("isSuperAdminOnlyPath", () => {
    expect(auth.isSuperAdminOnlyPath("/companies")).toBe(true);
    expect(auth.isSuperAdminOnlyPath("/system-errors/abc")).toBe(true);
    expect(auth.isSuperAdminOnlyPath("/company-settings")).toBe(false);
  });

  it.each([
    ["/reporting/weekly-advances", "advances"],
    ["/reporting/advances", "advances"],
    ["/reporting/bonuses/give", "bonuses"],
    ["/reporting/overview", "reporting"],
    ["/reporting", "reporting"],
    ["/calendar/DoPlanning", "planning"],
    ["/clockinfacerecognitionpage", "faceRecognition"],
    ["/clockinpagehistory", "clockin"],
    ["/clockinpage", "clockin"],
    ["/kiosk", "clockin"],
    ["/home", null],
    ["/clockinpageX", null],
  ])("featureForPath(%s) = %s", (path, feature) => {
    expect(auth.featureForPath(path)).toBe(feature);
  });
});

describe("canOpen", () => {
  const company = makeCompany();
  const as = (role: Role) => makeUser({ role });

  it("only the super admin opens super-admin pages", () => {
    for (const path of ["/companies", "/system-errors", "/login-sessions"]) {
      expect(auth.canOpen(path, as("superadmin"), null)).toBe(true);
      expect(auth.canOpen(path, as("superadmin"), company)).toBe(true);
      expect(auth.canOpen(path, as("admin"), company)).toBe(false);
      expect(auth.canOpen(path, as("manager"), company)).toBe(false);
    }
  });

  it("kiosk accounts only open the kiosk, and only with clock-in", () => {
    expect(auth.canOpen("/kiosk", as("employee"), company)).toBe(true);
    expect(auth.canOpen("/home", as("employee"), company)).toBe(false);
    expect(auth.canOpen("/kiosk", as("employee"), makeCompany({ features: ["planning"] }))).toBe(false);
    expect(auth.canOpen("/kiosk", as("employee"), null)).toBe(false);
  });

  it("without a company, only the company-free pages open", () => {
    const sa = as("superadmin");
    for (const path of ["/account", "/help", "/activity-log", "/login-sessions"]) {
      expect(auth.canOpen(path, sa, null)).toBe(true);
    }
    expect(auth.canOpen("/home", sa, null)).toBe(false);
    expect(auth.canOpen("/reporting/overview", sa, null)).toBe(false);
  });

  it("managers can't open admin-only pages", () => {
    for (const path of ["/users", "/company-settings", "/activity-log"]) {
      expect(auth.canOpen(path, as("manager"), company)).toBe(false);
      expect(auth.canOpen(path, as("admin"), company)).toBe(true);
    }
  });

  // BUG-011: the "no company" rule runs before the admin-only rule
  it("a manager without a company can't open the activity log", () => {
    expect(auth.canOpen("/activity-log", as("manager"), null)).toBe(false);
  });

  it.each(ALL_FEATURES.filter((f) => f !== "faceRecognition").map((f) => [f]))(
    "a page needing %s is closed when the company doesn't have it",
    (feature) => {
      const path = { planning: "/calendar", clockin: "/clockinpage", reporting: "/reporting", advances: "/reporting/advances", bonuses: "/reporting/bonuses" }[
        feature as Exclude<Feature, "faceRecognition">
      ];
      const without = makeCompany({ features: ALL_FEATURES.filter((f) => f !== feature) });
      expect(auth.canOpen(path, as("admin"), company)).toBe(true);
      expect(auth.canOpen(path, as("admin"), without)).toBe(false);
    }
  );

  it("face recognition also needs clock-in", () => {
    const path = "/clockinfacerecognitionpage";
    expect(auth.canOpen(path, as("admin"), company)).toBe(true);
    expect(auth.canOpen(path, as("admin"), makeCompany({ features: ["faceRecognition"] }))).toBe(false);
    expect(auth.canOpen(path, as("admin"), makeCompany({ features: ["clockin"] }))).toBe(false);
  });

  it("pages without a feature are open to admins and managers", () => {
    expect(auth.canOpen("/home", as("manager"), makeCompany({ features: [] }))).toBe(true);
  });
});

describe("homePathFor", () => {
  it.each([
    ["superadmin", null, "/companies"],
    ["admin", null, "/account"],
    ["employee", makeCompany(), "/kiosk"],
    ["admin", makeCompany(), "/home"],
    ["manager", makeCompany({ features: [] }), "/home"],
  ] as const)("%s with %o → %s", (role, company, path) => {
    expect(auth.homePathFor(makeUser({ role }), company)).toBe(path);
  });
});

// ── Session storage ──────────────────────────────────────────────────────

describe("session storage", () => {
  const user = makeUser();
  const company = makeCompany();

  it("saves and reads the whole session", () => {
    auth.saveSession("access", user, company, "refresh");
    expect(auth.getToken()).toBe("access");
    expect(auth.getRefreshToken()).toBe("refresh");
    expect(auth.getStoredUser()).toEqual(user);
    expect(auth.getStoredCompany()).toEqual(company);
  });

  it("keeps the old refresh token when a new one isn't given", () => {
    auth.saveTokens("a1", "r1");
    auth.saveTokens("a2");
    expect(auth.getToken()).toBe("a2");
    expect(auth.getRefreshToken()).toBe("r1");
  });

  it("saveIdentity without a company removes the stored company", () => {
    auth.saveIdentity(user, company);
    auth.saveIdentity(user, null);
    expect(auth.getStoredCompany()).toBeNull();
  });

  it("acting company for the super admin", () => {
    auth.setActingCompanyId("c9");
    expect(auth.getActingCompanyId()).toBe("c9");
    auth.setActingCompanyId(null);
    expect(auth.getActingCompanyId()).toBeNull();
  });

  it("clearSession removes everything", () => {
    auth.saveSession("a", user, company, "r");
    auth.setActingCompanyId("c9");
    auth.clearSession();
    expect([auth.getToken(), auth.getRefreshToken(), auth.getStoredUser(), auth.getStoredCompany(), auth.getActingCompanyId()]).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("returns null for corrupted JSON", () => {
    localStorage.setItem("auth_user", "{not json");
    expect(auth.getStoredUser()).toBeNull();
  });

  it("returns null when storage is blocked", () => {
    const spy = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(auth.getToken()).toBeNull();
    expect(auth.getStoredUser()).toBeNull();
    spy.mockRestore();
  });
});

// ── Authenticated fetch ──────────────────────────────────────────────────

/** Records the headers of every call to /data and answers with `respond`. */
function dataEndpoint(respond: (auth: string | null, n: number) => Response = () => HttpResponse.json({ ok: true })) {
  const seen: Headers[] = [];
  server.use(
    http.all(`${API}/data`, ({ request }) => {
      seen.push(request.headers);
      return respond(request.headers.get("Authorization"), seen.length);
    })
  );
  return seen;
}

const expired = () => HttpResponse.json({ code: "TOKEN_EXPIRED" }, { status: 401 });

/** Answers /auth/refresh with new tokens, counting the calls. */
function refreshEndpoint(respond?: () => Response) {
  const calls: unknown[] = [];
  server.use(
    http.post(`${API}/auth/refresh`, async ({ request }) => {
      calls.push(await request.json());
      return respond ? respond() : HttpResponse.json({ accessToken: "new-access", refreshToken: "new-refresh" });
    })
  );
  return calls;
}

describe("installAuthFetch", () => {
  const fresh = makeJwt(600);

  beforeEach(() => {
    auth.saveSession(fresh, makeUser(), makeCompany(), "refresh-1");
    auth.installAuthFetch();
  });

  it("adds the token and the language to backend requests", async () => {
    const seen = dataEndpoint();
    await fetch(`${API}/data`);
    expect(seen[0].get("Authorization")).toBe(`Bearer ${fresh}`);
    expect(seen[0].get("Accept-Language")).toBe("en");
    expect(seen[0].has("X-Company-Id")).toBe(false);
  });

  it("leaves other sites alone", async () => {
    let headers: Headers | undefined;
    server.use(
      http.get("https://other.test/x", ({ request }) => {
        headers = request.headers;
        return HttpResponse.json({});
      })
    );
    await fetch("https://other.test/x");
    expect(headers?.has("Authorization")).toBe(false);
  });

  // BUG-007: "https://api.test.evil.com" starts with "https://api.test", so it gets the token
  it("does not send the token to a host that only starts with the API address", async () => {
    let headers: Headers | undefined;
    server.use(
      http.get("https://api.test.evil.com/x", ({ request }) => {
        headers = request.headers;
        return HttpResponse.json({});
      })
    );
    await fetch("https://api.test.evil.com/x");
    expect(headers?.has("Authorization")).toBe(false);
  });

  it("keeps headers the caller set", async () => {
    const seen = dataEndpoint();
    await fetch(`${API}/data`, { headers: { Authorization: "Bearer mine", "Accept-Language": "ar" } });
    expect(seen[0].get("Authorization")).toBe("Bearer mine");
    expect(seen[0].get("Accept-Language")).toBe("ar");
  });

  it("accepts URL and Request objects", async () => {
    const seen = dataEndpoint();
    await fetch(new URL(`${API}/data`));
    await fetch(new Request(`${API}/data`, { headers: { "X-Test": "1" } }));
    expect(seen.map((h) => h.get("Authorization"))).toEqual([`Bearer ${fresh}`, `Bearer ${fresh}`]);
    expect(seen[1].get("X-Test")).toBe("1");
  });

  it("sends the acting company for a super admin only", async () => {
    const seen = dataEndpoint();
    auth.setActingCompanyId("c9");
    await fetch(`${API}/data`);
    auth.saveIdentity(makeUser({ role: "superadmin" }), null);
    await fetch(`${API}/data`);
    expect(seen.map((h) => h.get("X-Company-Id"))).toEqual([null, "c9"]);
  });

  it("is installed only once", async () => {
    const wrapped = window.fetch;
    auth.installAuthFetch();
    expect(window.fetch).toBe(wrapped);
  });

  it("renews the token shortly before it expires", async () => {
    auth.saveTokens(makeJwt(10), "refresh-1");
    const refreshes = refreshEndpoint();
    const seen = dataEndpoint();
    await fetch(`${API}/data`);
    expect(refreshes).toEqual([{ refreshToken: "refresh-1" }]);
    expect(seen[0].get("Authorization")).toBe("Bearer new-access");
    expect(auth.getRefreshToken()).toBe("new-refresh");
  });

  it("treats a token it can't read as expired", async () => {
    auth.saveTokens("not-a-jwt", "refresh-1");
    const refreshes = refreshEndpoint();
    dataEndpoint();
    await fetch(`${API}/data`);
    expect(refreshes).toHaveLength(1);
  });

  it("renews after TOKEN_EXPIRED and sends the request again", async () => {
    const refreshes = refreshEndpoint();
    const seen = dataEndpoint((token) => (token === "Bearer new-access" ? HttpResponse.json({ ok: true }) : expired()));
    const res = await fetch(`${API}/data`, { method: "POST", body: "payload" });
    expect(res.status).toBe(200);
    expect(refreshes).toHaveLength(1);
    expect(seen).toHaveLength(2);
    expect(location.href).toBe("");
  });

  it("shares one renewal between requests that expire together", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const refreshes = refreshEndpoint();
    server.use(
      http.post(`${API}/auth/refresh`, async () => {
        refreshes.push("call");
        await gate;
        return HttpResponse.json({ accessToken: "new-access", refreshToken: "new-refresh" });
      })
    );
    dataEndpoint((token) => (token === "Bearer new-access" ? HttpResponse.json({ ok: true }) : expired()));
    const all = Promise.all([fetch(`${API}/data`), fetch(`${API}/data`), fetch(`${API}/data`)]);
    await new Promise((r) => setTimeout(r, 50));
    release();
    const results = await all;
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshes).toHaveLength(1);
  });

  it("uses the browser lock so tabs renew one at a time", async () => {
    const request = vi.fn((_name: string, cb: () => Promise<boolean>) => cb());
    Object.defineProperty(navigator, "locks", { value: { request }, configurable: true });
    refreshEndpoint();
    dataEndpoint((token) => (token === "Bearer new-access" ? HttpResponse.json({}) : expired()));
    await fetch(`${API}/data`);
    expect(request).toHaveBeenCalledWith("auth-refresh", expect.any(Function));
  });

  it("uses the token another tab already renewed", async () => {
    const refreshes = refreshEndpoint();
    dataEndpoint((token) => {
      if (token === "Bearer other-tab") return HttpResponse.json({});
      auth.saveTokens("other-tab"); // the other tab finished first
      return expired();
    });
    const res = await fetch(`${API}/data`);
    expect(res.status).toBe(200);
    expect(refreshes).toHaveLength(0);
  });

  it("waits for the other tab when the server reports a renewal clash (409)", async () => {
    refreshEndpoint(() => {
      setTimeout(() => auth.saveTokens("other-tab"), 100);
      return new HttpResponse(null, { status: 409 });
    });
    dataEndpoint((token) => (token === "Bearer other-tab" ? HttpResponse.json({}) : expired()));
    const res = await fetch(`${API}/data`);
    expect(res.status).toBe(200);
  });

  it("signs out after a 409 when no other tab renewed", async () => {
    refreshEndpoint(() => new HttpResponse(null, { status: 409 }));
    dataEndpoint(() => expired());
    await fetch(`${API}/data`);
    expect(location.href).toContain("/signin?");
  });

  it("keeps the session when the server can't be reached during renewal", async () => {
    refreshEndpoint(() => HttpResponse.error());
    const seen = dataEndpoint((_t, n) => (n === 1 ? expired() : HttpResponse.json({})));
    const res = await fetch(`${API}/data`);
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(2);
    expect(auth.getToken()).toBe(fresh);
  });

  it("sends the user to sign in, with the page to come back to, when renewal fails", async () => {
    localStorage.setItem("last_company_slug", "pizza roma");
    refreshEndpoint(() => HttpResponse.json({ message: "revoked" }, { status: 401 }));
    dataEndpoint(() => expired());
    const res = await fetch(`${API}/data`);
    expect(res.status).toBe(401);
    expect(auth.getToken()).toBeNull();
    expect(location.href).toBe(
      "/signin?company=pizza%20roma&expired=1&next=%2Freporting%2Foverview%3Fstart%3D2026-03-01"
    );
  });

  it("signs out on a 401 that isn't an expired token", async () => {
    const refreshes = refreshEndpoint();
    dataEndpoint(() => HttpResponse.json({ code: "SESSION_REVOKED" }, { status: 401 }));
    await fetch(`${API}/data`);
    expect(refreshes).toHaveLength(0);
    expect(location.href).toBe("/signin?expired=1&next=%2Freporting%2Foverview%3Fstart%3D2026-03-01");
  });

  it("signs out when the retried request is still refused", async () => {
    refreshEndpoint();
    dataEndpoint(() => expired());
    await fetch(`${API}/data`);
    expect(location.href).toContain("/signin?");
  });

  it("signs out without a refresh token", async () => {
    localStorage.removeItem("auth_refresh");
    dataEndpoint(() => expired());
    await fetch(`${API}/data`);
    expect(location.href).toContain("/signin?");
  });

  it("can't resend a Request whose body was already sent", async () => {
    const refreshes = refreshEndpoint();
    dataEndpoint(() => expired());
    await fetch(new Request(`${API}/data`, { method: "POST", body: "x" }));
    expect(refreshes).toHaveLength(0);
    expect(location.href).toContain("/signin?");
  });

  it("doesn't redirect when already on the sign-in page", async () => {
    location.pathname = "/signin";
    dataEndpoint(() => HttpResponse.json({}, { status: 401 }));
    await fetch(`${API}/data`);
    expect(location.href).toBe("");
    expect(auth.getToken()).toBeNull();
  });

  it("returns a 401 as is when signed out", async () => {
    auth.clearSession();
    dataEndpoint(() => HttpResponse.json({}, { status: 401 }));
    const res = await fetch(`${API}/data`);
    expect(res.status).toBe(401);
    expect(location.href).toBe("");
  });

  it("never renews for the sign-in and refresh calls themselves", async () => {
    auth.saveTokens(makeJwt(5), "refresh-1");
    let refreshes = 0;
    server.use(
      http.post(`${API}/auth/login`, () => HttpResponse.json({ message: "Wrong password" }, { status: 401 })),
      http.post(`${API}/auth/refresh`, () => {
        refreshes++;
        return HttpResponse.json({}, { status: 401 });
      })
    );
    const res = await fetch(`${API}/auth/login`, { method: "POST" });
    expect(res.status).toBe(401);
    expect(refreshes).toBe(0);
    expect(location.href).toBe("");
  });

  // BUG-009: a refused early renewal is tried a second time with the same used-up refresh token
  it("tries the refresh token only once when it is refused", async () => {
    auth.saveTokens(makeJwt(10), "refresh-1");
    const refreshes = refreshEndpoint(() => HttpResponse.json({}, { status: 401 }));
    dataEndpoint(() => expired());
    await fetch(`${API}/data`);
    expect(refreshes).toHaveLength(1);
  });
});

// ── Logout and downloads ─────────────────────────────────────────────────

describe("serverLogout", () => {
  it("ends the session on the server, then locally", async () => {
    auth.saveSession("tok", makeUser(), null, "r");
    let header: string | null = null;
    server.use(
      http.post(`${API}/auth/logout`, ({ request }) => {
        header = request.headers.get("Authorization");
        return new HttpResponse(null, { status: 204 });
      })
    );
    await auth.serverLogout();
    expect(header).toBe("Bearer tok");
    expect(auth.getToken()).toBeNull();
  });

  it("still signs out locally when offline", async () => {
    auth.saveSession("tok", makeUser(), null, "r");
    server.use(http.post(`${API}/auth/logout`, () => HttpResponse.error()));
    await auth.serverLogout();
    expect(auth.getToken()).toBeNull();
  });

  it("doesn't call the server when already signed out", async () => {
    await expect(auth.serverLogout()).resolves.toBeUndefined();
  });
});

describe("downloadFile", () => {
  let clicked: { href: string; download: string }[];

  beforeEach(() => {
    clicked = [];
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    });
  });
  afterEach(() => vi.useRealTimers());

  const fileEndpoint = (headers: Record<string, string>) =>
    server.use(http.get(`${API}/export`, () => new HttpResponse("data", { headers })));

  it.each([
    ['attachment; filename="payroll-march.xlsx"', "payroll-march.xlsx"],
    ["attachment; filename*=UTF-8''paie%20mars.xlsx", "paie mars.xlsx"],
    ["attachment; filename=plain.csv", "plain.csv"],
    ["inline", "fallback.xlsx"],
  ])("names the file from %s", async (disposition, name) => {
    fileEndpoint({ "Content-Disposition": disposition });
    await auth.downloadFile(`${API}/export`, "fallback.xlsx");
    expect(clicked).toEqual([{ href: "blob:fake", download: name }]);
    expect(document.querySelector("a[download]")).toBeNull();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });

  it("uses the fallback name without the header", async () => {
    fileEndpoint({});
    await auth.downloadFile(`${API}/export`, "fallback.xlsx");
    expect(clicked[0].download).toBe("fallback.xlsx");
  });

  // BUG-010: a "%" in a plain filename makes decodeURIComponent throw
  it("accepts a filename containing %", async () => {
    fileEndpoint({ "Content-Disposition": 'attachment; filename="100% sales.xlsx"' });
    await auth.downloadFile(`${API}/export`, "fallback.xlsx");
    expect(clicked[0].download).toBe("100% sales.xlsx");
  });

  it.each([
    [HttpResponse.json({ message: "No data for March" }, { status: 404 }), "No data for March"],
    [new HttpResponse("oops", { status: 500 }), "Download failed (500)"],
    [HttpResponse.json({}, { status: 403 }), "Download failed (403)"],
  ])("throws a readable error (%#)", async (response, message) => {
    server.use(http.get(`${API}/export`, () => response));
    await expect(auth.downloadFile(`${API}/export`, "f")).rejects.toThrow(message);
  });
});
