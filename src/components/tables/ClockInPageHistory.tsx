"use client";
import React, { useEffect, useMemo, useState, useRef} from "react";
import { ensureOk, friendlyError } from "@/lib/errors";
import { confirmDialog, toast } from "@/lib/notify";
import LoadError from "@/components/ui/feedback/LoadError";
import {
  upsertWorktime,
  getWorktimesByDate,
} from "./worktime.api";interface AttendanceLog {
  _id?: string;
  deviceUserId: string;
  timestamp: string;
  deviceLogId?: string;
  processed?: boolean;

  // Employee information returned by backend
  employeeNumber?: string | number;
  firstName?: string;
  lastName?: string;
}

interface GroupedAttendance {
  id: string;
  employeeNumber: string | number;
  firstName?: string;
  lastName?: string;
  date: string;
  clockIn: string;
  clockOut: string | null;
  logs: AttendanceLog[];
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

const PAGE_SIZE = 15;

function formatDateTime(timestamp: string) {
  const d = new Date(timestamp);

  if (Number.isNaN(d.getTime())) {
    return timestamp;
  }

  // Afficher le timestamp en heure algérienne (UTC+1).
  const algeriaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

  const algeriaTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Algiers",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);

  const [year, month, day] = algeriaDate.split("-");

  return `${day}/${month}/${year} ${algeriaTime}`;
}


function getMinutesBetween(
  clockIn: string,
  clockOut: string
) {
  const inDate = new Date(clockIn);
  const outDate = new Date(clockOut);

  if (
    Number.isNaN(inDate.getTime()) ||
    Number.isNaN(outDate.getTime())
  ) {
    return null;
  }

  let difference =
    (outDate.getTime() - inDate.getTime()) / 60000;

  // Overnight
  if (difference < 0) {
    difference += 24 * 60;
  }

  return difference;
}

function formatDate(timestamp: string) {
  const formatted = formatDateTime(timestamp);
  return formatted.split(" ")[0] ?? formatted;
}

function formatTime(timestamp: string | null) {
  if (!timestamp) {
    return "—";
  }

  const formatted = formatDateTime(timestamp);
  return formatted.split(" ")[1] ?? formatted;
}

function normalizeDeviceId(value: string) {
  return String(value)
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
}

function formatDateForInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function ClockInPageHistory() {
  const today = new Date();

  const [fromDate, setFromDate] = useState(
    formatDateForInput(
      new Date(today.getFullYear(), today.getMonth(), today.getDate() - 50)
    )
  );

 
const [savingPunch, setSavingPunch] = useState(false);
const [savingAddPunch, setSavingAddPunch] = useState(false);
// A ref blocks a second click immediately, before React re-renders.
const addPunchInFlight = useRef(false);
  const [toDate, setToDate] = useState(formatDateForInput(today));

  const [search, setSearch] = useState("");

  const [logs, setLogs] = useState<AttendanceLog[]>([]);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);

  const [selectedLogs, setSelectedLogs] = useState<Set<string>>(
    new Set()
  );

  const [showAddModal, setShowAddModal] = useState(false);

const [newPunch, setNewPunch] = useState({
  deviceUserId: "",
  timestamp: "",
  consomation: 0,
  penalty: 0,
  bonus: 0,
});

const [employees, setEmployees] = useState<any[]>([]);
const [loadingEmployees, setLoadingEmployees] = useState(false);

  const [deviceStatus, setDeviceStatus] = useState<{
    connected: boolean;
    name: string;
    ip?: string;
  } | null>(null);

  const [editingPunch, setEditingPunch] = useState<{
  logId: string | null;
  value: string;
  mode: "edit" | "add-clock-out";
  clockInLogId?: string;
  deviceUserId?: string;
  workDate?: string;
} | null>(null);

const [selectedEmployee, setSelectedEmployee] = useState("");
const [employeeQuery, setEmployeeQuery] = useState("");
const [showSuggestions, setShowSuggestions] = useState(false);
const searchBoxRef = useRef<HTMLDivElement>(null);
  // ---------------------------------------------------------
  // LOAD ATTENDANCE LOGS
  // ---------------------------------------------------------

  const loadLogs = async () => {
    try {
      setLoading(true);
      setError(null);

      const url =
        `${API_BASE_URL}/attendance/device-logs` +
        `?from=${encodeURIComponent(fromDate)}` +
        `&to=${encodeURIComponent(toDate)}`;

      const response = await fetch(url, {
        cache: "no-store",
      });

      await ensureOk(response);

      const data = await response.json();

      const receivedLogs = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
        ? data.data
        : [];

      setLogs(receivedLogs);
      setPage(1);
      setSelectedLogs(new Set());
    } catch (err) {
      console.error(err);

      setError(friendlyError(err, "Couldn't load the clock-in records"));

      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  // Load initially
  useEffect(() => {
  loadLogs();
}, [fromDate, toDate]);

  // ---------------------------------------------------------
  // GROUP LOGS BY EMPLOYEE + DATE
  // ---------------------------------------------------------

  // ---------------------------------------------------------
// GROUP LOGS BY EMPLOYEE + DATE, THEN CREATE PUNCH INTERVALS
// ---------------------------------------------------------

const groupedLogs = useMemo(() => {
  const groups: Record<string, AttendanceLog[]> = {};

  // First group all punches by employee + date
  logs.forEach((log) => {
    const deviceId = normalizeDeviceId(log.deviceUserId);

    // Use the date contained in the machine timestamp
    const date = log.timestamp.substring(0, 10);

    const key = `${deviceId}-${date}`;

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(log);
  });

  const result: GroupedAttendance[] = [];

  // ---------------------------------------------------------
  // CREATE INTERVALS
  //
  // Punches are paired chronologically:
  //
  // 08:00 → 08:07
  // 08:07 → 12:00
  // 12:00 → 12:10
  // 12:10 → 16:00
  //
  // Each pair becomes its own table row.
  // ---------------------------------------------------------

  Object.values(groups).forEach((dayLogs) => {
    const sorted = [...dayLogs].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() -
        new Date(b.timestamp).getTime()
    );

    for (let i = 0; i < sorted.length; i += 2) {
      const clockInLog = sorted[i];

      if (!clockInLog) {
        continue;
      }

      const clockOutLog = sorted[i + 1] ?? null;

      result.push({
        id:
          clockInLog._id ??
          `${clockInLog.deviceUserId}-${clockInLog.timestamp}-${i}`,

        employeeNumber:
          clockInLog.employeeNumber ??
          normalizeDeviceId(clockInLog.deviceUserId),

        firstName: clockInLog.firstName,
        lastName: clockInLog.lastName,

        date: clockInLog.timestamp.substring(0, 10),

        // First punch of this interval
        clockIn: clockInLog.timestamp,

        // Second punch of this interval
        // If there is no second punch, the interval is not validated.
        clockOut: clockOutLog
          ? clockOutLog.timestamp
          : null,

        // Only these two machine logs belong to this interval
        logs: clockOutLog
          ? [clockInLog, clockOutLog]
          : [clockInLog],
      });
    }
  });

  // Newest intervals first
  return result.sort(
    (a, b) =>
      new Date(b.clockIn).getTime() -
      new Date(a.clockIn).getTime()
  );
}, [logs]);


useEffect(() => {
  loadEmployees();
}, []);



  // ---------------------------------------------------------
  // SEARCH
  // ---------------------------------------------------------

  const getEmployeeLabel = (employee: any) =>
  `${employee.empNumber} — ${employee.LastName ?? employee.lastName ?? ""} ${
    employee.FirstName ?? employee.firstName ?? ""
  }`.trim();

const suggestions = useMemo(() => {
  const q = employeeQuery.toLowerCase().trim();

  if (!q) return employees.slice(0, 50);

  return employees
    .filter((employee) =>
      getEmployeeLabel(employee).toLowerCase().includes(q)
    )
    .slice(0, 50);
}, [employees, employeeQuery]);

useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (
      searchBoxRef.current &&
      !searchBoxRef.current.contains(event.target as Node)
    ) {
      setShowSuggestions(false);
    }
  };

  document.addEventListener("mousedown", handleClickOutside);
  return () => document.removeEventListener("mousedown", handleClickOutside);
}, []);

const filteredLogs = useMemo(() => {
  if (selectedEmployee) {
    return groupedLogs.filter(
      (log) =>
        normalizeDeviceId(String(log.employeeNumber)) === selectedEmployee
    );
  }

  const q = employeeQuery.toLowerCase().trim();
  if (!q) return groupedLogs;

  return groupedLogs.filter((log) =>
    `${log.employeeNumber} ${log.lastName ?? ""} ${log.firstName ?? ""}`
      .toLowerCase()
      .includes(q)
  );
}, [groupedLogs, selectedEmployee, employeeQuery]);

  // ---------------------------------------------------------
  // PAGINATION
  // ---------------------------------------------------------
const currentLogs = filteredLogs;

  // ---------------------------------------------------------
  // DEVICE STATUS
  // ---------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    const checkDeviceStatus = async () => {
      try {
        const response = await fetch(
          "http://localhost:3001/device/status",
          {
            cache: "no-store",
          }
        );

        const data = await response.json();

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

    const interval = setInterval(checkDeviceStatus, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // ---------------------------------------------------------
  // SELECT LOG
  // ---------------------------------------------------------

  const toggleSelected = (id: string) => {
    setSelectedLogs((previous) => {
      const next = new Set(previous);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  };

  const toggleAll = () => {
    if (currentLogs.length === 0) return;

    const allSelected = currentLogs.every((log) =>
      selectedLogs.has(log.id)
    );

    setSelectedLogs((previous) => {
      const next = new Set(previous);

      currentLogs.forEach((log) => {
        if (allSelected) {
          next.delete(log.id);
        } else {
          next.add(log.id);
        }
      });

      return next;
    });
  };

  // ---------------------------------------------------------
  // DELETE
  // ---------------------------------------------------------

 
const deleteSelected = async () => {
  if (selectedLogs.size === 0) {
    toast.warning("Select at least one clock-in record to delete.");
    return;
  }

  const confirmed = await confirmDialog({
    title: `Delete ${selectedLogs.size} clock-in record${selectedLogs.size === 1 ? "" : "s"}?`,
    message: "Their clock-in and clock-out times will be removed. This can't be undone.",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!confirmed) {
    return;
  }

  try {
    setError(null);
    setLoading(true);

    const errors: string[] = [];
    let deletedCount = 0;

    
for (const id of selectedLogs) {
  const group = groupedLogs.find((log) => log.id === id);

  if (!group) {
    errors.push(`Record ${id} was not found`);
    continue;
  }

  // A grouped row can contain a Clock In and a Clock Out.
  for (const rawLog of group.logs) {
    // Use the MongoDB document ID, NOT deviceLogId.
    const rawId = rawLog._id;

    if (!rawId) {
      errors.push(`A record for ${rawLog.deviceUserId} at ${rawLog.timestamp} has no ID`);
      continue;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/attendance/device-logs/${encodeURIComponent(rawId)}`,
        {
          method: "DELETE",
          cache: "no-store",
        }
      );

      await ensureOk(response);

      deletedCount++;
    } catch (err) {
      console.error("Failed to delete attendance log:", rawId, err);

      errors.push(friendlyError(err));
    }
  }
}


    // Always reload from the database to reflect its actual state.
    await loadLogs();

    if (errors.length > 0) {
      toast.error(
        `${deletedCount} record(s) deleted, ${errors.length} couldn't be deleted. ${errors[0]}`
      );
    } else {
      setSelectedLogs(new Set());
      toast.success(`${selectedLogs.size} clock-in record${selectedLogs.size === 1 ? "" : "s"} deleted.`);
    }
  } catch (err) {
    console.error("Deletion error:", err);

    toast.error(friendlyError(err, "Couldn't delete the records"));
  } finally {
    setLoading(false);
  }
};


  const loadEmployees = async () => {
  try {
    setLoadingEmployees(true);

    const response = await fetch(
      `${API_BASE_URL}/employees`,
      {
        cache: "no-store",
      }
    );

    await ensureOk(response);

    const data = await response.json();

    const employeeList = Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
      ? data.data
      : [];

    setEmployees(employeeList);
  } catch (err) {
    console.error("Error loading employees:", err);
    setEmployees([]);

    setError(friendlyError(err, "Couldn't load the employees"));
  } finally {
    setLoadingEmployees(false);
  }
};
  // ---------------------------------------------------------
  // ADD PUNCH
  // ---------------------------------------------------------
const addPunch = async () => {
  if (!newPunch.deviceUserId || !newPunch.timestamp) {
    toast.warning("Choose an employee and enter the date and time.");
    return;
  }

  // Prevent duplicate POSTs if the user clicks more than once quickly.
  if (addPunchInFlight.current) return;
  addPunchInFlight.current = true;
  setSavingAddPunch(true);

  try {
    const employeeNumber = normalizeDeviceId(newPunch.deviceUserId);

const workDate = newPunch.timestamp.substring(0, 10);

// datetime-local contient l'heure locale saisie dans le formulaire.
// La conversion en ISO produit un timestamp UTC terminé par Z.
const timestamp = new Date(newPunch.timestamp);

if (Number.isNaN(timestamp.getTime())) {
  toast.warning("The date and time aren't valid.");
  return;
}


    // ---------------------------------------------------------
    // 1. CREATE THE ATTENDANCE / MACHINE PUNCH
    // ---------------------------------------------------------

    const response = await fetch(
      `${API_BASE_URL}/attendance/device-logs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deviceUserId: employeeNumber,
          timestamp: timestamp.toISOString(),
          processed: false,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok || result?.status === "error") {
      throw new Error(
        result?.message || "The clock-in couldn't be saved"
      );
    }

    console.log("Punch created:", result);

    // ---------------------------------------------------------
    // 2. RELOAD ALL PUNCHES FOR THIS DATE
    // ---------------------------------------------------------

    const logsResponse = await fetch(
      `${API_BASE_URL}/attendance/device-logs` +
        `?from=${encodeURIComponent(workDate)}` +
        `&to=${encodeURIComponent(workDate)}`,
      {
        cache: "no-store",
      }
    );

    await ensureOk(logsResponse);

    const logsData = await logsResponse.json();

    const dateLogs: AttendanceLog[] = Array.isArray(logsData)
      ? logsData
      : Array.isArray(logsData?.data)
      ? logsData.data
      : [];

    // ---------------------------------------------------------
    // 3. GET ALL PUNCHES FOR THIS EMPLOYEE + DATE
    // ---------------------------------------------------------

    const employeeLogs = dateLogs
      .filter(
        (log) =>
          normalizeDeviceId(log.deviceUserId) ===
            employeeNumber &&
          log.timestamp.substring(0, 10) === workDate
      )
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() -
          new Date(b.timestamp).getTime()
      );

    if (employeeLogs.length === 0) {
      throw new Error(
        "The clock-in was saved, but no records were found for this employee."
      );
    }

    // First punch = clock in
    // Last punch = clock out
    const clockInLog = employeeLogs[0];

    const clockOutLog =
      employeeLogs.length > 1
        ? employeeLogs[employeeLogs.length - 1]
        : null;

    const clockIn = formatTime(clockInLog.timestamp);
    const clockOut = clockOutLog
      ? formatTime(clockOutLog.timestamp)
      : "00:00";

    console.log("Manual punch worktime:", {
      employeeNumber,
      workDate,
      clockIn,
      clockOut,
    });

    // ---------------------------------------------------------
    // 4. FIND THE EMPLOYEE
    // ---------------------------------------------------------

    const employeesResponse = await fetch(
      `${API_BASE_URL}/employees`,
      {
        cache: "no-store",
      }
    );

    await ensureOk(employeesResponse);

    const employeesData = await employeesResponse.json();

    const employees = Array.isArray(employeesData)
      ? employeesData
      : Array.isArray(employeesData?.data)
      ? employeesData.data
      : [];

    const employee = employees.find(
      (emp: any) =>
        normalizeDeviceId(String(emp.empNumber)) ===
        employeeNumber
    );

    if (!employee) {
      throw new Error(
        `No employee has the number ${employeeNumber}.`
      );
    }

    // ---------------------------------------------------------
    // 5. GET SHIFTS
    // ---------------------------------------------------------

    const shiftsResponse = await fetch(
      `${API_BASE_URL}/shifts`,
      {
        cache: "no-store",
      }
    );

    await ensureOk(shiftsResponse);

    const shiftsData = await shiftsResponse.json();

    const shifts = Array.isArray(shiftsData)
      ? shiftsData
      : Array.isArray(shiftsData?.data)
      ? shiftsData.data
      : [];

    // ---------------------------------------------------------
    // 6. GET PLANNING FOR THIS EMPLOYEE + DATE
    // ---------------------------------------------------------

    const planningResponse = await fetch(
      `${API_BASE_URL}/planning?date=${encodeURIComponent(
        workDate
      )}`,
      {
        cache: "no-store",
      }
    );

    await ensureOk(planningResponse);

    const planningData = await planningResponse.json();

    const planning = Array.isArray(planningData)
      ? planningData
      : Array.isArray(planningData?.data)
      ? planningData.data
      : [];

    const employeePlanning = planning.find((p: any) => {
      const planningEmployeeId =
        typeof p.empId === "object"
          ? p.empId?._id
          : p.empId;

      return (
        String(planningEmployeeId) ===
        String(employee._id)
      );
    });

    // Warn only when the employee has no planning entry for this date.
    if (!employeePlanning) {
      toast.warning(
        `Employee ${employeeNumber} isn't in the planning on ${workDate}. The clock-in is saved, but lateness and overtime can't be calculated.`
      );
    }

    // ---------------------------------------------------------
    // 7. FIND THE ASSIGNED SHIFT
    // ---------------------------------------------------------

    let shift: any = null;

    if (employeePlanning) {
      const planningShiftId =
        typeof employeePlanning.shiftId === "object"
          ? employeePlanning.shiftId?._id
          : employeePlanning.shiftId;

      shift = shifts.find(
        (s: any) =>
          String(s._id) === String(planningShiftId) ||
          String(s.shift_id) === String(planningShiftId)
      );
    }

const shiftId = shift
  ? String(shift._id ?? shift.shift_id)
  : null;

const shiftStart = shift
  ? String(shift.start_time ?? "00:00").slice(0, 5)
  : "00:00";

const shiftEnd = shift
  ? String(shift.end_time ?? "00:00").slice(0, 5)
  : "00:00";

// L'employé peut travailler même sans planning ni shift.
// Dans ce cas, on conservera le retard et l'overtime à 0.


    // ---------------------------------------------------------
    // 8. CALCULATE WORK HOURS
    // ---------------------------------------------------------

    let workMinutes = 0;

    if (
      clockIn !== "—" &&
      clockOut !== "00:00" &&
      clockOut !== "—"
    ) {
      const [inH, inM] = clockIn
        .slice(0, 5)
        .split(":")
        .map(Number);

      const [outH, outM] = clockOut
        .slice(0, 5)
        .split(":")
        .map(Number);

      let inMinutes = inH * 60 + inM;
      let outMinutes = outH * 60 + outM;

      if (outMinutes < inMinutes) {
        outMinutes += 1440;
      }

      workMinutes = Math.max(
        0,
        outMinutes - inMinutes
      );
    }

    const workHours =
      `${String(Math.floor(workMinutes / 60)).padStart(
        2,
        "0"
      )}:${String(workMinutes % 60).padStart(2, "0")}`;

    // ---------------------------------------------------------
    // 9. CALCULATE DELAY
    // ---------------------------------------------------------

   
let lateMinutes = 0;

if (shift && clockIn !== "—") {
  const [inH, inM] = clockIn
    .slice(0, 5)
    .split(":")
    .map(Number);

  const [startH, startM] = shiftStart
    .split(":")
    .map(Number);

  lateMinutes = Math.max(
    0,
    inH * 60 + inM - (startH * 60 + startM)
  );
}


    // ---------------------------------------------------------
    // 10. CALCULATE OVERTIME
    // ---------------------------------------------------------

  
let overtimeMinutes = 0;

if (shift && clockOut !== "00:00" && clockOut !== "—") {
  const [outH, outM] = clockOut
    .slice(0, 5)
    .split(":")
    .map(Number);

  const [startH, startM] = shiftStart
    .split(":")
    .map(Number);

  const [endH, endM] = shiftEnd
    .split(":")
    .map(Number);

  let actualOut = outH * 60 + outM;
  let expectedEnd = endH * 60 + endM;

  // Shift qui se termine le lendemain
  if (expectedEnd < startH * 60 + startM) {
    expectedEnd += 1440;

    if (actualOut < startH * 60 + startM) {
      actualOut += 1440;
    }
  }

  overtimeMinutes = Math.max(
    0,
    actualOut - expectedEnd
  );
}


    // ---------------------------------------------------------
    // 11. CREATE / UPDATE WORKTIME
    // ---------------------------------------------------------

    const worktimePayload = {
      // Use the employee internal numeric ID for worktime.emp_id.
      emp_id: Number(employee.num ?? employee.empNumber),

      // IMPORTANT:
      // Mongo shift IDs are strings/ObjectIds.
      shift_id: shiftId,
      work_date: workDate,

      clock_in: clockIn,
      clock_out: clockOut,

      late_minutes: String(lateMinutes),
      overtime_minutes: String(overtimeMinutes),

      work_hours: workHours,

      consomation: newPunch.consomation,
      penalty: newPunch.penalty,
      bonus: newPunch.bonus,

      absent: false,
      absent_comment: "",
    };

    console.log(
      "Saving manual punch to worktime:",
      worktimePayload
    );

    // shift_id can be null for an employee who was not scheduled.
    // The backend and WorktimePayload type must also allow null.
    await upsertWorktime(
      worktimePayload as any,
      null
    );

    // ---------------------------------------------------------
    // 12. RELOAD UI
    // ---------------------------------------------------------

    setShowAddModal(false);

    setNewPunch({
      deviceUserId: "",
      timestamp: "",
      consomation: 0,
      penalty: 0,
      bonus: 0,
    });

    await loadLogs();

    toast.success(
      clockOut !== "00:00"
        ? "Clock-in added. Worked hours updated with the clock-in and clock-out."
        : "Clock-in added. Worked hours will be calculated after the clock-out."
    );
  } catch (err) {
    console.error(
      "Error adding punch:",
      err
    );

    toast.error(friendlyError(err, "Couldn't add the clock-in"));
  } finally {
    addPunchInFlight.current = false;
    setSavingAddPunch(false);
  }
};





const saveEditedPunch = async () => {
  if (!editingPunch) return;

  const { logId, value, mode } = editingPunch;

  if (!value) {
    toast.warning("Enter a time.");
    return;
  }

  // For an existing punch, use its own log.
  // For a missing clock-out, use the existing clock-in log.
  const rawLog =
    mode === "edit"
      ? logs.find((item) => item._id === logId)
      : logs.find(
          (item) => item._id === editingPunch.clockInLogId
        );

  if (!rawLog?._id) {
    toast.error("This clock-in record no longer exists. Refresh the page and try again.");
    return;
  }

  const workDate =
    editingPunch.workDate ?? rawLog.timestamp.substring(0, 10);

  const employeeNumber = normalizeDeviceId(
    editingPunch.deviceUserId ?? rawLog.deviceUserId
  );

const timestamp = new Date(
  `${workDate}T${value}:00`
).toISOString();
  try {
    setSavingPunch(true);
    setError(null);

    // 1. Edit an existing punch OR create the missing clock-out.
    const response = await fetch(
      mode === "edit"
        ? `${API_BASE_URL}/attendance/device-logs/${encodeURIComponent(logId!)}`
        : `${API_BASE_URL}/attendance/device-logs`,
      {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "edit"
            ? { timestamp }
            : {
                deviceUserId: employeeNumber,
                timestamp,
                processed: false,
              }
        ),
      }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok || result?.status === "error") {
      throw new Error(
        result?.message ||
          (mode === "edit"
            ? "The clock-in couldn't be changed"
            : "The clock-out couldn't be added")
      );
    }

    // 2. Reload raw logs for the employee and date.
    const logsResponse = await fetch(
      `${API_BASE_URL}/attendance/device-logs` +
        `?from=${encodeURIComponent(workDate)}` +
        `&to=${encodeURIComponent(workDate)}`,
      { cache: "no-store" }
    );

    await ensureOk(logsResponse);

    const logsData = await logsResponse.json();

    const dateLogs: AttendanceLog[] = Array.isArray(logsData)
      ? logsData
      : Array.isArray(logsData?.data)
      ? logsData.data
      : [];

    const employeeLogs = dateLogs
      .filter(
        (item) =>
          normalizeDeviceId(item.deviceUserId) === employeeNumber &&
          item.timestamp.substring(0, 10) === workDate
      )
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() -
          new Date(b.timestamp).getTime()
      );

    if (employeeLogs.length === 0) {
      throw new Error("No records were found to recalculate the worked hours.");
    }

    // 3. Calculate the day's first Clock In and last Clock Out.
    const clockIn = formatTime(employeeLogs[0].timestamp);

    const clockOut =
      employeeLogs.length > 1
        ? formatTime(employeeLogs[employeeLogs.length - 1].timestamp)
        : "00:00";

    // 4. Fetch the employee.
    const employeesResponse = await fetch(`${API_BASE_URL}/employees`, {
      cache: "no-store",
    });

    await ensureOk(employeesResponse);

    const employeesData = await employeesResponse.json();

    const employeeList = Array.isArray(employeesData)
      ? employeesData
      : Array.isArray(employeesData?.data)
      ? employeesData.data
      : [];

    const employee = employeeList.find(
      (emp: any) =>
        normalizeDeviceId(String(emp.empNumber)) === employeeNumber
    );

    if (!employee) {
      throw new Error(`No employee has the number ${employeeNumber}.`);
    }

    // 5. Fetch shifts.
    const shiftsResponse = await fetch(`${API_BASE_URL}/shifts`, {
      cache: "no-store",
    });

    await ensureOk(shiftsResponse);

    const shiftsData = await shiftsResponse.json();

    const shifts = Array.isArray(shiftsData)
      ? shiftsData
      : Array.isArray(shiftsData?.data)
      ? shiftsData.data
      : [];

    // 6. Fetch the employee's planning.
    const planningResponse = await fetch(
      `${API_BASE_URL}/planning?date=${encodeURIComponent(workDate)}`,
      { cache: "no-store" }
    );

    await ensureOk(planningResponse);

    const planningData = await planningResponse.json();

    const planningList = Array.isArray(planningData)
      ? planningData
      : Array.isArray(planningData?.data)
      ? planningData.data
      : [];

    const employeePlanning = planningList.find((p: any) => {
      const planningEmployeeId =
        typeof p.empId === "object" ? p.empId?._id : p.empId;

      return String(planningEmployeeId) === String(employee._id);
    });

    // A missing planning entry is different from a missing shift.
    // Show the warning only when the employee is not scheduled.
    if (!employeePlanning) {
      toast.warning(
        `Employee ${employeeNumber} isn't in the planning on ${workDate}. The clock-in is saved, but lateness and overtime can't be calculated.`
      );
    }

    const planningShiftId = employeePlanning
      ? typeof employeePlanning.shiftId === "object"
        ? employeePlanning.shiftId?._id
        : employeePlanning.shiftId
      : null;

    const shift = employeePlanning
      ? shifts.find(
          (s: any) =>
            String(s._id) === String(planningShiftId) ||
            String(s.shift_id) === String(planningShiftId)
        )
      : null;

    const shiftId = shift
      ? String(shift._id ?? shift.shift_id)
      : null;

    const shiftStart = shift
      ? String(shift.start_time ?? "00:00").slice(0, 5)
      : "00:00";

    const shiftEnd = shift
      ? String(shift.end_time ?? "00:00").slice(0, 5)
      : "00:00";

    // 7. Recalculate work hours, including overnight shifts.
    let workMinutes = 0;

    if (clockOut !== "00:00" && clockOut !== "—") {
      const [inH, inM] = clockIn.slice(0, 5).split(":").map(Number);
      const [outH, outM] = clockOut.slice(0, 5).split(":").map(Number);

      const inMinutes = inH * 60 + inM;
      let outMinutes = outH * 60 + outM;

      if (outMinutes < inMinutes) {
        outMinutes += 1440;
      }

      workMinutes = Math.max(0, outMinutes - inMinutes);
    }

    const workHours =
      `${String(Math.floor(workMinutes / 60)).padStart(2, "0")}:` +
      `${String(workMinutes % 60).padStart(2, "0")}`;

    // 8. Recalculate delay.
    let lateMinutes = 0;

if (shift && clockIn !== "—") {
  const [inH, inM] = clockIn
    .slice(0, 5)
    .split(":")
    .map(Number);

  const [startH, startM] = shiftStart
    .split(":")
    .map(Number);

  lateMinutes = Math.max(
    0,
    inH * 60 + inM - (startH * 60 + startM)
  );
}
    // 9. Recalculate overtime.
   let overtimeMinutes = 0;

if (shift && clockOut !== "00:00" && clockOut !== "—") {
  const [outH, outM] = clockOut
    .slice(0, 5)
    .split(":")
    .map(Number);

  const [startH, startM] = shiftStart
    .split(":")
    .map(Number);

  const [endH, endM] = shiftEnd
    .split(":")
    .map(Number);

  let actualOut = outH * 60 + outM;
  let expectedEnd = endH * 60 + endM;

  // Gérer les shifts qui se terminent le lendemain
  if (expectedEnd < startH * 60 + startM) {
    expectedEnd += 1440;

    if (actualOut < startH * 60 + startM) {
      actualOut += 1440;
    }
  }

  overtimeMinutes = Math.max(
    0,
    actualOut - expectedEnd
  );
}

    // 10. Update the worktime while preserving payroll fields.
    const existingWorktimes = await getWorktimesByDate(workDate);

    const existingWorktime = existingWorktimes.find(
      (item) =>
        Number(item.emp_id) ===
        Number(employee.num ?? employee.empNumber)
    );

    const worktimePayload = {
      emp_id: Number(employee.num ?? employee.empNumber),
shift_id: shiftId,
      work_date: workDate,
      clock_in: clockIn,
      clock_out: clockOut,
      work_hours: workHours,
      late_minutes: String(lateMinutes),
      overtime_minutes: String(overtimeMinutes),

      consomation: existingWorktime?.consomation ?? 0,
      penalty: existingWorktime?.penalty ?? 0,
      bonus: existingWorktime?.bonus ?? 0,
      absent: existingWorktime?.absent ?? false,
      absent_comment: existingWorktime?.absent_comment ?? "",
    };

    // shift_id can be null for an employee who was not scheduled.
    // The backend and WorktimePayload type must also allow null.
    await upsertWorktime(
      worktimePayload as any,
      existingWorktime?._id ?? null
    );

    // 11. Refresh the history.
    setEditingPunch(null);
    await loadLogs();

    toast.success(
      `Worked ${workHours}, late ${lateMinutes} min, overtime ${overtimeMinutes} min.` +
        (!employeePlanning ? " This employee wasn't in the planning." : ""),
      mode === "edit" ? "Clock-in updated" : "Clock-out added"
    );
  } catch (err) {
    console.error("Error updating punch and worktime:", err);

    toast.error(friendlyError(err, "Couldn't update the clock-in"));
  } finally {
    setSavingPunch(false);
  }
};

  // ---------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------

  return (
    <div className="min-h-screen bg-white p-5">

      {/* HEADER */}
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-700">
          Clock-in history
        </h1>
      </div>

      {/* FILTER BAR */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">

       {/* FROM */}
<div>
  <input
    type="date"
    value={fromDate}
    max={toDate}
    onChange={(e) => setFromDate(e.target.value)}
    onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
    className="h-9 cursor-pointer rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-blue-400"
  />
</div>

<span className="text-gray-500">→</span>

{/* TO */}
<div>
  <input
    type="date"
    value={toDate}
    min={fromDate}
    onChange={(e) => setToDate(e.target.value)}
    onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
    className="h-9 cursor-pointer rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-blue-400"
  />
</div>

        {/* EMPLOYEE FILTER */}
{/* EMPLOYEE SEARCH WITH SUGGESTIONS */}
<div className="relative ml-2" ref={searchBoxRef}>
  <div className="flex h-9">
    <input
      type="text"
      placeholder="Search for an employee…"
      value={employeeQuery}
      onChange={(e) => {
        setEmployeeQuery(e.target.value);
        setSelectedEmployee("");
        setShowSuggestions(true);
      }}
      onFocus={() => setShowSuggestions(true)}
      className="w-64 rounded-l-md border border-gray-300 px-3 text-sm outline-none focus:border-blue-400"
    />

    <button
      type="button"
      onClick={() => {
        setEmployeeQuery("");
        setSelectedEmployee("");
        setShowSuggestions(false);
      }}
      title="Effacer"
      className="rounded-r-md border border-l-0 border-gray-300 bg-gray-100 px-3 text-sm text-gray-600 hover:bg-gray-200"
    >
      ✕
    </button>
  </div>

  {showSuggestions && (
    <ul className="absolute left-0 top-10 z-30 max-h-64 w-72 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
      {loadingEmployees ? (
        <li className="px-3 py-2 text-sm text-gray-400">Loading…</li>
      ) : suggestions.length === 0 ? (
        <li className="px-3 py-2 text-sm text-gray-400">No employee found</li>
      ) : (
        suggestions.map((employee) => (
          <li
            key={employee._id ?? employee.empNumber}
            onClick={() => {
              setSelectedEmployee(
                normalizeDeviceId(String(employee.empNumber))
              );
              setEmployeeQuery(getEmployeeLabel(employee));
              setShowSuggestions(false);
            }}
            className="cursor-pointer px-3 py-2 text-sm text-gray-700 hover:bg-blue-50"
          >
            {getEmployeeLabel(employee)}
          </li>
        ))
      )}
    </ul>
  )}
</div>
</div>
      {/* DEVICE STATUS */}
      {deviceStatus && (
        <div className="mb-3 text-xs text-gray-500">
          Machine:{" "}
          <span
            className={
              deviceStatus.connected
                ? "font-medium text-green-600"
                : "font-medium text-red-500"
            }
          >
            {deviceStatus.connected
              ? "Connected"
              : "Disconnected"}
          </span>
        </div>
      )}

      {/* ACTION BAR */}
      <div className="mb-4 flex gap-2">

        <button
onClick={() => {
  setShowAddModal(true);
  loadEmployees();
}}          className="
            rounded-md
            bg-[#c98573]
            px-5
            py-2
            text-sm
            font-medium
            text-white
            shadow-sm
            hover:bg-[#b87565]
          "
        >
          Add clock-in
        </button>

        <button
          onClick={deleteSelected}
          className="
            rounded-md
            bg-[#c98573]
            px-5
            py-2
            text-sm
            font-medium
            text-white
            shadow-sm
            hover:bg-[#b87565]
          "
        >
          🗑 Delete
        </button>

      </div>

      {/* ERROR */}
      {error && (
        <LoadError
          className="mb-4"
          title="Something didn't load"
          message={error}
          onRetry={() => {
            setError(null);
            loadLogs();
            loadEmployees();
          }}
        />
      )}

      {/* TABLE */}
           {/* TABLE */}
      <div className="overflow-hidden rounded-md border border-gray-200">

        <div className="max-h-[70vh] overflow-auto">

          <table className="w-full min-w-[1000px] border-collapse">

            <thead className="sticky top-0 z-10">
              <tr className="bg-[#e5edf7] text-gray-600">
                {/* SELECT */}
                <th className="w-10 border-b border-gray-200 px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={
                      currentLogs.length > 0 &&
                      currentLogs.every((log) =>
                        selectedLogs.has(log.id)
                      )
                    }
                    onChange={toggleAll}
                  />
                </th>

                {/* EMPLOYEE NUMBER */}
                <th className="border-b border-gray-200 px-4 py-2 text-left text-xs font-semibold">
                  Number
                </th>

                {/* LAST NAME */}
                <th className="border-b border-gray-200 px-4 py-2 text-left text-xs font-semibold">
                  Last name
                </th>

                {/* FIRST NAME */}
                <th className="border-b border-gray-200 px-4 py-2 text-left text-xs font-semibold">
                  First name
                </th>

                {/* DATE */}
                <th className="border-b border-gray-200 px-4 py-2 text-left text-xs font-semibold">
                  Date
                </th>

                {/* CLOCK IN */}
                <th className="border-b border-gray-200 px-4 py-2 text-left text-xs font-semibold">
                  Clock In
                </th>

                {/* CLOCK OUT */}
                <th className="border-b border-gray-200 px-4 py-2 text-left text-xs font-semibold">
                  Clock Out
                </th>

                {/* STATUS */}
                <th className="border-b border-gray-200 px-4 py-2 text-left text-xs font-semibold">
                  Status
                </th>

              </tr>
            </thead>

            <tbody>

              {loading ? (

                <tr>
                  <td
                    colSpan={8}
                    className="py-10 text-center text-sm text-gray-400"
                  >
                    Loading clock-in records…
                  </td>
                </tr>

              ) : currentLogs.length === 0 ? (

                <tr>
                  <td
                    colSpan={8}
                    className="py-10 text-center text-sm text-gray-400"
                  >
                    No clock-in records in this period.
                  </td>
                </tr>

              ) : (

                currentLogs.map((log, index) => {

                  return (
                    <tr
                      key={log.id}
                      className={`
                        ${
                          index % 2 === 0
                            ? "bg-white"
                            : "bg-gray-50/50"
                        }
                        hover:bg-blue-50
                      `}
                    >

                      {/* SELECT */}
                      <td className="border-b border-gray-100 px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedLogs.has(log.id)}
                          onChange={() =>
                            toggleSelected(log.id)
                          }
                        />
                      </td>

                      {/* EMPLOYEE NUMBER */}
                      <td className="border-b border-gray-100 px-4 py-2 text-sm text-gray-700">
                        {log.employeeNumber}
                      </td>

                      {/* LAST NAME */}
                      <td className="border-b border-gray-100 px-4 py-2 text-sm text-gray-700">
                        {log.lastName ?? "—"}
                      </td>

                      {/* FIRST NAME */}
                      <td className="border-b border-gray-100 px-4 py-2 text-sm text-gray-700">
                        {log.firstName ?? "—"}
                      </td>

                      {/* DATE */}
                      <td className="border-b border-gray-100 px-4 py-2 text-sm text-gray-700">
                        {formatDate(log.clockIn)}
                      </td>

                      {/* CLOCK IN */}
                     <td className="border-b border-gray-100 px-4 py-2 text-sm font-medium text-gray-700">
  {editingPunch?.logId === log.logs[0]?._id ? (
    <div className="flex items-center gap-1">
      
<input
  type="time"
  value={editingPunch?.value ?? ""}
  disabled={savingPunch}
  onChange={(e) =>
    setEditingPunch((prev) =>
      prev ? { ...prev, value: e.target.value } : prev
    )
  }
  className="w-28 rounded border border-gray-300 px-2 py-1 text-xs"
/>


      <button
        onClick={saveEditedPunch}
        disabled={savingPunch}
        className="text-xs text-green-700 hover:underline"
      >
        {savingPunch ? "..." : "✓"}
      </button>

      <button
        onClick={() => setEditingPunch(null)}
        disabled={savingPunch}
        className="text-xs text-red-600 hover:underline"
      >
        ✕
      </button>
    </div>
  ) : (
    <span
      onDoubleClick={() => {
        const rawLog = log.logs[0];

        if (!rawLog?._id) return;

        setEditingPunch({
  logId: rawLog._id!,
  value: rawLog.timestamp.substring(11, 16),
  mode: "edit",
});
      }}
      title="Double-click to edit"
      className="inline-flex cursor-pointer rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-700 hover:ring-2 hover:ring-green-300"
    >
      {formatTime(log.clockIn)}
    </span>
  )}
</td>

                      {/* CLOCK OUT */}
                     
<td className="border-b border-gray-100 px-4 py-2 text-sm font-medium text-gray-700">
  {editingPunch?.mode === "add-clock-out" &&
  editingPunch.clockInLogId === log.logs[0]?._id ? (
    <div className="flex items-center gap-1">
      <input
        type="time"
        value={editingPunch.value}
        disabled={savingPunch}
        onChange={(e) =>
          setEditingPunch((prev) =>
            prev ? { ...prev, value: e.target.value } : prev
          )
        }
        className="w-28 rounded border border-gray-300 px-2 py-1 text-xs"
      />

      <button
        onClick={saveEditedPunch}
        disabled={savingPunch}
        className="text-xs text-green-700 hover:underline"
      >
        {savingPunch ? "..." : "✓"}
      </button>

      <button
        onClick={() => setEditingPunch(null)}
        disabled={savingPunch}
        className="text-xs text-red-600 hover:underline"
      >
        ✕
      </button>
    </div>
  ) : log.clockOut && log.logs[1] ? (
    editingPunch?.mode === "edit" &&
    editingPunch.logId === log.logs[1]._id ? (
      <div className="flex items-center gap-1">
        <input
          type="time"
          value={editingPunch.value}
          disabled={savingPunch}
          onChange={(e) =>
            setEditingPunch((prev) =>
              prev ? { ...prev, value: e.target.value } : prev
            )
          }
          className="w-28 rounded border border-gray-300 px-2 py-1 text-xs"
        />

        <button
          onClick={saveEditedPunch}
          disabled={savingPunch}
          className="text-xs text-green-700 hover:underline"
        >
          {savingPunch ? "..." : "✓"}
        </button>

        <button
          onClick={() => setEditingPunch(null)}
          disabled={savingPunch}
          className="text-xs text-red-600 hover:underline"
        >
          ✕
        </button>
      </div>
    ) : (
      <span
        onDoubleClick={() => {
          const rawLog = log.logs[1];
          if (!rawLog?._id) return;

          setEditingPunch({
            logId: rawLog._id,
            value: rawLog.timestamp.substring(11, 16),
            mode: "edit",
          });
        }}
        title="Double-click to edit"
        className="inline-flex cursor-pointer rounded-md bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 hover:ring-2 hover:ring-blue-300"
      >
        {formatTime(log.clockOut)}
      </span>
    )
  ) : (
    <span
      onDoubleClick={() => {
        const clockInLog = log.logs[0];
        if (!clockInLog?._id) return;

        setEditingPunch({
          logId: null,
          value: "",
          mode: "add-clock-out",
          clockInLogId: clockInLog._id,
          deviceUserId: normalizeDeviceId(clockInLog.deviceUserId),
          workDate: log.date,
        });
      }}
      title="Double-click to add a clock-out"
      className="inline-flex cursor-pointer rounded-md border border-dashed border-orange-300 px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 hover:ring-2 hover:ring-orange-200"
    >
      —
    </span>
  )}
</td>

 {/* STATUS */}
<td className="border-b border-gray-100 px-4 py-2">
  {!log.clockOut ? (
    <span
      className="
        inline-flex
        rounded-md
        bg-orange-100
        px-2
        py-1
        text-xs
        font-medium
        text-orange-700
      "
    >
      Not validated
    </span>
  ) : (() => {
      const minutes = getMinutesBetween(
        log.clockIn,
        log.clockOut
      );

      if (minutes !== null && minutes < 15) {
        return (
          <span
            className="
              inline-flex
              rounded-md
              bg-yellow-100
              px-2
              py-1
              text-xs
              font-medium
              text-yellow-700
            "
          >
            Pause
          </span>
        );
      }

      return (
        <span
          className="
            inline-flex
            rounded-md
            bg-green-100
            px-2
            py-1
            text-xs
            font-medium
            text-green-700
          "
        >
          Validated
        </span>
      );
    })()}
</td>

                    </tr>
                  );
                })

              )}

            </tbody>

          </table>

        </div>

      </div>

      

      {/* ADD MODAL */}
      {showAddModal && (

        <div
          className="
            fixed
            inset-0
            z-50
            flex
            items-center
            justify-center
            bg-black/40
          "
        >

          <div
            className="
              w-[420px]
              rounded-xl
              bg-white
              p-6
              shadow-2xl
            "
          >

            <div className="mb-5 flex items-center justify-between">

              <h2 className="text-lg font-semibold text-gray-800">
                Add a clock-in
              </h2>

              <button
                onClick={() => setShowAddModal(false)}
                disabled={savingAddPunch}
                className="text-xl text-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ×
              </button>

            </div>

            <div className="space-y-4">

              {/* EMPLOYEE NUMBER */}
              {/* EMPLOYEE */}
<div>
  <label className="mb-1 block text-sm font-medium text-gray-600">
    Employee
  </label>

  <select
    value={newPunch.deviceUserId}
    onChange={(e) =>
      setNewPunch((p) => ({
        ...p,
        deviceUserId: e.target.value,
      }))
    }
    disabled={loadingEmployees}
    className="
      w-full
      rounded-lg
      border
      border-gray-300
      bg-white
      px-3
      py-2
      text-sm
      text-gray-700
      outline-none
      focus:border-blue-500
      disabled:bg-gray-100
    "
  >
    <option value="">
      {loadingEmployees
        ? "Loading employees…"
        : "Select an employee"}
    </option>

    {employees.map((employee) => (
      <option
        key={employee._id ?? employee.num ?? employee.empNumber}
        value={normalizeDeviceId(String(employee.empNumber))}
      >
        {employee.empNumber} — {employee.LastName ?? employee.lastName ?? ""}{" "}
        {employee.FirstName ?? employee.firstName ?? ""}
      </option>
    ))}
  </select>
</div>

              {/* DATE/TIME */}
              <div>

                <label className="mb-1 block text-sm font-medium text-gray-600">
                  Date and time
                </label>

                <input
                  type="datetime-local"
                  value={newPunch.timestamp}
                  onChange={(e) =>
                    setNewPunch((p) => ({
                      ...p,
                      timestamp: e.target.value,
                    }))
                  }
                  className="
                    w-full
                    rounded-lg
                    border
                    border-gray-300
                    px-3
                    py-2
                    text-sm
                    outline-none
                    focus:border-blue-500
                  "
                />

              </div>

              {/* CONSOMMATION */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">
                  Consumption
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={newPunch.consomation}
                  onChange={(e) =>
                    setNewPunch((p) => ({
                      ...p,
                      consomation: Number(e.target.value),
                    }))
                  }
                  className="
                    w-full rounded-lg border border-gray-300
                    px-3 py-2 text-sm outline-none
                    focus:border-blue-500
                  "
                />
              </div>

              {/* PENALTY */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">
                  Penalty
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={newPunch.penalty}
                  onChange={(e) =>
                    setNewPunch((p) => ({
                      ...p,
                      penalty: Number(e.target.value),
                    }))
                  }
                  className="
                    w-full rounded-lg border border-gray-300
                    px-3 py-2 text-sm outline-none
                    focus:border-blue-500
                  "
                />
              </div>

              {/* BONUS */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">
                  Bonus
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={newPunch.bonus}
                  onChange={(e) =>
                    setNewPunch((p) => ({
                      ...p,
                      bonus: Number(e.target.value),
                    }))
                  }
                  className="
                    w-full rounded-lg border border-gray-300
                    px-3 py-2 text-sm outline-none
                    focus:border-blue-500
                  "
                />
              </div>

            </div>

            <div className="mt-6 flex justify-end gap-2">

              <button
                onClick={() => setShowAddModal(false)}
                disabled={savingAddPunch}
                className="
                  rounded-lg
                  border
                  border-gray-300
                  px-4
                  py-2
                  text-sm
                  text-gray-600
                  disabled:cursor-not-allowed
                  disabled:opacity-50
                "
              >
                Cancel
              </button>

              <button
                onClick={addPunch}
                disabled={savingAddPunch}
                aria-busy={savingAddPunch}
                className={`
                  rounded-lg
                  px-5
                  py-2
                  text-sm
                  font-medium
                  text-white
                  transition-colors
                  ${savingAddPunch
                    ? "cursor-not-allowed bg-gray-400 opacity-70"
                    : "bg-[#c98573] hover:bg-[#b87565]"}
                `}
              >
                {savingAddPunch ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Saving…
                  </span>
                ) : (
                  "Add"
                )}
              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}
