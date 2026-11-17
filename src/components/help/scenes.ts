// ─────────────────────────────────────────────────────────────────────────
// The guides' scripts
//
// Each step of a guide plays on a real page of the app (in demo mode: a
// sample company, nothing saved). A step says which page to open and what
// the pointer does there, naming things the way the screen shows them: the
// "Add Shift" button, the "Start time" field. If a screen changes, the guide
// follows it; a name that no longer exists is caught by the tests.
// ─────────────────────────────────────────────────────────────────────────
import type { Target } from "./demoFrame";

/** The frame shows the app at this size (a laptop screen), scaled to fit. */
export const DESIGN_W = 1280;
export const DESIGN_H = 720;

export interface Action {
  /** What the pointer goes to */
  target: Target;
  /** Text typed into it (a field) */
  type?: string;
  /** Clicks it once there. Default: yes, unless the action types */
  click?: boolean;
}

export interface Scene {
  /** The page the step plays on, e.g. "/planning/shifts" */
  path: string;
  /** Plays signed out (the sign-in page) */
  signedOut?: boolean;
  actions: Action[];
}

const text = (t: string, more: Partial<Target> = {}): Target => ({ text: t, ...more });
const field = (label: string, more: Partial<Target> = {}): Target => ({ label, ...more });
const point = (target: Target): Action => ({ target, click: false });
const click = (target: Target): Action => ({ target });
const type = (target: Target, value: string): Action => ({ target, type: value });

/** Opens a page from the side menu: its group, then the page. */
const fromMenu = (group: string, page: string): Action[] => [click(text(group, { role: "button" })), point(text(page, { role: "link" }))];

export const SCENES: Record<string, Scene[]> = {
  "getting-started": [
    {
      path: "/signin",
      signedOut: true,
      actions: [type(field("Email"), "sara@pizzaroma.dz"), type(field("Password"), "••••••••"), point(text("Sign in", { role: "button" }))],
    },
    { path: "/home", actions: [point(text("Today")), point(text("Who is where"))] },
    { path: "/home", actions: [point(text("Planning", { role: "button" })), point(text("Reporting", { role: "button" }))] },
    { path: "/home", actions: [click(text("Language", { role: "button" })), point(text("Français"))] },
    { path: "/home", actions: [point({ selector: "header button[aria-label^='Switch to']" })] },
    { path: "/home", actions: [click({ text: "Sara Benali", selector: "header button:not([aria-label])" }), point(text("My account", { role: "link" }))] },
  ],
  "plan-week": [
    { path: "/planning/new", actions: [...fromMenu("Planning", "New Planning"), point(text("Today", { role: "button" }))] },
    { path: "/planning/new", actions: [click({ selector: "table tbody td.cursor-pointer" })] },
    {
      path: "/planning/new",
      actions: [click({ selector: "table tbody td.cursor-pointer" }), type({ text: "Type a name or employee number…", selector: "input[placeholder*='employee number']" }, "Yacine")],
    },
    { path: "/planning/new", actions: [click({ selector: "table tbody td.cursor-pointer" }), point(field("Backup Employees"))] },
    { path: "/planning/new", actions: [point(text("Save", { role: "button" }))] },
    { path: "/planning/new", actions: [point(text("Copy Month", { role: "button" }))] },
    { path: "/planning/new", actions: [point(text("Import from File", { role: "button" })), point(text("Import from Date", { role: "button" }))] },
  ],
  "view-planning": [
    { path: "/planning/view", actions: [...fromMenu("Planning", "View Planning"), point(text("Today", { role: "button" }))] },
    { path: "/planning/view", actions: [point(text("Yacine Haddad"))] },
    { path: "/planning/view", actions: [point(text("Export Day", { role: "button" })), point(text("Manager Export", { role: "button" }))] },
    { path: "/planning/view", actions: [point(text("Employees Export", { role: "button" }))] },
  ],
  shifts: [
    { path: "/planning/shifts", actions: fromMenu("Planning", "Shifts Management") },
    { path: "/planning/shifts", actions: [click(text("Add Shift", { role: "button" })), point(text("Start time")), point(text("End time"))] },
    { path: "/planning/shifts", actions: [point(text("Archive", { role: "button" })), point(text("Archived", { role: "button" }))] },
    { path: "/planning/shifts", actions: [click(text("Archived", { role: "button" })), point(text("Delete", { role: "button" }))] },
  ],
  kiosk: [
    { path: "/users", actions: [click(text("Add user", { role: "button" })), point(field("Role"))] },
    { path: "/signin", signedOut: true, actions: [type(field("Email"), "kiosk@pizzaroma.dz"), type(field("Password"), "••••••••")] },
    { path: "/kiosk", actions: [type({ selector: "input[placeholder^='Find your name']" }, "Ya"), point(text("Yacine Haddad"))] },
    { path: "/kiosk", actions: [click(text("Amel Kaci")), point(text("Clock out", { role: "button" }))] },
    { path: "/kiosk", actions: [point(text("Exit kiosk", { role: "button" }))] },
    { path: "/home", actions: [click(text("Clock In/Out", { role: "button" })), point(text("Clock-in kiosk", { role: "link" }))] },
  ],
  history: [
    { path: "/clock-in/history", actions: [click(text("Clock In/Out", { role: "button" })), point(text("Clock In/Out History", { role: "link" }))] },
    { path: "/clock-in/history", actions: [type({ selector: "input[placeholder^='Search for an employee']" }, "Amel")] },
    { path: "/clock-in/history", actions: [point(text("Clock In")), point(text("Clock Out"))] },
    { path: "/clock-in/history", actions: [point(text("Add clock-in", { role: "button" }))] },
    { path: "/clock-in/history", actions: [point(text("🗑 Delete", { role: "button" }))] },
  ],
  machine: [
    { path: "/clock-in/face", actions: [point(text("Face Recognition Machine — Connected")), point(text("Reset", { role: "button" }))] },
    { path: "/clock-in/face", actions: [point(text("Face recognition")), point(text("Yacine Haddad"))] },
    { path: "/clock-in/face", actions: [click(text("Clock In/Out", { role: "button" })), point(text("Clock In/Out with Face recognition", { role: "link" }))] },
    { path: "/company-settings", actions: [point(field("Clocking machine time zone"))] },
  ],
  employees: [
    { path: "/employees/new", actions: fromMenu("Employees Management", "Add Employee") },
    { path: "/employees/new", actions: [type(field("Employee Number: *"), "107")] },
    {
      path: "/employees/new",
      actions: [type(field("First Name: *"), "Sara"), type(field("Last Name: *"), "Benali"), type(field("Base Salary: *"), "45000"), point(text("Save", { role: "button" }))],
    },
    { path: "/employees", actions: [point({ selector: "button[aria-label='Edit']" }), point({ selector: "button[aria-label='Archive']" })] },
  ],
  payroll: [
    { path: "/reporting/weekly-advances", actions: [...fromMenu("Reporting", "Weekly Advances"), point(text("Give Advance", { role: "button" }))] },
    { path: "/reporting/monthly-payroll", actions: [point(text("Monthly Payroll", { role: "link" })), point(text("Apply", { role: "button" }))] },
    { path: "/reporting/monthly-payroll", actions: [point(text("Yacine Haddad"))] },
    { path: "/reporting/monthly-payroll", actions: [point(text("Details", { role: "link" }))] },
    { path: "/company-settings", actions: [point(text("Payroll rules")), point(field("Hours per day"))] },
  ],
  bonuses: [
    { path: "/reporting/bonuses/give", actions: [click(text("Reporting", { role: "button" })), point(text("Bonuses", { role: "button" }))] },
    { path: "/reporting/bonuses/give", actions: [click(text("Give Bonus", { role: "button" })), type(field("Amount"), "5000"), type(field("Reason"), "Great month")] },
    { path: "/reporting/bonuses/history", actions: [point(text("Bonuses", { role: "button" }))] },
  ],
  users: [
    { path: "/users", actions: [click(text("Add user", { role: "button" }))] },
    { path: "/users", actions: [click(text("Add user", { role: "button" })), point(field("Role"))] },
    { path: "/users", actions: [click(text("Add user", { role: "button" })), point(text("Generate", { role: "button" })), point(text("Create user", { role: "button" }))] },
    { path: "/users", actions: [point(text("Disable", { role: "button" })), point(text("Reset password", { role: "button" }))] },
  ],
  settings: [
    { path: "/company-settings", actions: [point(text("Company settings", { role: "link" }))] },
    { path: "/company-settings", actions: [point(field("Default language"))] },
    { path: "/company-settings", actions: [point(field("Currency label")), point(field("Clocking machine time zone"))] },
    { path: "/company-settings", actions: [point(text("Payroll rules")), point(text("Save settings", { role: "button" }))] },
  ],
};
