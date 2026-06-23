export const POSTS = [
  { id: 1,  label: "Pizzaiolo" },
  { id: 2,  label: "Livreur" },
  { id: 3,  label: "Agent polyvalent" },
  { id: 4,  label: "Prepateur" },
  { id: 5,  label: "Caissier" },
  { id: 6,  label: "Plongeur" },
  { id: 7,  label: "Serveur" },
  { id: 8,  label: "Manageur" },
  { id: 9,  label: "Packaging" },
  { id: 10, label: "Topping" },
  { id: 11, label: "Bar" },
  { id: 12, label: "Pate" },
];

export const SHIFTS = [
  { id: "shift-1", label: "6:00 AM - 16:00 PM", sub: "Morning-Afternoon" },
  { id: "shift-2", label: "16:00 PM - 00:00 AM", sub: "Evening" },
  { id: "shift-3", label: "16:00 PM - 00:00 AM", sub: "Evening" },
];

export type ShiftTask = {
  id: string;
  label: string;     // e.g. "Reception desk"
  startTime: string; // "06:00"
  endTime: string;   // "10:00"
};

// add tasks to your existing Cell type
export type Cell = {
  id: string;
  title: string;
  planningId?: string;
  tasks?: ShiftTask[]; // new
};

// ─── API types ────────────────────────────────────────────────────────────────

export interface ShiftRecord   { _id: string; startTime: string; endTime: string; }
export interface TaskRecord    { _id: string; taskId: number; taskName: string; }
export interface EmployeeRecord { _id: string; empNumber: number; firstName: string; lastName: string; }
export interface PlanningRecord {
  _id: string;
  shiftId: ShiftRecord;
  empId: EmployeeRecord;
  taskId: number;
  planDate: string;
  tasks?: ShiftTask[]; 
}

export interface Post  { id: number; label: string; mongoId: string; }
export interface Shift { id: string; label: string; sub: string; }
export type GridData = Record<number, Record<string, Cell[]>>;