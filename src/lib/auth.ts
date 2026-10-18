import { API_BASE_URL } from "@/lib/config";

export type Role = "admin" | "manager";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

// Pages only admins can open. Managers get planning and clock-in.
const ADMIN_ONLY_PREFIXES = [
  "/reporting",
  "/addEmployeeForm",
  "/add-employee",
  "/basic-tables",
  "/users",
];

export function isAdminOnlyPath(pathname: string): boolean {
  if (pathname === "/") return true; // the Overview report
  return ADMIN_ONLY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export function homePathFor(role: Role): string {
  return role === "admin" ? "/" : "/calendar/ViewPlanning";
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return storage()?.getItem(TOKEN_KEY) ?? null;
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = storage()?.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: AuthUser) {
  storage()?.setItem(TOKEN_KEY, token);
  storage()?.setItem(USER_KEY, JSON.stringify(user));
}

export function saveUser(user: AuthUser) {
  storage()?.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  storage()?.removeItem(TOKEN_KEY);
  storage()?.removeItem(USER_KEY);
}

// Some components still call the backend on localhost:3001 directly.
const API_ORIGINS = [API_BASE_URL, "http://localhost:3001"].filter(Boolean);

function isApiUrl(url: string): boolean {
  return API_ORIGINS.some((origin) => url.startsWith(origin));
}

let installed = false;

/**
 * Wraps window.fetch so every request to the backend carries the login token,
 * and a 401 (expired or revoked session) sends the user back to the sign-in page.
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

    const res = await originalFetch(input, { ...init, headers });
    if (res.status === 401 && token && !url.includes("/auth/login")) {
      clearSession();
      if (!window.location.pathname.startsWith("/signin")) {
        const next = encodeURIComponent(
          window.location.pathname + window.location.search
        );
        window.location.href = `/signin?next=${next}`;
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
