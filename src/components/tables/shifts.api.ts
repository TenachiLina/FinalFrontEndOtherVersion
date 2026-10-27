// shifts.api.ts
import type {
  EmployeeRecord,
  ShiftRecord,
  PlanningRecord,
} from "./../calendar/types";

import { API_BASE_URL } from "@/lib/config";
import { ensureOk } from "@/lib/errors";

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });

  // Throws an ApiError carrying the server's message, which friendlyError
  // can turn into a readable message
  await ensureOk(res);

  return res.json() as Promise<T>;
}


// ─────────────────────────────────────────────────────────────
// Employees
// ─────────────────────────────────────────────────────────────

export const getEmployees = () =>
  request<EmployeeRecord[]>("/employees");


// ─────────────────────────────────────────────────────────────
// Shifts
// ─────────────────────────────────────────────────────────────

export const getShifts = () =>
  request<ShiftRecord[]>("/shifts");


// ─────────────────────────────────────────────────────────────
// Planning
// ─────────────────────────────────────────────────────────────

export const getPlanningByDate = (date: string) =>
  request<PlanningRecord[]>(
    `/planning?planDate=${date}`
  );