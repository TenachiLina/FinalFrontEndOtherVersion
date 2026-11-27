// The Home page's figures (GET /dashboard): today at a glance. The server
// works them out from the planning and the clocking; the app shows them.
import { API_BASE_URL } from "@/lib/config";
import { fetchJson } from "@/lib/errors";

export type TodayStatus = "present" | "left" | "absent" | "missing" | "expected";

export interface PersonToday {
  empNumber: number;
  name: string;
  status: TodayStatus;
  /** "08:00 – 16:00"; null for someone who came without being planned */
  shift: string | null;
  clockIn: string | null;
  clockOut: string | null;
  late: boolean;
  lateMinutes: number;
}

export interface TodayCounts {
  planned: number;
  present: number;
  left: number;
  late: number;
  absent: number;
  missing: number;
  expected: number;
}

export interface Dashboard {
  /** The company's own day, "YYYY-MM-DD", and time, "HH:MM" */
  day: string;
  time: string;
  /** null when the company has clock-in switched off */
  attendance: { employees: number; counts: TodayCounts; people: PersonToday[] } | null;
  pending: { corrections: number };
  /** The pay of the month so far; null for managers and when reporting is off */
  month: {
    month: string;
    currency: string;
    hours: number;
    gross: number;
    advances: number;
    bonuses: number;
    net: number;
    employees: number;
    closesAt: string | null;
  } | null;
  subscription: { status: string; endingSoon: boolean; readOnly: boolean; daysLeft: number | null };
}

export function fetchDashboard(): Promise<Dashboard> {
  return fetchJson<Dashboard>(`${API_BASE_URL}/dashboard`);
}
