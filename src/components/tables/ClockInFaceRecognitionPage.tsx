"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";

import { API_BASE_URL } from "@/lib/config";
import { confirmDialog, toast } from "@/lib/notify";
import Badge from "../ui/badge/Badge";

import {
  getWorktimesByDate,
  upsertWorktime,
  type AuditAs,
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
  EmployeeRecord,
} from "./../calendar/types";
import { friendlyError } from "@/lib/errors";
import { t } from "@/lib/i18n";
import TimeSelect from "@/components/form/TimeSelect";

/* ============================================================================
   FACE RECOGNITION API
============================================================================ */

const DEVICE_ATTENDANCE_API =
  process.env.NEXT_PUBLIC_DEVICE_ATTENDANCE_API ??
  `${API_BASE_URL}/attendance/device-logs`;

const DEVICE_STATUS_API =
  process.env.NEXT_PUBLIC_DEVICE_STATUS_API ??
  `${API_BASE_URL}/device/status`;

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

function getLocalDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function dateStringToLocalDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function addDays(
  date: string,
  amount: number
): string {
  const d = dateStringToLocalDate(date);

  d.setDate(d.getDate() + amount);

  return getLocalDateString(d);
}

function timeToMinutes(time: string): number {
  const parts = time
    .slice(0, 5)
    .split(":")
    .map(Number);

  if (
    parts.length !== 2 ||
    Number.isNaN(parts[0]) ||
    Number.isNaN(parts[1])
  ) {
    return 0;
  }

  return parts[0] * 60 + parts[1];
}

/**
 * Treat the timestamp coming from the attendance machine
 * as machine/local attendance time.
 */
function deviceDateTime(
  timestamp: string
): {
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

  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
  ] = match;

  return {
    date: `${year}-${month}-${day}`,
    minutes:
      Number(hour) * 60 +
      Number(minute),
    time: `${hour}:${minute}`,
  };
}

const deviceTime = (
  timestamp: string
) => {
  const parsed =
    deviceDateTime(timestamp);

  return (
    parsed?.time ??
    "00:00"
  );
};

function formatDateTime(
  timestamp: string
) {
  const parsed =
    deviceDateTime(timestamp);

  if (!parsed) {
    return timestamp;
  }

  const [
    year,
    month,
    day,
  ] = parsed.date.split("-");

  return `${day}/${month}/${year} ${parsed.time}`;
}

function normalizeDeviceId(
  value: string
) {
  return String(value)
    .replace(
      /[\u0000-\u001F\u007F]/g,
      ""
    )
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

/* ============================================================================
   OPERATIONAL DATE
============================================================================ */

/**
 * Determine whether a shift crosses midnight.
 *
 * Example:
 *
 * 16:00 -> 02:00
 *
 * 02:00 < 16:00
 *
 * therefore overnight.
 */
function isOvernightShift(
  shift: Shift
): boolean {
  return (
    timeToMinutes(
      shift.end_time
    ) <
    timeToMinutes(
      shift.start_time
    )
  );
}

/**
 * Get the latest overnight end time.
 *
 * Example:
 *
 * 16:00 -> 02:00
 *
 * returns 120 minutes.
 */
function getLatestOvernightEnd(
  shifts: Shift[]
): number | null {
  const overnightShifts =
    shifts.filter(
      isOvernightShift
    );

  if (
    overnightShifts.length === 0
  ) {
    return null;
  }

  return Math.max(
    ...overnightShifts.map(
      (shift) =>
        timeToMinutes(
          shift.end_time
        )
    )
  );
}

/**
 * Determine the current operational attendance date.
 *
 * Example:
 *
 * Shift = 16:00 -> 02:00
 *
 * At Aug 28 23:00:
 *   operation = Aug 28
 *
 * At Aug 29 01:00:
 *   operation = Aug 28
 *
 * At Aug 29 02:01:
 *   operation = Aug 29
 */
function getOperationalDate(
  shifts: Shift[]
): string {
  const now = new Date();

  const calendarDate =
    getLocalDateString(now);

  if (!shifts.length) {
    return calendarDate;
  }

  const currentMinutes =
    now.getHours() * 60 +
    now.getMinutes();

  const overnightEnd =
    getLatestOvernightEnd(
      shifts
    );

  if (
    overnightEnd !== null &&
    currentMinutes < overnightEnd
  ) {
    return addDays(
      calendarDate,
      -1
    );
  }

  return calendarDate;
}

/**
 * Determine whether a machine punch belongs to
 * the specified operational date.
 *
 * For a normal shift:
 *
 * Aug 28 -> only Aug 28.
 *
 * For an overnight shift 16:00 -> 02:00:
 *
 * Aug 28 16:00
 * Aug 28 23:00
 * Aug 29 01:30
 *
 * all belong to Aug 28 operation.
 *
 * Aug 28 01:30 belongs to the Aug 27 operation
 * (it closes the previous night's shift).
 */
function isPunchInsideOperationalDay(
  timestamp: string,
  operationDate: string,
  shifts: Shift[]
): boolean {
  const parsed =
    deviceDateTime(timestamp);

  if (!parsed) {
    return false;
  }

  const overnightEnd =
    getLatestOvernightEnd(
      shifts
    );

  if (overnightEnd === null) {
    return (
      parsed.date ===
      operationDate
    );
  }

  const nextDate =
    addDays(
      operationDate,
      1
    );

  /*
   * Early-morning punches up to the overnight end
   * belong to the previous operation day, the same
   * window that is kept on the next date below.
   */
  if (
    parsed.date ===
    operationDate
  ) {
    return (
      parsed.minutes >
      overnightEnd
    );
  }

  if (
    parsed.date ===
    nextDate
  ) {
    return (
      parsed.minutes <=
      overnightEnd
    );
  }

  return false;
}

/* ============================================================================
   DEVICE LOG -> EMPLOYEE ENTRY
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
    periods: WorkPeriod[];
    workHours: string;
  }
> {
  const result: Record<
    string,
    {
      clockIn: string;
      clockOut: string;
      periods: WorkPeriod[];
      workHours: string;
    }
  > = {};

  for (const employee of employees) {
    const employeeId = String(employee.empNumber);

    const employeeLogs = logs
      .filter((log) => {
        const deviceId = normalizeDeviceId(
          log.deviceUserId
        );

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

    if (!employeeLogs.length) {
      continue;
    }

    /*
     * Punch sequence:
     *
     * 0 = IN
     * 1 = OUT
     * 2 = IN
     * 3 = OUT
     * ...
     */

    const periods: WorkPeriod[] = [];

    for (
      let i = 0;
      i + 1 < employeeLogs.length;
      i += 2
    ) {
      periods.push({
        clockIn: deviceTime(
          employeeLogs[i].timestamp
        ),

        clockOut: deviceTime(
          employeeLogs[i + 1].timestamp
        ),
      });
    }

    /*
     * If there is an odd number of punches,
     * the employee is currently working.
     *
     * Example:
     *
     * 08:00 IN
     * 12:00 OUT
     * 12:30 IN
     *
     * The last period is still open.
     */

    if (employeeLogs.length % 2 === 1) {
      periods.push({
        clockIn: deviceTime(
          employeeLogs[
            employeeLogs.length - 1
          ].timestamp
        ),

        clockOut: "00:00",
      });
    }

    /*
     * Calculate ONLY completed work periods.
     *
     * Therefore pauses are NOT counted.
     */

    let totalMinutes = 0;

    for (const period of periods) {
      if (
        period.clockIn === "00:00" ||
        period.clockOut === "00:00"
      ) {
        continue;
      }

      let minutes =
        toMinutes(period.clockOut) -
        toMinutes(period.clockIn);

      /*
       * Overnight period.
       */
      if (minutes < 0) {
        minutes += 1440;
      }

      totalMinutes += minutes;
    }

    result[employeeId] = {
      /*
       * First punch of the day.
       */
      clockIn: deviceTime(
        employeeLogs[0].timestamp
      ),

      /*
       * Last punch ONLY if it is an OUT.
       *
       * If the employee is currently working,
       * clockOut stays empty.
       */
      clockOut:
        employeeLogs.length % 2 === 0
          ? deviceTime(
              employeeLogs[
                employeeLogs.length - 1
              ].timestamp
            )
          : "00:00",

      periods,

      workHours:
        formatMin(totalMinutes),
    };
  }

  return result;
}
/* ============================================================================
   FETCH MACHINE ATTENDANCE
============================================================================ */

async function getDeviceAttendanceForOperationalDate(
  operationDate: string,
  shifts: Shift[]
): Promise<DeviceAttendanceLog[]> {
  const datesToFetch = [
    operationDate,
  ];

  const hasOvernightShift =
    shifts.some(
      isOvernightShift
    );

  if (
    hasOvernightShift
  ) {
    datesToFetch.push(
      addDays(
        operationDate,
        1
      )
    );
  }

  const responses =
    await Promise.all(
      datesToFetch.map(
        async (date) => {
          const response =
            await fetch(
              `${DEVICE_ATTENDANCE_API}?date=${encodeURIComponent(
                date
              )}`,
              {
                cache:
                  "no-store",
              }
            );

          if (
            !response.ok
          ) {
            throw new Error(
              `Face-recognition API returned ${response.status} for ${date}`
            );
          }

          const data =
            await response.json();

          const logs =
            Array.isArray(
              data
            )
              ? data
              : data?.data;

          if (
            !Array.isArray(
              logs
            )
          ) {
            throw new Error(
              "Invalid face-recognition attendance response"
            );
          }

          return logs as DeviceAttendanceLog[];
        }
      )
    );

  const combined =
    responses.flat();

  /*
   * Remove duplicate machine logs.
   */
  const unique =
    new Map<
      string,
      DeviceAttendanceLog
    >();

  for (
    const log of combined
  ) {
    const key =
      log._id ??
      log.deviceLogId ??
      `${log.deviceUserId}-${log.timestamp}`;

    unique.set(
      key,
      log
    );
  }

  return Array.from(
    unique.values()
  ).filter(
    (log) =>
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

type ShiftStatus =
  | "present"
  | "absent"
  | "pending";

interface Employee {
  num: number;
  mongoId: string;
  empNumber: string;
  FirstName: string;
}

interface WorkPeriod {
  clockIn: string;
  clockOut: string;
}

interface EmployeeTimeEntry {
  clockIn: string;
  clockOut: string;

  // All completed work periods for this shift/day.
  periods: WorkPeriod[];

  // Total actual worked time, excluding pauses.
  workHours: string;

  absent: boolean;
  absentComment: string;
  consomation: number | string;
  penalty: number | string;
  workTimeId: string | null;

  _dirty?: boolean;
  _saving?: boolean;
  // How the activity log should describe the next save (see worktime.api)
  _auditAs?: AuditAs;
  
  backupEmpNum?: number | null;
}


interface ManualInputState {
  employee: number | null;
  type:
    | "clockIn"
    | "clockOut"
    | null;
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
    <circle
      cx="12"
      cy="12"
      r="10"
    />

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
    <line
      x1="18"
      y1="6"
      x2="6"
      y2="18"
    />

    <line
      x1="6"
      y1="6"
      x2="18"
      y2="18"
    />
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
   TIME CALCULATIONS
============================================================================ */

const toMinutes = (
  t: string
) => {
  const [h, m] =
    t
      .slice(0, 5)
      .split(":")
      .map(Number);

  if (
    Number.isNaN(h) ||
    Number.isNaN(m)
  ) {
    return 0;
  }

  return h * 60 + m;
};

const formatMin = (
  n: number
) =>
  n <= 0
    ? "00:00"
    : `${Math.floor(n / 60)
        .toString()
        .padStart(
          2,
          "0"
        )}:${(n % 60)
        .toString()
        .padStart(
          2,
          "0"
        )}`;
const calcHoursFromPeriods = (
  periods: WorkPeriod[]
): string => {
  let total = 0;

  for (const period of periods) {
    if (
      period.clockIn === "00:00" ||
      period.clockOut === "00:00"
    ) {
      continue;
    }

    let minutes =
      toMinutes(period.clockOut) -
      toMinutes(period.clockIn);

    if (minutes < 0) {
      minutes += 1440;
    }

    total += minutes;
  }

  return formatMin(total);
};

const calcLate = (
  i: string,
  s: string
) => {
  if (
    i === "00:00" ||
    !s
  ) {
    return 0;
  }

  const late =
    toMinutes(i) -
    toMinutes(
      s.slice(0, 5)
    );

  return late > 0
    ? late
    : 0;
};

/**
 * Correct overtime calculation for both:
 *
 * 16:00 -> 00:00
 *
 * and:
 *
 * 16:00 -> 02:00
 */
const calcOvertime = (
  o: string,
  e: string
) => {
  if (
    o === "00:00" ||
    !e
  ) {
    return 0;
  }

  let endMinutes =
    toMinutes(
      e.slice(0, 5)
    );

  const outMinutes =
    toMinutes(o);

  /*
   * 00:00 means midnight / 24:00.
   */
  if (
    endMinutes === 0
  ) {
    endMinutes =
      1440;
  }

  /*
   * For an overnight shift:
   *
   * 16:00 -> 02:00
   *
   * the end is actually 1560.
   */
  if (
    endMinutes <
    toMinutes(
      "16:00"
    )
  ) {
    /*
     * Only add 24h when the shift is genuinely
     * an overnight shift.
     */
    endMinutes +=
      1440;
  }

  let actualOut =
    outMinutes;

  /*
   * A clock-out after midnight belongs to
   * the following day.
   */
  if (
    actualOut <
    toMinutes(
      "12:00"
    ) &&
    endMinutes > 1440
  ) {
    actualOut +=
      1440;
  }

  const overtime =
    actualOut -
    endMinutes;

  return overtime > 0
    ? overtime
    : 0;
};

/* ============================================================================
   STATUS
============================================================================ */

const getStatus = (
  e: EmployeeTimeEntry
): ShiftStatus =>
  e.absent
    ? "absent"
    : e.clockIn !==
          "00:00" &&
      e.clockOut !==
          "00:00"
    ? "present"
    : "pending";

const badgeColor = (
  s: ShiftStatus
) =>
  s === "present"
    ? "success"
    : s === "absent"
    ? "error"
    : "warning";

const badgeLabel = (
  s: ShiftStatus
) =>
  s === "present"
    ? t("Present")
    : s === "absent"
    ? t("Absent")
    : t("Pending");

/* ============================================================================
   WORKTIME CONVERSION
============================================================================ */
function recordToEntry(
  r: WorktimeRecord
): EmployeeTimeEntry {
  return {
    clockIn: r.clock_in ?? "00:00",

    clockOut: r.clock_out ?? "00:00",

    /*
     * Worktime currently stores the daily summary.
     *
     * The individual periods come from the
     * attendance-machine logs.
     */
    periods: [],

    workHours: r.work_hours ?? "00:00",

    absent: r.absent ?? false,

    absentComment:
      r.absent_comment ?? "",

    consomation:
      r.consomation ?? 0,

    penalty:
      r.penalty ?? 0,

    workTimeId: r._id,

    backupEmpNum: r.backup_emp_id ?? null,
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
  // Plan A: Worktime stores the daily total, while periods preserve
  // every IN/OUT pair. Recalculate from periods whenever they exist
  // so the value sent to Worktime is always the current total.
  const hours =
    entry.periods?.length > 0
      ? calcHoursFromPeriods(entry.periods)
      : entry.workHours || "00:00";

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

    late_minutes:
      String(late),

    overtime_minutes:
      String(ot),

    /*
     * THIS is now the total actual
     * working time.
     *
     * Example:
     * 08:00-12:00 + 12:30-16:00
     * = 07:30
     */
    work_hours: hours,

    consomation:
      Number(entry.consomation) || 0,

    penalty:
      Number(entry.penalty) || 0,

    absent:
      entry.absent,

    absent_comment:
      entry.absentComment || undefined,
      
    backup_emp_id: entry.backupEmpNum ?? null,
    };
}

/* ============================================================================
   LOCAL STORAGE
============================================================================ */

const LS_KEY = (
  date: string
) =>
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
      JSON.stringify(
        entries
      )
    );
  } catch {}
}

function loadEntriesFromStorage(
  date: string
): Record<
  string,
  EmployeeTimeEntry
> {
  try {
    const raw =
      localStorage.getItem(
        LS_KEY(date)
      );

    return raw
      ? JSON.parse(raw)
      : {};
  } catch {
    return {};
  }
}

/* ============================================================================
   COMPONENT
============================================================================ */

interface AttendancePageProps {
  currentDate?: string;
}

export default function AttendancePage({
  currentDate:
    providedDate,
}: AttendancePageProps) {
  /* --------------------------------------------------------------------------
     OPERATIONAL DATE
  -------------------------------------------------------------------------- */

  const [
    operationalDate,
    setOperationalDate,
  ] = useState<string>(
    providedDate ??
      getLocalDateString()
  );

  /*
   * Recalculate the operational date every minute.
   *
   * This is important for overnight shifts.
   */
  const [clockTick, setClockTick] =
    useState(0);

  /* --------------------------------------------------------------------------
     STATE
  -------------------------------------------------------------------------- */
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [
    specialTimes,
    setSpecialTimes,
  ] = useState<
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

  const [
    employees,
    setEmployees,
  ] = useState<Employee[]>(
    []
  );

  const [
    assignedShifts,
    setAssignedShifts,
  ] = useState<
    Record<
      number,
      string[]
    >
  >({});

  const [
    currentTab,
    setCurrentTab,
  ] = useState<string | null>(
    null
  );

  const [
    entries,
    setEntries,
  ] = useState<
    Record<
      string,
      EmployeeTimeEntry
    >
  >({});

  const [
    manualInput,
    setManualInput,
  ] =
    useState<ManualInputState>({
      employee: null,
      type: null,
      value: "",
    });

  const [search, setSearch] =
    useState("");

  const [
    apiError,
    setApiError,
  ] = useState<string | null>(
    null
  );

  const [loading, setLoading] =
    useState(true);

  const [
    deviceLoading,
    setDeviceLoading,
  ] = useState(false);

  const [
    deviceLogs,
    setDeviceLogs,
  ] = useState<
    DeviceAttendanceLog[]
  >([]);

const [deviceEntries, setDeviceEntries] =
  useState<
    Record<
      string,
      {
        clockIn: string;
        clockOut: string;
        periods: WorkPeriod[];
        workHours: string;
      }
    >
  >({});
  
  const [dailyPlanning, setDailyPlanning] =
  useState<PlanningRecord[]>([]);
  const [absenceModal, setAbsenceModal] = useState<{
    empNum: number;
    backups: EmployeeRecord[];
  } | null>(null);
  const [selectedBackupId, setSelectedBackupId] =
    useState("");



  const saveTimers =
    useRef<
      Record<
        string,
        ReturnType<
          typeof setTimeout
        >
      >
    >({});

  /*
   * Prevent the exact same machine punch from
   * being saved more than once while a request
   * is already running.
   */
  const machineSaveInFlight =
    useRef<
      Set<string>
    >(new Set());

  /*
   * Remember only signatures that were ACTUALLY accepted by the backend.
   * This is intentionally separate from `entries` because React state can
   * already contain the latest machine punches before MongoDB has been
   * updated.
   */
  const lastSavedMachineSignature =
    useRef<
      Record<string, string>
    >({});

  const [
    deviceStatus,
    setDeviceStatus,
  ] = useState<{
    connected: boolean;
    name: string;
    ip?: string;
  } | null>(null);

  /* --------------------------------------------------------------------------
     KEEP OPERATIONAL DATE UPDATED
  -------------------------------------------------------------------------- */

  useEffect(() => {
    if (providedDate) {
      setOperationalDate(
        providedDate
      );

      return;
    }

    const updateOperationalDate =
      () => {
        setClockTick(
          (value) =>
            value + 1
        );
      };

    updateOperationalDate();

    const interval =
      setInterval(
        updateOperationalDate,
        60 * 1000
      );

    return () =>
      clearInterval(
        interval
      );
  }, [
    providedDate,
  ]);

  /*
   * Whenever the clock changes, calculate whether
   * we moved from:
   *
   * Aug 28 operation
   *
   * to:
   *
   * Aug 29 operation.
   */
  useEffect(() => {
    if (providedDate) {
      return;
    }

    if (!shifts.length) {
      const today =
        getLocalDateString();

      setOperationalDate(
        (previous) =>
          previous === today
            ? previous
            : today
      );

      return;
    }

    const calculated =
      getOperationalDate(
        shifts
      );

    setOperationalDate(
      (previous) =>
        previous === calculated
          ? previous
          : calculated
    );
  }, [
    clockTick,
    shifts,
    providedDate,
  ]);

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
              DEVICE_STATUS_API,
              {
                cache:
                  "no-store",
              }
            );

          if (
            !response.ok
          ) {
            throw new Error(
              `Device status ${response.status}`
            );
          }

          const data =
            await response.json();

          if (!cancelled) {
            setDeviceStatus(
              data
            );
          }
        } catch {
          if (!cancelled) {
            setDeviceStatus({
              connected:
                false,

              name:
                "Face Recognition Machine",
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

      clearInterval(
        interval
      );
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
          if (cancelled) {
            return;
          }

          setDailyPlanning(planningRecords);

          /* ---------------------------------------------------------------
             EMPLOYEES
          --------------------------------------------------------------- */

          const mappedEmployees:
            Employee[] =
            empRecords.map(
              (e) => ({
                num:
                  e.empNumber,

                mongoId:
                  e._id,

                empNumber:
                  String(
                    e.empNumber
                  ),

                FirstName:
                  `${e.firstName} ${e.lastName}`,
              })
            );

          /* ---------------------------------------------------------------
             SHIFTS
          --------------------------------------------------------------- */

          const mappedShifts:
            Shift[] =
            shiftRecords.map(
              (s) => ({
                shift_id:
                  s._id,

                start_time:
                  s.startTime.length ===
                  5
                    ? `${s.startTime}:00`
                    : s.startTime,

                end_time:
                  s.endTime.length ===
                  5
                    ? `${s.endTime}:00`
                    : s.endTime,
              })
            );

          /* ---------------------------------------------------------------
             PLANNING
          --------------------------------------------------------------- */

          const assigned:
            Record<
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

              if (!emp) {
                return;
              }

              const empNum =
                emp.empNumber;

              if (
                !assigned[
                  empNum
                ]
              ) {
                assigned[
                  empNum
                ] = [];
              }

              if (
                !assigned[
                  empNum
                ].includes(
                  p.shiftId._id
                )
              ) {
                assigned[
                  empNum
                ].push(
                  p.shiftId._id
                );
              }
            }
          );

          /* ---------------------------------------------------------------
             SPECIAL TIMES
          --------------------------------------------------------------- */

          const special:
            Record<
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

          setSpecialTimes(
            special
          );

          setEmployees(
            mappedEmployees
          );

          setShifts(
            mappedShifts
          );

          setAssignedShifts(
            assigned
          );

          /*
           * Recalculate the operational date now that
           * we actually know the shifts.
           */
          if (
            !providedDate
          ) {
            setOperationalDate(
              getOperationalDate(
                mappedShifts
              )
            );
          }

          setCurrentTab(
            (previous) => {
              if (
                previous &&
                mappedShifts.some(
                  (s) =>
                    s.shift_id ===
                    previous
                )
              ) {
                return previous;
              }

              return mappedShifts.length
                ? mappedShifts[0]
                    .shift_id
                : null;
            }
          );
        }
      )
      .catch((e) => {
        if (!cancelled) {
          setApiError(
            friendlyError(e, "Couldn't load today's data")
          );
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
  }, [
    operationalDate,
  ]);

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

    setDeviceLoading(
      true
    );

    /*
     * Clear only while this particular operational
     * date is being loaded.
     */
    setDeviceLogs([]);
    setDeviceEntries({});

    setAttendanceLoading(true);
    setEntries({});

    const loadAttendance =
      async () => {
        try {
          
          const [
            records,
            logs,
          ] =
            await Promise.all([
              getWorktimesByDate(
                operationalDate
              ),

              getDeviceAttendanceForOperationalDate(
                operationalDate,
                shifts
              ),
              
            ]);

          if (cancelled) {
            return;
          }

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
            "DEVICE LOGS:",
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

          setDeviceLogs(
            logs
          );

          setDeviceEntries(
            machineEntries
          );

          /* ---------------------------------------------------------------
             DATABASE + LOCAL STORAGE
          --------------------------------------------------------------- */

          const fromStorage =
            loadEntriesFromStorage(
              operationalDate
            );

          const next:
            Record<
              string,
              EmployeeTimeEntry
            > = {
            ...fromStorage,
          };

          /*
           * First load records from MongoDB.
           */
          records.forEach(
            (
              r: WorktimeRecord
            ) => {
              const key =
                `${r.emp_id}-${r.shift_id}`;

              /*
               * Database is the persistent source.
               *
               * Machine punches will override only clockIn/clockOut
               * below.
               */
              if (
                !next[key]?._dirty
              ) {
                next[key] =
                  recordToEntry(
                    r
                  );
              }
            }
          );

          /*
           * Machine is authoritative for clockIn/clockOut.
           */
          employees.forEach(
            (emp) => {
              const machine =
                machineEntries[
                  String(
                    emp.empNumber
                  )
                ];

              if (!machine) {
                return;
              }

              const employeeShifts =
                assignedShifts[
                  emp.num
                ] ?? [];

              employeeShifts.forEach(
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

                      absent:
                        false,

                      absentComment:
                        "",

                      consomation:
                        0,

                      penalty:
                        0,

                      workTimeId:
                        null,
                    };

                 next[key] = {
                  ...existing,
                  clockIn: machine.clockIn,
                  clockOut: machine.clockOut,
                  periods: machine.periods,
                  workHours: machine.workHours,
                  _dirty: false,
                };
                }
              );
            }
          );

          saveEntriesToStorage(
            operationalDate,
            next
          );

          setEntries(
            next
          );
        } catch (e) {
          if (!cancelled) {
            setApiError(
              friendlyError(e, "Couldn't load the face-recognition clock-ins")
            );
          }
        } finally {
          if (!cancelled) {
            setDeviceLoading(
              false
            );
            setAttendanceLoading(false);
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
  ]);

  /* --------------------------------------------------------------------------
     CURRENT SHIFT
  -------------------------------------------------------------------------- */

  const currentShift =
    useMemo(
      () =>
        shifts.find(
          (s) =>
            s.shift_id ===
            currentTab
        ) ?? null,

      [
        shifts,
        currentTab,
      ]
    );

  /* --------------------------------------------------------------------------
     EMPLOYEE FILTER
  -------------------------------------------------------------------------- */

  const filteredEmployees = useMemo(() => {
    if (!currentTab) {
      return [];
    }

    const q = search.toLowerCase();

    // Collect employee numbers of backups selected for absent employees
    // of THIS shift only (entries are keyed "<empNum>-<shiftId>"), so a
    // backup doesn't show up in every shift tab.
    const backupEmployeeNums = new Set<number>();

    Object.entries(entries).forEach(([key, entry]) => {
      if (
        key.endsWith(`-${currentTab}`) &&
        entry.absent &&
        entry.backupEmpNum != null
      ) {
        backupEmployeeNums.add(Number(entry.backupEmpNum));
      }
    });

    return employees.filter((emp) => {
      const inShift = (
        assignedShifts[emp.num] ?? []
      ).includes(currentTab);

      const isSelectedBackup = backupEmployeeNums.has(
        Number(emp.empNumber)
      );

      const matchesSearch =
        emp.FirstName.toLowerCase().includes(q) ||
        String(emp.empNumber).toLowerCase().includes(q);

      return (
        (inShift || isSelectedBackup) &&
        matchesSearch
      );
    });
  }, [
    currentTab,
    employees,
    assignedShifts,
    search,
    entries,
  ]);

  /* --------------------------------------------------------------------------
     ENTRY
  -------------------------------------------------------------------------- */

  const entryKey = (
    empNum: number,
    shiftId =
      currentTab
  ) =>
    `${empNum}-${shiftId}`;


  
  const getEntry = (
    empNum: number
  ): EmployeeTimeEntry => {
    const stored =
      entries[entryKey(empNum)] ?? {
        clockIn: "00:00",
        clockOut: "00:00",
        periods: [],
        workHours: "00:00",
        absent: false,
        absentComment: "",
        consomation: 0,
        penalty: 0,
        workTimeId: null,
        backupEmpNum: null,
      };

    const machine = deviceEntries[String(empNum)];

    // No machine data: preserve the database entry.
    if (!machine) {
      return stored;
    }

    // Machine data may update times, but must not
    // override the employee's absence status.
    return {
      ...stored,
      clockIn: machine.clockIn,
      clockOut: machine.clockOut,
      periods: machine.periods,
      workHours: machine.workHours,
      _dirty: false,
    };
  };


  /* --------------------------------------------------------------------------
     MANUAL SAVE
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
          saveTimers.current[
            key
          ]
        );

        saveTimers.current[
          key
        ] =
          setTimeout(
            async () => {
              setEntries(
                (prev) => ({
                  ...prev,

                  [key]: {
                    ...prev[key],

                    _saving:
                      true,

                    _dirty:
                      false,
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
                      null,
                    updatedEntry._auditAs
                  );

                setEntries(
                  (prev) => {
                    const next = {
                      ...prev,

                      [key]: {
                        ...prev[key],

                        workTimeId:
                          saved._id,

                        _saving:
                          false,

                        _dirty:
                          false,
                      },
                    };

                    saveEntriesToStorage(
                      operationalDate,
                      next
                    );

                    return next;
                  }
                );
              } catch (e) {
                setApiError(
                  friendlyError(e, `Couldn't save the times for employee ${empNum}`)
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
      ]
    );

  /* --------------------------------------------------------------------------
     AUTOMATIC MACHINE ATTENDANCE SAVE
  -------------------------------------------------------------------------- */

  /**
   * Machine attendance is stored as ONE daily Worktime document:
   *
   *   employee + operational date = one record
   *
   * Every time the machine produces a new punch sequence:
   *
   *   08:00 -> 09:00
   *
   * then:
   *
   *   08:00 -> 09:00
   *   09:30 -> 10:14
   *
   * we call upsertWorktime().
   *
   * upsertWorktime() is responsible for:
   *
   *   1. finding the existing Worktime by employee + date
   *   2. PUT/updating it when it exists
   *   3. POST/creating it when it does not exist
   *
   * We do NOT use `entries` to decide whether MongoDB is already up to date.
   * `entries` is React state and may be newer than the database.
   */
  useEffect(() => {
    if (
      !operationalDate ||
      !employees.length ||
      !shifts.length ||
      !Object.keys(
        deviceEntries
      ).length
    ) {
      return;
    }

    let cancelled = false;

    const saveMachinePunches =
      async () => {
        for (const emp of employees) {
          if (cancelled) {
            return;
          }

          const machine =
            deviceEntries[
              String(emp.empNumber)
            ];

          if (!machine) {
            continue;
          }

          if (machine.clockIn === "00:00") {
            console.log(
              "⏭️ MACHINE SAVE SKIPPED - no clock-in:",
              emp.empNumber
            );
            continue;
          }

          const employeeShifts =
            assignedShifts[emp.num] ?? [];

          if (!employeeShifts.length) {
            console.log(
              "⏭️ MACHINE SAVE SKIPPED - employee has no assigned shift:",
              emp.empNumber
            );
            continue;
          }

          /*
           * Worktime is a DAILY record.
           *
           * The shift_id is only metadata for the daily document.
           * Prefer the currently displayed shift when it is assigned,
           * otherwise use the employee's first assigned shift.
           */
          const shiftId =
            currentTab &&
            employeeShifts.includes(currentTab)
              ? currentTab
              : employeeShifts[0];

          const shift =
            shifts.find(
              (s) =>
                s.shift_id === shiftId
            );

          if (!shift) {
            console.error(
              "❌ MACHINE SAVE FAILED - shift not found:",
              {
                employee: emp.empNumber,
                shiftId,
                employeeShifts,
              }
            );
            continue;
          }

          const key =
            `${emp.num}-${shiftId}`;

          /*
           * Build the DAILY summary from every machine period.
           *
           * Example:
           *   08:00 -> 09:00
           *   09:14 -> 10:14
           *
           * becomes:
           *   clock_in  = 08:00
           *   clock_out = 10:14
           *   work_hours = 02:00
           */
          const completedPeriods =
            machine.periods.filter(
              (period) =>
                period.clockIn !== "00:00" &&
                period.clockOut !== "00:00"
            );

          const firstClockIn =
            machine.periods.length > 0
              ? machine.periods[0].clockIn
              : "00:00";

          const lastClockOut =
            completedPeriods.length > 0
              ? completedPeriods[
                  completedPeriods.length - 1
                ].clockOut
              : "00:00";

          const totalWorkHours =
            calcHoursFromPeriods(
              machine.periods
            );

          /*
           * Signature of the COMPLETE machine attendance.
           *
           * This is NOT used to determine whether the database contains
           * the record. It is only used to avoid sending the exact same
           * request twice after React/effect re-renders.
           */
          const periodsSignature =
            machine.periods
              .map(
                (period) =>
                  `${period.clockIn}-${period.clockOut}`
              )
              .join(",");

          const signature =
            `${operationalDate}|${emp.empNumber}|${firstClockIn}|${lastClockOut}|${totalWorkHours}|${periodsSignature}`;

          const saveKey =
            `${operationalDate}-${emp.empNumber}`;

          console.log(
            "🔍 MACHINE SAVE CHECK:",
            {
              employee:
                emp.empNumber,
              operationalDate,
              signature,
              lastSuccessfullySaved:
                lastSavedMachineSignature.current[
                  saveKey
                ],
              periods:
                machine.periods,
            }
          );

          /*
           * The exact same machine state was already successfully
           * accepted by the backend.
           *
           * IMPORTANT:
           * This does NOT compare with `entries`.
           */
          if (
            lastSavedMachineSignature.current[
              saveKey
            ] === signature
          ) {
            console.log(
              "⏭️ MACHINE SAVE SKIPPED - exact machine state already saved:",
              {
                employee:
                  emp.empNumber,
                signature,
              }
            );
            continue;
          }

          /*
           * Prevent two identical requests from being sent at the
           * same time.
           */
          if (
            machineSaveInFlight.current.has(
              signature
            )
          ) {
            console.log(
              "⏭️ MACHINE SAVE SKIPPED - request already in flight:",
              signature
            );
            continue;
          }

          machineSaveInFlight.current.add(
            signature
          );

          /*
           * We intentionally do NOT use `entries` here to decide
           * whether a Worktime already exists.
           *
           * MongoDB is checked by upsertWorktime().
           */
          const existing =
            entries[key] ??
            {
              clockIn: "00:00",
              clockOut: "00:00",
              periods: [],
              workHours: "00:00",
              absent: false,
              absentComment: "",
              consomation: 0,
              penalty: 0,
              workTimeId: null,
            };

          const machineEntry:
            EmployeeTimeEntry =
            {
              ...existing,

              clockIn:
                firstClockIn,

              clockOut:
                lastClockOut,

              periods:
                machine.periods,

              workHours:
                totalWorkHours,

              absent: false,

              absentComment:
                existing.absentComment ?? "",

              consomation:
                existing.consomation ?? 0,

              penalty:
                existing.penalty ?? 0,
            };

          const payload =
            entryToPayload(
              machineEntry,
              emp.num,
              shiftId,
              operationalDate,
              shift.start_time,
              shift.end_time
            );

          console.log(
            "===================================================="
          );
          console.log(
            "💾 MACHINE ATTENDANCE SAVE"
          );
          console.log(
            "Employee:",
            emp.empNumber
          );
          console.log(
            "Operational date:",
            operationalDate
          );
          console.log(
            "Shift ID:",
            shiftId
          );
          console.log(
            "Assigned shifts:",
            employeeShifts
          );
          console.log(
            "Machine periods:",
            machine.periods
          );
          console.log(
            "Daily clock IN:",
            firstClockIn
          );
          console.log(
            "Daily clock OUT:",
            lastClockOut
          );
          console.log(
            "Daily work hours:",
            totalWorkHours
          );
          console.log(
            "FINAL PAYLOAD SENT TO BACKEND:",
            payload
          );
          console.log(
            "===================================================="
          );

          try {
            /*
             * IMPORTANT:
             *
             * We intentionally pass NULL here.
             *
             * This forces upsertWorktime() to check MongoDB using:
             *
             *   employee + operational date
             *
             * If the employee already has today's Worktime:
             *   -> PUT /worktime/:id
             *
             * If not:
             *   -> POST /worktime
             *
             * This is safer than trusting the React `entries` state.
             */
            // Punches from the machine are normal clock-ins/outs.
            const saved =
              await upsertWorktime(
                payload,
                null,
                "clock"
              );

            console.log(
              "===================================================="
            );
            console.log(
              "✅ MACHINE ATTENDANCE BACKEND RESPONSE"
            );
            console.log(
              "Employee:",
              emp.empNumber
            );
            console.log(
              "Returned Mongo ID:",
              saved?._id
            );
            console.log(
              "Returned clock_in:",
              saved?.clock_in
            );
            console.log(
              "Returned clock_out:",
              saved?.clock_out
            );
            console.log(
              "Returned work_hours:",
              saved?.work_hours
            );
            console.log(
              "FULL BACKEND RESPONSE:",
              saved
            );
            console.log(
              "===================================================="
            );

            /*
             * Only mark this machine state as saved AFTER the
             * backend has successfully accepted it.
             */
            lastSavedMachineSignature.current[
              saveKey
            ] = signature;

            console.log(
              "💾 MACHINE SIGNATURE MARKED AS SUCCESSFULLY SAVED:",
              {
                saveKey,
                signature,
              }
            );

            if (cancelled) {
              return;
            }

            setEntries(
              (prev) => {
                const next = {
                  ...prev,

                  [key]: {
                    ...prev[key],

                    ...machineEntry,

                    workTimeId:
                      saved._id,

                    _dirty: false,

                    _saving: false,
                  },
                };

                saveEntriesToStorage(
                  operationalDate,
                  next
                );

                return next;
              }
            );
          } catch (error) {
            console.error(
              "===================================================="
            );
            console.error(
              "❌ MACHINE ATTENDANCE SAVE FAILED"
            );
            console.error(
              "Employee:",
              emp.empNumber
            );
            console.error(
              "Payload that failed:",
              payload
            );
            console.error(
              "Error:",
              error
            );
            console.error(
              "===================================================="
            );

            /*
             * IMPORTANT:
             * Do NOT update lastSavedMachineSignature on failure.
             *
             * That means the next effect run can retry the same
             * attendance instead of thinking it was already saved.
             */
            if (!cancelled) {
              setApiError(
                friendlyError(error, `Couldn't save the machine clock-in for employee ${emp.empNumber}`)
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
          } finally {
            machineSaveInFlight.current.delete(
              signature
            );
          }
        }
      };

    saveMachinePunches();

    return () => {
      cancelled = true;
    };
  }, [
    deviceEntries,
    operationalDate,
    employees,
    shifts,
    assignedShifts,
    currentTab,
  ]);

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

        setEntries(
          (prev) => {
            const current =
              prev[key] ??
              getEntry(empNum);

            const updated = {
              ...current,

              _auditAs: undefined,

              ...patch,

              _dirty:
                true,
            };

            scheduleSave(
              empNum,
              currentTab,
              updated
            );

            const next = {
              ...prev,

              [key]:
                updated,
            };

            saveEntriesToStorage(
              operationalDate,
              next
            );

            return next;
          }
        );
      },
      [
        currentTab,
        operationalDate,
        scheduleSave,
      ]
    );

  /* --------------------------------------------------------------------------
     MANUAL TIME EDIT
  -------------------------------------------------------------------------- */

  const openManualInput = (
    empNum: number,
    type:
      | "clockIn"
      | "clockOut"
  ) =>
    setManualInput({
      employee:
        empNum,

      type,

      value:
        getEntry(empNum)[
          type
        ],
    });

  const saveManualTime =
    () => {
      const {
        employee,
        type,
        value,
      } =
        manualInput;

      if (
        employee ===
          null ||
        !type
      ) {
        return;
      }

      if (
        !value.match(
          /^\d{2}:\d{2}$/
        )
      ) {
        toast.warning(
          "Enter the time as HH:MM, for example 08:30."
        );

        return;
      }

      updateEntry(
        employee,
        {
          [type]:
            value,
          _auditAs: "edit",
        }
      );

      setManualInput({
        employee:
          null,

        type:
          null,

        value:
          "",
      });
    };

  /* --------------------------------------------------------------------------
     ABSENCE
  -------------------------------------------------------------------------- */

  
const toggleAbsent = (
  empNum: number,
  absent: boolean
) => {
  if (!currentTab) return;

  // The manager is cancelling the absence.
  if (!absent) {
    updateEntry(empNum, {
      absent: false,
      backupEmpNum: null,
    });

    setAbsenceModal(null);
    setSelectedBackupId("");
    return;
  }

  const employee = employees.find(
    (emp) => emp.num === empNum
  );

  if (!employee) return;

  const planning = dailyPlanning.find(
    (p) =>
      p.empId?._id === employee.mongoId &&
      p.shiftId?._id === currentTab
  );

  const backups = (
    planning?.backupEmpIds ?? []
  ).filter(
    (backup): backup is EmployeeRecord =>
      typeof backup === "object" &&
      backup !== null &&
      Boolean(backup._id)
  );

  // No backups configured: mark the employee absent directly.
  if (backups.length === 0) {
    updateEntry(empNum, {
      absent: true,
      clockIn: "00:00",
      clockOut: "00:00",
      backupEmpNum: null,
    });
    return;
  }

  // Ask the manager to choose a backup.
  setSelectedBackupId("");
  setAbsenceModal({
    empNum,
    backups,
  });
};

const confirmAbsence = () => {
  if (!absenceModal || !selectedBackupId || !currentTab) {
    return;
  }

  const backup = absenceModal.backups.find(
    (item) => item._id === selectedBackupId
  );

  if (!backup) return;

  // Find the backup in the main employees list.
  const backupEmployee = employees.find(
    (emp) => emp.mongoId === backup._id
  );

  if (!backupEmployee) {
    setApiError("The selected backup employee could not be found.");
    return;
  }

  // 1. Mark the original employee absent.
  updateEntry(absenceModal.empNum, {
    absent: true,
    clockIn: "00:00",
    clockOut: "00:00",
    backupEmpNum: backup.empNumber,
  });

  // 2. Ensure the backup has a separate attendance entry.
  // Preserve any existing clock-in/out times.
  updateEntry(backupEmployee.num, {
    absent: false,
  });

  // Close the modal.
  setAbsenceModal(null);
  setSelectedBackupId("");
};



  /* --------------------------------------------------------------------------
     RESET
  -------------------------------------------------------------------------- */

  const clearAllData =
    async () => {
      const ok = await confirmDialog({
        title: t("Reset clock-ins for {date}?", { date: operationalDate }),
        message: "All clock-in and clock-out times shown for this day will be cleared.",
        confirmLabel: "Reset",
        danger: true,
      });
      if (!ok) {
        return;
      }

      setEntries(
        (prev) => {
          const reset:
            Record<
              string,
              EmployeeTimeEntry
            > = {};

          Object.keys(
            prev
          ).forEach(
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

      setDeviceEntries(
        {}
      );

      setDeviceLogs(
        []
      );
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
              getEntry(
                emp.num
              )
            );

          if (
            status ===
            "present"
          ) {
            present++;
          } else if (
            status ===
            "absent"
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
        {t("Loading attendance data…")}
      </div>
    );
  }

  if (
    !loading &&
    !shifts.length
  ) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
        {t("No shifts found. Add shifts in Shifts Management first.")}
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
                employee:
                  null,

                type:
                  null,

                value:
                  "",
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
                  ? t("Clock-In")
                  : t("Clock-Out")}{" "}
                {t("Time")}
              </h3>

              <button
                onClick={() =>
                  setManualInput({
                    employee:
                      null,

                    type:
                      null,

                    value:
                      "",
                  })
                }
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <CloseIcon />
              </button>
            </div>

            <TimeSelect
              value={manualInput.value}
              onChange={(v) => setManualInput((p) => ({ ...p, value: v }))}
              className="flex-1"
            />

            <div className="flex gap-2 mt-4">
              <button
                onClick={
                  saveManualTime
                }
                className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                {t("Save")}
              </button>

              <button
                onClick={() =>
                  setManualInput({
                    employee:
                      null,

                    type:
                      null,

                    value:
                      "",
                  })
                }
                className="flex-1 rounded-lg border border-gray-200 dark:border-white/[0.1] px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.05] transition-colors"
              >
                {t("Cancel")}
              </button>
            </div>
          </div>
        </>
      )}

      {absenceModal && (
        <>
          {/* Background overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => {
              setAbsenceModal(null);
              setSelectedBackupId("");
            }}
          />

          {/* Absence modal */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="backup-dialog-title"
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 bg-white p-6 shadow-xl dark:border-white/[0.1] dark:bg-gray-900"
          >
            <h3
              id="backup-dialog-title"
              className="text-lg font-semibold text-gray-800 dark:text-white"
            >
              {t("Choose a replacement")}
            </h3>

            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {t("Select one of the planned backup employees to replace the absent employee.")}
            </p>

            {/* Planned backup employees */}
            <div className="mt-4 space-y-2">
              {absenceModal.backups.map((backup) => (
                <label
                  key={backup._id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                    selectedBackupId === backup._id
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 hover:bg-gray-50 dark:border-white/[0.1] dark:hover:bg-white/[0.05]"
                  }`}
                >
                  <input
                    type="radio"
                    name="plannedBackup"
                    value={backup._id}
                    checked={selectedBackupId === backup._id}
                    onChange={() => setSelectedBackupId(backup._id)}
                    className="h-4 w-4 accent-blue-600"
                  />

                  <span className="text-sm font-medium text-gray-800 dark:text-white">
                    {backup.firstName} {backup.lastName}
                  </span>

                  <span className="ml-auto text-xs text-gray-400">
                    EMP-{backup.empNumber}
                  </span>
                </label>
              ))}
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAbsenceModal(null);
                  setSelectedBackupId("");
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]"
              >
                {t("Cancel")}
              </button>

              <button
                type="button"
                disabled={!selectedBackupId}
                onClick={confirmAbsence}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("Confirm absence")}
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
            ⚠{" "}
            {apiError}
          </span>

          <button
            onClick={() =>
              setApiError(
                null
              )
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
            {t("Attendance")}
          </h1>

          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Operation date:{" "}
            {
              operationalDate
            }
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mr-1">
            {t("Shift:")}
          </span>

          {shifts.map(
            (s) => (
              <button
                key={
                  s.shift_id
                }
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
            )
          )}

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
                ? t("Checking machine…")
                : `${
                    t(deviceStatus.name)
                  } — ${
                    deviceStatus.connected
                      ? t("Connected")
                      : t("Disconnected")
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
              ? t("Reading machine…")
              : t("Machine punches: {n}", { n: deviceLogs.length })}
          </span>

          {/* RESET */}

          <button
            onClick={
              clearAllData
            }
            className="ml-2 flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/50 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <TrashIcon />
            {t("Reset")}
          </button>
        </div>
      </div>

      {/* =====================================================================
          SUMMARY
      ===================================================================== */}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          {
            label:
              "Total",

            value:
              stats.total,

            color:
              "text-gray-800 dark:text-white",
          },

          {
            label:
              t("Present"),

            value:
              stats.present,

            color:
              "text-green-700 dark:text-green-400",
          },

          {
            label:
              t("Absent"),

            value:
              stats.absent,

            color:
              "text-red-600 dark:text-red-400",
          },

          {
            label:
              t("Pending"),

            value:
              stats.pending,

            color:
              "text-amber-600 dark:text-amber-400",
          },
        ].map(
          (stat) => (
            <div
              key={
                stat.label
              }
              className="rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.05] px-4 py-3"
            >
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                {
                  t(stat.label)
                }
              </p>

              <p
                className={`text-2xl font-medium ${stat.color}`}
              >
                {
                  stat.value
                }
              </p>
            </div>
          )
        )}
      </div>

      {/* =====================================================================
          TABLE
      ===================================================================== */}

      {attendanceLoading ? (
        <div className="p-6 text-center text-gray-500">
          {t("Loading attendance...")}
        </div>
      ) : (
      <div className="rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
        <div className="flex items-center justify-between px-5 py-4 gap-4 flex-wrap border-b border-gray-100 dark:border-white/[0.05]">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white">
            {currentShift
              ? t("{start} – {end} shift", { start: currentShift.start_time.slice(0, 5), end: currentShift.end_time.slice(0, 5) })
              : t("Attendance")}
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
              placeholder={t("Search employee…")}
              value={
                search
              }
              onChange={(e) =>
                setSearch(
                  e.target
                    .value
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
                  t("Clock In"),
                  t("Clock Out"),
                  "Hours",
                  "Delay",
                  "Overtime",
                  "Consumption",
                  "Penalty",
                  t("Absent"),
                  "Reason",
                  "Saved",
                ].map(
                  (h) => (
                    <th
                      key={
                        h
                      }
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap"
                    >
                      {
                        t(h)
                      }
                    </th>
                  )
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {filteredEmployees.length ===
              0 ? (
                <tr>
                  <td
                    colSpan={
                      12
                    }
                    className="px-5 py-12 text-center text-sm text-gray-400"
                  >
                    {employees.length ===
                    0
                      ? t("No employees found in the database.")
                      : t("No employees assigned to this shift for today.")}
                  </td>
                </tr>
              ) : (
                filteredEmployees.map(
                  (
                    emp
                  ) => {
                    const entry =
                      getEntry(
                        emp.num
                      );

                    const status =
                      getStatus(
                        entry
                      );

                    //states  
                    const backupEmployee =
                    entry.backupEmpNum == null
                      ? undefined
                      : employees.find(
                          (item) =>
                            Number(item.empNumber) === Number(entry.backupEmpNum)
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
                      entry.periods?.length > 0
                        ? calcHoursFromPeriods(
                            entry.periods
                          )
                        : entry.workHours || "00:00";

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

                          {entry.absent && (
                            <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                              {t("Backup:")}{" "}
                              {backupEmployee
                                ? `${backupEmployee.FirstName} `
                                : entry.backupEmpNum != null
                                  ? t("Employee #{n}", { n: entry.backupEmpNum })
                                  : t("Not assigned")}
                            </p>
                          )}
                        </td>

                        {/* STATUS */}

                        <td className="px-4 py-3">
                          <Badge
                            size="sm"
                            color={badgeColor(
                              status
                            )}
                          >
                            {
                              badgeLabel(
                                status
                              )
                            }
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
                                  : t("No punch")}
                              </span>

                              <span className="text-[10px] text-gray-400">
                                {t("Face recognition")}
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
                                  : t("No punch")}
                              </span>

                              <span className="text-[10px] text-gray-400">
                                {t("Face recognition")}
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
                              lateMin >
                              0
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
                              otMin >
                              0
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
                            onChange={(
                              e
                            ) =>
                              updateEntry(
                                emp.num,
                                {
                                  consomation:
                                    e
                                      .target
                                      .value,
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
                            onChange={(
                              e
                            ) =>
                              updateEntry(
                                emp.num,
                                {
                                  penalty:
                                    e
                                      .target
                                      .value,
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
                                  e
                                    .target
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
                                ? t("Enter reason…")
                                : "—"
                            }
                            value={
                              entry.absentComment ||
                              ""
                            }
                            onChange={(
                              e
                            ) =>
                              updateEntry(
                                emp.num,
                                {
                                  absentComment:
                                    e
                                      .target
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
                              {t("Saving…")}
                            </span>
                          ) : entry._dirty ? (
                            <span className="text-xs text-amber-500">
                              {t("Unsaved")}
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
          {
            filteredEmployees.length
          }{" "}
          employee
          {filteredEmployees.length !==
          1
            ? "s"
            : ""}{" "}
          in this shift
        </div>
      </div>
      )}
    </>
  );
}