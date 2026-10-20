import { API_BASE_URL } from "@/lib/config";
import { getToken } from "@/lib/auth";

// ─────────────────────────────────────────────────────────────────────────
// Sends errors that happen in the browser (a page that crashed, a script
// error) to the backend, where they appear under System errors.
// Never throws and never shows anything to the user.
// ─────────────────────────────────────────────────────────────────────────

// Enough to see a problem, not enough to flood the log from one stuck page.
const MAX_PER_PAGE_LOAD = 20;
const REPEAT_WINDOW_MS = 10_000;

let sent = 0;
const recent = new Map<string, number>();

// Noise from browsers and extensions, not from the app
const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/i, /extension:\/\//i];

export function reportClientError(error: unknown, extra?: { digest?: string }) {
  try {
    if (typeof window === "undefined" || !getToken()) return;
    const e = error instanceof Error ? error : new Error(String(error));
    if (IGNORED.some((re) => re.test(e.message) || re.test(e.stack ?? ""))) return;

    const key = `${e.name}|${e.message}`;
    const now = Date.now();
    if ((recent.get(key) ?? 0) > now - REPEAT_WINDOW_MS || sent >= MAX_PER_PAGE_LOAD) return;
    recent.set(key, now);
    sent += 1;

    void fetch(`${API_BASE_URL}/error-logs/client`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: e.name,
        message: e.message,
        stack: e.stack,
        digest: extra?.digest,
        pageUrl: window.location.href,
      }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* reporting must never cause an error itself */
  }
}

let installed = false;

/** Also reports script errors and unhandled promise failures on every page. */
export function installErrorReporting() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (event) => {
    if (event.error) reportClientError(event.error);
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportClientError(event.reason);
  });
}
