"use client";
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
  let stepsCounter : number = 0;
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
  //For Main Employee:
  const [activeCell,       setActiveCell]       = useState<{ postId: number; shiftId: string } | null>(null);
  const [empSearch,        setEmpSearch]        = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null);
  //Optional Backup Employee:
  const [backupEmpSearch, setBackupEmpSearch] = useState("");
  const [selectedBackupEmployee, setSelectedBackupEmployee] = useState<EmployeeRecord | null>(null);
  // ── Add modal tasks ─────────────────────────────────────────
  const [addTasks, setAddTasks] = useState<ShiftTask[]>([]);
  
  // ── Edit modal ────────────────────────────────────────────────────────────
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  //For Main Employee:
  const [editingEmployee, setEditingEmployee] = useState<Cell | null>(null);
  const [editTitle,       setEditTitle]       = useState("");
  const [editSelectedEmployee, setEditSelectedEmployee] = useState<EmployeeRecord | null>(null);
  //For Backup Employee:
  const [editBackupEmployee, setEditBackupEmployee] = useState<EmployeeRecord | null>(null);
  const [editBackupSearch, setEditBackupSearch] = useState("");
  const [editTasks, setEditTasks] = useState<ShiftTask[]>([]);

  // ── List modal ────────────────────────────────────────────────────────────
  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [listCell,        setListCell]        = useState<{ postId: number; shiftId: string } | null>(null);
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
  //Filtred backup employee list for dropdown
  const filteredBackupEmployees = employees.filter((e) => {
    if (selectedEmployee && e._id === selectedEmployee._id) {
      return false;
    }

    const q = backupEmpSearch.toLowerCase();

    return (
      e.firstName.toLowerCase().includes(q) ||
      e.lastName.toLowerCase().includes(q) ||
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
    if (editingEmployee && e._id === editingEmployee.id) {
      return false;
    }

    const q = editBackupSearch.toLowerCase();

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
  useEffect(() => {
    if (posts.length === 0 || shifts.length === 0) {
      return;
    }

    setGrid(buildEmptyGrid(posts, shifts));
  }, [currentDate, posts, shifts]);

  // ── Date navigation ───────────────────────────────────────────────────────
  const goToToday = () => { const d = new Date(); setCurrentDate(d); setCalendarMonth(d); };
  const goPrev    = () => setCurrentDate((d) => { const n = new Date(d); n.setDate(d.getDate() - 1); return n; });
  const goNext    = () => setCurrentDate((d) => { const n = new Date(d); n.setDate(d.getDate() + 1); return n; });
  const formattedDate = currentDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // ── Add modal handlers ────────────────────────────────────────────────────
  const handleCellClick = useCallback(
    (postId: number, shiftId: string) => {
      setActiveCell({ postId, shiftId });

      // Main employee
      setEmpSearch("");
      setSelectedEmployee(null);

      // Backup employee
      setBackupEmpSearch("");
      setSelectedBackupEmployee(null);

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

    // Backup employee
    setBackupEmpSearch("");
    setSelectedBackupEmployee(null);

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
      alert("This employee is already assigned to this cell.");
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

            // Backup employee
            backupEmployeeId:
              selectedBackupEmployee?._id ?? null,

            backupTitle:
              selectedBackupEmployee
                ? `${selectedBackupEmployee.firstName} ${selectedBackupEmployee.lastName}`
                : null,

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
    setSelectedBackupEmployee(null);

    setAddTasks([]);

  }, [
    activeCell,
    selectedEmployee,
    selectedBackupEmployee,
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

    // Existing backup logic
    if (emp.backupEmployeeId) {
      const backup = employees.find(
        (employee) => employee._id === emp.backupEmployeeId
      );

      setEditBackupEmployee(backup ?? null);
    } else {
      setEditBackupEmployee(null);
    }

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

    // Check duplicate main employee
    const already = grid[postId]?.[shiftId]?.some(
      (c) =>
        c.id === editSelectedEmployee?._id &&
        c.id !== editingEmployee.id
    );

    if (already) {
      alert("This employee is already assigned to this cell.");
      return;
    }

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
                  : editTitle.trim(),

                // Backup employee
                backupEmployeeId:
                  editBackupEmployee?._id ?? null,

                backupTitle: editBackupEmployee
                  ? `${editBackupEmployee.firstName} ${editBackupEmployee.lastName}`
                  : null,

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
    setEditBackupEmployee(null);
    setEditBackupSearch("");
    setEditTasks([]);
    setActiveCell(null);
  }, [
    editingEmployee,
    activeCell,
    grid,
    editSelectedEmployee,
    editTitle,
    editBackupEmployee,
    editTasks,
  ]);

  // handleCloseEditModal: also clear editTasks
  const handleCloseEditModal = useCallback(() => {
    setIsEditModalOpen(false);
    setEditingEmployee(null);
    setEditTitle("");
    setEditBackupEmployee(null);
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
    const planDate = currentDate.toLocaleDateString('en-CA', { timeZone: 'Africa/Algiers' }); // → "YYYY-MM-DD"
    const entries: { 
      shiftId: string; 
      empId: string; 
      backupEmpId?: string | null;
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
              backupEmpId: cell.backupEmployeeId ?? null,
              taskId: post.id, 
              planDate, 
              tasks: cell.tasks ?? [] 
            });
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

  const handleCopyMonth = useCallback(async () => {
    if (!copySourceMonth || !copyDestinationMonth) {
      alert("Please select both source and destination months.");
      return;
    }

    if (copySourceMonth === copyDestinationMonth) {
      alert("Source and destination months must be different.");
      return;
    }

    try {
      setIsCopyingMonth(true);

      const res = await fetch(`${BASE}/planning/copy-month`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceMonth: copySourceMonth,
          destinationMonth: copyDestinationMonth,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to copy month.");
      }

      const result = await res.json();

      alert(
        result.message ||
        "Planning copied successfully."
      );

      setIsCopyMonthModalOpen(false);
      setCopySourceMonth("");
      setCopyDestinationMonth("");

    } catch (error) {
      console.error("Error copying month:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Error copying planning."
      );
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
  
  const handleDuplicateToWeekday = useCallback(async () => {
    const entries: {
      shiftId: string;
      empId: string;
      backupEmpId?: string | null;
      taskId: number;
      tasks: ShiftTask[];
    }[] = [];

    posts.forEach((post) => {
      shifts.forEach((shift) => {
        (grid[post.id]?.[shift.id] ?? []).forEach((cell) => {
          entries.push({
            shiftId: shift.id,
            empId: cell.id,
            // ✅ Include backup employee
            backupEmpId: cell.backupEmployeeId ?? null,
            taskId: post.id,
            tasks: cell.tasks ?? [],
          });
        });
      });
    });

    if (entries.length === 0) {
      alert("No employees planned for this day.");
      return;
    }

    const targetDates = getSameWeekdayDatesInMonth(currentDate);

    if (targetDates.length === 0) return;

    const weekdayName = currentDate.toLocaleDateString("en-US", {
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

          const res = await fetch(`${BASE}/planning/bulk`, {
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
        console.error(
          "Duplication failures:",
          failures.map((f) => f.reason.message)
        );

        alert(
          `Some dates failed: ${failures
            .map((f) => f.reason.message)
            .join("; ")}`
        );
      } else {
        alert(
          `Planning duplicated to ${targetDates.length} ${weekdayName}s!`
        );
      }
    } catch (err) {
      console.error(err);
      alert("Error duplicating planning.");
    }
  }, [grid, currentDate, posts, shifts]);

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
        alert("No posts/tasks are available.");
        return;
      }

      if (shifts.length === 0) {
        alert("No shifts are available.");
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
      // 6. Add employee to grid
      // =========================================================

      const addEmployeeToGrid = (
        shiftId: string,
        employee: EmployeeRecord,
        backupEmployee?: EmployeeRecord | null
      ) => {
        importedGrid[defaultPost.id][shiftId].push({
          id: employee._id,

          title:
            `${employee.firstName} ${employee.lastName}`,

          backupEmployeeId:
            backupEmployee?._id ?? null,

          backupTitle:
            backupEmployee
              ? `${backupEmployee.firstName} ${backupEmployee.lastName}`
              : null,
        });
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
          alert("The Excel file is empty or invalid.");
          return;
        }

        const header = rows[0];

        if (
          String(header[0])
            .trim()
            .toLowerCase() !== "hour"
        ) {
          alert(
            "Invalid planning file. The first column must be 'Hour'."
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
            // BACKUP
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
                currentEmployee = {
                  ...currentEmployee,
                  backupEmployeeId: null,
                  backupTitle: null,
                };
              } else {

                const backupEmployee =
                  findEmployee(backupName);

                if (!backupEmployee) {
                  notFound.push(backupName);
                  return;
                }

                currentEmployee = {
                  ...currentEmployee,

                  backupEmployeeId:
                    backupEmployee._id,

                  backupTitle:
                    `${backupEmployee.firstName} ${backupEmployee.lastName}`,
                };
              }

              const cellIndex =
                importedGrid[
                  defaultPost.id
                ][shift.id].findIndex(
                  (emp) =>
                    emp.id === currentEmployee?.id
                );

              if (cellIndex !== -1) {
                importedGrid[
                  defaultPost.id
                ][shift.id][cellIndex] =
                  currentEmployee;
              }

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

              backupEmployeeId: null,

              backupTitle: null,
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
          // BACKUP EMPLOYEE
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

            currentEmployee = {
              ...currentEmployee,

              backupEmployeeId:
                backupEmployee._id,

              backupTitle:
                `${backupEmployee.firstName} ${backupEmployee.lastName}`,
            };

            const cellIndex =
              importedGrid[
                defaultPost.id
              ][currentShiftId].findIndex(
                (emp) =>
                  emp.id === currentEmployee?.id
              );

            if (cellIndex !== -1) {
              importedGrid[
                defaultPost.id
              ][currentShiftId][cellIndex] =
                currentEmployee;
            }

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

            backupEmployeeId: null,

            backupTitle: null,
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
        alert(
          "Please select an Excel (.xlsx/.xls) or PDF (.pdf) file."
        );

        return;
      }

      // =========================================================
      // 10. Show employees that were not found
      // =========================================================

      if (notFound.length > 0) {

        alert(
          `These employees were not found and were skipped:\n\n` +
          [...new Set(notFound)].join("\n")
        );
      }

      // =========================================================
      // 11. Update grid
      // =========================================================

      setGrid(importedGrid);

    } catch (error) {

      console.error(
        "Error importing planning:",
        error
      );

      alert(
        "Failed to import the planning file."
      );

    } finally {

      // Allow importing the same file again
      e.target.value = "";
    }
  };

  const handleImportFromDate = useCallback(
    async (date: Date) => {
      try {
        setLoadingGrid(true);

        const dateStr = date.toLocaleDateString("en-CA", {
          timeZone: "Africa/Algiers",
        });

        const records = await apiFetch<PlanningRecord[]>(
          `/planning/import/${dateStr}`
        );

        console.log("records from import:", records);

        // ---------------------------------------------
        // 1. Create an empty grid
        // ---------------------------------------------

        const importedGrid = buildEmptyGrid(
          posts,
          shifts
        );

        // ---------------------------------------------
        // 2. Put imported planning into the grid
        // ---------------------------------------------

        records.forEach((record: any) => {

          if (
            importedGrid[record.taskId] &&
            importedGrid[record.taskId][record.shiftId] !== undefined
          ) {

            importedGrid[
              record.taskId
            ][
              record.shiftId
            ].push({

              // Main employee ID
              id: record.empId,

              // Main employee name
              title: record.title,

              // Backup employee ID
              backupEmployeeId:
                record.backupEmpId ?? null,

              // Backup employee name
              backupTitle:
                record.backupTitle ?? null,

              // Existing tasks
              tasks:
                record.tasks ?? [],

              // Existing planning ID
              planningId:
                record.id,
            });
          }
        });

        console.log(
          "grid after date import:",
          importedGrid
        );

        setGrid(importedGrid);

        console.log(
          "Leaving import from date now"
        );

      } catch (err) {

        console.error(err);

        alert(
          "Failed to import planning."
        );

      } finally {

        setLoadingGrid(false);
      }

    },
    [posts, shifts]
  );

  return {
    posts, shifts, employees, filteredEmployees, loadingMeta, metaError, loadingGrid,
    grid,
    currentDate, setCurrentDate,
    calendarMonth, setCalendarMonth,
    goToToday, goPrev, goNext, formattedDate,
    isOpen, activeCell, empSearch, setEmpSearch, selectedEmployee, setSelectedEmployee, backupEmpSearch, setBackupEmpSearch, selectedBackupEmployee, setSelectedBackupEmployee,
    filteredBackupEmployees,
    handleCellClick, handleSave, handleClose,
    editSelectedEmployee, setEditSelectedEmployee, isEditModalOpen, editingEmployee, editTitle, setEditTitle, editBackupEmployee, setEditBackupEmployee, editBackupSearch, setEditBackupSearch,
    filteredEditBackupEmployees, filteredEditEmployees,
    openEditModal, handleEdit, handleCloseEditModal,
    isListModalOpen, setIsListModalOpen,
    listCell, setListCell, listEmployees,
    handleDelete, handleSavePlanning,
    excelInputRef, pdfInputRef, handleImportClick, handleExcelImportClick, handlePdfImportClick ,handleImportFile,
    showImportMenu, setShowImportMenu,
    handleDuplicateToWeekday,
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