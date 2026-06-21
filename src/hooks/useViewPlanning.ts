import { useState, useCallback, useEffect } from "react";
import { useModal } from "@/hooks/useModal";
import { Cell, GridData, TaskRecord, ShiftRecord, EmployeeRecord, PlanningRecord } from "../components/calendar/types";
import * as XLSX from 'xlsx';

const apiFetch = <T,>(path: string): Promise<T> =>
  fetch(`http://localhost:3001${path}`).then((r) => {
    if (!r.ok) throw new Error(`Failed to fetch ${path}`);
    return r.json();
  });

function buildEmptyGrid(tasks: TaskRecord[], shifts: ShiftRecord[]): GridData {
  const g: GridData = {};
  tasks.forEach((t) => {
    g[t.taskId] = {};
    shifts.forEach((s) => { g[t.taskId][s._id] = []; });
  });
  return g;
}

export const useViewPlanning = () => {
  const { isOpen, openModal, closeModal } = useModal();

  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaReady, setMetaReady] = useState(false);

  const [grid, setGrid] = useState<GridData>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const goToToday = () => setCurrentDate(new Date());
  const goPrev = () => setCurrentDate((d) => { const n = new Date(d); n.setDate(d.getDate() - 1); return n; });
  const goNext = () => setCurrentDate((d) => { const n = new Date(d); n.setDate(d.getDate() + 1); return n; });

  const formattedDate = currentDate.toLocaleDateString("en-CA", {
    month: "long", day: "numeric", year: "numeric",
  });

  const [activeEmployee, setActiveEmployee] = useState<Cell | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [listCell, setListCell] = useState<{ postId: number; shiftId: string } | null>(null);
  const listEmployees = listCell ? (grid[listCell.postId]?.[listCell.shiftId] ?? []) : [];

  // ── Fetch meta once ──────────────────────────────────────────────
  useEffect(() => {
    setLoadingMeta(true);
    Promise.all([
      apiFetch<TaskRecord[]>("/tasks"),
      apiFetch<ShiftRecord[]>("/shifts"),
      apiFetch<EmployeeRecord[]>("/employees"),
    ])
      .then(([taskRecords, shiftRecords, empRecords]) => {
        setTasks(taskRecords);
        setShifts(shiftRecords);
        setEmployees(empRecords);
        setGrid(buildEmptyGrid(taskRecords, shiftRecords));
        setMetaReady(true);
      })
      .catch((e) => setMetaError(String(e)))
      .finally(() => setLoadingMeta(false));
  }, []);

  // ── Fetch planning ───────────────────────────────────────────────
  const fetchPlanning = useCallback(async (taskRecords: TaskRecord[], shiftRecords: ShiftRecord[]) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<PlanningRecord[]>("/planning");

      const currentDateStr = currentDate.toLocaleDateString('en-CA', { timeZone: 'Africa/Algiers' });

      const filteredData = data.filter((item) => {
        const itemDateStr = new Date(item.planDate).toISOString().split('T')[0];
        return itemDateStr === currentDateStr;
      });

      const newGrid = buildEmptyGrid(taskRecords, shiftRecords);

      filteredData.forEach((item) => {
        const taskId = item.taskId;       // number
        const shiftId = item.shiftId._id;     // MongoDB _id string from /shifts

        if (newGrid[taskId]?.[shiftId] !== undefined) {
          newGrid[taskId][shiftId].push({
            id: item.empId._id,
            title: `${item.empId.firstName} ${item.empId.lastName}`,
            planningId: item._id,
            tasks: item.tasks ?? [],   // add this
          });
        } else {
          console.warn(`No grid cell for taskId=${taskId} shiftId=${shiftId}`);
        }
      });

      setGrid(newGrid);
    } catch (err) {
      console.error("Error fetching planning:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  // ── Re-fetch planning when date changes or meta is ready ─────────
  useEffect(() => {
    if (!metaReady) return;
    fetchPlanning(tasks, shifts);
  }, [fetchPlanning, metaReady, tasks, shifts]);

  const handleCloseDetailsModal = useCallback(() => {
    setIsDetailsModalOpen(false);
    setActiveEmployee(null);
  }, []);

  const handleListCellClick = useCallback((postId: number, shiftId: string) => {
    setListCell({ postId, shiftId });
    setIsListModalOpen(true);
  }, []);

  const handleExport = () => {
    const shiftLabels = shifts.map((s) => `${s.startTime} - ${s.endTime}`);

    const rows = tasks.map((task) => {
      const row: Record<string, string> = { Task: task.taskName };
      shifts.forEach((shift) => {
        const emps = grid[task.taskId]?.[shift._id] ?? [];
        row[`${shift.startTime} - ${shift.endTime}`] = emps.map((emp) => emp.title).join('\n');
      });
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows, { header: ['Task', ...shiftLabels] });

    Object.keys(worksheet).forEach((key) => {
      if (key.startsWith('!')) return;
      if (!worksheet[key].s) worksheet[key].s = {};
      worksheet[key].s = { alignment: { wrapText: true, vertical: 'top' } };
    });

    worksheet['!cols'] = [{ wch: 20 }, ...shifts.map(() => ({ wch: 30 }))];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Planning');
    workbook.Workbook = { Views: [{ RTL: false }] };

    XLSX.writeFile(workbook, `planning_${formattedDate}.xlsx`, { cellStyles: true });
  };

  return {
    tasks, shifts, employees,
    loadingMeta, metaError,
    grid,
    currentDate, setCurrentDate,
    calendarMonth, setCalendarMonth,
    goToToday, goPrev, goNext, formattedDate,
    activeEmployee, isDetailsModalOpen,
    handleCloseDetailsModal,
    isListModalOpen, setIsListModalOpen,
    listCell, setListCell, listEmployees,
    handleListCellClick,
    loading, error,
    handleExport,
  };
};