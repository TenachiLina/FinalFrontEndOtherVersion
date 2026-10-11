// shifts.api.ts
import type {
  EmployeeRecord,
  ShiftRecord,
  PlanningRecord,
} from "./../calendar/types";

import { API_BASE_URL } from "@/lib/config";

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

  if (!res.ok) {
    const text = await res.text().catch(
      () => res.statusText
    );

    throw new Error(
      `[api] ${res.status} ${text}`
    );
  }

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