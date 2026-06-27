"use client";
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  type EmployeeRecord,
  type ShiftRecord,
  type PlanningRecord,
} from "./shifts.api";

// ─── Types ────────────────────────────────────────────────────────────────────

type ShiftStatus = "present" | "absent" | "pending";

/** Internal employee shape used by the table */
interface Employee {
  num: number;
  mongoId: string;
  empNumber: string;
  FirstName: string;
  specialClockIn?: string;  // ← add
  specialClockOut?: string; // ← add
}

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
const calcLate     = (i: string, s: string) => { if (i==="00:00"||!s) return 0; const l=toMinutes(i)-toMinutes(s.slice(0,5)); return l>0?l:0; };
const calcOvertime = (o: string, e: string) => { if(o==="00:00"||!e) return 0; let em=toMinutes(e.slice(0,5)),om=toMinutes(o); if(em===0)em=1440; if(em===1440&&om<720)om+=1440; const ot=om-em; return ot>0?ot:0; };
const nowTime      = () => { const d=new Date(); return `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`; };
const getStatus    = (e: EmployeeTimeEntry): ShiftStatus => e.absent ? "absent" : e.clockIn!=="00:00" ? "present" : "pending";
const badgeColor   = (s: ShiftStatus) => s==="present"?"success":s==="absent"?"error":"warning";
const badgeLabel   = (s: ShiftStatus) => s==="present"?"Present":s==="absent"?"Absent":"Pending";

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
  const late  = calcLate(entry.clockIn, shiftStart);
  const ot    = calcOvertime(entry.clockOut, shiftEnd);
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


// ─── localStorage persistence ─────────────────────────────────────────────────

const LS_KEY = (date: string) => `worktime_${date}`;

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

  // ── DB-loaded state ───────────────────────────────────────────────────────
  const [shifts, setShifts]         = useState<Shift[]>([]);
  const [employees, setEmployees]   = useState<Employee[]>([]);
  // Map: empNum -> shiftId[]  (built from planning)
  const [assignedShifts, setAssignedShifts] = useState<Record<number, string[]>>({});

  const [currentTab, setCurrentTab] = useState<string | null>(null);
  const [entries, setEntries]       = useState<Record<string, EmployeeTimeEntry>>({});
  const [manualInput, setManualInput] = useState<ManualInputState>({ employee: null, type: null, value: "" });
  const [search, setSearch]         = useState("");
  const [apiError, setApiError]     = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
const [specialTimes, setSpecialTimes] = useState<Record<string, { clockIn?: string; clockOut?: string }>>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Load employees, shifts, planning for the selected date ───────────────
  useEffect(() => {
    setLoading(true);
    setApiError(null);

    Promise.all([
  getEmployees(),
  getShifts(),
  getPlanningByDate(currentDate).catch((e) => {
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
        if (mappedShifts.length) setCurrentTab(mappedShifts[0].shift_id);
      })
      .catch((e) => setApiError(String(e)))
      .finally(() => setLoading(false));
  }, [currentDate]);

  // ── Load existing worktime records for the date ───────────────────────────
  useEffect(() => {
  if (!currentDate) return;
  getWorktimesByDate(currentDate)
    .then((records) => {
      setEntries((prev) => {
        // Start with whatever is in localStorage
        const fromStorage = loadEntriesFromStorage(currentDate);
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
    .catch((e) => setApiError(String(e)));
}, [currentDate]);

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

  // ── Auto-save ─────────────────────────────────────────────────────────────

  const scheduleSave = useCallback((empNum: number, shiftId: string, updatedEntry: EmployeeTimeEntry) => {
    const k = `${empNum}-${shiftId}`;
    const shift = shifts.find((s) => s.shift_id === shiftId);
    clearTimeout(saveTimers.current[k]);
    saveTimers.current[k] = setTimeout(async () => {
      setEntries((prev) => ({ ...prev, [k]: { ...prev[k], _saving: true, _dirty: false } }));
      try {
        const payload = entryToPayload(
          updatedEntry, empNum, shiftId, currentDate,
          shift?.start_time ?? "", shift?.end_time ?? ""
        );
        const saved = await upsertWorktime(payload, updatedEntry.workTimeId ?? null);
        setEntries((prev) => ({ ...prev, [k]: { ...prev[k], workTimeId: saved._id, _saving: false } }));
      } catch (e) {
        setApiError(`Save failed for employee ${empNum}: ${e}`);
        setEntries((prev) => ({ ...prev, [k]: { ...prev[k], _saving: false, _dirty: true } }));
      }
    }, 800);
  }, [currentDate, shifts]);

  const updateEntry = useCallback((empNum: number, patch: Partial<EmployeeTimeEntry>) => {
  if (!currentTab) return;
  const k = entryKey(empNum);
  setEntries((prev) => {
    const updated = { ...(prev[k] ?? getEntry(empNum)), ...patch, _dirty: true };
    scheduleSave(empNum, currentTab, updated);
    const next = { ...prev, [k]: updated };
    saveEntriesToStorage(currentDate, next); // ← save to localStorage
    return next;
  });
}, [currentTab, currentDate, scheduleSave]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleClockIn  = (empNum: number) => updateEntry(empNum, { clockIn:  nowTime() });
  const handleClockOut = (empNum: number) => updateEntry(empNum, { clockOut: nowTime() });

  const openManualInput = (empNum: number, type: "clockIn" | "clockOut") =>
    setManualInput({ employee: empNum, type, value: getEntry(empNum)[type] });

  const saveManualTime = () => {
    const { employee, type, value } = manualInput;
    if (!employee || !type) return;
    if (!value.match(/^\d{2}:\d{2}$/)) { alert("Use HH:MM format"); return; }
    updateEntry(employee, { [type]: value });
    setManualInput({ employee: null, type: null, value: "" });
  };

  const toggleAbsent = (empNum: number, absent: boolean) =>
    updateEntry(empNum, { absent, ...(absent ? { clockIn: "00:00", clockOut: "00:00" } : {}) });

  const clearAllData = () => {
    if (!window.confirm("Reset all clock-in/out data for today?")) return;
    setEntries((prev) => {
      const reset: Record<string, EmployeeTimeEntry> = {};
      Object.keys(prev).forEach((k) => {
        reset[k] = { ...prev[k], clockIn: "00:00", clockOut: "00:00", absent: false, absentComment: "", consomation: 0, penalty: 0, _dirty: false };
      });
      return reset;
    });
  };

  // ── Stats ─────────────────────────────────────────────────────────────────

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
    Loading attendance data…
  </div>
);

if (!loading && !shifts.length) return (
  <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
    No shifts found — check that <code className="mx-1 font-mono bg-gray-100 px-1 rounded">localhost:3001/shifts</code> returns data and CORS is enabled.
  </div>
);

  return (
    <>
      {/* Manual Time Edit Modal */}
      {manualInput.employee !== null && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setManualInput({ employee: null, type: null, value: "" })} />
          <div className="fixed z-50 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-white/[0.1] shadow-xl p-6 w-72" style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-800 dark:text-white">
                Edit {manualInput.type === "clockIn" ? "Clock-In" : "Clock-Out"} Time
              </h3>
              <button onClick={() => setManualInput({ employee: null, type: null, value: "" })} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><CloseIcon /></button>
            </div>
            <input
              type="time"
              value={manualInput.value}
              onChange={(e) => setManualInput((p) => ({ ...p, value: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <div className="flex gap-2 mt-4">
              <button onClick={saveManualTime} className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">Save</button>
              <button onClick={() => setManualInput({ employee: null, type: null, value: "" })} className="flex-1 rounded-lg border border-gray-200 dark:border-white/[0.1] px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.05] transition-colors">Cancel</button>
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
          <h1 className="text-xl font-medium text-gray-800 dark:text-white">Attendance</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{currentDate}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mr-1">Shift:</span>
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
          { label: "Present", value: stats.present, color: "text-green-700 dark:text-green-400" },
          { label: "Absent",  value: stats.absent,  color: "text-red-600 dark:text-red-400" },
          { label: "Pending", value: stats.pending, color: "text-amber-600 dark:text-amber-400" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.05] px-4 py-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{stat.label}</p>
            <p className={`text-2xl font-medium ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Table Card */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-4 gap-4 flex-wrap border-b border-gray-100 dark:border-white/[0.05]">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white">
            {currentShift ? `${currentShift.start_time.slice(0,5)} – ${currentShift.end_time.slice(0,5)} shift` : "Attendance"}
          </h2>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="text" placeholder="Search employee…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 placeholder-gray-400 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-48"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/[0.05] bg-gray-50/60 dark:bg-white/[0.02]">
                {["Employee","Status","Clock In","Clock Out","Hours","Delay","Overtime","Consumption","Penalty","Absent","Reason","Saved"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {filteredEmployees.length === 0 ? (
                <tr><td colSpan={12} className="px-5 py-12 text-center text-sm text-gray-400">
                  {employees.length === 0
                    ? "No employees found in the database."
                    : "No employees assigned to this shift for today."}
                </td></tr>
              ) : filteredEmployees.map((emp) => {
                const entry   = getEntry(emp.num);
                const status  = getStatus(entry);
                const st = specialTimes[`${emp.mongoId}-${currentTab}`];
const effectiveStart = st?.clockIn  ?? currentShift?.start_time ?? "";
const effectiveEnd   = st?.clockOut ?? currentShift?.end_time   ?? "";
const lateMin = calcLate(entry.clockIn, effectiveStart);
const otMin   = calcOvertime(entry.clockOut, effectiveEnd);
                const hours   = calcHours(entry.clockIn, entry.clockOut);

                return (
                  <tr key={`${emp.num}-${currentTab}`}
                    className={`transition-colors ${entry.absent ? "bg-red-50/40 dark:bg-red-900/10" : "hover:bg-gray-50 dark:hover:bg-white/[0.02]"}`}
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90">{emp.FirstName}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">{emp.empNumber}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge size="sm" color={badgeColor(status)}>{badgeLabel(status)}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {!entry.absent ? (
                        <div className="flex flex-col gap-1">
                          <button onClick={() => handleClockIn(emp.num)}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${entry.clockIn !== "00:00" ? "bg-green-600 text-white hover:bg-green-700" : "border border-gray-200 dark:border-white/[0.1] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.05]"}`}>
                            <ClockInIcon />{entry.clockIn !== "00:00" ? entry.clockIn : "Clock In"}
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
                            <ClockInIcon />{entry.clockOut !== "00:00" ? entry.clockOut : "Clock Out"}
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
                        <input type="checkbox" className="sr-only peer" checked={entry.absent} onChange={(e) => toggleAbsent(emp.num, e.target.checked)} />
                        <div className="w-9 h-5 bg-gray-200 dark:bg-white/[0.1] peer-focus:ring-2 peer-focus:ring-blue-500/20 rounded-full peer peer-checked:bg-red-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                      </label>
                    </td>
                    <td className="px-4 py-3">
                      <input type="text" disabled={!entry.absent} placeholder={entry.absent ? "Enter reason…" : "—"}
                        value={entry.absentComment || ""}
                        onChange={(e) => updateEntry(emp.num, { absentComment: e.target.value })}
                        className="w-32 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-800 placeholder-gray-300 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {entry._saving ? (
                        <span className="text-xs text-blue-500 animate-pulse flex items-center gap-1"><SaveIcon />Saving…</span>
                      ) : entry._dirty ? (
                        <span className="text-xs text-amber-500">Unsaved</span>
                      ) : entry.workTimeId ? (
                        <span className="text-xs text-green-600">✓ Saved</span>
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