// worktime.api.ts
// Drop this alongside your AttendancePage component.
// Base URL can be overridden via NEXT_PUBLIC_API_URL env var.

import { API_BASE_URL } from "@/lib/config";
// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorktimePayload {
  worktime_id?: number;
  emp_id: number;
  shift_id: string;
  work_date: string;

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
}

export interface WorktimeRecord
  extends WorktimePayload {
  _id: string;
  worktime_id: number;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {

  const res = await fetch(`$${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
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

  if (!text.trim()) {
    throw new Error(
      `[worktime] ${res.status} - Empty response from ${path}`
    );
  }

  return JSON.parse(text) as T;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

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
  body: WorktimePayload
) =>
  request<WorktimeRecord>(
    "/worktime",
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );

export const updateWorktime = (
  id: string,
  body: Partial<WorktimePayload>
) =>
  request<WorktimeRecord>(
    `/worktime/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
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

export async function upsertWorktime(
  payload: WorktimePayload,
  existingId?: string | null
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
        payload
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

  const existing = await getWorktimes({
    emp_id: String(payload.emp_id),
    work_date: payload.work_date,
  });

  console.log(
    "🔎 Existing Worktime records:",
    existing
  );

  // ------------------------------------------------------------
  // 3. Record already exists -> UPDATE it.
  // ------------------------------------------------------------
  if (existing.length > 0) {
    const existingRecord = existing[0];

    console.log(
      "🟡 Found existing daily Worktime.",
      "Updating MongoDB record:",
      existingRecord._id
    );

    const updated = await updateWorktime(
      existingRecord._id,
      payload
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
    payload
  );

  console.log(
    "🟢 CREATE SUCCESS:",
    created
  );

  return created;
}