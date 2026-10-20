import { t } from "@/lib/i18n";
// ─────────────────────────────────────────────────────────────────────────
// Turning failures into messages people can act on.
//
// Use `ensureOk(res)` after fetch() to throw an ApiError carrying the
// backend's message, and `friendlyError(err)` wherever an error is shown
// to the user. Technical details are logged to the console, never shown.
// ─────────────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    // Code of the error in the system error log (server errors only)
    public reference?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const NETWORK = "Can't reach the server. Check your internet connection and try again.";
const SERVER = "Something went wrong on our side. Please try again in a moment.";
// All messages below are English and translated on the way out (see friendlyError)

/** Reads the backend's message (and error reference) from a failed response. */
async function messageFrom(res: Response): Promise<{ message: string; reference?: string }> {
  try {
    const text = await res.text();
    try {
      const body = JSON.parse(text);
      const msg = body?.message;
      const reference = typeof body?.reference === "string" ? body.reference : undefined;
      if (Array.isArray(msg)) return { message: msg.join(". "), reference };
      if (typeof msg === "string") return { message: msg, reference };
    } catch {
      /* not JSON */
    }
    return { message: text.length < 200 ? text : "" };
  } catch {
    return { message: "" };
  }
}

/** Throws an ApiError when the response is not OK; returns it otherwise. */
export async function ensureOk(res: Response): Promise<Response> {
  if (!res.ok) {
    const { message, reference } = await messageFrom(res);
    throw new ApiError(res.status, message, reference);
  }
  return res;
}

/** fetch() + ensureOk + JSON. Network failures become a friendly ApiError too. */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    console.error(err);
    throw new ApiError(0, NETWORK);
  }
  await ensureOk(res);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function byStatus(status: number, serverMessage: string): string {
  switch (status) {
    case 0:
      return NETWORK;
    case 400:
    case 409:
    case 422:
      return serverMessage || "Some of the information isn't valid. Please check it and try again.";
    case 401:
      return "Your session has expired. Please sign in again.";
    case 403:
      return serverMessage || "You don't have permission to do this.";
    case 404:
      return "We couldn't find that. It may have been deleted.";
    case 413:
      return "That file is too large.";
    case 429:
      return serverMessage || "Too many attempts. Please wait a moment and try again.";
    default:
      return status >= 500 ? SERVER : serverMessage || SERVER;
  }
}

/**
 * A clear message for any error. `context` says what was being done,
 * e.g. "Couldn't save the planning", and is put in front of the reason.
 */
export function friendlyError(err: unknown, context?: string): string {
  console.error(context ?? "Error", err);
  let reason: string;

  if (err instanceof ApiError) {
    reason = byStatus(err.status, err.message);
    // Lets support find this exact error in System errors
    if (err.reference) reason = `${t(reason)} ${t("(Error code: {code})", { code: err.reference })}`;
  } else if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    reason = NETWORK;
  } else if (err instanceof Error) {
    // Older code throws `${status} ${body}`; recover the status and message.
    const m = /^(\d{3})\b\s*([\s\S]*)$/.exec(err.message);
    if (m) {
      let serverMessage = m[2];
      let reference: string | undefined;
      try {
        const body = JSON.parse(m[2]);
        serverMessage = Array.isArray(body?.message) ? body.message.join(". ") : body?.message ?? "";
        if (typeof body?.reference === "string") reference = body.reference;
      } catch {
        /* not JSON */
      }
      reason = byStatus(Number(m[1]), serverMessage);
      if (reference) reason = `${t(reason)} ${t("(Error code: {code})", { code: reference })}`;
    } else if (/^(failed to|error)/i.test(err.message) || err.message.length > 160) {
      // Technical wording ("Failed to fetch employees"): don't show it as is
      reason = SERVER;
    } else {
      reason = err.message || SERVER;
    }
  } else {
    reason = SERVER;
  }

  // Server messages arrive already translated; t() leaves unknown text unchanged
  reason = t(reason);
  if (!context) return reason;
  return `${t(context)}. ${reason}`;
}

/**
 * For extra data a screen can do without (e.g. advances on the payroll):
 * returns `fallback` on failure and warns that totals may be incomplete.
 * Stays silent when the feature is simply switched off (403).
 */
export function optionalData<T>(fallback: T, what: string) {
  return (err: unknown): T => {
    if (err instanceof ApiError && err.status === 403) return fallback;
    console.error(`${what} couldn't be loaded`, err);
    // Imported lazily so this file stays free of UI dependencies
    import("@/lib/notify").then(({ toast }) =>
      toast.warning(
        t("{what} couldn't be loaded, so the totals shown may be incomplete. Try refreshing.", { what: t(what) })
      )
    );
    return fallback;
  };
}
