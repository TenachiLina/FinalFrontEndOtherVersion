import { API_BASE_URL } from "@/lib/config";
import { getLang } from "@/lib/i18n";
import { t } from "@/lib/i18n";

// employee: a shared clock-in kiosk account that only sees /kiosk
export type Role = "superadmin" | "admin" | "manager" | "employee";

export type Feature =
  | "planning"
  | "clockin"
  | "faceRecognition"
  | "reporting"
  | "advances"
  | "bonuses";

export const FEATURE_LABELS: Record<Feature, string> = {
  planning: "Planning & shifts",
  clockin: "Clock in / out",
  faceRecognition: "Face-recognition clock-in",
  reporting: "Reporting & payroll",
  advances: "Advances",
  bonuses: "Bonuses",
};

export interface CompanySettings {
  /** Default language for people who haven't picked one */
  language?: "en" | "fr" | "ar";
  currency: string;
  utcOffset: string;
  hoursPerDay: number;
  workingDaysPerMonth: number;
  weeklyAdvanceRatio: number;
}

export interface CompanyInfo {
  id: string;
  name: string;
  slug: string | null;
  branding: { logo?: string; title?: string; subtitle?: string; color?: string };
  active: boolean;
  features: Feature[];
  settings: CompanySettings;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId: string | null;
}

const TOKEN_KEY = "auth_token";
// Used only to get new tokens when the access token expires (see below)
const REFRESH_KEY = "auth_refresh";
const USER_KEY = "auth_user";
const COMPANY_KEY = "auth_company";
// The company a super admin is currently working inside.
const ACTING_COMPANY_KEY = "acting_company_id";

// ── Access rules: which pages need which role / feature ─────────────────────

// Pages only company admins can open. Managers get every feature except
// these: users (and so other managers' details), company settings and the log.
const ADMIN_ONLY_PREFIXES = [
  "/users",
  "/company-settings",
  "/activity-log",
];

// Pages a super admin can open without choosing a company.
// (The activity log then shows every company.)
const NO_COMPANY_PATHS = ["/companies", "/account", "/help", "/activity-log", "/login-sessions"];

// Page prefix → feature it needs. The first match wins.
const PATH_FEATURES: [string, Feature][] = [
  ["/reporting/weekly-advances", "advances"],
  ["/reporting/advances", "advances"],
  ["/reporting/bonuses", "bonuses"],
  ["/reporting", "reporting"],
  ["/calendar", "planning"],
  ["/clockinfacerecognitionpage", "faceRecognition"],
  ["/clockinpagehistory", "clockin"],
  ["/clockinpage", "clockin"],
  ["/kiosk", "clockin"],
];

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some((p) => matches(pathname, p));
}

export function featureForPath(pathname: string): Feature | null {
  return PATH_FEATURES.find(([p]) => matches(pathname, p))?.[1] ?? null;
}

// Pages only the super admin can open, inside a company or not.
// Login sessions show other people's IP addresses and devices.
const SUPER_ADMIN_ONLY_PREFIXES = ["/companies", "/system-errors", "/login-sessions"];

export function isSuperAdminOnlyPath(pathname: string): boolean {
  return SUPER_ADMIN_ONLY_PREFIXES.some((p) => matches(pathname, p));
}

/** Whether this user may open this page in the current company. */
export function canOpen(
  pathname: string,
  user: AuthUser,
  company: CompanyInfo | null
): boolean {
  if (isSuperAdminOnlyPath(pathname)) return user.role === "superadmin";
  // Kiosk accounts only get the clock-in kiosk.
  if (user.role === "employee") {
    return matches(pathname, "/kiosk") && !!company?.features.includes("clockin");
  }
  if (!company) {
    return NO_COMPANY_PATHS.some((p) => matches(pathname, p));
  }
  if (user.role === "manager" && isAdminOnlyPath(pathname)) return false;
  const feature = featureForPath(pathname);
  if (feature && !company.features.includes(feature)) return false;
  // Face recognition is a kind of clock-in.
  if (feature === "faceRecognition" && !company.features.includes("clockin")) {
    return false;
  }
  return true;
}

export function homePathFor(user: AuthUser, company: CompanyInfo | null): string {
  if (!company) return user.role === "superadmin" ? "/companies" : "/account";
  if (user.role === "employee") return "/kiosk";
  // Everyone with a company lands on the welcome home page
  const candidates = ["/home", "/reporting/overview", "/calendar/ViewPlanning", "/clockinpage", "/basic-tables"];
  return candidates.find((p) => canOpen(p, user, company)) ?? "/account";
}

// ── Session storage ──────────────────────────────────────────────────────────

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return storage()?.getItem(TOKEN_KEY) ?? null;
}

export function getStoredUser(): AuthUser | null {
  return readJson<AuthUser>(USER_KEY);
}

export function getStoredCompany(): CompanyInfo | null {
  return readJson<CompanyInfo>(COMPANY_KEY);
}

export function getRefreshToken(): string | null {
  return storage()?.getItem(REFRESH_KEY) ?? null;
}

/** Stores the tokens from sign-in or from a refresh (they change every time). */
export function saveTokens(accessToken: string, refreshToken?: string) {
  storage()?.setItem(TOKEN_KEY, accessToken);
  if (refreshToken) storage()?.setItem(REFRESH_KEY, refreshToken);
}

export function saveSession(
  token: string,
  user: AuthUser,
  company: CompanyInfo | null,
  refreshToken?: string
) {
  saveTokens(token, refreshToken);
  saveIdentity(user, company);
}

export function saveIdentity(user: AuthUser, company: CompanyInfo | null) {
  storage()?.setItem(USER_KEY, JSON.stringify(user));
  if (company) storage()?.setItem(COMPANY_KEY, JSON.stringify(company));
  else storage()?.removeItem(COMPANY_KEY);
}

export function getActingCompanyId(): string | null {
  return storage()?.getItem(ACTING_COMPANY_KEY) ?? null;
}

export function setActingCompanyId(companyId: string | null) {
  if (companyId) storage()?.setItem(ACTING_COMPANY_KEY, companyId);
  else storage()?.removeItem(ACTING_COMPANY_KEY);
}

export function clearSession() {
  storage()?.removeItem(TOKEN_KEY);
  storage()?.removeItem(REFRESH_KEY);
  storage()?.removeItem(USER_KEY);
  storage()?.removeItem(COMPANY_KEY);
  storage()?.removeItem(ACTING_COMPANY_KEY);
}

// ── Authenticated fetch ─────────────────────────────────────────────────────

/** The URL's origin ("https://host:port"), or null for a relative or invalid URL. */
function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// Some components still call the backend on localhost:3001 directly;
// only trust those origins in development.
const API_ORIGINS = [
  originOf(API_BASE_URL),
  ...(process.env.NODE_ENV === "development"
    ? ["https://localhost:3001", "http://localhost:3001"]
    : []),
].filter(Boolean);

// Compare whole origins: a prefix check would also match "https://api.test.evil.com".
function isApiUrl(url: string): boolean {
  const origin = originOf(url);
  return origin !== null && API_ORIGINS.includes(origin);
}

// Requests that must never trigger a token refresh themselves
function isAuthUrl(url: string): boolean {
  return /\/auth\/(login|refresh)(\?|$)/.test(url);
}

/** Seconds left before the access token expires (read from the token itself). */
function secondsLeft(token: string): number {
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    return typeof payload.exp === "number" ? payload.exp - Date.now() / 1000 : 0;
  } catch {
    return 0;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let refreshing: Promise<boolean> | null = null;

/**
 * Swaps the refresh token for a new pair of tokens (the server replaces both
 * every time: "rotation"). One refresh at a time, also across browser tabs,
 * since each refresh token works only once.
 * `staleToken` is the access token that was too old: if another tab already
 * replaced it, there is nothing to do.
 */
function refreshTokens(
  originalFetch: typeof fetch,
  staleToken: string
): Promise<boolean> {
  if (refreshing) return refreshing;
  const run = async (): Promise<boolean> => {
    if (getToken() !== staleToken) return !!getToken();
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await originalFetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (res.ok) {
        const data = (await res.json()) as { accessToken: string; refreshToken: string };
        saveTokens(data.accessToken, data.refreshToken);
        return true;
      }
      if (res.status === 409) {
        // Another tab renewed the session at the same moment: use its tokens.
        await sleep(1000);
        return getToken() !== staleToken && !!getToken();
      }
      return false;
    } catch {
      // Server unreachable: keep the session, the request will fail normally
      return true;
    }
  };
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  const task: Promise<boolean> = locks
    ? // The lock resolves with run()'s result (the DOM typing nests the Promise)
      (locks.request("auth-refresh", run) as unknown as Promise<boolean>)
    : run();
  refreshing = task.finally(() => {
    refreshing = null;
  });
  return refreshing;
}

function goToSignIn() {
  clearSession();
  if (window.location.pathname.startsWith("/signin")) return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  let slug: string | null = null;
  try {
    slug = localStorage.getItem("last_company_slug");
  } catch {
    /* storage unavailable */
  }
  const company = slug ? `company=${encodeURIComponent(slug)}&` : "";
  window.location.href = `/signin?${company}expired=1&next=${next}`;
}

let installed = false;

/**
 * Wraps window.fetch so every request to the backend carries the login token
 * (and, for a super admin, the company they are working in).
 * The access token lasts a few minutes: it is renewed shortly before it
 * expires, or after the server answers TOKEN_EXPIRED (then the request is
 * sent again). If the session itself has ended, the user goes back to the
 * sign-in page.
 * This covers all existing fetch() calls without changing each of them.
 */
export function installAuthFetch() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (!isApiUrl(url)) return originalFetch(input, init);
    const authUrl = isAuthUrl(url);

    const send = (token: string | null) => {
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined)
      );
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      // The server answers in the user's language (errors, confirmations)
      if (!headers.has("Accept-Language")) headers.set("Accept-Language", getLang());
      const acting = getActingCompanyId();
      if (acting && getStoredUser()?.role === "superadmin" && !headers.has("X-Company-Id")) {
        headers.set("X-Company-Id", acting);
      }
      return originalFetch(input, { ...init, headers });
    };

    let token = getToken();
    // Renew a little before expiry, so most requests never see a 401
    if (token && !authUrl && getRefreshToken() && secondsLeft(token) < 30) {
      await refreshTokens(originalFetch, token);
      token = getToken();
    }

    let res = await send(token);
    if (res.status !== 401 || !token || authUrl) return res;

    const body = await res.clone().json().catch(() => null);
    // A Request object's body can only be read once: it can't be sent again.
    const canRetry = !(input instanceof Request && input.body);
    if (
      body?.code === "TOKEN_EXPIRED" &&
      canRetry &&
      (await refreshTokens(originalFetch, token))
    ) {
      res = await send(getToken());
      if (res.status !== 401) return res;
    }
    goToSignIn();
    return res;
  };
}

/** Ends the session on the server (its tokens stop working), then locally. */
export async function serverLogout() {
  const token = getToken();
  if (token) {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true,
      });
    } catch {
      /* offline: the session will still expire on its own */
    }
  }
  clearSession();
}

/** Downloads a file from a protected backend endpoint (exports). */
export async function downloadFile(url: string, fallbackName: string) {
  const res = await fetch(url);
  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = String(body.message);
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const filename = match ? decodeURIComponent(match[1]) : fallbackName;

  const blobUrl = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}
