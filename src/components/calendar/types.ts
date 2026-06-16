export interface Cell {
  id: string;
  title: string;
}

export type GridData = Record<number, Record<string, Cell[]>>;

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