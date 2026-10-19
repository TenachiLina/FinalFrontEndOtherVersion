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
const USER_KEY = "auth_user";
const COMPANY_KEY = "auth_company";
// The company a super admin is currently working inside.
const ACTING_COMPANY_KEY = "acting_company_id";

// ── Access rules: which pages need which role / feature ─────────────────────

// Pages only company admins can open. Managers get planning and clock-in.
const ADMIN_ONLY_PREFIXES = [
  "/reporting",
  "/addEmployeeForm",
  "/add-employee",
  "/basic-tables",
  "/users",
  "/company-settings",
];

// Pages a super admin can open without choosing a company.
const NO_COMPANY_PATHS = ["/companies", "/account", "/help"];

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
  if (pathname === "/") return true; // the Overview report
  return ADMIN_ONLY_PREFIXES.some((p) => matches(pathname, p));
}

export function featureForPath(pathname: string): Feature | null {
  if (pathname === "/") return "reporting";
  return PATH_FEATURES.find(([p]) => matches(pathname, p))?.[1] ?? null;
}

export function isSuperAdminOnlyPath(pathname: string): boolean {
  return matches(pathname, "/companies");
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
  const candidates = ["/home", "/", "/calendar/ViewPlanning", "/clockinpage", "/basic-tables"];
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

export function saveSession(
  token: string,
  user: AuthUser,
  company: CompanyInfo | null
) {
  storage()?.setItem(TOKEN_KEY, token);
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
  storage()?.removeItem(USER_KEY);
  storage()?.removeItem(COMPANY_KEY);
  storage()?.removeItem(ACTING_COMPANY_KEY);
}

// ── Authenticated fetch ─────────────────────────────────────────────────────

// Some components still call the backend on localhost:3001 directly.
const API_ORIGINS = [API_BASE_URL, "http://localhost:3001"].filter(Boolean);

function isApiUrl(url: string): boolean {
  return API_ORIGINS.some((origin) => url.startsWith(origin));
}

let installed = false;

/**
 * Wraps window.fetch so every request to the backend carries the login token
 * (and, for a super admin, the company they are working in), and a 401
 * (expired or revoked session) sends the user back to the sign-in page.
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

    const token = getToken();
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

    const res = await originalFetch(input, { ...init, headers });
    if (res.status === 401 && token && !url.includes("/auth/login")) {
      clearSession();
      if (!window.location.pathname.startsWith("/signin")) {
        const next = encodeURIComponent(
          window.location.pathname + window.location.search
        );
        let slug: string | null = null;
        try {
          slug = localStorage.getItem("last_company_slug");
        } catch {
          /* storage unavailable */
        }
        const company = slug ? `company=${encodeURIComponent(slug)}&` : "";
        window.location.href = `/signin?${company}expired=1&next=${next}`;
      }
    }
    return res;
  };
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
