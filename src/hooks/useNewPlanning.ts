import { useState, useCallback, useEffect, useRef } from "react";
import { useModal } from "@/hooks/useModal";
import {Cell, EmployeeRecord, GridData, PlanningRecord, Post, Shift, ShiftRecord, TaskRecord, ShiftTask } from "../components/calendar/types";
import * as XLSX from 'xlsx';


const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" }, ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`);
  return res.json();
}

function buildEmptyGrid(posts: Post[], shifts: Shift[]): GridData {
  const g: GridData = {};
  posts.forEach((p) => { g[p.id] = {}; shifts.forEach((s) => { g[p.id][s.id] = []; }); });
  return g;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useShiftGrid = () => {
  const { isOpen, openModal, closeModal } = useModal();

  // ── Reference data ────────────────────────────────────────────────────────
  const [posts,     setPosts]     = useState<Post[]>([]);
  const [shifts,    setShifts]    = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaError,   setMetaError]   = useState<string | null>(null);

  // ── Grid & date ───────────────────────────────────────────────────────────
  const [grid,          setGrid]          = useState<GridData>({});
  const [currentDate,   setCurrentDate]   = useState(new Date());
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [loadingGrid,   setLoadingGrid]   = useState(false);

  // ── Add modal state ───────────────────────────────────────────────────────
  const [activeCell,       setActiveCell]       = useState<{ postId: number; shiftId: string } | null>(null);
  const [empSearch,        setEmpSearch]        = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null);

  // ── Edit modal ────────────────────────────────────────────────────────────
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Cell | null>(null);
  const [editTitle,       setEditTitle]       = useState("");
  const [editTasks, setEditTasks] = useState<ShiftTask[]>([]);

  // ── List modal ────────────────────────────────────────────────────────────
  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [listCell,        setListCell]        = useState<{ postId: number; shiftId: string } | null>(null);
  const listEmployees = listCell ? (grid[listCell.postId]?.[listCell.shiftId] ?? []) : [];

  // ── Filtered employee list for dropdown ───────────────────────────────────
  const filteredEmployees = employees.filter((e) => {
    const q = empSearch.toLowerCase();
    return (
      e.firstName.toLowerCase().includes(q) ||
      e.lastName.toLowerCase().includes(q) ||
      String(e.empNumber).includes(q)
    );
  });

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
        const mappedShifts: Shift[] = shiftRecords.map((s) => ({
          id: s._id, label: `${s.startTime} - ${s.endTime}`, sub: "",
        }));
        setPosts(mappedPosts);
        setShifts(mappedShifts);
        setEmployees(empRecords);
        setGrid(buildEmptyGrid(mappedPosts, mappedShifts));
      })
      .catch((e) => setMetaError(String(e)))
      .finally(() => setLoadingMeta(false));
  }, []);

  // ── Load planning for currentDate ─────────────────────────────────────────
  // useEffect(() => {
  //   if (!posts.length || !shifts.length) return;
  //   const dateStr = currentDate.toISOString().slice(0, 10);
  //   setLoadingGrid(true);
  //   apiFetch<PlanningRecord[]>(`/planning?planDate=${dateStr}`)
  //     .then((records) => {
  //       const newGrid = buildEmptyGrid(posts, shifts);
  //       records.forEach((p) => {
  //         const shiftId = p.shiftId._id;
  //         const taskId  = p.taskId;
  //         if (newGrid[taskId] && newGrid[taskId][shiftId] !== undefined) {
  //           newGrid[taskId][shiftId].push({
  //             id: p.empId._id,
  //             title: `${p.empId.firstName} ${p.empId.lastName}`,
  //             planningId: p._id,
  //           });
  //         }
  //       });
  //       setGrid(newGrid);
  //     })
  //     .catch((e) => console.warn("Planning fetch failed:", e))
  //     .finally(() => setLoadingGrid(false));
  // }, [currentDate, posts, shifts]);

  // ── Date navigation ───────────────────────────────────────────────────────
  const goToToday = () => { const d = new Date(); setCurrentDate(d); setCalendarMonth(d); };
  const goPrev    = () => setCurrentDate((d) => { const n = new Date(d); n.setDate(d.getDate() - 1); return n; });
  const goNext    = () => setCurrentDate((d) => { const n = new Date(d); n.setDate(d.getDate() + 1); return n; });
  const formattedDate = currentDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // ── Add modal handlers ────────────────────────────────────────────────────
  const handleCellClick = useCallback((postId: number, shiftId: string) => {
    setActiveCell({ postId, shiftId });
    setEmpSearch("");
    setSelectedEmployee(null);
    openModal();
  }, [openModal]);

  const handleSave = useCallback(() => {
    if (!activeCell || !selectedEmployee) return;
    const { postId, shiftId } = activeCell;
    // Prevent duplicates in the same cell
    const already = grid[postId]?.[shiftId]?.some((c) => c.id === selectedEmployee._id);
    if (already) { alert("This employee is already assigned to this cell."); return; }
    setGrid((prev) => ({
      ...prev,
      [postId]: {
        ...prev[postId],
        [shiftId]: [
          ...prev[postId][shiftId],
          { id: selectedEmployee._id, title: `${selectedEmployee.firstName} ${selectedEmployee.lastName}` },
        ],
      },
    }));
    closeModal();
    setActiveCell(null);
    setEmpSearch("");
    setSelectedEmployee(null);
  }, [activeCell, selectedEmployee, grid, closeModal]);

  const handleClose = useCallback(() => {
    closeModal();
    setActiveCell(null);
    setEmpSearch("");
    setSelectedEmployee(null);
  }, [closeModal]);

  // ── Edit handlers ─────────────────────────────────────────────────────────
  // const openEditModal = useCallback((emp: Cell, cell: { postId: number; shiftId: string }) => {
  //   setActiveCell(cell);
  //   setEditingEmployee(emp);
  //   setEditTitle(emp.title);
  //   setIsListModalOpen(false);
  //   setIsEditModalOpen(true);
  // }, []);
  const openEditModal = useCallback((emp: Cell, cell: { postId: number; shiftId: string }) => {
  setActiveCell(cell);
  setEditingEmployee(emp);
  setEditTitle(emp.title);
  setEditTasks(emp.tasks ?? []);
  setIsListModalOpen(false);
  setIsEditModalOpen(true);
  }, []);
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


  // const handleEdit = useCallback(() => {
  //   if (!activeCell || !editingEmployee || !editTitle.trim()) return;
  //   const { postId, shiftId } = activeCell;
  //   setGrid((prev) => ({
  //     ...prev,
  //     [postId]: {
  //       ...prev[postId],
  //       [shiftId]: prev[postId][shiftId].map((emp) =>
  //         emp.id === editingEmployee.id ? { ...emp, title: editTitle.trim() } : emp
  //       ),
  //     },
  //   }));
  //   setIsEditModalOpen(false);
  //   setEditingEmployee(null);
  //   setEditTitle("");
  //   setActiveCell(null);
  // }, [activeCell, editingEmployee, editTitle]);

  // const handleCloseEditModal = useCallback(() => {
  //   setIsEditModalOpen(false);
  //   setEditingEmployee(null);
  //   setEditTitle("");
  //   setActiveCell(null);
  // }, []);
  // handleEdit: validate + persist tasks alongside the title
  const handleEdit = useCallback(() => {
    if (!activeCell || !editingEmployee || !editTitle.trim()) return;

    const invalid = editTasks.find(
      (t) => !t.label.trim() || !t.startTime || !t.endTime || t.endTime <= t.startTime
    );
    if (invalid) {
      alert("Each task needs a label, a start time, and an end time after the start time.");
      return;
    }

    const { postId, shiftId } = activeCell;
    setGrid((prev) => ({
      ...prev,
      [postId]: {
        ...prev[postId],
        [shiftId]: prev[postId][shiftId].map((emp) =>
          emp.id === editingEmployee.id
            ? { ...emp, title: editTitle.trim(), tasks: editTasks }
            : emp
        ),
      },
    }));
    setIsEditModalOpen(false);
    setEditingEmployee(null);
    setEditTitle("");
    setEditTasks([]);
    setActiveCell(null);
  }, [activeCell, editingEmployee, editTitle, editTasks]);

  // handleCloseEditModal: also clear editTasks
  const handleCloseEditModal = useCallback(() => {
    setIsEditModalOpen(false);
    setEditingEmployee(null);
    setEditTitle("");
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

  // ── Save planning to DB ───────────────────────────────────────────────────
  const handleSavePlanning = useCallback(async () => {
    const planDate = currentDate.toLocaleDateString('en-CA', { timeZone: 'Africa/Algiers' }); // → "YYYY-MM-DD"

    // const entries: { shiftId: string; empId: string; taskId: number; planDate: string }[] = [];
    // posts.forEach((post) => {
    //   shifts.forEach((shift) => {
    //     (grid[post.id]?.[shift.id] ?? []).forEach((cell) => {
    //       entries.push({ shiftId: shift.id, empId: cell.id, taskId: post.id, planDate });
    //     });
    //   });
    // });
    const entries: { shiftId: string; empId: string; taskId: number; planDate: string; tasks: ShiftTask[] }[] = [];
    posts.forEach((post) => {
      shifts.forEach((shift) => {
        (grid[post.id]?.[shift.id] ?? []).forEach((cell) => {
          entries.push({ shiftId: shift.id, empId: cell.id, taskId: post.id, planDate, tasks: cell.tasks ?? [] });
        });
      });
    });

    if (entries.length === 0) { alert("No employees planned for this day."); return; }

    try {
      const res = await fetch(`${BASE}/planning/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries, planDate }),
      });
      if (!res.ok) throw new Error("Failed to save");
      alert("Planning saved!");
    } catch (err) {
      console.error(err);
      alert("Error saving planning.");
    }
  }, [grid, currentDate, posts, shifts]);



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

  const handleDuplicateToWeekday = useCallback(async () => {
    // const entries: { shiftId: string; empId: string; taskId: number }[] = [];
    // posts.forEach((post) => {
    //   shifts.forEach((shift) => {
    //     (grid[post.id]?.[shift.id] ?? []).forEach((cell) => {
    //       entries.push({ shiftId: shift.id, empId: cell.id, taskId: post.id });
    //     });
    //   });
    // });
    const entries: { shiftId: string; empId: string; taskId: number; tasks: ShiftTask[] }[] = [];
    posts.forEach((post) => {
      shifts.forEach((shift) => {
        (grid[post.id]?.[shift.id] ?? []).forEach((cell) => {
          entries.push({ shiftId: shift.id, empId: cell.id, taskId: post.id, tasks: cell.tasks ?? [] });
        });
      });
    });

   
    if (entries.length === 0) {
      alert("No employees planned for this day.");
      return;
    }

    const targetDates = getSameWeekdayDatesInMonth(currentDate).filter(
      (d) => d.toDateString() !== currentDate.toDateString()
    );
    if (targetDates.length === 0) return;

    const weekdayName = currentDate.toLocaleDateString("en-US", { weekday: "long" });
    const confirmed = confirm(
      `Copy today's planning to ${targetDates.length} other ${weekdayName}(s) this month? This will overwrite any existing planning on those dates.`
    );
    if (!confirmed) return;

    try {
      const results = await Promise.allSettled(
      targetDates.map(async (date) => {
        const planDate = date.toLocaleDateString("en-CA", { timeZone: "Africa/Algiers" });
        const entriesWithDate = entries.map((e) => ({ ...e, planDate }));

        const res = await fetch(`${BASE}/planning/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries: entriesWithDate, planDate }),
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`${planDate}: ${res.status} ${errText}`);
        }
        return planDate;
      })
      );

      const failures = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      if (failures.length > 0) {
        console.error("Duplication failures:", failures.map((f) => f.reason.message));
        alert(`Some dates failed: ${failures.map((f) => f.reason.message).join("; ")}`);
      } else {
        alert(`Planning duplicated to ${targetDates.length} day(s)!`);
      }
    } catch (err) {
      console.error(err);
      alert("Error duplicating planning.");
    }
  }, [grid, currentDate, posts, shifts]);



  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Import planning ───────────────────────────────────────────────────
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet);

  const importedGrid = buildEmptyGrid(posts, shifts);
  const notFound: string[] = [];

  rows.forEach((row) => {
    const taskName = row.Task;
    const post = posts.find((p) => p.label === taskName);
    if (!post) return;

    shifts.forEach((shift) => {
      const cellValue = row[shift.label];
      if (!cellValue) return;

      importedGrid[post.id][shift.id] = String(cellValue)
        .split("\n")
        .map((n) => n.trim())
        .filter(Boolean)
        .map((name) => {
          const emp = employees.find(
            (e) => `${e.firstName} ${e.lastName}`.toLowerCase() === name.toLowerCase()
          );
          if (!emp) { notFound.push(name); return null; }
          return { id: emp._id, title: `${emp.firstName} ${emp.lastName}` };
        })
        .filter((c): c is Cell => c !== null);
    });
  });

  if (notFound.length > 0) {
    alert(`These names weren't found in the employee list and were skipped:\n${[...new Set(notFound)].join(", ")}`);
  }

  setGrid(importedGrid);
  e.target.value = "";
  };
  return {
    posts, shifts, employees, filteredEmployees, loadingMeta, metaError, loadingGrid,
    grid,
    currentDate, setCurrentDate,
    calendarMonth, setCalendarMonth,
    goToToday, goPrev, goNext, formattedDate,
    isOpen, activeCell, empSearch, setEmpSearch, selectedEmployee, setSelectedEmployee,
    handleCellClick, handleSave, handleClose,
    isEditModalOpen, editingEmployee, editTitle, setEditTitle,
    openEditModal, handleEdit, handleCloseEditModal,
    isListModalOpen, setIsListModalOpen,
    listCell, setListCell, listEmployees,
    handleDelete, handleSavePlanning,
    fileInputRef, handleImportClick, handleImportFile,
    handleDuplicateToWeekday,
    editTasks, addEditTask, updateEditTask, removeEditTask,
  };
};