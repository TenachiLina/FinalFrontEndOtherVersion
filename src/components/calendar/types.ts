// types.ts

// ─────────────────────────────────────────────────────────────
// Posts
// ─────────────────────────────────────────────────────────────

export const POSTS = [
  { id: 1, label: "Pizzaiolo" },
  { id: 2, label: "Livreur" },
  { id: 3, label: "Agent polyvalent" },
  { id: 4, label: "Prepateur" },
  { id: 5, label: "Caissier" },
  { id: 6, label: "Plongeur" },
  { id: 7, label: "Serveur" },
  { id: 8, label: "Manageur" },
  { id: 9, label: "Packaging" },
  { id: 10, label: "Topping" },
  { id: 11, label: "Bar" },
  { id: 12, label: "Pate" },
];


// ─────────────────────────────────────────────────────────────
// Frontend Shift definitions
// ─────────────────────────────────────────────────────────────

export const SHIFTS = [
  {
    id: "shift-1",
    label: "6:00 AM - 16:00 PM",
    sub: "Morning-Afternoon",
  },
  {
    id: "shift-2",
    label: "16:00 PM - 00:00 AM",
    sub: "Evening",
  },
  {
    id: "shift-3",
    label: "16:00 PM - 00:00 AM",
    sub: "Evening",
  },
];


// ─────────────────────────────────────────────────────────────
// Tasks
// ─────────────────────────────────────────────────────────────

export type ShiftTask = {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
};


// ─────────────────────────────────────────────────────────────
// API Employee
// ─────────────────────────────────────────────────────────────

export interface EmployeeRecord {
  _id: string;
  empNumber: number;
  firstName: string;
  lastName: string;
  baseSalary: number;
  address?: string;
  phoneNumber?: string;
  personalImage?: string;
}


// ─────────────────────────────────────────────────────────────
// API Shift
// ─────────────────────────────────────────────────────────────

export interface ShiftRecord {
  _id: string;
  startTime: string;
  endTime: string;
  isArchived?: boolean;
}


// ─────────────────────────────────────────────────────────────
// API Task
// ─────────────────────────────────────────────────────────────

export interface TaskRecord {
  _id: string;
  taskId: number;
  taskName: string;
}


// ─────────────────────────────────────────────────────────────
// API Planning
// ─────────────────────────────────────────────────────────────

export interface PlanningRecord {
  _id: string;

  shiftId: ShiftRecord;

  empId: EmployeeRecord;

  // Backup employee assigned to this planning
  backupEmpId?: EmployeeRecord | null;

  taskId: number;

  planDate: string;

  customStartTime?: string;

  customEndTime?: string;

  tasks?: ShiftTask[];
}


// ─────────────────────────────────────────────────────────────
// Frontend Employee
// ─────────────────────────────────────────────────────────────

export interface Post {
  id: number;
  label: string;
  mongoId: string;
}


// ─────────────────────────────────────────────────────────────
// Frontend Shift
// ─────────────────────────────────────────────────────────────

export interface Shift {
  id: string;
  label: string;
  sub: string;
}


// ─────────────────────────────────────────────────────────────
// Planning Grid Cell
// ─────────────────────────────────────────────────────────────

export type Cell = {
  id: string;

  title: string;

  // Backup employee ID used by the frontend grid
  backupEmployeeId?: string | null;

  // Backup employee display name
  backupTitle?: string | null;

  planningId?: string;

  tasks?: ShiftTask[];
};


// ─────────────────────────────────────────────────────────────
// Planning Grid
// ─────────────────────────────────────────────────────────────

export type GridData = Record<
  number,
  Record<string, Cell[]>
>;

// ─────────────────────────────────────────────────────────────
// Combine Employees + absent employees' backups:
// ─────────────────────────────────────────────────────────────

export interface AttendanceEmployee {
  num: number;
  mongoId: string;
  empNumber: string;
  FirstName: string;
  specialClockIn?: string;
  specialClockOut?: string;
}

// ─────────────────────────────────────────────────────────────
// Used To display the backup employee if the main is absent and it exists:
// ─────────────────────────────────────────────────────────────

export interface AttendanceRow {
  employee: AttendanceEmployee;
  isBackup: boolean;
  backupOfEmpNum?: number;
}