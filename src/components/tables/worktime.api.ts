// worktime.api.ts
// Drop this alongside your AttendancePage component.
// Base URL can be overridden via NEXT_PUBLIC_API_URL env var.

import { API_BASE_URL } from "@/lib/config";
// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorktimePayload {
  worktime_id?: number;
  emp_id: number;
shift_id?: string | null;  work_date: string;

  clock_in?: string;
  clock_out?: string;

  late_minutes?: string;
  overtime_minutes?: string;
  work_hours?: string;

  consomation?: number;
  penalty?: number;
  bonus?: number;

  absent?: boolean;
  absent_comment?: string;
  //Main
  backup_for_emp_id?: number | null;
  //backup
  backup_emp_id?: number | null;
}

export interface WorktimeRecord extends WorktimePayload {
  _id: string;
  worktime_id: number;
  shift_id?: string | null;
  //backup
  backup_emp_id?: number | null;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();

  console.log(
    "========== WORKTIME API RESPONSE =========="
  );
  console.log("PATH:", path);
  console.log(
    "METHOD:",
    init?.method ?? "GET"
  );
  console.log("STATUS:", res.status);
  console.log(
    "BODY:",
    JSON.stringify(text)
  );
  console.log(
    "============================================"
  );

  if (!res.ok) {
    throw new Error(
      `[worktime] ${res.status} ${text || res.statusText
      }`
    );
  }

  // A delete may be confirmed with "204 No Content": nothing to read
  if (res.status === 204) {
    return undefined as T;
  }

  if (!text.trim()) {
    throw new Error(
      `[worktime] ${res.status} - Empty response from ${path}`
    );
  }

  return JSON.parse(text) as T;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Tells the activity log what kind of save this is:
 * "clock" = someone clocked in or out (clock buttons, clocking machine),
 * logged as "Clocked in at 08:00"; "edit" = a manager changed the times,
 * logged with what changed. Left out, the server guesses.
 */
export type AuditAs = "clock" | "edit";

const auditHeaders = (auditAs?: AuditAs): Record<string, string> =>
  auditAs ? { "X-Audit-As": auditAs } : {};

export const getWorktimes = (
  params?: Record<string, string>
) => {
  const qs = params
    ? "?" +
    new URLSearchParams(params).toString()
    : "";

  return request<WorktimeRecord[]>(
    `/worktime${qs}`
  );
};

export const getWorktimesByDate = (
  date: string
) =>
  getWorktimes({
    work_date: date,
  });

export const getWorktime = (
  id: string
) =>
  request<WorktimeRecord>(
    `/worktime/${id}`
  );

export const createWorktime = (
  body: WorktimePayload,
  auditAs?: AuditAs
) =>
  request<WorktimeRecord>(
    "/worktime",
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: auditHeaders(auditAs),
    }
  );

export const updateWorktime = (
  id: string,
  body: Partial<WorktimePayload>,
  auditAs?: AuditAs
) =>
  request<WorktimeRecord>(
    `/worktime/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
      headers: auditHeaders(auditAs),
    }
  );

export const deleteWorktime = (
  id: string
) =>
  request<{ deleted: boolean }>(
    `/worktime/${id}`,
    {
      method: "DELETE",
    }
  );

// ─── Upsert helper ────────────────────────────────────────────────────────────
// Plan A:
// ONE Worktime record per employee + operational date.
//
// Example:
//
//   17:00 -> 18:00
//   18:10 -> 19:10
//
// becomes ONE Worktime:
//
//   clock_in  = 17:00
//   clock_out = 19:10
//   work_hours = 02:00
//
// The individual periods remain handled by AttendancePage.

/**
 * perShift: the caller keeps one record per employee AND shift (ClockInPage),
 * so only a record of the same shift may be updated. Without it, the record
 * of the employee's day is updated whatever its shift.
 */
export interface UpsertOptions {
  perShift?: boolean;
}

export async function upsertWorktime(
  payload: WorktimePayload,
  existingId?: string | null,
  auditAs?: AuditAs,
  options: UpsertOptions = {}
): Promise<WorktimeRecord> {
  console.log("🔵 UPSERT WORKTIME START");
  console.log("Payload:", payload);
  console.log("Existing ID:", existingId);

  // ------------------------------------------------------------
  // 1. If we already KNOW the correct MongoDB document ID,
  //    update it directly.
  // ------------------------------------------------------------
  if (existingId) {
    try {
      console.log(
        "🟡 Updating existing Worktime:",
        existingId
      );

      const updated = await updateWorktime(
        existingId,
        payload,
        auditAs
      );

      console.log(
        "🟢 UPDATE SUCCESS:",
        updated
      );

      return updated;
    } catch (error) {
      console.warn(
        "⚠️ Existing Worktime ID could not be updated."
      );

      console.warn(
        "🔎 Falling back to employee + date search...",
        error
      );
    }
  }

  // ------------------------------------------------------------
  // 2. Search MongoDB by employee + operational date.
  //
  // This is the important part.
  // There should be ONE Worktime document per employee/date.
  // ------------------------------------------------------------
  console.log(
    "🔎 Searching Worktime by employee + date:",
    {
      emp_id: payload.emp_id,
      work_date: payload.work_date,
    }
  );

  const perShift = options.perShift === true;
  const search: Record<string, string> = {
    emp_id: String(payload.emp_id),
    work_date: payload.work_date,
  };
  if (perShift && payload.shift_id) {
    search.shift_id = payload.shift_id;
  }

  const existing = await getWorktimes(search);

  console.log(
    "🔎 Existing Worktime records:",
    existing
  );

  // ------------------------------------------------------------
  // 3. Record already exists -> UPDATE it.
  //
  // Don't trust the search blindly: if the backend ignores the
  // filters, existing[0] can be another employee's (or another
  // day's, or another shift's) record.
  // ------------------------------------------------------------
  const existingRecord = existing.find(
    (r) =>
      String(r.emp_id) === String(payload.emp_id) &&
      String(r.work_date ?? "").split("T")[0] === payload.work_date &&
      (!perShift || (r.shift_id ?? null) === (payload.shift_id ?? null))
  );

  if (existingRecord) {

    console.log(
      "🟡 Found existing daily Worktime.",
      "Updating MongoDB record:",
      existingRecord._id
    );

    const updated = await updateWorktime(
      existingRecord._id,
      payload,
      auditAs
    );

    console.log(
      "🟢 DAILY UPDATE SUCCESS:",
      updated
    );

    return updated;
  }

  // ------------------------------------------------------------
  // 4. No record exists -> CREATE one.
  // ------------------------------------------------------------
  console.log(
    "🟠 No daily Worktime found."
  );

  console.log(
    "🟠 Creating new Worktime document..."
  );

  const created = await createWorktime(
    payload,
    auditAs
  );

  console.log(
    "🟢 CREATE SUCCESS:",
    created
  );

  return created;
}