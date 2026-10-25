"use client";
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  EmployeeRecord,
  PlanningRecord,
  AttendanceEmployee,
  AttendanceRow,
} from "./../calendar/types";
import { friendlyError } from "@/lib/errors";
import { t } from "@/lib/i18n";
import DateInput from "@/components/form/DateInput";
// ─── Types ────────────────────────────────────────────────────────────────────
type ShiftStatus = "present" | "absent" | "pending";
type Employee = AttendanceEmployee;

/** Internal shift shape used by the tabs */
interface Shift {
  shift_id: string;     // _id from DB
  start_time: string;
  end_time: string;
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
  // How the activity log should describe the next save (clock button or edit)
  _auditAs?: AuditAs;
}
interface ManualInputState {
  employee: number | null;
  type: "clockIn" | "clockOut" | null;
  value: string;
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const ClockInIcon = () => (<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>);
const EditIcon    = () => (<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>);
const CloseIcon   = () => (<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>);
const TrashIcon   = () => (<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>);
const SaveIcon    = () => (<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toMinutes    = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const formatMin    = (n: number) => n <= 0 ? "00:00" : `${Math.floor(n/60).toString().padStart(2,"0")}:${(n%60).toString().padStart(2,"0")}`;
const calcHours    = (i: string, o: string) => { if (i==="00:00"||o==="00:00") return "00:00"; let d=toMinutes(o)-toMinutes(i); if(d<0) d+=1440; return formatMin(d); };
// A shift that ends before it starts (22:00–06:00, 18:00–00:00) ends the next day
const isOvernight  = (s: string, e: string) => !!s && !!e && toMinutes(e.slice(0,5)) < toMinutes(s.slice(0,5));
// On an overnight shift, a clock-in after midnight (before the shift's end) belongs to the next day
const calcLate     = (i: string, s: string, e: string) => { if (i==="00:00"||!s) return 0; let im=toMinutes(i); const sm=toMinutes(s.slice(0,5)); if(isOvernight(s,e)&&im<sm&&im<=toMinutes(e.slice(0,5)))im+=1440; const l=im-sm; return l>0?l:0; };
// On an overnight shift, the end and a clock-out earlier than the start are on the next day
const calcOvertime = (o: string, s: string, e: string) => { if(o==="00:00"||!e) return 0; let em=toMinutes(e.slice(0,5)),om=toMinutes(o); if(isOvernight(s,e)){ em+=1440; if(om<toMinutes(s.slice(0,5)))om+=1440; } const ot=om-em; return ot>0?ot:0; };
const nowTime      = () => { const d=new Date(); return `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`; };
const getStatus    = (e: EmployeeTimeEntry): ShiftStatus => e.absent ? "absent" : e.clockIn!=="00:00" ? "present" : "pending";
const badgeColor   = (s: ShiftStatus) => s==="present"?"success":s==="absent"?"error":"warning";
const badgeLabel   = (s: ShiftStatus) => s==="present"?t("Present"):s==="absent"?t("Absent"):t("Pending");
function recordToEntry(r: WorktimeRecord): EmployeeTimeEntry {
  return {
    clockIn:       r.clock_in       ?? "00:00",
    clockOut:      r.clock_out      ?? "00:00",
    absent:        r.absent         ?? false,
    absentComment: r.absent_comment ?? "",
    consomation:   r.consomation    ?? 0,
    penalty:       r.penalty        ?? 0,
    workTimeId:    r._id,
  };
}
function entryToPayload(
  entry: EmployeeTimeEntry,
  empNum: number,
  shiftId: string,
  date: string,
  shiftStart: string,
  shiftEnd: string,
): WorktimePayload {
  const hours = calcHours(entry.clockIn, entry.clockOut);
  const late  = calcLate(entry.clockIn, shiftStart, shiftEnd);
  const ot    = calcOvertime(entry.clockOut, shiftStart, shiftEnd);
  return {
    emp_id:           empNum,
    shift_id:         shiftId as any,
    work_date:        date,
    clock_in:         entry.clockIn  !== "00:00" ? entry.clockIn  : undefined,
    clock_out:        entry.clockOut !== "00:00" ? entry.clockOut : undefined,
    late_minutes:     String(late),
    overtime_minutes: String(ot),
    work_hours:       hours,
    consomation:      Number(entry.consomation) || 0,
    penalty:          Number(entry.penalty)     || 0,
    absent:           entry.absent,
    absent_comment:   entry.absentComment || undefined,
  };
}
const employeeRecordToEmployee = (
  employee: EmployeeRecord
): Employee => ({
  num: employee.empNumber,
  mongoId: employee._id,
  empNumber: `EMP-${employee.empNumber}`,
  FirstName: `${employee.firstName} ${employee.lastName}`,
});

// ─── localStorage persistence ─────────────────────────────────────────────────
const LS_KEY = (date: string) => `worktime_${date}`;
// This page keeps one record per employee AND shift: a save must never land on another shift's record
const PER_SHIFT = { perShift: true };
function saveEntriesToStorage(date: string, entries: Record<string, EmployeeTimeEntry>) {
  try {
    localStorage.setItem(LS_KEY(date), JSON.stringify(entries));
  } catch {}
}
function loadEntriesFromStorage(date: string): Record<string, EmployeeTimeEntry> {
  try {
    const raw = localStorage.getItem(LS_KEY(date));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}




// ─── Component ────────────────────────────────────────────────────────────────
interface AttendancePageProps {
  currentDate?: string;
}

export default function AttendancePage({
  currentDate = new Date().toISOString().slice(0, 10),
}: AttendancePageProps) {

  const [selectedDate, setSelectedDate] = useState(currentDate);
  // Read by saves that finish after a date change
  const selectedDateRef = useRef(currentDate);

  // ── DB-loaded state ───────────────────────────────────────
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignedShifts, setAssignedShifts] = useState<Record<number, string[]>>({});
  const [planningRecords, setPlanningRecords] = useState<PlanningRecord[]>([]);

  const [currentTab, setCurrentTab] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, EmployeeTimeEntry>>({});
  const [manualInput, setManualInput] = useState<ManualInputState>({
    employee: null,
    type: null,
    value: "",
  });
  const [search, setSearch] = useState("");
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [specialTimes, setSpecialTimes] =
    useState<Record<string, { clockIn?: string; clockOut?: string }>>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingSaves = useRef<Record<string, () => void>>({});
 
  //Backup Employees states: 
  const [absenceModal, setAbsenceModal] = useState<{
    empNum: number;
    backups: EmployeeRecord[];
  } | null>(null);

  const [selectedBackupId, setSelectedBackupId] = useState("");

  const [selectedBackups, setSelectedBackups] = useState<
    Record<string, EmployeeRecord>
  >({}); 

  const [savedBackupAssignments, setSavedBackupAssignments] =
  useState<Record<string, number>>({});

  // ── Load employees, shifts, planning for the selected date ───────────────
  useEffect(() => {
    setLoading(true);
    setApiError(null);

    Promise.all([
  getEmployees(),
  getShifts(),
  getPlanningByDate(selectedDate).catch((e) => {
    console.warn("Planning fetch failed:", e);
    return [] as PlanningRecord[];
  }),
])
  .then(([empRecords, shiftRecords, planningRecords]) => {
    console.log("shifts:", shiftRecords);
    console.log("employees:", empRecords);
    console.log("planning:", planningRecords);

        // Map employees
        const mappedEmployees: Employee[] = empRecords.map((e) => ({
          num:       e.empNumber,
          mongoId:   e._id,
          empNumber: `EMP-${e.empNumber}`,
          FirstName: `${e.firstName} ${e.lastName}`,
        }));

        // Map shifts (use _id as shift_id)
        const mappedShifts: Shift[] = shiftRecords.map((s) => ({
          shift_id:   s._id,
          start_time: s.startTime.length === 5 ? `${s.startTime}:00` : s.startTime,
          end_time:   s.endTime.length   === 5 ? `${s.endTime}:00`   : s.endTime,
        }));

        // Build assignedShifts from planning records
        // planning.empId._id  →  find employee by mongoId  →  get empNumber
        // planning.shiftId._id → shift_id
        const assigned: Record<number, string[]> = {};
        planningRecords.forEach((p) => {
          const emp = empRecords.find((e) => e._id === p.empId._id);
          if (!emp) return;
          const empNum = emp.empNumber;
          if (!assigned[empNum]) assigned[empNum] = [];
          if (!assigned[empNum].includes(p.shiftId._id)) {
            assigned[empNum].push(p.shiftId._id);
          }
        });
        const special: Record<string, { clockIn?: string; clockOut?: string }> = {};
        planningRecords.forEach((p: any) => {
          const firstTask = p.tasks?.[0];
          if (firstTask?.startTime) {
            const k = `${p.empId._id}-${p.shiftId._id}`;
            special[k] = { clockIn: firstTask.startTime, clockOut: firstTask.endTime };
          }
        });
        setSpecialTimes(special);
        setEmployees(mappedEmployees);
        setShifts(mappedShifts);
        setAssignedShifts(assigned);
        setPlanningRecords(planningRecords);

        if (mappedShifts.length) {
          setCurrentTab(mappedShifts[0].shift_id);
        }
      })
      .catch((e) => setApiError(friendlyError(e, "Couldn't load today's data")))
      .finally(() => setLoading(false));
}, [selectedDate]);
  // ── Load existing worktime records for the date ───────────────────────────
  useEffect(() => {
  if (!currentDate) return;
  getWorktimesByDate(selectedDate)
    .then((records) => {
      const assignments: Record<string, number> = {};
      records.forEach((record) => {
        if (
          record.backup_emp_id != null &&
          record.shift_id
        ) {
          assignments[
            `${record.emp_id}-${record.shift_id}`
          ] = record.backup_emp_id;
        }
      });
      setSavedBackupAssignments(assignments);
      
      setEntries((prev) => {
        // Start with whatever is in localStorage
        const fromStorage = loadEntriesFromStorage(selectedDate);
        const next = { ...fromStorage };

        // Overlay DB records (but don't overwrite dirty local changes)
        records.forEach((r: any) => {
          const k = `${r.emp_id}-${r.shift_id}`;
          if (!next[k]?._dirty) {
            next[k] = recordToEntry(r);
          }
        });
        return next;
      });
    })
    .catch((e) => setApiError(friendlyError(e, "Couldn't load today's data")));
}, [selectedDate]);


useEffect(() => {
  const restored: Record<string, EmployeeRecord> = {};

  for (const [key, backupEmpNum] of Object.entries(
    savedBackupAssignments
  )) {
    // Employee number comes before the first hyphen.
    // The shift ID itself may also contain hyphens.
    const separatorIndex = key.indexOf("-");

    if (separatorIndex === -1) continue;

    const mainEmpNum = Number(key.slice(0, separatorIndex));
    const shiftId = key.slice(separatorIndex + 1);

    const planning = planningRecords.find(
      (p) =>
        p.empId?.empNumber === mainEmpNum &&
        p.shiftId?._id === shiftId
    );

    const backup = (planning?.backupEmpIds ?? []).find(
      (b) =>
        typeof b === "object" &&
        b !== null &&
        b.empNumber === backupEmpNum
    );

    if (backup) {
      restored[key] = backup;
    }
  }

  setSelectedBackups(restored);
}, [savedBackupAssignments, planningRecords]);
  // ── Derived ───────────────────────────────────────────────────────────────
  const currentShift = useMemo(
    () => shifts.find((s) => s.shift_id === currentTab) ?? null,
    [shifts, currentTab]
  );
  const filteredEmployees = useMemo(() => {
    if (!currentTab) return [];
    const q = search.toLowerCase();
    return employees.filter((emp) => {
      const inShift = (assignedShifts[emp.num] ?? []).includes(currentTab);
      return inShift && (
        emp.FirstName.toLowerCase().includes(q) ||
        emp.empNumber.toLowerCase().includes(q)
      );
    });
  }, [currentTab, employees, assignedShifts, search]);
  const entryKey = (empNum: number, shiftId = currentTab) => `${empNum}-${shiftId}`;
  const getEntry = (empNum: number): EmployeeTimeEntry =>
    entries[entryKey(empNum)] ?? {
      clockIn: "00:00", clockOut: "00:00",
      absent: false, absentComment: "",
      consomation: 0, penalty: 0, workTimeId: null,
  };
  // const getBackupEmployee = (
  // emp: Employee,
  // shiftId: string | null
  // ): EmployeeRecord | null => {
  //   if (!shiftId) return null;

  //   const planning = planningRecords.find(
  //     (p) =>
  //       p.empId?._id === emp.mongoId &&
  //       p.shiftId?._id === shiftId
  //   );

  //   return planning?.backupEmpId ?? null;
  // };
  // Start/end the delay and overtime are measured from: the planned task times when there are any
  const effectiveTimes = (empNum: number, shiftId: string | null) => {
    const shift = shifts.find((s) => s.shift_id === shiftId);
    const mongoId = employees.find((e) => e.num === empNum)?.mongoId;
    const st = specialTimes[`${mongoId}-${shiftId}`];
    return {
      start: st?.clockIn ?? shift?.start_time ?? "",
      end: st?.clockOut ?? shift?.end_time ?? "",
    };
  };
  // ── Auto-save ─────────────────────────────────────────────────────────────
  // Records a successful save on the page and in the browser's copy of that day,
  // so a reload doesn't take the saved entry for an unsaved change
  const markSaved = (date: string, k: string, workTimeId: string) => {
    if (selectedDateRef.current !== date) {
      const stored = loadEntriesFromStorage(date);
      if (stored[k]) {
        saveEntriesToStorage(date, { ...stored, [k]: { ...stored[k], workTimeId, _saving: false, _dirty: false } });
      }
      return;
    }
    setEntries((prev) => {
      const next = { ...prev, [k]: { ...prev[k], workTimeId, _saving: false } };
      saveEntriesToStorage(date, next);
      return next;
    });
  };
  const scheduleSave = useCallback((empNum: number, shiftId: string, updatedEntry: EmployeeTimeEntry) => {
    const k = `${empNum}-${shiftId}`;
    const date = selectedDate;
    const { start, end } = effectiveTimes(empNum, shiftId);
    const save = async () => {
      delete pendingSaves.current[k];
      // After a date change the save still goes to its own day, but must not touch the new day's rows
      const onPage = () => selectedDateRef.current === date;
      if (onPage()) setEntries((prev) => ({ ...prev, [k]: { ...prev[k], _saving: true, _dirty: false } }));
      try {
        const payload = entryToPayload(updatedEntry, empNum, shiftId, date, start, end);
        const saved = await upsertWorktime(payload, updatedEntry.workTimeId ?? null, updatedEntry._auditAs, PER_SHIFT);
        markSaved(date, k, saved._id);
      } catch (e) {
        setApiError(friendlyError(e, `Couldn't save the times for employee ${empNum}`));
        if (onPage()) setEntries((prev) => ({ ...prev, [k]: { ...prev[k], _saving: false, _dirty: true } }));
      }
    };
    clearTimeout(saveTimers.current[k]);
    pendingSaves.current[k] = save;
    saveTimers.current[k] = setTimeout(save, 800);
  }, [selectedDate, shifts, employees, specialTimes]);
  // Sends the saves still waiting for their timer now (before the date changes)
  const flushPendingSaves = () => {
    Object.entries(pendingSaves.current).forEach(([k, save]) => {
      clearTimeout(saveTimers.current[k]);
      save();
    });
  };
  const updateEntry = useCallback((empNum: number, patch: Partial<EmployeeTimeEntry>) => {
  if (!currentTab) return;
  const k = entryKey(empNum);
  setEntries((prev) => {
    const updated = { ...(prev[k] ?? getEntry(empNum)), _auditAs: undefined, ...patch, _dirty: true };
    scheduleSave(empNum, currentTab, updated);
    const next = { ...prev, [k]: updated };
    saveEntriesToStorage(selectedDate, next); // ← save to localStorage
    return next;
  });
}, [currentTab, selectedDate, scheduleSave]);


  // ── Actions ───────────────────────────────────────────────────────────────
  const handleClockIn  = (empNum: number) => updateEntry(empNum, { clockIn:  nowTime(), _auditAs: "clock" });
  const handleClockOut = (empNum: number) => updateEntry(empNum, { clockOut: nowTime(), _auditAs: "clock" });
  const openManualInput = (empNum: number, type: "clockIn" | "clockOut") =>
    setManualInput({ employee: empNum, type, value: getEntry(empNum)[type] });
  const saveManualTime = () => {
    const { employee, type, value } = manualInput;
    if (!employee || !type) return;
    if (!value.match(/^\d{2}:\d{2}$/)) { toast.warning("Enter the time as HH:MM, for example 08:30."); return; }
    updateEntry(employee, { [type]: value, _auditAs: "edit" });
    setManualInput({ employee: null, type: null, value: "" });
  };
  // const toggleAbsent = (empNum: number, absent: boolean) =>
  //   updateEntry(empNum, { absent, ...(absent ? { clockIn: "00:00", clockOut: "00:00" } : {}) });
  const handleAbsentClick = (
    emp: AttendanceEmployee,
    absent: boolean
  ) => {
    // If the checkbox is unchecked, cancel the absence.
    if (!absent) {
      updateEntry(emp.num, { absent: false });

      const key = `${emp.num}-${currentTab}`;

      setSelectedBackups((prev) => {
        const updated = { ...prev };
        delete updated[key];
        return updated;
      });
      if (currentTab) {
        upsertWorktime(
          {
            emp_id: emp.num,
            shift_id: currentTab,
            work_date: selectedDate,
            absent: false,
            backup_emp_id: null,
          },
          getEntry(emp.num).workTimeId,
          undefined,
          PER_SHIFT
        ).catch((error) => {
          console.error("Failed to clear saved backup:", error);
          setApiError("Could not clear the saved backup assignment.");
        });
      }

      return;
    }

    if (!currentTab) return;

    const planning = getPlanningForEmployee(emp, currentTab);

    const backups = (planning?.backupEmpIds ?? []).filter(
      (backup): backup is EmployeeRecord =>
        typeof backup === "object" &&
        backup !== null &&
        Boolean(backup._id)
    );

    // No planned backups: mark the employee absent directly.
    if (backups.length === 0) {
      updateEntry(emp.num, {
        absent: true,
        clockIn: "00:00",
        clockOut: "00:00",
      });
      return;
    }

    // Open the selection modal.
    setSelectedBackupId("");
    setAbsenceModal({
      empNum: emp.num,
      backups,
    });
  };
  const confirmAbsence = async () => {
  if (!absenceModal || !selectedBackupId || !currentTab) {
    return;
  }

  const backup = absenceModal.backups.find(
    (b) => b._id === selectedBackupId
  );

  if (!backup) return;

  const mainEmpNum = absenceModal.empNum;
  const key = `${mainEmpNum}-${currentTab}`;

  const previousEntry = getEntry(mainEmpNum);

  const updatedEntry: EmployeeTimeEntry = {
    ...previousEntry,
    absent: true,
    clockIn: "00:00",
    clockOut: "00:00",
    _dirty: false,
    _saving: false,
  };

  try {
    // Build the absent employee's worktime payload.
    const { start, end } = effectiveTimes(mainEmpNum, currentTab);
    const payload = entryToPayload(
      updatedEntry,
      mainEmpNum,
      currentTab,
      selectedDate,
      start,
      end
    );

    // Save the absence and selected backup on the MAIN employee's record.
    const saved = await upsertWorktime(
      {
        ...payload,
        absent: true,
        clock_in: "00:00",
        clock_out: "00:00",
        backup_emp_id: backup.empNumber,
      },
      previousEntry.workTimeId,
      undefined,
      PER_SHIFT
    );

    // Update the attendance entry after the API succeeds.
    setEntries((prev) => {
      const next = {
        ...prev,
        [key]: {
          ...updatedEntry,
          workTimeId: saved._id,
        },
      };

      saveEntriesToStorage(selectedDate, next);

      return next;
    });

    // Store the selected backup for immediate display.
    setSelectedBackups((prev) => ({
      ...prev,
      [key]: backup,
    }));

    setAbsenceModal(null);
    setSelectedBackupId("");
  } catch (error) {
    console.error("Failed to save absence and backup:", error);
    setApiError("Could not save the absence and selected backup.");
  }
  };


  const clearAllData = async () => {
    const ok = await confirmDialog({
      title: "Reset today's clock-ins?",
      message: "All clock-in and clock-out times entered on this page today will be cleared.",
      confirmLabel: "Reset",
      danger: true,
    });
    if (!ok) return;
    setEntries((prev) => {
      const reset: Record<string, EmployeeTimeEntry> = {};
      Object.keys(prev).forEach((k) => {
        reset[k] = { ...prev[k], clockIn: "00:00", clockOut: "00:00", absent: false, absentComment: "", consomation: 0, penalty: 0, _dirty: false };
      });
      return reset;
    });
  };
  
const getAttendanceRows = (
  employees: Employee[],
  shiftId: string | null
): AttendanceRow[] => {
  if (!shiftId) {
    return employees.map((employee) => ({
      employee,
      isBackup: false,
    }));
  }

  const rows: AttendanceRow[] = [];

  for (const employee of employees) {
    // 1. Always display the main employee.
    rows.push({
      employee,
      isBackup: false,
    });

    // 2. Get this employee's attendance entry for the selected shift.
    const entry = getEntry(employee.num);

    // 3. Display a replacement only when the main employee is absent.
    if (!entry.absent) {
      continue;
    }

    // 4. Get the backup selected in the absence modal.
    const backupKey = `${employee.num}-${shiftId}`;
    const backupRecord = selectedBackups[backupKey];

    // No backup selected: do not add a replacement row.
    if (!backupRecord) {
      continue;
    }

    // 5. Convert the API employee record to the frontend format.
    const backupEmployee = employeeRecordToEmployee(backupRecord);

    // 6. Prevent duplicate employee rows.
    if (
      rows.some(
        (row) =>
          row.employee.mongoId === backupEmployee.mongoId
      )
    ) {
      continue;
    }

    // 7. Add the selected backup as an attendance row.
    rows.push({
      employee: backupEmployee,
      isBackup: true,
      backupOfEmpNum: employee.num,
    });
  }

  return rows;
};


  //Helpers:
  const getPlanningForEmployee = (
    emp: AttendanceEmployee,
    shiftId: string
  ) => {
    return planningRecords.find(
      (p) =>
        p.empId?._id === emp.mongoId &&
        p.shiftId?._id === shiftId
    );
  };
  
  // ── Stats ─────────────────────────────────────────────────────────────────
  const attendanceRows = useMemo(
    () => getAttendanceRows(filteredEmployees, currentTab),
    [filteredEmployees, currentTab, entries, planningRecords, selectedBackups]
  );

  const stats = useMemo(() => {
    let present = 0, absent = 0, pending = 0;
    filteredEmployees.forEach((emp) => {
      const s = getStatus(getEntry(emp.num));
      if (s === "present") present++;
      else if (s === "absent") absent++;
      else pending++;
    });
    return { total: filteredEmployees.length, present, absent, pending };
  }, [filteredEmployees, entries]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-32 text-gray-400 text-sm animate-pulse">
      {t("Loading attendance data…")}
    </div>
  );

  if (!loading && !shifts.length) return (
    <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
      {t("No shifts found. Add shifts in Shifts Management first.")}
    </div>
  );

  return (
    <>
      
{/* Manual Time Edit Modal */}
{manualInput.employee !== null && (
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
      className="fixed z-50 bg-white dark:bg-gray-900 rounded-xl
      border border-gray-200 dark:border-white/[0.1]
      shadow-xl p-6 w-[320px] max-w-[90vw]"
      style={{
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      }}
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-base font-medium text-gray-800 dark:text-white">
          Edit{" "}
          {manualInput.type === "clockIn"
            ? t("Clock-In")
            : t("Clock-Out")}{" "}
          {t("Time")}
        </h3>

        <button
          type="button"
          onClick={() =>
            setManualInput({
              employee: null,
              type: null,
              value: "",
            })
          }
          className="text-gray-400 hover:text-gray-600
          dark:hover:text-gray-200 p-2"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Hour and minute selectors */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label
            htmlFor="edit-hour"
            className="block text-sm text-gray-500
            dark:text-gray-400 mb-2"
          >
            {t("Hour")}
          </label>

          <select
            id="edit-hour"
            value={manualInput.value.split(":")[0] || "00"}
            onChange={(e) => {
              const minute =
                manualInput.value.split(":")[1] || "00";

              setManualInput((p) => ({
                ...p,
                value: `${e.target.value}:${minute}`,
              }));
            }}
            className="w-full h-14 rounded-lg border
            border-gray-200 bg-gray-50 px-3 text-xl
            text-gray-800 dark:border-white/[0.1]
            dark:bg-white/[0.05] dark:text-white"
          >
            {Array.from({ length: 24 }, (_, i) => {
              const hour = String(i).padStart(2, "0");

              return (
                <option key={hour} value={hour}>
                  {hour}
                </option>
              );
            })}
          </select>
        </div>

        <span className="text-2xl font-semibold mt-6
        text-gray-700 dark:text-white">
          :
        </span>

        <div className="flex-1">
          <label
            htmlFor="edit-minute"
            className="block text-sm text-gray-500
            dark:text-gray-400 mb-2"
          >
            {t("Minute")}
          </label>

          <select
            id="edit-minute"
            value={manualInput.value.split(":")[1] || "00"}
            onChange={(e) => {
              const hour =
                manualInput.value.split(":")[0] || "00";

              setManualInput((p) => ({
                ...p,
                value: `${hour}:${e.target.value}`,
              }));
            }}
            className="w-full h-14 rounded-lg border
            border-gray-200 bg-gray-50 px-3 text-xl
            text-gray-800 dark:border-white/[0.1]
            dark:bg-white/[0.05] dark:text-white"
          >
            {Array.from({ length: 60 }, (_, i) => {
              const minute = String(i).padStart(2, "0");

              return (
                <option key={minute} value={minute}>
                  {minute}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
        {t("Select the hour and minute. No keyboard required.")}
      </p>

      {/* Actions */}
      <div className="flex gap-3 mt-6">
        <button
          type="button"
          onClick={saveManualTime}
          className="flex-1 rounded-lg bg-blue-600
          px-3 py-3 text-sm font-medium text-white
          hover:bg-blue-700 active:bg-blue-800"
        >
          {t("Save")}
        </button>

        <button
          type="button"
          onClick={() =>
            setManualInput({
              employee: null,
              type: null,
              value: "",
            })
          }
          className="flex-1 rounded-lg border
          border-gray-200 dark:border-white/[0.1]
          px-3 py-3 text-sm font-medium
          text-gray-600 dark:text-gray-300"
        >
          {t("Cancel")}
        </button>
      </div>
    </div>
  </>
)}


            

      {absenceModal && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => {
              setAbsenceModal(null);
              setSelectedBackupId("");
            }}
          />

          <div className="fixed start-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 bg-white p-6 shadow-xl dark:border-white/[0.1] dark:bg-gray-900">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
              {t("Choose a replacement")}
            </h3>

            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {t("Select one of the planned backup employees to replace the absent employee.")}
            </p>

            <div className="mt-4 space-y-2">
              {absenceModal.backups.map((backup) => (
                <label
                  key={backup._id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${
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

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAbsenceModal(null);
                  setSelectedBackupId("");
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-700"
              >
                {t("Cancel")}
              </button>

              <button
                type="button"
                disabled={!selectedBackupId}
                onClick={confirmAbsence}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("Confirm absence")}
              </button>
            </div>
          </div>
        </>
      )}

      {/* API Error Banner */}
      {apiError && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-2 text-sm text-red-700 dark:text-red-300">
          <span>⚠ {apiError}</span>
          <button onClick={() => setApiError(null)} className="ml-4 text-red-400 hover:text-red-600"><CloseIcon /></button>
        </div>
      )}

      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
  <h1 className="text-xl font-medium text-gray-800 dark:text-white">
    {t("Attendance")}
  </h1>

  <div className="mt-1 flex items-center gap-2">
    <DateInput
      value={selectedDate}
      onChange={(v) => {
        // Pending saves go out now, for the day they were made on
        selectedDateRef.current = v;
        flushPendingSaves();
        setSelectedDate(v);
        setEntries({});
        setCurrentTab(null);
      }}
    />
  </div>
</div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mr-1">{t("Shift:")}</span>
          {shifts.map((s) => (
            <button key={s.shift_id} onClick={() => setCurrentTab(s.shift_id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                currentTab === s.shift_id
                  ? "border-blue-500 bg-blue-600 text-white"
                  : "border-gray-200 dark:border-white/[0.1] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.05]"
              }`}
            >
              {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
            </button>
          ))}
          <button onClick={clearAllData} className="ml-2 flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/50 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            <TrashIcon /> Reset
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Total",   value: stats.total,   color: "text-gray-800 dark:text-white" },
          { label: t("Present"), value: stats.present, color: "text-green-700 dark:text-green-400" },
          { label: t("Absent"),  value: stats.absent,  color: "text-red-600 dark:text-red-400" },
          { label: t("Pending"), value: stats.pending, color: "text-amber-600 dark:text-amber-400" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.05] px-4 py-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t(stat.label)}</p>
            <p className={`text-2xl font-medium ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Table Card */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-4 gap-4 flex-wrap border-b border-gray-100 dark:border-white/[0.05]">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white">
            {currentShift ? t("{start} – {end} shift", { start: currentShift.start_time.slice(0,5), end: currentShift.end_time.slice(0,5) }) : t("Attendance")}
          </h2>
          <div className="relative">
            <svg className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="text" placeholder={t("Search employee…")} value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pe-4 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 placeholder-gray-400 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-48"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/[0.05] bg-gray-50/60 dark:bg-white/[0.02]">
                {["Employee","Status",t("Clock In"),t("Clock Out"),"Hours","Delay","Overtime","Consumption","Penalty",t("Absent"),"Reason","Saved"].map((h) => (
                  <th key={h} className="px-4 py-3 text-start text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {attendanceRows.length === 0 ? (
                <tr><td colSpan={12} className="px-5 py-12 text-center text-sm text-gray-400">
                  {employees.length === 0
                    ? t("No employees found in the database.")
                    : t("No employees assigned to this shift for today.")}
                </td></tr>
              ) : attendanceRows.map(({ employee: emp, isBackup, backupOfEmpNum }) => {
                    const entry = getEntry(emp.num);
                    const status = getStatus(entry);

                    const mainEmployee = backupOfEmpNum
                      ? employees.find((e) => e.num === backupOfEmpNum)
                      : null;

                    const { start: effectiveStart, end: effectiveEnd } =
                      effectiveTimes(emp.num, currentTab);

                    const lateMin = calcLate(entry.clockIn, effectiveStart, effectiveEnd);
                    const otMin = calcOvertime(entry.clockOut, effectiveStart, effectiveEnd);
                    const hours = calcHours(entry.clockIn, entry.clockOut);

                return (
                  <tr key={`${emp.num}-${currentTab}`}
                    className={`transition-colors ${entry.absent ? "bg-red-50/40 dark:bg-red-900/10" : "hover:bg-gray-50 dark:hover:bg-white/[0.02]"}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isBackup && (
                          <span className="text-blue-500 text-xs">↳</span>
                        )}

                        <div>
                          <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                            {emp.FirstName}
                          </p>

                          <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">
                            {emp.empNumber}
                          </p>

                          {isBackup && (
                            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                              Backup for {mainEmployee?.FirstName ?? "employee"}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge size="sm" color={badgeColor(status)}>{badgeLabel(status)}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {!entry.absent ? (
                        <div className="flex flex-col gap-1">
                          <button onClick={() => handleClockIn(emp.num)}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${entry.clockIn !== "00:00" ? "bg-green-600 text-white hover:bg-green-700" : "border border-gray-200 dark:border-white/[0.1] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.05]"}`}>
                            <ClockInIcon />{entry.clockIn !== "00:00" ? entry.clockIn : t("Clock In")}
                          </button>
                          <button onClick={() => openManualInput(emp.num, "clockIn")}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
                            <EditIcon /> Edit
                          </button>
                        </div>
                      ) : <span className="text-xs text-gray-400 italic">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {!entry.absent ? (
                        <div className="flex flex-col gap-1">
                          <button onClick={() => handleClockOut(emp.num)}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${entry.clockOut !== "00:00" ? "bg-red-500 text-white hover:bg-red-600" : "border border-gray-200 dark:border-white/[0.1] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.05]"}`}>
                            <ClockInIcon />{entry.clockOut !== "00:00" ? entry.clockOut : t("Clock Out")}
                          </button>
                          <button onClick={() => openManualInput(emp.num, "clockOut")}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
                            <EditIcon /> Edit
                          </button>
                        </div>
                      ) : <span className="text-xs text-gray-400 italic">—</span>}
                    </td>
                    <td className="px-4 py-3"><span className="text-sm font-mono text-gray-700 dark:text-gray-300">{hours}</span></td>
                    <td className="px-4 py-3"><span className={`text-sm font-mono ${lateMin > 0 ? "text-amber-600 dark:text-amber-400" : "text-gray-400"}`}>{formatMin(lateMin)}</span></td>
                    <td className="px-4 py-3"><span className={`text-sm font-mono ${otMin > 0 ? "text-blue-600 dark:text-blue-400" : "text-gray-400"}`}>{formatMin(otMin)}</span></td>
                    <td className="px-4 py-3">
                      <input type="number" value={entry.consomation || ""} placeholder="0"
                        onChange={(e) => updateEntry(emp.num, { consomation: e.target.value })}
                        className="w-16 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-800 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" value={entry.penalty || ""} placeholder="0"
                        onChange={(e) => updateEntry(emp.num, { penalty: e.target.value })}
                        className="w-16 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-800 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={entry.absent} onChange={(e) => handleAbsentClick(emp, e.target.checked)} />
                        <div className="w-9 h-5 bg-gray-200 dark:bg-white/[0.1] peer-focus:ring-2 peer-focus:ring-blue-500/20 rounded-full peer peer-checked:bg-red-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                      </label>
                    </td>
                    <td className="px-4 py-3">
                      <input type="text" disabled={!entry.absent} placeholder={entry.absent ? t("Enter reason…") : "—"}
                        value={entry.absentComment || ""}
                        onChange={(e) => updateEntry(emp.num, { absentComment: e.target.value })}
                        className="w-32 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-800 placeholder-gray-300 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {entry._saving ? (
                        <span className="text-xs text-blue-500 animate-pulse flex items-center gap-1"><SaveIcon />{t("Saving…")}</span>
                      ) : entry._dirty ? (
                        <span className="text-xs text-amber-500">{t("Unsaved")}</span>
                      ) : entry.workTimeId ? (
                        <span className="text-xs text-green-600">✓ {t("Saved")}</span>
                      ) : (
                        <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 dark:border-white/[0.05] text-xs text-gray-400 dark:text-gray-500">
          {filteredEmployees.length} employee{filteredEmployees.length !== 1 ? "s" : ""} in this shift
        </div>
      </div>
    </>
  );
}