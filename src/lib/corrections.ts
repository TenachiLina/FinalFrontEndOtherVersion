import { API_BASE_URL } from "@/lib/config";
import { fetchJson } from "@/lib/errors";
import { locale, t } from "@/lib/i18n";
import { payrollConfig } from "@/lib/payrollConfig";

// Mistakes employees report from the mobile app (worked time, advances,
// bonuses). Managers and admins answer them on the Correction requests page.

export type CorrectionKind = "worktime" | "advance" | "bonus";
export type CorrectionStatus = "pending" | "corrected" | "rejected";
export type StatusFilter = CorrectionStatus | "all";

export interface Correction {
  id: string;
  kind: CorrectionKind;
  /** The record reported, or null for something missing. */
  recordId: string | null;
  /** "YYYY-MM-DD" */
  date: string;
  /** What the record said when the employee reported it. */
  snapshot: Record<string, unknown> | null;
  message: string;
  status: CorrectionStatus;
  reply: string | null;
  handledBy: string | null;
  handledAt: string | null;
  createdAt: string | null;
  employee?: { id: string; empNumber: number; name: string };
}

/** Fired after a request is answered, so the menu badge updates. */
export const CORRECTIONS_CHANGED = "corrections-changed";

export const KIND_LABELS: Record<CorrectionKind, string> = {
  worktime: "Worked time",
  advance: "Advance",
  bonus: "Bonus",
};

export const STATUS_LABELS: Record<CorrectionStatus, string> = {
  pending: "Waiting",
  corrected: "Corrected",
  rejected: "Rejected",
};

/** The page where the record is fixed. */
export const FIX_PAGE: Record<CorrectionKind, { path: string; label: string }> = {
  worktime: { path: "/clockinpagehistory", label: "Open Clock In/Out History" },
  advance: { path: "/reporting/advances", label: "Open Advances" },
  bonus: { path: "/reporting/bonuses/history", label: "Open Bonuses history" },
};

export function listCorrections(status: StatusFilter): Promise<Correction[]> {
  return fetchJson<Correction[]>(`${API_BASE_URL}/corrections?status=${status}`);
}

export async function pendingCorrections(): Promise<number> {
  const { pending } = await fetchJson<{ pending: number }>(`${API_BASE_URL}/corrections/count`);
  return pending;
}

export function answerCorrection(
  id: string,
  status: Exclude<CorrectionStatus, "pending">,
  reply: string
): Promise<Correction> {
  return fetchJson<Correction>(`${API_BASE_URL}/corrections/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, reply: reply.trim() || undefined }),
  });
}

/** "5 000 DA" in the company's currency. */
export function formatAmount(amount: number): string {
  return `${amount.toLocaleString(locale())} ${payrollConfig.currency}`;
}

/**
 * What the record said, in words: "In 10:12 · Out 18:00 · 07:48 worked",
 * "5 000 DA · Rent". Null when the employee reported something missing.
 */
export function describeSnapshot(c: Correction): string | null {
  const v = c.snapshot;
  if (!v) return null;
  if (c.kind === "worktime") {
    if (v.absent) return t("Absent");
    const parts = [
      t("In {time}", { time: String(v.clockIn ?? "—") }),
      t("Out {time}", { time: String(v.clockOut ?? "—") }),
    ];
    if (v.workHours) parts.push(t("{hours} worked", { hours: String(v.workHours) }));
    if (Number(v.lateMinutes) > 0) parts.push(t("{n} min late", { n: Number(v.lateMinutes) }));
    return parts.join(" · ");
  }
  const parts: string[] = [];
  if (typeof v.amount === "number") parts.push(formatAmount(v.amount));
  if (typeof v.reason === "string" && v.reason) parts.push(v.reason);
  return parts.join(" · ");
}
