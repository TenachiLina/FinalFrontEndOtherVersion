"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";

import Badge from "../ui/badge/Badge";

import {
  getWorktimesByDate,
  upsertWorktime,
  type WorktimeRecord,
  type WorktimePayload,
} from "./worktime.api";

import {
  getEmployees,
  getShifts,
  getPlanningByDate,
} from "./shifts.api";

import type {
  PlanningRecord,
} from "./../calendar/types";

/* ============================================================================
   FACE RECOGNITION API
============================================================================ */

const DEVICE_ATTENDANCE_API =
  process.env.NEXT_PUBLIC_DEVICE_ATTENDANCE_API ??
  "http://localhost:3001/attendance/device-logs";

interface DeviceAttendanceLog {
  _id?: string;
  deviceUserId: string;
  timestamp: string;
  deviceLogId?: string;
  processed?: boolean;
}

/* ============================================================================
   DATE / TIME HELPERS
============================================================================ */

/**
 * IMPORTANT:
 *
 * We intentionally DO NOT use:
 *
 *   new Date().toISOString().slice(0, 10)
 *
 * because toISOString() converts to UTC.
 *
 * The attendance machine operates in local time.
 */
function getLocalDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateStringToLocalDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function addDays(date: string, amount: number): string {
  const d = dateStringToLocalDate(date);
  d.setDate(d.getDate() + amount);
  return getLocalDateString(d);
}

function timeToMinutes(time: string): number {
  const parts = time.slice(0, 5).split(":").map(Number);

  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
    return 0;
  }

  return parts[0] * 60 + parts[1];
}

/**
 * Convert a timestamp coming from the machine into a local date/time
 * without applying another timezone conversion.
 *
 * Example:
 *
 * 2026-08-28T23:30:00.000Z
 *
 * becomes:
 *
 * 28/08/2026 23:30
 *
 * because the machine timestamp is already treated as attendance-machine
 * local time in this application.
 */
function deviceDateTime(timestamp: string): {
  date: string;
  minutes: number;
  time: string;
} | null {
  if (!timestamp) return null;

  const match = timestamp.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/
  );

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute] = match;

  return {
    date: `${year}-${month}-${day}`,
    minutes: Number(hour) * 60 + Number(minute),
    time: `${hour}:${minute}`,
  };
}

const deviceTime = (timestamp: string) => {
  const parsed = deviceDateTime(timestamp);

  return parsed?.time ?? "00:00";
};

function formatDateTime(timestamp: string) {
  const parsed = deviceDateTime(timestamp);

  if (!parsed) {
    return timestamp;
  }

  const [year, month, day] = parsed.date.split("-");

  return `${day}/${month}/${year} ${parsed.time}`;
}

function normalizeDeviceId(value: string) {
  return String(value)
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
}

/* ============================================================================
   SHIFT TYPES
============================================================================ */

interface Shift {
  shift_id: string;
  start_time: string;
  end_time: string;
}

/**
 * Returns the number of minutes an end time represents.
 *
 * 00:00 is treated as 24:00 when it is a shift ending at midnight.
 */
function shiftEndMinutes(time: string): number {
  const value = timeToMinutes(time);

  if (value === 0) {
    return 1440;
  }

  return value;
}

/**
 * Find the latest shift end.
 *
 * This is the IMPORTANT part of the new attendance-day logic.
 *
 * Example:
 *
 * Shift 1: 06:00 - 14:00
 * Shift 2: 08:00 - 16:00
 * Shift 3: 16:00 - 00:00
 *
 * The attendance operation does NOT end at 00:00 from the perspective
 * of the previous operation.
 *
 * Shift 3 ends at 24:00.
 *
 * If a future shift ends at 02:00, then the previous operational day
 * remains active until 02:00.
 */
function getLatestShiftEndMinutes(shifts: Shift[]): number {
  if (!shifts.length) {
    return 1440;
  }

  return Math.max(
    ...shifts.map((shift) => shiftEndMinutes(shift.end_time))
  );
}

/**
 * Determine which operational attendance date is currently active.
 *
 * If it is after midnight but BEFORE the final shift has finished,
 * we are still inside yesterday's attendance operation.
 *
 * Example:
 *
 * Last shift: 16:00 -> 02:00
 *
 * At 01:00 on Aug 29:
 *   operational date = Aug 28
 *
 * At 02:01 on Aug 29:
 *   operational date = Aug 29
 */
function getOperationalDate(shifts: Shift[]): string {
  const now = new Date();

  const calendarDate = getLocalDateString(now);

  if (!shifts.length) {
    return calendarDate;
  }

  const currentMinutes =
    now.getHours() * 60 + now.getMinutes();

  const latestEnd = getLatestShiftEndMinutes(shifts);

  /*
   * If the latest shift ends after midnight, its end time is represented
   * as > 1440.
   *
   * Example:
   * 02:00 => 1560
   *
   * This means:
   * from 00:00 until 02:00 we are still in yesterday's operation.
   */
  const overnightEnd = shifts.some(
    (shift) => timeToMinutes(shift.end_time) < timeToMinutes(shift.start_time)
  );

  if (overnightEnd) {
    const overnightShiftEnd = Math.max(
      ...shifts
        .filter(
          (shift) =>
            timeToMinutes(shift.end_time) <
            timeToMinutes(shift.start_time)
        )
        .map((shift) => 1440 + timeToMinutes(shift.end_time))
    );

    if (currentMinutes < overnightShiftEnd - 1440) {
      return addDays(calendarDate, -1);
    }
  }

  /*
   * Special case for a shift ending exactly at 00:00.
   *
   * At 00:00 the previous operation is considered finished.
   */
  if (
    currentMinutes === 0 &&
    shifts.some(
      (shift) =>
        timeToMinutes(shift.end_time) === 0
    )
  ) {
    return calendarDate;
  }

  return calendarDate;
}

/**
 * Determine whether a device punch belongs to an operational attendance date.
 *
 * The operation starts on `operationDate` and may continue after midnight.
 *
 * Example:
 *
 * operationDate = 2026-08-28
 * last shift = 16:00 -> 02:00
 *
 * Valid punches:
 *
 * 2026-08-28 16:00
 * 2026-08-28 23:50
 * 2026-08-29 01:30
 *
 * Invalid for that operation:
 *
 * 2026-08-29 03:00
 */
function isPunchInsideOperationalDay(
  timestamp: string,
  operationDate: string,
  shifts: Shift[]
): boolean {
  const parsed = deviceDateTime(timestamp);

  if (!parsed) {
    return false;
  }

  const operationStartDate = operationDate;

  const hasOvernightShift = shifts.some(
    (shift) =>
      timeToMinutes(shift.end_time) <
      timeToMinutes(shift.start_time)
  );

  if (!hasOvernightShift) {
    return parsed.date === operationStartDate;
  }

  const previousDate = addDays(operationStartDate, 1);

  if (parsed.date === operationStartDate) {
    return true;
  }

  if (parsed.date === previousDate) {
    const overnightEnds = Math.max(
      ...shifts
        .filter(
          (shift) =>
            timeToMinutes(shift.end_time) <
            timeToMinutes(shift.start_time)
        )
        .map((shift) => timeToMinutes(shift.end_time))
    );

    return parsed.minutes <= overnightEnds;
  }

  return false;
}

/* ============================================================================
   DEVICE LOG → EMPLOYEE ENTRY
============================================================================ */

function deviceLogsToEntries(
  logs: DeviceAttendanceLog[],
  employees: Employee[],
  operationDate: string,
  shifts: Shift[]
): Record<
  string,
  {
    clockIn: string;
    clockOut: string;
  }
> {
  const result: Record<
    string,
    {
      clockIn: string;
      clockOut: string;
    }
  > = {};

  for (const employee of employees) {
    const employeeId = String(employee.empNumber);

    const employeeLogs = logs
      .filter((log) => {
        const deviceId = normalizeDeviceId(log.deviceUserId);

        if (deviceId !== employeeId) {
          return false;
        }

        return isPunchInsideOperationalDay(
          log.timestamp,
          operationDate,
          shifts
        );
      })
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() -
          new Date(b.timestamp).getTime()
      );

    if (employeeLogs.length === 0) {
      continue;
    }

    result[employeeId] = {
      clockIn: deviceTime(employeeLogs[0].timestamp),

      clockOut:
        employeeLogs.length > 1
          ? deviceTime(
              employeeLogs[employeeLogs.length - 1].timestamp
            )
          : "00:00",
    };
  }

  return result;
}

/* ============================================================================
   FETCH MACHINE ATTENDANCE
============================================================================ */

/**
 * Fetch logs for the operation date AND the following calendar date.
 *
 * The second request is necessary for overnight shifts.
 *
 * Example:
 *
 * operation = Aug 28
 *
 * We fetch:
 *   Aug 28
 *   Aug 29
 *
 * Then the client-side operational-day filter decides which punches
 * actually belong to Aug 28.
 */
async function getDeviceAttendanceForOperationalDate(
  operationDate: string,
  shifts: Shift[]
): Promise<DeviceAttendanceLog[]> {
  const datesToFetch = [operationDate];

  const hasOvernightShift = shifts.some(
    (shift) =>
      timeToMinutes(shift.end_time) <
      timeToMinutes(shift.start_time)
  );

  if (hasOvernightShift) {
    datesToFetch.push(addDays(operationDate, 1));
  }

  const responses = await Promise.all(
    datesToFetch.map(async (date) => {
      const response = await fetch(
        `${DEVICE_ATTENDANCE_API}?date=${encodeURIComponent(date)}`,
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error(
          `Face-recognition API returned ${response.status} for ${date}`
        );
      }

      const data = await response.json();

      const logs = Array.isArray(data)
        ? data
        : data?.data;

      if (!Array.isArray(logs)) {
        throw new Error(
          "Invalid face-recognition attendance response"
        );
      }

      return logs as DeviceAttendanceLog[];
    })
  );

  const combined = responses.flat();

  /*
   * Remove duplicates.
   */
  const unique = new Map<string, DeviceAttendanceLog>();

  for (const log of combined) {
    const key =
      log._id ??
      log.deviceLogId ??
      `${log.deviceUserId}-${log.timestamp}`;

    unique.set(key, log);
  }

  return Array.from(unique.values()).filter((log) =>
    isPunchInsideOperationalDay(
      log.timestamp,
      operationDate,
      shifts
    )
  );
}

/* ============================================================================
   TYPES
============================================================================ */

type ShiftStatus = "present" | "absent" | "pending";

interface Employee {
  num: number;
  mongoId: string;
  empNumber: string;
  FirstName: string;
}

interface EmployeeTimeEntry {
  clockIn: string;
  clockOut: string;
  absent: boolean;
  absentComment: string;
  consomation: number | string;
  penalty: number | string;
  workTimeId: string | null;
  _dirty?: boolean;
  _saving?: boolean;
}

interface ManualInputState {
  employee: number | null;
  type: "clockIn" | "clockOut" | null;
  value: string;
}

/* ============================================================================
   ICONS
============================================================================ */

const ClockInIcon = () => (
  <svg
    className="w-4 h-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const CloseIcon = () => (
  <svg
    className="w-5 h-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const TrashIcon = () => (
  <svg
    className="w-4 h-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
);

const SaveIcon = () => (
  <svg
    className="w-3.5 h-3.5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);

/* ============================================================================
   HELPERS
============================================================================ */

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);

  return h * 60 + m;
};

const formatMin = (n: number) =>
  n <= 0
    ? "00:00"
    : `${Math.floor(n / 60)
        .toString()
        .padStart(2, "0")}:${(n % 60)
        .toString()
        .padStart(2, "0")}`;

const calcHours = (i: string, o: string) => {
  if (i === "00:00" || o === "00:00") {
    return "00:00";
  }

  let d = toMinutes(o) - toMinutes(i);

  if (d < 0) {
    d += 1440;
  }

  return formatMin(d);
};

const calcLate = (i: string, s: string) => {
  if (i === "00:00" || !s) {
    return 0;
  }

  const l =
    toMinutes(i) -
    toMinutes(s.slice(0, 5));

  return l > 0 ? l : 0;
};

const calcOvertime = (o: string, e: string) => {
  if (o === "00:00" || !e) {
    return 0;
  }

  let em = toMinutes(e.slice(0, 5));
  let om = toMinutes(o);

  if (em === 0) {
    em = 1440;
  }

  if (em === 1440 && om < 720) {
    om += 1440;
  }

  const ot = om - em;

  return ot > 0 ? ot : 0;
};

const getStatus = (
  e: EmployeeTimeEntry
): ShiftStatus =>
  e.absent
    ? "absent"
    : e.clockIn !== "00:00"
    ? "present"
    : "pending";

const badgeColor = (s: ShiftStatus) =>
  s === "present"
    ? "success"
    : s === "absent"
    ? "error"
    : "warning";

const badgeLabel = (s: ShiftStatus) =>
  s === "present"
    ? "Present"
    : s === "absent"
    ? "Absent"
    : "Pending";

/* ============================================================================
   WORKTIME CONVERSION
============================================================================ */

function recordToEntry(
  r: WorktimeRecord
): EmployeeTimeEntry {
  return {
    clockIn: r.clock_in ?? "00:00",
    clockOut: r.clock_out ?? "00:00",
    absent: r.absent ?? false,
    absentComment: r.absent_comment ?? "",
    consomation: r.consomation ?? 0,
    penalty: r.penalty ?? 0,
    workTimeId: r._id,
  };
}

function entryToPayload(
  entry: EmployeeTimeEntry,
  empNum: number,
  shiftId: string,
  date: string,
  shiftStart: string,
  shiftEnd: string
): WorktimePayload {
  const hours = calcHours(
    entry.clockIn,
    entry.clockOut
  );

  const late = calcLate(
    entry.clockIn,
    shiftStart
  );

  const ot = calcOvertime(
    entry.clockOut,
    shiftEnd
  );

  return {
    emp_id: empNum,
    shift_id: shiftId as any,
    work_date: date,

    clock_in:
      entry.clockIn !== "00:00"
        ? entry.clockIn
        : undefined,

    clock_out:
      entry.clockOut !== "00:00"
        ? entry.clockOut
        : undefined,

    late_minutes: String(late),
    overtime_minutes: String(ot),
    work_hours: hours,

    consomation:
      Number(entry.consomation) || 0,

    penalty:
      Number(entry.penalty) || 0,

    absent: entry.absent,

    absent_comment:
      entry.absentComment || undefined,
  };
}

/* ============================================================================
   LOCAL STORAGE
============================================================================ */

const LS_KEY = (date: string) =>
  `worktime_${date}`;

function saveEntriesToStorage(
  date: string,
  entries: Record<
    string,
    EmployeeTimeEntry
  >
) {
  try {
    localStorage.setItem(
      LS_KEY(date),
      JSON.stringify(entries)
    );
  } catch {}
}

function loadEntriesFromStorage(
  date: string
): Record<string, EmployeeTimeEntry> {
  try {
    const raw = localStorage.getItem(
      LS_KEY(date)
    );

    return raw
      ? JSON.parse(raw)
      : {};
  } catch {
    return {};
  }
}

/**
 * Remove stale attendance cache.
 *
 * This does NOT delete the database.
 * It only prevents old browser localStorage values from being reused.
 */
function removeStaleLocalStorage(
  currentDate: string
) {
  try {
    const prefix = "worktime_";

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);

      if (
        key &&
        key.startsWith(prefix) &&
        key !== LS_KEY(currentDate)
      ) {
        /*
         * We deliberately don't remove old historical records here.
         * The important thing is that we NEVER read them for today's date.
         */
      }
    }
  } catch {}
}

/* ============================================================================
   COMPONENT
============================================================================ */

interface AttendancePageProps {
  currentDate?: string;
}

export default function AttendancePage({
  currentDate: providedDate,
}: AttendancePageProps) {
  /* --------------------------------------------------------------------------
     CURRENT OPERATIONAL DATE
  -------------------------------------------------------------------------- */

  const [operationalDate, setOperationalDate] =
    useState<string>(
      providedDate ??
        getLocalDateString()
    );

  /*
   * Recalculate the operational date every minute.
   *
   * This is important when the page stays open through midnight.
   *
   * Example:
   *
   * 23:59 -> operation Aug 28
   * 00:30 -> still operation Aug 28 if last shift ends 02:00
   * 02:01 -> operation Aug 29
   */
  const [dateTick, setDateTick] =
    useState(0);

  useEffect(() => {
    if (providedDate) {
      setOperationalDate(providedDate);
      return;
    }

    const updateDate = () => {
      setDateTick((v) => v + 1);
    };

    updateDate();

    const interval = setInterval(
      updateDate,
      60 * 1000
    );

    return () =>
      clearInterval(interval);
  }, [providedDate]);

  /* --------------------------------------------------------------------------
     STATE
  -------------------------------------------------------------------------- */

  const [specialTimes, setSpecialTimes] =
    useState<
      Record<
        string,
        {
          clockIn?: string;
          clockOut?: string;
        }
      >
    >({});

  const [shifts, setShifts] =
    useState<Shift[]>([]);

  const [employees, setEmployees] =
    useState<Employee[]>([]);

  const [assignedShifts, setAssignedShifts] =
    useState<Record<number, string[]>>({});

  const [currentTab, setCurrentTab] =
    useState<string | null>(null);

  const [entries, setEntries] =
    useState<
      Record<string, EmployeeTimeEntry>
    >({});

  const [manualInput, setManualInput] =
    useState<ManualInputState>({
      employee: null,
      type: null,
      value: "",
    });

  const [search, setSearch] =
    useState("");

  const [apiError, setApiError] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [deviceLoading, setDeviceLoading] =
    useState(false);

  const [deviceLogs, setDeviceLogs] =
    useState<DeviceAttendanceLog[]>([]);

  const [deviceEntries, setDeviceEntries] =
    useState<
      Record<
        string,
        {
          clockIn: string;
          clockOut: string;
        }
      >
    >({});

  const saveTimers =
    useRef<
      Record<
        string,
        ReturnType<typeof setTimeout>
      >
    >({});

  const [deviceStatus, setDeviceStatus] =
    useState<{
      connected: boolean;
      name: string;
      ip?: string;
    } | null>(null);

  /* --------------------------------------------------------------------------
     DEVICE STATUS
  -------------------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    const checkDeviceStatus =
      async () => {
        try {
          const response =
            await fetch(
              "http://localhost:3001/device/status",
              {
                cache: "no-store",
              }
            );

          const data =
            await response.json();

          if (!cancelled) {
            setDeviceStatus(data);
          }
        } catch {
          if (!cancelled) {
            setDeviceStatus({
              connected: false,
              name: "Face Recognition Machine",
            });
          }
        }
      };

    checkDeviceStatus();

    const interval =
      setInterval(
        checkDeviceStatus,
        30000
      );

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  /* --------------------------------------------------------------------------
     LOAD EMPLOYEES / SHIFTS / PLANNING
  -------------------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setApiError(null);

    Promise.all([
      getEmployees(),
      getShifts(),

      getPlanningByDate(
        operationalDate
      ).catch((e) => {
        console.warn(
          "Planning fetch failed:",
          e
        );

        return [] as PlanningRecord[];
      }),
    ])
      .then(
        ([
          empRecords,
          shiftRecords,
          planningRecords,
        ]) => {
          if (cancelled) return;

          /* ---------------------------------------------------------------
             EMPLOYEES
          --------------------------------------------------------------- */

          const mappedEmployees: Employee[] =
            empRecords.map((e) => ({
              num: e.empNumber,
              mongoId: e._id,
              empNumber: String(
                e.empNumber
              ),
              FirstName:
                `${e.firstName} ${e.lastName}`,
            }));

          /* ---------------------------------------------------------------
             SHIFTS
          --------------------------------------------------------------- */

          const mappedShifts: Shift[] =
            shiftRecords.map((s) => ({
              shift_id: s._id,

              start_time:
                s.startTime.length === 5
                  ? `${s.startTime}:00`
                  : s.startTime,

              end_time:
                s.endTime.length === 5
                  ? `${s.endTime}:00`
                  : s.endTime,
            }));

          /* ---------------------------------------------------------------
             PLANNING
          --------------------------------------------------------------- */

          const assigned: Record<
            number,
            string[]
          > = {};

          planningRecords.forEach(
            (p) => {
              const emp =
                empRecords.find(
                  (e) =>
                    e._id ===
                    p.empId._id
                );

              if (!emp) return;

              const empNum =
                emp.empNumber;

              if (!assigned[empNum]) {
                assigned[empNum] = [];
              }

              if (
                !assigned[empNum].includes(
                  p.shiftId._id
                )
              ) {
                assigned[empNum].push(
                  p.shiftId._id
                );
              }
            }
          );

          /* ---------------------------------------------------------------
             SPECIAL TIMES
          --------------------------------------------------------------- */

          const special: Record<
            string,
            {
              clockIn?: string;
              clockOut?: string;
            }
          > = {};

          planningRecords.forEach(
            (p: any) => {
              const firstTask =
                p.tasks?.[0];

              if (
                firstTask?.startTime
              ) {
                const key =
                  `${p.empId._id}-${p.shiftId._id}`;

                special[key] = {
                  clockIn:
                    firstTask.startTime,

                  clockOut:
                    firstTask.endTime,
                };
              }
            }
          );

          setSpecialTimes(special);
          setEmployees(mappedEmployees);
          setShifts(mappedShifts);
          setAssignedShifts(assigned);

          /*
           * Only reset the selected shift when necessary.
           */
          setCurrentTab((previous) => {
            if (
              previous &&
              mappedShifts.some(
                (s) =>
                  s.shift_id === previous
              )
            ) {
              return previous;
            }

            return mappedShifts.length
              ? mappedShifts[0].shift_id
              : null;
          });
        }
      )
      .catch((e) => {
        if (!cancelled) {
          setApiError(String(e));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [operationalDate, dateTick]);

  /* --------------------------------------------------------------------------
     LOAD WORKTIME + MACHINE ATTENDANCE
  -------------------------------------------------------------------------- */

  useEffect(() => {
    if (
      !operationalDate ||
      !employees.length ||
      !shifts.length
    ) {
      return;
    }

    let cancelled = false;

    setDeviceLoading(true);

    /*
     * IMPORTANT:
     *
     * Before loading anything, clear the current machine state.
     *
     * This prevents the previous operation's machineEntries from remaining
     * visible while the new operation is being loaded.
     */
    setDeviceLogs([]);
    setDeviceEntries({});

    /*
     * Also clear the in-memory entries.
     *
     * They will be reconstructed from:
     *
     * 1. localStorage for THIS operational date
     * 2. database worktime for THIS operational date
     * 3. machine punches for THIS operational date
     */
    setEntries({});

    const loadAttendance =
      async () => {
        try {
          const [
            records,
            logs,
          ] = await Promise.all([
            getWorktimesByDate(
              operationalDate
            ),

            getDeviceAttendanceForOperationalDate(
              operationalDate,
              shifts
            ),
          ]);

          if (cancelled) return;

          console.log(
            "================================="
          );

          console.log(
            "OPERATIONAL ATTENDANCE DATE:",
            operationalDate
          );

          console.log(
            "CURRENT LOCAL DATE:",
            getLocalDateString()
          );

          console.log(
            "SHIFTS:",
            shifts
          );

          console.log(
            "DEVICE LOGS FOR OPERATION:",
            logs
          );

          /* ---------------------------------------------------------------
             MACHINE ENTRIES
          --------------------------------------------------------------- */

          const machineEntries =
            deviceLogsToEntries(
              logs,
              employees,
              operationalDate,
              shifts
            );

          console.log(
            "MACHINE ENTRIES:",
            machineEntries
          );

          setDeviceLogs(logs);
          setDeviceEntries(
            machineEntries
          );

          /* ---------------------------------------------------------------
             WORKTIME + LOCAL STORAGE
          --------------------------------------------------------------- */

          setEntries(() => {
            /*
             * VERY IMPORTANT:
             *
             * We only read:
             *
             * worktime_${operationalDate}
             *
             * Therefore yesterday's browser data cannot be reused for
             * today's operation.
             */
            const fromStorage =
              loadEntriesFromStorage(
                operationalDate
              );

            const next: Record<
              string,
              EmployeeTimeEntry
            > = {
              ...fromStorage,
            };

            /*
             * Database worktimes for THIS operation only.
             */
            records.forEach(
              (r: WorktimeRecord) => {
                const key =
                  `${r.emp_id}-${r.shift_id}`;

                /*
                 * Do not overwrite a locally edited dirty record.
                 */
                if (
                  !next[key]?._dirty
                ) {
                  next[key] =
                    recordToEntry(r);
                }
              }
            );

            /*
             * Face recognition is authoritative.
             *
             * If the machine has a punch for the employee,
             * replace the stored clock-in/out with the machine values.
             */
            employees.forEach(
              (emp) => {
                const machine =
                  machineEntries[
                    String(emp.empNumber)
                  ];

                if (!machine) {
                  return;
                }

                (
                  assignedShifts[
                    emp.num
                  ] ?? []
                ).forEach(
                  (shiftId) => {
                    const key =
                      `${emp.num}-${shiftId}`;

                    const existing =
                      next[key] ??
                      {
                        clockIn:
                          "00:00",

                        clockOut:
                          "00:00",

                        absent: false,

                        absentComment:
                          "",

                        consomation: 0,

                        penalty: 0,

                        workTimeId:
                          null,
                      };

                    next[key] = {
                      ...existing,

                      clockIn:
                        machine.clockIn,

                      clockOut:
                        machine.clockOut,

                      absent: false,

                      _dirty: false,
                    };
                  }
                );
              }
            );

            /*
             * IMPORTANT:
             *
             * Save the reconstructed state under THIS operational date.
             *
             * We do NOT copy anything from yesterday.
             */
            saveEntriesToStorage(
              operationalDate,
              next
            );

            return next;
          });
        } catch (e) {
          if (!cancelled) {
            setApiError(
              `Face-recognition attendance: ${String(
                e
              )}`
            );
          }
        } finally {
          if (!cancelled) {
            setDeviceLoading(false);
          }
        }
      };

    loadAttendance();

    return () => {
      cancelled = true;
    };
  }, [
    operationalDate,
    employees,
    shifts,
    assignedShifts,
    dateTick,
  ]);

  /* --------------------------------------------------------------------------
     CURRENT SHIFT
  -------------------------------------------------------------------------- */

  const currentShift =
    useMemo(
      () =>
        shifts.find(
          (s) =>
            s.shift_id === currentTab
        ) ?? null,
      [shifts, currentTab]
    );

  /* --------------------------------------------------------------------------
     EMPLOYEE FILTER
  -------------------------------------------------------------------------- */

  const filteredEmployees =
    useMemo(() => {
      if (!currentTab) {
        return [];
      }

      const q =
        search.toLowerCase();

      return employees.filter(
        (emp) => {
          const inShift =
            (
              assignedShifts[
                emp.num
              ] ?? []
            ).includes(
              currentTab
            );

          return (
            inShift &&
            (
              emp.FirstName
                .toLowerCase()
                .includes(q) ||
              emp.empNumber
                .toLowerCase()
                .includes(q)
            )
          );
        }
      );
    }, [
      currentTab,
      employees,
      assignedShifts,
      search,
    ]);

  /* --------------------------------------------------------------------------
     ENTRY
  -------------------------------------------------------------------------- */

  const entryKey = (
    empNum: number,
    shiftId = currentTab
  ) =>
    `${empNum}-${shiftId}`;

  const getEntry = (
    empNum: number
  ): EmployeeTimeEntry => {
    const stored =
      entries[
        entryKey(empNum)
      ] ?? {
        clockIn: "00:00",
        clockOut: "00:00",
        absent: false,
        absentComment: "",
        consomation: 0,
        penalty: 0,
        workTimeId: null,
      };

    const machine =
      deviceEntries[
        String(empNum)
      ];

    if (!machine) {
      return stored;
    }

    return {
      ...stored,

      clockIn:
        machine.clockIn,

      clockOut:
        machine.clockOut,

      absent: false,

      _dirty: false,
    };
  };

  /* --------------------------------------------------------------------------
     AUTO SAVE
  -------------------------------------------------------------------------- */

  const scheduleSave =
    useCallback(
      (
        empNum: number,
        shiftId: string,
        updatedEntry: EmployeeTimeEntry
      ) => {
        const key =
          `${empNum}-${shiftId}`;

        const shift =
          shifts.find(
            (s) =>
              s.shift_id ===
              shiftId
          );

        clearTimeout(
          saveTimers.current[key]
        );

        saveTimers.current[key] =
          setTimeout(
            async () => {
              setEntries(
                (prev) => ({
                  ...prev,
                  [key]: {
                    ...prev[key],
                    _saving: true,
                    _dirty: false,
                  },
                })
              );

              try {
                const payload =
                  entryToPayload(
                    updatedEntry,
                    empNum,
                    shiftId,
                    operationalDate,
                    shift?.start_time ??
                      "",
                    shift?.end_time ??
                      ""
                  );

                const saved =
                  await upsertWorktime(
                    payload,
                    updatedEntry.workTimeId ??
                      null
                  );

                setEntries(
                  (prev) => ({
                    ...prev,

                    [key]: {
                      ...prev[key],

                      workTimeId:
                        saved._id,

                      _saving:
                        false,
                    },
                  })
                );

                saveEntriesToStorage(
                  operationalDate,
                  {
                    ...entries,
                    [key]: {
                      ...updatedEntry,
                      workTimeId:
                        saved._id,
                      _dirty: false,
                    },
                  }
                );
              } catch (e) {
                setApiError(
                  `Save failed for employee ${empNum}: ${e}`
                );

                setEntries(
                  (prev) => ({
                    ...prev,

                    [key]: {
                      ...prev[key],

                      _saving:
                        false,

                      _dirty:
                        true,
                    },
                  })
                );
              }
            },
            800
          );
      },
      [
        operationalDate,
        shifts,
        entries,
      ]
    );

  /* --------------------------------------------------------------------------
     UPDATE ENTRY
  -------------------------------------------------------------------------- */

  const updateEntry =
    useCallback(
      (
        empNum: number,
        patch: Partial<EmployeeTimeEntry>
      ) => {
        if (!currentTab) {
          return;
        }

        const key =
          entryKey(empNum);

        setEntries((prev) => {
          const updated = {
            ...(prev[key] ??
              getEntry(empNum)),

            ...patch,

            _dirty: true,
          };

          scheduleSave(
            empNum,
            currentTab,
            updated
          );

          const next = {
            ...prev,
            [key]: updated,
          };

          /*
           * Save ONLY under the current operational date.
           */
          saveEntriesToStorage(
            operationalDate,
            next
          );

          return next;
        });
      },
      [
        currentTab,
        operationalDate,
        scheduleSave,
      ]
    );

  /* --------------------------------------------------------------------------
     MANUAL EDIT
  -------------------------------------------------------------------------- */

  const openManualInput = (
    empNum: number,
    type:
      | "clockIn"
      | "clockOut"
  ) =>
    setManualInput({
      employee: empNum,
      type,
      value:
        getEntry(empNum)[
          type
        ],
    });

  const saveManualTime = () => {
    const {
      employee,
      type,
      value,
    } = manualInput;

    if (!employee || !type) {
      return;
    }

    if (!value.match(/^\d{2}:\d{2}$/)) {
      alert(
        "Use HH:MM format"
      );

      return;
    }

    updateEntry(
      employee,
      {
        [type]: value,
      }
    );

    setManualInput({
      employee: null,
      type: null,
      value: "",
    });
  };

  /* --------------------------------------------------------------------------
     ABSENCE
  -------------------------------------------------------------------------- */

  const toggleAbsent = (
    empNum: number,
    absent: boolean
  ) =>
    updateEntry(
      empNum,
      {
        absent,

        ...(absent
          ? {
              clockIn: "00:00",
              clockOut: "00:00",
            }
          : {}),
      }
    );

  /* --------------------------------------------------------------------------
     RESET
  -------------------------------------------------------------------------- */

  const clearAllData = () => {
    if (
      !window.confirm(
        `Reset all clock-in/out data for ${operationalDate}?`
      )
    ) {
      return;
    }

    setEntries(
      (prev) => {
        const reset: Record<
          string,
          EmployeeTimeEntry
        > = {};

        Object.keys(prev).forEach(
          (key) => {
            reset[key] = {
              ...prev[key],

              clockIn:
                "00:00",

              clockOut:
                "00:00",

              absent:
                false,

              absentComment:
                "",

              consomation:
                0,

              penalty:
                0,

              _dirty:
                false,
            };
          }
        );

        saveEntriesToStorage(
          operationalDate,
          reset
        );

        return reset;
      }
    );

    /*
     * Also clear the face-recognition state.
     *
     * It will be reloaded from the machine.
     */
    setDeviceEntries({});
  };

  /* --------------------------------------------------------------------------
     STATS
  -------------------------------------------------------------------------- */

  const stats =
    useMemo(() => {
      let present = 0;
      let absent = 0;
      let pending = 0;

      filteredEmployees.forEach(
        (emp) => {
          const status =
            getStatus(
              getEntry(emp.num)
            );

          if (
            status === "present"
          ) {
            present++;
          } else if (
            status === "absent"
          ) {
            absent++;
          } else {
            pending++;
          }
        }
      );

      return {
        total:
          filteredEmployees.length,

        present,

        absent,

        pending,
      };
    }, [
      filteredEmployees,
      entries,
      deviceEntries,
      currentTab,
    ]);

  /* ==========================================================================
     RENDER
  ========================================================================== */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 text-sm animate-pulse">
        Loading attendance data…
      </div>
    );
  }

  if (
    !loading &&
    !shifts.length
  ) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
        No shifts found — check that{" "}
        <code className="mx-1 font-mono bg-gray-100 px-1 rounded">
          localhost:3001/shifts
        </code>{" "}
        returns data and CORS is enabled.
      </div>
    );
  }

  return (
    <>
      {/* =====================================================================
          MANUAL TIME EDIT MODAL
      ===================================================================== */}

      {manualInput.employee !==
        null && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={() =>
              setManualInput({
                employee: null,
                type: null,
                value: "",
              })
            }
          />

          <div
            className="fixed z-50 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-white/[0.1] shadow-xl p-6 w-72"
            style={{
              top: "50%",
              left: "50%",
              transform:
                "translate(-50%,-50%)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-800 dark:text-white">
                Edit{" "}
                {manualInput.type ===
                "clockIn"
                  ? "Clock-In"
                  : "Clock-Out"}{" "}
                Time
              </h3>

              <button
                onClick={() =>
                  setManualInput({
                    employee: null,
                    type: null,
                    value: "",
                  })
                }
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <CloseIcon />
              </button>
            </div>

            <input
              type="time"
              value={
                manualInput.value
              }
              onChange={(e) =>
                setManualInput(
                  (p) => ({
                    ...p,
                    value:
                      e.target.value,
                  })
                )
              }
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />

            <div className="flex gap-2 mt-4">
              <button
                onClick={
                  saveManualTime
                }
                className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Save
              </button>

              <button
                onClick={() =>
                  setManualInput({
                    employee: null,
                    type: null,
                    value: "",
                  })
                }
                className="flex-1 rounded-lg border border-gray-200 dark:border-white/[0.1] px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.05] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* =====================================================================
          ERROR
      ===================================================================== */}

      {apiError && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-2 text-sm text-red-700 dark:text-red-300">
          <span>
            ⚠ {apiError}
          </span>

          <button
            onClick={() =>
              setApiError(null)
            }
            className="ml-4 text-red-400 hover:text-red-600"
          >
            <CloseIcon />
          </button>
        </div>
      )}

      {/* =====================================================================
          HEADER
      ===================================================================== */}

      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-medium text-gray-800 dark:text-white">
            Attendance
          </h1>

          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Operation date:{" "}
            {operationalDate}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mr-1">
            Shift:
          </span>

          {shifts.map((s) => (
            <button
              key={s.shift_id}
              onClick={() =>
                setCurrentTab(
                  s.shift_id
                )
              }
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                currentTab ===
                s.shift_id
                  ? "border-blue-500 bg-blue-600 text-white"
                  : "border-gray-200 dark:border-white/[0.1] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.05]"
              }`}
            >
              {s.start_time.slice(
                0,
                5
              )}{" "}
              –{" "}
              {s.end_time.slice(
                0,
                5
              )}
            </button>
          ))}

          {/* MACHINE STATUS */}

          <div
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium ${
              deviceStatus ===
              null
                ? "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
                : deviceStatus.connected
                ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                deviceStatus ===
                null
                  ? "bg-amber-500"
                  : deviceStatus.connected
                  ? "bg-green-500"
                  : "bg-red-500"
              }`}
            />

            <span>
              {deviceStatus ===
              null
                ? "Checking machine…"
                : `${deviceStatus.name} — ${
                    deviceStatus.connected
                      ? "Connected"
                      : "Disconnected"
                  }`}
            </span>
          </div>

          {/* MACHINE PUNCH COUNT */}

          <span
            className={`ml-2 rounded-lg px-3 py-1.5 text-xs font-medium ${
              deviceLoading
                ? "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
                : "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400"
            }`}
          >
            {deviceLoading
              ? "Reading machine…"
              : `Machine punches: ${deviceLogs.length}`}
          </span>

          {/* RESET */}

          <button
            onClick={
              clearAllData
            }
            className="ml-2 flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/50 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <TrashIcon />
            Reset
          </button>
        </div>
      </div>

      {/* =====================================================================
          SUMMARY
      ===================================================================== */}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          {
            label: "Total",
            value: stats.total,
            color:
              "text-gray-800 dark:text-white",
          },

          {
            label: "Present",
            value: stats.present,
            color:
              "text-green-700 dark:text-green-400",
          },

          {
            label: "Absent",
            value: stats.absent,
            color:
              "text-red-600 dark:text-red-400",
          },

          {
            label: "Pending",
            value: stats.pending,
            color:
              "text-amber-600 dark:text-amber-400",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.05] px-4 py-3"
          >
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              {stat.label}
            </p>

            <p
              className={`text-2xl font-medium ${stat.color}`}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* =====================================================================
          TABLE
      ===================================================================== */}

      <div className="rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
        <div className="flex items-center justify-between px-5 py-4 gap-4 flex-wrap border-b border-gray-100 dark:border-white/[0.05]">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white">
            {currentShift
              ? `${currentShift.start_time.slice(
                  0,
                  5
                )} – ${currentShift.end_time.slice(
                  0,
                  5
                )} shift`
              : "Attendance"}
          </h2>

          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle
                cx="11"
                cy="11"
                r="8"
              />
              <path d="m21 21-4.35-4.35" />
            </svg>

            <input
              type="text"
              placeholder="Search employee…"
              value={search}
              onChange={(e) =>
                setSearch(
                  e.target.value
                )
              }
              className="pl-9 pr-4 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 placeholder-gray-400 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-48"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/[0.05] bg-gray-50/60 dark:bg-white/[0.02]">
                {[
                  "Employee",
                  "Status",
                  "Clock In",
                  "Clock Out",
                  "Hours",
                  "Delay",
                  "Overtime",
                  "Consumption",
                  "Penalty",
                  "Absent",
                  "Reason",
                  "Saved",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {filteredEmployees.length ===
              0 ? (
                <tr>
                  <td
                    colSpan={12}
                    className="px-5 py-12 text-center text-sm text-gray-400"
                  >
                    {employees.length ===
                    0
                      ? "No employees found in the database."
                      : "No employees assigned to this shift for today."}
                  </td>
                </tr>
              ) : (
                filteredEmployees.map(
                  (emp) => {
                    const entry =
                      getEntry(
                        emp.num
                      );

                    const status =
                      getStatus(
                        entry
                      );

                    const st =
                      specialTimes[
                        `${emp.mongoId}-${currentTab}`
                      ];

                    const effectiveStart =
                      st?.clockIn ??
                      currentShift?.start_time ??
                      "";

                    const effectiveEnd =
                      st?.clockOut ??
                      currentShift?.end_time ??
                      "";

                    const lateMin =
                      calcLate(
                        entry.clockIn,
                        effectiveStart
                      );

                    const otMin =
                      calcOvertime(
                        entry.clockOut,
                        effectiveEnd
                      );

                    const hours =
                      calcHours(
                        entry.clockIn,
                        entry.clockOut
                      );

                    return (
                      <tr
                        key={`${emp.num}-${currentTab}`}
                        className={`transition-colors ${
                          entry.absent
                            ? "bg-red-50/40 dark:bg-red-900/10"
                            : "hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                        }`}
                      >
                        {/* EMPLOYEE */}

                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                            {
                              emp.FirstName
                            }
                          </p>

                          <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">
                            {
                              emp.empNumber
                            }
                          </p>
                        </td>

                        {/* STATUS */}

                        <td className="px-4 py-3">
                          <Badge
                            size="sm"
                            color={badgeColor(
                              status
                            )}
                          >
                            {badgeLabel(
                              status
                            )}
                          </Badge>
                        </td>

                        {/* CLOCK IN */}

                        <td className="px-4 py-3">
                          {!entry.absent ? (
                            <div className="flex flex-col gap-1">
                              <span
                                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                                  entry.clockIn !==
                                  "00:00"
                                    ? "bg-green-600 text-white"
                                    : "border border-gray-200 dark:border-white/[0.1] text-gray-400"
                                }`}
                              >
                                <ClockInIcon />

                                {entry.clockIn !==
                                "00:00"
                                  ? entry.clockIn
                                  : "No punch"}
                              </span>

                              <span className="text-[10px] text-gray-400">
                                Face recognition
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 italic">
                              —
                            </span>
                          )}
                        </td>

                        {/* CLOCK OUT */}

                        <td className="px-4 py-3">
                          {!entry.absent ? (
                            <div className="flex flex-col gap-1">
                              <span
                                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                                  entry.clockOut !==
                                  "00:00"
                                    ? "bg-red-500 text-white"
                                    : "border border-gray-200 dark:border-white/[0.1] text-gray-400"
                                }`}
                              >
                                <ClockInIcon />

                                {entry.clockOut !==
                                "00:00"
                                  ? entry.clockOut
                                  : "No punch"}
                              </span>

                              <span className="text-[10px] text-gray-400">
                                Face recognition
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 italic">
                              —
                            </span>
                          )}
                        </td>

                        {/* HOURS */}

                        <td className="px-4 py-3">
                          <span className="text-sm font-mono text-gray-700 dark:text-gray-300">
                            {
                              hours
                            }
                          </span>
                        </td>

                        {/* DELAY */}

                        <td className="px-4 py-3">
                          <span
                            className={`text-sm font-mono ${
                              lateMin > 0
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-gray-400"
                            }`}
                          >
                            {formatMin(
                              lateMin
                            )}
                          </span>
                        </td>

                        {/* OVERTIME */}

                        <td className="px-4 py-3">
                          <span
                            className={`text-sm font-mono ${
                              otMin > 0
                                ? "text-blue-600 dark:text-blue-400"
                                : "text-gray-400"
                            }`}
                          >
                            {formatMin(
                              otMin
                            )}
                          </span>
                        </td>

                        {/* CONSUMPTION */}

                        <td className="px-4 py-3">
                          <input
                            type="number"
                            value={
                              entry.consomation ||
                              ""
                            }
                            placeholder="0"
                            onChange={(e) =>
                              updateEntry(
                                emp.num,
                                {
                                  consomation:
                                    e.target.value,
                                }
                              )
                            }
                            className="w-16 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-800 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                        </td>

                        {/* PENALTY */}

                        <td className="px-4 py-3">
                          <input
                            type="number"
                            value={
                              entry.penalty ||
                              ""
                            }
                            placeholder="0"
                            onChange={(e) =>
                              updateEntry(
                                emp.num,
                                {
                                  penalty:
                                    e.target.value,
                                }
                              )
                            }
                            className="w-16 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-800 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                        </td>

                        {/* ABSENT */}

                        <td className="px-4 py-3">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={
                                entry.absent
                              }
                              onChange={(
                                e
                              ) =>
                                toggleAbsent(
                                  emp.num,
                                  e.target
                                    .checked
                                )
                              }
                            />

                            <div className="w-9 h-5 bg-gray-200 dark:bg-white/[0.1] peer-focus:ring-2 peer-focus:ring-blue-500/20 rounded-full peer peer-checked:bg-red-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                          </label>
                        </td>

                        {/* REASON */}

                        <td className="px-4 py-3">
                          <input
                            type="text"
                            disabled={
                              !entry.absent
                            }
                            placeholder={
                              entry.absent
                                ? "Enter reason…"
                                : "—"
                            }
                            value={
                              entry.absentComment ||
                              ""
                            }
                            onChange={(e) =>
                              updateEntry(
                                emp.num,
                                {
                                  absentComment:
                                    e.target
                                      .value,
                                }
                              )
                            }
                            className="w-32 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-800 placeholder-gray-300 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                          />
                        </td>

                        {/* SAVED */}

                        <td className="px-4 py-3">
                          {entry._saving ? (
                            <span className="text-xs text-blue-500 animate-pulse flex items-center gap-1">
                              <SaveIcon />
                              Saving…
                            </span>
                          ) : entry._dirty ? (
                            <span className="text-xs text-amber-500">
                              Unsaved
                            </span>
                          ) : entry.workTimeId ? (
                            <span className="text-xs text-green-600">
                              ✓ Saved
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300 dark:text-gray-600">
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  }
                )
              )}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 dark:border-white/[0.05] text-xs text-gray-400 dark:text-gray-500">
          {filteredEmployees.length}{" "}
          employee
          {filteredEmployees.length !==
          1
            ? "s"
            : ""}{" "}
          in this shift
        </div>
      </div>
    </>
  );
}