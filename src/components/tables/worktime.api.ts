// worktime.api.ts
// Drop this alongside your AttendancePage component.
// Base URL can be overridden via NEXT_PUBLIC_API_URL env var.

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ─── Types (mirror your Mongoose schema) ─────────────────────────────────────

export interface WorktimePayload {
  worktime_id?: number;       // omit on create; let server assign or use emp+date key
  emp_id: number;
  shift_id: number;
  work_date: string;          // "YYYY-MM-DD"
  clock_in?: string;          // "HH:MM"
  clock_out?: string;         // "HH:MM"
  late_minutes?: string;
  overtime_minutes?: string;
  work_hours?: string;
  consomation?: number;
  penalty?: number;
  bonus?: number;
  absent?: boolean;
  absent_comment?: string;
}

export interface WorktimeRecord extends WorktimePayload {
  _id: string;
  worktime_id: number;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`[worktime] ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/** Fetch all worktime records (optionally filter server-side via query params). */
export const getWorktimes = (params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<WorktimeRecord[]>(`/worktime${qs}`);
};

/** Fetch records for a specific date (YYYY-MM-DD). */
export const getWorktimesByDate = (date: string) =>
  getWorktimes({ work_date: date });

/** Fetch one record by Mongo _id or worktime_id. */
export const getWorktime = (id: string) =>
  request<WorktimeRecord>(`/worktime/${id}`);

/** Create a new worktime entry. */
export const createWorktime = (body: WorktimePayload) =>
  request<WorktimeRecord>("/worktime", {
    method: "POST",
    body: JSON.stringify(body),
  });

/** Full update (PUT). */
export const updateWorktime = (id: string, body: Partial<WorktimePayload>) =>
  request<WorktimeRecord>(`/worktime/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

/** Delete a record. */
export const deleteWorktime = (id: string) =>
  request<{ deleted: boolean }>(`/worktime/${id}`, { method: "DELETE" });

// ─── Upsert helper (used by AttendancePage) ───────────────────────────────────
// Looks up an existing record for (emp_id, shift_id, work_date).
// Creates one if not found, updates it if found.

export async function upsertWorktime(
  payload: WorktimePayload,
  existingId?: string | null
): Promise<WorktimeRecord> {
  if (existingId) {
    return updateWorktime(existingId, payload);
  }
  // Try to find an existing record first to avoid duplicates on re-mount
  const existing = await getWorktimes({
    emp_id: String(payload.emp_id),
    shift_id: String(payload.shift_id),
    work_date: payload.work_date,
  });
  if (existing.length > 0) {
    return updateWorktime(existing[0]._id, payload);
  }
  return createWorktime(payload);
}
