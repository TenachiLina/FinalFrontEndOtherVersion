"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { useModal } from "@/hooks/useModal";
import { Cell, EmployeeRecord, GridData, PlanningRecord, Post, Shift, ShiftRecord, TaskRecord, ShiftTask, BackupRef } from "../components/calendar/types";
import * as XLSX from 'xlsx';
import { API_BASE_URL } from "@/lib/config";
import { ensureOk, friendlyError } from "@/lib/errors";
import { toast } from "@/lib/notify";
import { sortShifts } from "@/lib/sortShifts";
import { locale, t } from "@/lib/i18n";


// ─── Helpers ──────────────────────────────────────────────────────────────────
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" }, ...init,
  });
  await ensureOk(res);
  return res.json();
}

function buildEmptyGrid(posts: Post[], shifts: Shift[]): GridData {
  const g: GridData = {};
  posts.forEach((p) => { g[p.id] = {}; shifts.forEach((s) => { g[p.id][s.id] = []; }); });
  return g;
}

// "YYYY-MM-DD" of a date, as the planning is loaded and saved (Algiers time)
function algiersDay(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Africa/Algiers" });
}

// Backup ids of a cell: unique, and never the main employee himself
function getBackupIds(cell: Cell): string[] {
  return [...new Set((cell.backups ?? []).map((b) => b.id))].filter(
    (id) => id !== cell.id
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useShiftGrid = () => {
  let stepsCounter: number = 0;
  const { isOpen, openModal, closeModal } = useModal();

  // ── Reference data ────────────────────────────────────────────────────────
  const [posts, setPosts] = useState<Post[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);

  // ── Grid & date ───────────────────────────────────────────────────────────
  const [grid, setGrid] = useState<GridData>({});
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [loadingGrid, setLoadingGrid] = useState(false);

  // ── Add modal state ───────────────────────────────────────────────────────
  //For Main Employee:
  const [activeCell, setActiveCell] = useState<{ postId: number; shiftId: string } | null>(null);
  const [empSearch, setEmpSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null);
  //Optional Backup Employees (many):
  const [backupEmpSearch, setBackupEmpSearch] = useState("");
  const [selectedBackupEmployees, setSelectedBackupEmployees] = useState<EmployeeRecord[]>([]);
  // ── Add modal tasks ─────────────────────────────────────────
  const [addTasks, setAddTasks] = useState<ShiftTask[]>([]);

  // ── Edit modal ────────────────────────────────────────────────────────────
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  //For Main Employee:
  const [editingEmployee, setEditingEmployee] = useState<Cell | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSelectedEmployee, setEditSelectedEmployee] = useState<EmployeeRecord | null>(null);
  //For Backup Employees (many):
  const [editBackupEmployees, setEditBackupEmployees] = useState<EmployeeRecord[]>([]);
  const [editBackupSearch, setEditBackupSearch] = useState("");
  const [editTasks, setEditTasks] = useState<ShiftTask[]>([]);

  // ── List modal ────────────────────────────────────────────────────────────
  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [listCell, setListCell] = useState<{ postId: number; shiftId: string } | null>(null);
  const listEmployees = listCell ? (grid[listCell.postId]?.[listCell.shiftId] ?? []) : [];

  // ── Importing modal ────────────────────────────────────────────────────────────
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importDate, setImportDate] = useState("");
  const [showImportMenu, setShowImportMenu] = useState(false);

  // ── Copy Month modal ─────────────────────────────────────────────
  const [isCopyMonthModalOpen, setIsCopyMonthModalOpen] = useState(false);
  const [copySourceMonth, setCopySourceMonth] = useState("");
  const [copyDestinationMonth, setCopyDestinationMonth] = useState("");
  const [isCopyingMonth, setIsCopyingMonth] = useState(false);

  // ── Filtered employee list for dropdown ───────────────────────────────────
  const filteredEmployees = employees.filter((e) => {
    const q = empSearch.toLowerCase();
    return (
      e.firstName.toLowerCase().includes(q) ||
      e.lastName.toLowerCase().includes(q) ||
      String(e.empNumber).includes(q)
    );
  });
  //Filtered backup employee list for dropdown
  //(hides the main employee and the backups that are already added)
  const filteredBackupEmployees = employees.filter((e) => {
    if (selectedEmployee && e._id === selectedEmployee._id) return false;
    if (selectedBackupEmployees.some((b) => b._id === e._id)) return false;

    const q = backupEmpSearch.toLowerCase().trim();

    return (
      e.firstName.toLowerCase().includes(q) ||
      e.lastName.toLowerCase().includes(q) ||
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
      String(e.empNumber).includes(q)
    );
  });
  const filteredEditEmployees = employees.filter((emp) => {
    const search = editTitle.toLowerCase().trim();

    if (!search) return false;

    return (
      `${emp.firstName} ${emp.lastName}`
        .toLowerCase()
        .includes(search) ||
      emp.firstName.toLowerCase().includes(search) ||
      emp.lastName.toLowerCase().includes(search) ||
      String(emp.empNumber ?? "").includes(search)
    );
  });
  //Editing Modal Employees filtering:
  const filteredEditBackupEmployees = employees.filter((e) => {
    const mainId = editSelectedEmployee?._id ?? editingEmployee?.id;
    if (mainId && e._id === mainId) return false;
    if (editBackupEmployees.some((b) => b._id === e._id)) return false;

    const q = editBackupSearch.toLowerCase().trim();

    return (
      e.firstName.toLowerCase().includes(q) ||
      e.lastName.toLowerCase().includes(q) ||
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
      String(e.empNumber).includes(q)
    );
  });

  // ── Backup add / remove (Add modal) ───────────────────────────────────────
  const addBackup = useCallback((emp: EmployeeRecord) => {
    setSelectedBackupEmployees((prev) =>
      prev.some((b) => b._id === emp._id) ? prev : [...prev, emp]
    );
    setBackupEmpSearch(""); // field empties, ready for the next one
  }, []);

  const removeBackup = useCallback((id: string) => {
    setSelectedBackupEmployees((prev) => prev.filter((b) => b._id !== id));
  }, []);

  // ── Backup add / remove (Edit modal) ──────────────────────────────────────
  const addEditBackup = useCallback((emp: EmployeeRecord) => {
    setEditBackupEmployees((prev) =>
      prev.some((b) => b._id === emp._id) ? prev : [...prev, emp]
    );
    setEditBackupSearch("");
  }, []);

  const removeEditBackup = useCallback((id: string) => {
    setEditBackupEmployees((prev) => prev.filter((b) => b._id !== id));
  }, []);

  // ── Load tasks, shifts, employees once ───────────────────────────────────
  useEffect(() => {
    setLoadingMeta(true);
    Promise.all([
      apiFetch<TaskRecord[]>("/tasks"),
      apiFetch<ShiftRecord[]>("/shifts"),
      apiFetch<EmployeeRecord[]>("/employees"),
    ])
      .then(([taskRecords, shiftRecords, empRecords]) => {
        const mappedPosts: Post[] = taskRecords.map((t) => ({
          id: t.taskId, label: t.taskName, mongoId: t._id,
        }));
        // Sort by start time BEFORE mapping (after mapping only `label` is left)
        const mappedShifts: Shift[] = sortShifts(shiftRecords).map((s) => ({
          id: s._id, label: `${s.startTime} - ${s.endTime}`, sub: "",
        }));
        setPosts(mappedPosts);
        setShifts(mappedShifts);
        setEmployees(empRecords);
        setGrid(buildEmptyGrid(mappedPosts, mappedShifts));
      })
      .catch((e) => setMetaError(friendlyError(e, "Couldn't load employees, shifts and posts")))
      .finally(() => setLoadingMeta(false));
  }, []);
  // ── Load the saved planning of the selected day ───────────────────────────
  const loadPlanningForDate = useCallback(
    async (
      date: Date,
      opts?: { signal?: { cancelled: boolean }; notifyOnError?: boolean }
    ) => {
      const signal = opts?.signal;
      try {
        setLoadingGrid(true);

        const dateStr = date.toLocaleDateString("en-CA", {
          timeZone: "Africa/Algiers",
        });

        const records = await apiFetch<PlanningRecord[]>(
          `/planning/import/${dateStr}`
        );

        if (signal?.cancelled) return;

        const newGrid = buildEmptyGrid(posts, shifts);

        const toBackupRef = (id: string, title?: string | null): BackupRef => {
          const e = employees.find((x) => x._id === id);
          return {
            id,
            title:
              title ??
              (e ? `${e.firstName} ${e.lastName}` : "Unknown employee"),
          };
        };

        records.forEach((record: any) => {
          const cell = newGrid[record.taskId]?.[record.shiftId];
          if (cell === undefined) return;
          // The same employee saved twice in one cell is shown (and saved back) once
          if (cell.some((c) => c.id === record.empId)) return;

          let backups: BackupRef[] = [];

          if (Array.isArray(record.backups)) {
            backups = record.backups.map((b: any) =>
              toBackupRef(String(b.id ?? b._id), b.title)
            );
          } else if (Array.isArray(record.backupEmpIds)) {
            backups = record.backupEmpIds.map((b: any) =>
              toBackupRef(typeof b === "string" ? b : String(b._id))
            );
          } else if (record.backupEmpId) {
            const legacyId =
              typeof record.backupEmpId === "string"
                ? record.backupEmpId
                : String(record.backupEmpId._id);
            backups = [toBackupRef(legacyId, record.backupTitle)];
          }

          newGrid[record.taskId][record.shiftId].push({
            id: record.empId,
            title: record.title,
            backups,
            tasks: record.tasks ?? [],
            planningId: record.id,
          });
        });

        setGrid(newGrid);
      } catch (err) {
        if (signal?.cancelled) return;
        console.error("Error loading planning:", err);
        setGrid(buildEmptyGrid(posts, shifts));
        if (opts?.notifyOnError) toast.error(friendlyError(err, "Couldn't import the planning"));
      } finally {
        if (!signal?.cancelled) setLoadingGrid(false);
      }
    },
    [posts, shifts, employees]
  );

  // The day the grid was loaded for. While the next day is still loading,
  // the grid holds the previous day: saving then would copy it onto the new day.
  const gridDayRef = useRef<string | null>(null);

  useEffect(() => {
    if (posts.length === 0 || shifts.length === 0) return;

    const signal = { cancelled: false };
    loadPlanningForDate(currentDate, { signal }).then(() => {
      if (!signal.cancelled) gridDayRef.current = algiersDay(currentDate);
    });

    return () => {
      signal.cancelled = true;
    };
  }, [currentDate, posts, shifts, loadPlanningForDate]);

  /** True when the grid on screen is the planning of the selected day. */
  const gridIsForCurrentDay = useCallback(
    () => gridDayRef.current === algiersDay(currentDate),
    [currentDate]
  );

  // ── Date navigation ───────────────────────────────────────────────────────
  const goToToday = () => { const d = new Date(); setCurrentDate(d); setCalendarMonth(d); };
  const goPrev = () => setCurrentDate((d) => { const n = new Date(d); n.setDate(d.getDate() - 1); return n; });
  const goNext = () => setCurrentDate((d) => { const n = new Date(d); n.setDate(d.getDate() + 1); return n; });
  const formattedDate = currentDate.toLocaleDateString(locale(), { month: "long", day: "numeric", year: "numeric" });

  // ── Add modal handlers ────────────────────────────────────────────────────
  const handleCellClick = useCallback(
    (postId: number, shiftId: string) => {
      setActiveCell({ postId, shiftId });

      // Main employee
      setEmpSearch("");
      setSelectedEmployee(null);

      // Backup employees
      setBackupEmpSearch("");
      setSelectedBackupEmployees([]);

      // Tasks
      setAddTasks([]);

      openModal();
    },
    [openModal]
  );

  const handleClose = useCallback(() => {
    closeModal();
    setActiveCell(null);

    // Main employee
    setEmpSearch("");
    setSelectedEmployee(null);

    // Backup employees
    setBackupEmpSearch("");
    setSelectedBackupEmployees([]);

    // Tasks
    setAddTasks([]);
  }, [closeModal]);

  const handleSave = useCallback(() => {
    console.log("We are in handle save now");

    if (!activeCell || !selectedEmployee) return;

    const { postId, shiftId } = activeCell;

    // Prevent duplicates in the same cell
    const already = grid[postId]?.[shiftId]?.some(
      (c) => c.id === selectedEmployee._id
    );

    if (already) {
      toast.warning("This employee is already in this slot.");
      return;
    }

    setGrid((prev) => ({
      ...prev,
      [postId]: {
        ...prev[postId],
        [shiftId]: [
          ...prev[postId][shiftId],

          {
            // Main employee
            id: selectedEmployee._id,

            title:
              `${selectedEmployee.firstName} ${selectedEmployee.lastName}`,

            // Backup employees (the main employee can never be his own backup)
            backups: selectedBackupEmployees
              .filter((b) => b._id !== selectedEmployee._id)
              .map((b) => ({
                id: b._id,
                title: `${b.firstName} ${b.lastName}`,
              })),

            // Tasks
            tasks: addTasks,
          },
        ],
      },
    }));

    // Close modal
    closeModal();

    // Reset everything
    setActiveCell(null);

    setEmpSearch("");
    setSelectedEmployee(null);

    setBackupEmpSearch("");
    setSelectedBackupEmployees([]);

    setAddTasks([]);

  }, [
    activeCell,
    selectedEmployee,
    selectedBackupEmployees,
    addTasks,
    grid,
    closeModal,
  ]);

  const openEditModal = (emp: any, cell: any) => {
    setActiveCell(cell);

    // This is the existing cell entry
    setEditingEmployee(emp);

    // Find the actual employee record using the saved employee ID
    const mainEmployee = employees.find(
      (employee) => employee._id === emp.id
    );

    setEditSelectedEmployee(mainEmployee ?? null);

    setEditTitle(
      mainEmployee
        ? `${mainEmployee.firstName} ${mainEmployee.lastName}`
        : emp.title
    );

    // Existing backups
    setEditBackupEmployees(
      (emp.backups ?? [])
        .map((b: BackupRef) => employees.find((e) => e._id === b.id))
        .filter((e: EmployeeRecord | undefined): e is EmployeeRecord => !!e)
    );

    setEditBackupSearch("");

    setEditTasks(emp.tasks ?? []);

    setIsEditModalOpen(true);
  };

  // task CRUD for the edit modal
  const addEditTask = useCallback(() => {
    setEditTasks((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label: "", startTime: "", endTime: "" },
    ]);
  }, []);

  const updateEditTask = useCallback((taskId: string, patch: Partial<ShiftTask>) => {
    setEditTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
  }, []);

  const removeEditTask = useCallback((taskId: string) => {
    setEditTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const addTask = useCallback(() => {
    setAddTasks((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: "",
        startTime: "",
        endTime: "",
      },
    ]);
  }, []);

  const updateTask = useCallback(
    (taskId: string, patch: Partial<ShiftTask>) => {
      setAddTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, ...patch } : t
        )
      );
    },
    []
  );

  const removeTask = useCallback((taskId: string) => {
    setAddTasks((prev) =>
      prev.filter((t) => t.id !== taskId)
    );
  }, []);

  const handleEdit = useCallback(() => {
    if (!editingEmployee || !activeCell) return;

    const { postId, shiftId } = activeCell;

    // A typed name that wasn't picked from the list has no employee behind
    // it: the cell would show that name but keep saving the old employee.
    if (!editSelectedEmployee && editTitle.trim() !== editingEmployee.title) {
      toast.warning("Pick the employee from the list.");
      return;
    }

    // Check duplicate main employee
    const already = grid[postId]?.[shiftId]?.some(
      (c) =>
        c.id === editSelectedEmployee?._id &&
        c.id !== editingEmployee.id
    );

    if (already) {
      toast.warning("This employee is already in this slot.");
      return;
    }

    const newMainId = editSelectedEmployee?._id ?? editingEmployee.id;

    // Then continue with your update
    setGrid((prev) => ({
      ...prev,
      [postId]: {
        ...prev[postId],
        [shiftId]: prev[postId][shiftId].map((emp) =>
          emp.id === editingEmployee.id
            ? {
              ...emp,

              // Main employee ID
              id: editSelectedEmployee?._id ?? emp.id,

              // Main employee name
              title: editSelectedEmployee
                ? `${editSelectedEmployee.firstName} ${editSelectedEmployee.lastName}`
                : emp.title,

              // Backup employees (the main employee can never be his own backup)
              backups: editBackupEmployees
                .filter((b) => b._id !== newMainId)
                .map((b) => ({
                  id: b._id,
                  title: `${b.firstName} ${b.lastName}`,
                })),

              // Tasks
              tasks: editTasks,
            }
            : emp
        ),
      },
    }));

    // close modal / cleanup...
    setIsEditModalOpen(false);
    setEditingEmployee(null);
    setEditTitle("");
    setEditBackupEmployees([]);
    setEditBackupSearch("");
    setEditTasks([]);
    setActiveCell(null);
  }, [
    editingEmployee,
    activeCell,
    grid,
    editSelectedEmployee,
    editTitle,
    editBackupEmployees,
    editTasks,
  ]);

  // handleCloseEditModal: also clear editTasks
  const handleCloseEditModal = useCallback(() => {
    setIsEditModalOpen(false);
    setEditingEmployee(null);
    setEditTitle("");
    setEditBackupEmployees([]);
    setEditBackupSearch("");
    setEditTasks([]);
    setActiveCell(null);
  }, []);

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = useCallback((employeeId: string, cell?: { postId: number; shiftId: string }) => {
    const target = cell ?? activeCell;
    if (!target) return;
    const { postId, shiftId } = target;
    setGrid((prev) => ({
      ...prev,
      [postId]: {
        ...prev[postId],
        [shiftId]: prev[postId][shiftId].filter((emp) => emp.id !== employeeId),
      },
    }));
    closeModal();
    setActiveCell(null);
  }, [activeCell, closeModal]);

  const handleCopyMonthClick = useCallback(() => {
    setCopySourceMonth("");
    setCopyDestinationMonth("");
    setIsCopyMonthModalOpen(true);
  }, []);

  // ── Save planning to DB ───────────────────────────────────────────────────
  const handleSavePlanning = useCallback(async () => {
    if (!gridIsForCurrentDay()) return;
    const planDate = currentDate.toLocaleDateString('en-CA', { timeZone: 'Africa/Algiers' }); // → "YYYY-MM-DD"
    const entries: {
      shiftId: string;
      empId: string;
      backupEmpIds: string[];
      taskId: number;
      planDate: string;
      tasks: ShiftTask[]
    }[] = [];
    console.log("entries before saving:", entries);
    console.log("🕸️🕸️grid before saving:", grid);
    posts.forEach((post) => {
      shifts.forEach((shift) => {
        (grid[post.id]?.[shift.id] ?? []).forEach((cell) => {
          entries.push(
            {
              shiftId: shift.id,
              empId: cell.id,
              backupEmpIds: getBackupIds(cell),
              taskId: post.id,
              planDate,
              tasks: cell.tasks ?? []
            });
        });
      });
    });
    if (entries.length === 0) { toast.warning("Add at least one employee to this day before saving."); return; }
    try {
      const res = await fetch(`${API_BASE_URL}/planning/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries, planDate }),
      });
      await ensureOk(res);
      toast.success("Planning saved.");
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't save the planning"));
    }
  }, [grid, currentDate, posts, shifts, gridIsForCurrentDay]);

  const handleCopyMonth = useCallback(async () => {
    if (!copySourceMonth || !copyDestinationMonth) {
      toast.warning("Choose both the month to copy from and the month to copy to.");
      return;
    }

    if (copySourceMonth === copyDestinationMonth) {
      toast.warning("Choose two different months.");
      return;
    }

    try {
      setIsCopyingMonth(true);

      const res = await fetch(`${API_BASE_URL}/planning/copy-month`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceMonth: copySourceMonth,
          destinationMonth: copyDestinationMonth,
        }),
      });

      await ensureOk(res);

      const result = await res.json();

      toast.success(result.message || "Planning copied.");

      setIsCopyMonthModalOpen(false);
      setCopySourceMonth("");
      setCopyDestinationMonth("");

    } catch (error) {
      toast.error(friendlyError(error, "Couldn't copy the planning"));
    } finally {
      setIsCopyingMonth(false);
    }
  }, [
    copySourceMonth,
    copyDestinationMonth,
  ]);

  // ── Save planning to weekday ───────────────────────────────────────────────────
  const getSameWeekdayDatesInMonth = (date: Date): Date[] => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const weekday = date.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const result: Date[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      if (d.getDay() === weekday) result.push(d);
    }
    return result;
  };

  const handleSaveToAllWeekdays = useCallback(async () => {
    if (!gridIsForCurrentDay()) return;
    const entries: {
      shiftId: string;
      empId: string;
      backupEmpIds: string[];
      taskId: number;
      tasks: ShiftTask[];
    }[] = [];

    posts.forEach((post) => {
      shifts.forEach((shift) => {
        (grid[post.id]?.[shift.id] ?? []).forEach((cell) => {
          entries.push({
            shiftId: shift.id,
            empId: cell.id,
            backupEmpIds: getBackupIds(cell),
            taskId: post.id,
            tasks: cell.tasks ?? [],
          });
        });
      });
    });

    if (entries.length === 0) {
      toast.warning("There is no one planned on this day to copy.");
      return;
    }

    const targetDates = getSameWeekdayDatesInMonth(currentDate);

    if (targetDates.length === 0) return;

    const weekdayName = currentDate.toLocaleDateString(locale(), {
      weekday: "long",
    });

    try {
      const results = await Promise.allSettled(
        targetDates.map(async (date) => {
          const planDate = date.toLocaleDateString("en-CA", {
            timeZone: "Africa/Algiers",
          });

          const entriesWithDate = entries.map((e) => ({
            ...e,
            planDate,
          }));

          const res = await fetch(`${API_BASE_URL}/planning/bulk`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              entries: entriesWithDate,
              planDate,
            }),
          });

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(
              `${planDate}: ${res.status} ${errText}`
            );
          }

          return planDate;
        })
      );

      const failures = results.filter(
        (r) => r.status === "rejected"
      ) as PromiseRejectedResult[];

      if (failures.length > 0) {
        console.error("Duplication failures:", failures.map((f) => f.reason));
        toast.error(
          t("Copied to {done} of {total} days ({weekday}).", { done: targetDates.length - failures.length, total: targetDates.length, weekday: weekdayName }) +
            " " + friendlyError(failures[0].reason)
        );
      } else {
        toast.success(t("Planning copied to {n} days ({weekday}).", { n: targetDates.length, weekday: weekdayName }));
      }
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't copy the planning"));
    }
  }, [grid, currentDate, posts, shifts, gridIsForCurrentDay]);

  const handleSaveToNextWeekdays = useCallback(async () => {
    if (!gridIsForCurrentDay()) return;
    const entries: {
      shiftId: string;
      empId: string;
      backupEmpIds: string[];
      taskId: number;
      tasks: ShiftTask[];
    }[] = [];

    // Get the planning of the selected day
    posts.forEach((post) => {
      shifts.forEach((shift) => {
        (grid[post.id]?.[shift.id] ?? []).forEach((cell) => {
          entries.push({
            shiftId: shift.id,
            empId: cell.id,
            backupEmpIds: getBackupIds(cell),
            taskId: post.id,
            tasks: cell.tasks ?? [],
          });
        });
      });
    });

    if (entries.length === 0) {
      toast.warning("There is no one planned on this day to copy.");
      return;
    }

    // Generate selected date + next occurrences of the same weekday
    const targetDates: Date[] = [];

    const selectedDate = new Date(currentDate);
    const selectedMonth = selectedDate.getMonth();
    const selectedYear = selectedDate.getFullYear();

    let date = new Date(selectedDate);

    while (
      date.getMonth() === selectedMonth &&
      date.getFullYear() === selectedYear
    ) {
      targetDates.push(new Date(date));

      // Move to the next occurrence of the same weekday
      date.setDate(date.getDate() + 7);
    }

    const weekdayName = currentDate.toLocaleDateString(locale(), {
      weekday: "long",
    });

    try {
      const results = await Promise.allSettled(
        targetDates.map(async (targetDate) => {
          const planDate = targetDate.toLocaleDateString("en-CA", {
            timeZone: "Africa/Algiers",
          });

          const entriesWithDate = entries.map((entry) => ({
            ...entry,
            planDate,
          }));

          const res = await fetch(`${API_BASE_URL}/planning/bulk`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              entries: entriesWithDate,
              planDate,
            }),
          });

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`${planDate}: ${res.status} ${errText}`);
          }

          return planDate;
        })
      );

      const failures = results.filter(
        (r) => r.status === "rejected"
      ) as PromiseRejectedResult[];

      if (failures.length > 0) {
        console.error("Save to weekdays failures:", failures.map((f) => f.reason));
        toast.error(
          t("Saved to {done} of {total} days ({weekday}).", { done: targetDates.length - failures.length, total: targetDates.length, weekday: weekdayName }) +
            " " + friendlyError(failures[0].reason)
        );
        return;
      }

      toast.success(
        t("Planning saved to {n} days ({weekday}), starting from the selected day.", { n: targetDates.length, weekday: weekdayName })
      );
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't save the planning to the next weeks"));
    }
  }, [grid, currentDate, posts, shifts, gridIsForCurrentDay]);

  const excelInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    setShowImportMenu((prev) => !prev);
  };

  const handleExcelImportClick = () => {
    excelInputRef.current?.click();
    setShowImportMenu(false);
  };

  const handlePdfImportClick = () => {
    pdfInputRef.current?.click();
    setShowImportMenu(false);
  };

  const handleImportFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];

    if (!file) return;

    try {
      // =========================================================
      // 1. Make sure posts and shifts exist
      // =========================================================

      if (posts.length === 0) {
        toast.warning("Add at least one post before importing a planning.");
        return;
      }

      if (shifts.length === 0) {
        toast.warning("Add at least one shift before importing a planning.");
        return;
      }

      // =========================================================
      // 2. Default post
      // =========================================================

      const defaultPost = posts[0];

      // =========================================================
      // 3. Empty grid
      // =========================================================

      const importedGrid = buildEmptyGrid(posts, shifts);

      const notFound: string[] = [];

      // =========================================================
      // 4. Helper: find shift using exported hour
      // =========================================================

      const findShiftByHour = (hourValue: string) => {
        const hour = hourValue
          .trim()
          .replace(/H$/i, "")
          .padStart(2, "0");

        return shifts.find((shift) => {
          // IMPORTANT:
          // Use the properties that actually exist in your Shift type.
          //
          // If your Shift has:
          //   label = "06:00 - 14:00"
          //
          // then use label.
          //
          // If your Shift has:
          //   start = "06:00"
          //
          // use shift.start.

          const label = String(shift.label ?? "");

          const startTime = label
            .split(" - ")[0]
            ?.substring(0, 2)
            .padStart(2, "0");

          return startTime === hour;
        });
      };

      // =========================================================
      // 5. Find employee by full name
      // =========================================================

      const findEmployee = (name: string) => {
        const normalizedName = name
          .trim()
          .replace(/\s+/g, " ")
          .toLowerCase();

        return employees.find((emp) => {
          const fullName =
            `${emp.firstName} ${emp.lastName}`
              .trim()
              .replace(/\s+/g, " ")
              .toLowerCase();

          return fullName === normalizedName;
        });
      };

      // =========================================================
      // 6. Add a backup to the current employee (no duplicates)
      // =========================================================

      const addBackupToCell = (
        cell: Cell,
        backupEmployee: EmployeeRecord
      ) => {
        // an employee can't be his own backup
        if (backupEmployee._id === cell.id) return;

        if (!cell.backups.some((b) => b.id === backupEmployee._id)) {
          cell.backups.push({
            id: backupEmployee._id,
            title: `${backupEmployee.firstName} ${backupEmployee.lastName}`,
          });
        }
      };

      // =========================================================
      // 7. EXCEL IMPORT
      // =========================================================

      if (
        file.name.toLowerCase().endsWith(".xlsx") ||
        file.name.toLowerCase().endsWith(".xls")
      ) {
        const data = await file.arrayBuffer();

        const workbook = XLSX.read(data, {
          type: "array",
        });

        const worksheet =
          workbook.Sheets[workbook.SheetNames[0]];

        const rows = XLSX.utils.sheet_to_json(
          worksheet,
          {
            header: 1,
            defval: "",
          }
        ) as unknown as string[][];

        if (rows.length < 2) {
          toast.error("This Excel file is empty or can't be read.");
          return;
        }

        const header = rows[0];

        if (
          String(header[0])
            .trim()
            .toLowerCase() !== "hour"
        ) {
          toast.error(
            "This isn't a planning file: the first column must be called 'Hour'."
          );
          return;
        }

        rows.slice(1).forEach((row) => {
          const hourValue =
            String(row[0] ?? "").trim();

          const employeeValue =
            String(row[1] ?? "").trim();

          if (!hourValue || !employeeValue) {
            return;
          }

          const shift = findShiftByHour(hourValue);

          if (!shift) {
            console.warn(
              `No shift found for ${hourValue}`
            );
            return;
          }

          const lines = employeeValue
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

          let currentEmployee: Cell | null = null;

          lines.forEach((line) => {

            // ---------------------------------------------
            // BACKUP (one "Backup: Name" line per backup)
            // ---------------------------------------------

            if (
              line
                .toLowerCase()
                .startsWith("backup:")
            ) {

              if (!currentEmployee) {
                return;
              }

              const backupName = line
                .substring("Backup:".length)
                .trim();

              if (
                !backupName ||
                backupName.toLowerCase() ===
                "no backup"
              ) {
                return;
              }

              const backupEmployee =
                findEmployee(backupName);

              if (!backupEmployee) {
                notFound.push(backupName);
                return;
              }

              // currentEmployee is the same object that is
              // already in the grid, so no need to replace it
              addBackupToCell(currentEmployee, backupEmployee);

              return;
            }

            // ---------------------------------------------
            // MAIN EMPLOYEE
            // ---------------------------------------------

            const employee =
              findEmployee(line);

            if (!employee) {
              notFound.push(line);
              currentEmployee = null;
              return;
            }

            currentEmployee = {
              id: employee._id,

              title:
                `${employee.firstName} ${employee.lastName}`,

              backups: [],
            };

            importedGrid[
              defaultPost.id
            ][shift.id].push(currentEmployee);
          });
        });
      }

      // =========================================================
      // 8. PDF IMPORT
      // =========================================================

      else if (
        file.name.toLowerCase().endsWith(".pdf")
      ) {
        const data = await file.arrayBuffer();

        const pdfjsLib = await import("pdfjs-dist");

        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

        const pdf = await pdfjsLib.getDocument({
          data,
        }).promise;

        const extractedLines: string[] = [];

        // ---------------------------------------------
        // Read every PDF page
        // ---------------------------------------------

        for (
          let pageNumber = 1;
          pageNumber <= pdf.numPages;
          pageNumber++
        ) {

          const page =
            await pdf.getPage(pageNumber);

          const content =
            await page.getTextContent();

          /*
          * PDF.js returns individual text items.
          * We collect their strings in the same order
          * as the exported PDF.
          */

          content.items.forEach((item: any) => {

            const text =
              String(item.str ?? "").trim();

            if (text) {
              extractedLines.push(text);
            }
          });
        }

        console.log(
          "PDF extracted text:",
          extractedLines
        );

        // =====================================================
        // Find the exported hour rows
        // =====================================================

        const validHours = new Set(
          [
            "06H",
            "07H",
            "08H",
            "09H",
            "10H",
            "11H",
            "12H",
            "14H",
            "15H",
            "16H",
          ]
        );

        let currentShiftId: string | null = null;
        let currentEmployee: Cell | null = null;

        // =====================================================
        // Process PDF text
        // =====================================================

        extractedLines.forEach((line) => {

          const cleanLine = line
            .trim()
            .replace(/\s+/g, " ");

          if (!cleanLine) {
            return;
          }

          // ---------------------------------------------
          // Ignore PDF title
          // ---------------------------------------------

          if (
            cleanLine
              .toLowerCase()
              .startsWith("daily planning")
          ) {
            return;
          }

          // ---------------------------------------------
          // Ignore headers
          // ---------------------------------------------

          if (
            cleanLine.toLowerCase() === "hour"
          ) {
            return;
          }

          // ---------------------------------------------
          // Detect hour
          // ---------------------------------------------

          const hourMatch =
            cleanLine.match(
              /^(06|07|08|09|10|11|12|14|15|16)H$/i
            );

          if (hourMatch) {

            const hour =
              `${hourMatch[1]}H`;

            const shift =
              findShiftByHour(hour);

            if (!shift) {
              console.warn(
                `No existing shift found for ${hour}`
              );

              currentShiftId = null;
              return;
            }

            currentShiftId = shift.id;
            currentEmployee = null;

            return;
          }

          // ---------------------------------------------
          // No shift selected yet
          // ---------------------------------------------

          if (!currentShiftId) {
            return;
          }

          // ---------------------------------------------
          // BACKUP EMPLOYEE (one "Backup: Name" per backup)
          // ---------------------------------------------

          if (
            cleanLine
              .toLowerCase()
              .startsWith("backup:")
          ) {

            const backupName =
              cleanLine
                .substring("Backup:".length)
                .trim();

            if (
              !backupName ||
              backupName.toLowerCase() ===
              "no backup"
            ) {
              return;
            }

            if (!currentEmployee) {
              return;
            }

            const backupEmployee =
              findEmployee(backupName);

            if (!backupEmployee) {
              notFound.push(backupName);
              return;
            }

            // currentEmployee is the same object that is
            // already in the grid, so no need to replace it
            addBackupToCell(currentEmployee, backupEmployee);

            return;
          }

          // ---------------------------------------------
          // MAIN EMPLOYEE
          // ---------------------------------------------

          const employee =
            findEmployee(cleanLine);

          if (!employee) {
            notFound.push(cleanLine);
            currentEmployee = null;
            return;
          }

          currentEmployee = {
            id: employee._id,

            title:
              `${employee.firstName} ${employee.lastName}`,

            backups: [],
          };

          importedGrid[
            defaultPost.id
          ][currentShiftId].push(
            currentEmployee
          );
        });
      }

      // =========================================================
      // 9. Unsupported file
      // =========================================================

      else {
        toast.error("Choose an Excel (.xlsx, .xls) or PDF (.pdf) file.");

        return;
      }

      // =========================================================
      // 10. Show employees that were not found
      // =========================================================

      if (notFound.length > 0) {

        toast.warning(
          t("Imported, but these employees weren't found and were skipped: {names}", { names: [...new Set(notFound)].join(", ") })
        );
      }

      // =========================================================
      // 11. Update grid
      // =========================================================

      setGrid(importedGrid);

    } catch (error) {

      toast.error(friendlyError(error, "Couldn't import the planning file"));

    } finally {

      // Allow importing the same file again
      e.target.value = "";
    }
  };

  const handleImportFromDate = useCallback(
    async (date: Date) => {
      await loadPlanningForDate(date, { notifyOnError: true });
    },
    [loadPlanningForDate]
  );

  // ── One save at a time ────────────────────────────────────────────────────
  // A second click while saving would send the same day twice (stored twice).
  const savingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const oneSaveAtATime = useCallback(async (save: () => Promise<void>) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      await save();
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, []);

  return {
    posts, shifts, employees, filteredEmployees, loadingMeta, metaError, loadingGrid,
    grid,
    currentDate, setCurrentDate,
    calendarMonth, setCalendarMonth,
    goToToday, goPrev, goNext, formattedDate,
    isOpen, activeCell, empSearch, setEmpSearch, selectedEmployee, setSelectedEmployee, backupEmpSearch, setBackupEmpSearch,
    selectedBackupEmployees, addBackup, removeBackup,
    filteredBackupEmployees,
    handleCellClick, handleSave, handleClose,
    editSelectedEmployee, setEditSelectedEmployee, isEditModalOpen, editingEmployee, editTitle, setEditTitle, editBackupSearch, setEditBackupSearch,
    editBackupEmployees, addEditBackup, removeEditBackup,
    filteredEditBackupEmployees, filteredEditEmployees,
    openEditModal, handleEdit, handleCloseEditModal,
    isListModalOpen, setIsListModalOpen,
    listCell, setListCell, listEmployees,
    handleDelete,
    handleSavePlanning: () => oneSaveAtATime(handleSavePlanning),
    isSaving,
    excelInputRef, pdfInputRef, handleImportClick, handleExcelImportClick, handlePdfImportClick, handleImportFile,
    showImportMenu, setShowImportMenu,
    handleSaveToAllWeekdays: () => oneSaveAtATime(handleSaveToAllWeekdays),
    handleSaveToNextWeekdays: () => oneSaveAtATime(handleSaveToNextWeekdays),
    addTasks, setAddTasks, addTask, updateTask, removeTask,
    editTasks, addEditTask, updateEditTask, removeEditTask,
    isImportModalOpen,
    setIsImportModalOpen,
    importDate,
    setImportDate,
    handleImportFromDate,

    isCopyMonthModalOpen,
    setIsCopyMonthModalOpen,
    copySourceMonth,
    setCopySourceMonth,
    copyDestinationMonth,
    setCopyDestinationMonth,
    isCopyingMonth,
    handleCopyMonthClick,
    handleCopyMonth,
  };
};