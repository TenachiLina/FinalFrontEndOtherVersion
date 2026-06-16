// shifts.api.ts
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`[api] ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Employees ────────────────────────────────────────────────────────────────

export interface EmployeeRecord {
  _id: string;
  empNumber: number;
  firstName: string;
  lastName: string;
  baseSalary: number;
  address?: string;
  phoneNumber?: string;
  personalImage?: string;
}

export const getEmployees = () => request<EmployeeRecord[]>("/employees");

// ─── Shifts ───────────────────────────────────────────────────────────────────

export interface ShiftRecord {
  _id: string;
  startTime: string;   // "HH:MM:SS" or "HH:MM"
  endTime:   string;
}

export const getShifts = () => request<ShiftRecord[]>("/shifts");

// ─── Planning ─────────────────────────────────────────────────────────────────

export interface PlanningRecord {
  _id: string;
  shiftId: ShiftRecord;       // populated
  empId:   EmployeeRecord;    // populated
  taskId:  number;
  planDate: string;
  customStartTime?: string;
  customEndTime?:   string;
}

export const getPlanningByDate = (date: string) =>
  request<PlanningRecord[]>(`/planning?planDate=${date}`);