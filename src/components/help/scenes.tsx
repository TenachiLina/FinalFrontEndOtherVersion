"use client";

import React, { createContext, useContext } from "react";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ArchiveBoxIcon,
  BanknotesIcon,
  CalendarDaysIcon,
  CheckIcon,
  ClockIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  HomeIcon,
  MoonIcon,
  PencilSquareIcon,
  PlusIcon,
  QuestionMarkCircleIcon,
  TrashIcon,
  UserGroupIcon,
  UsersIcon,
  ViewfinderCircleIcon,
} from "@heroicons/react/24/outline";
import { t } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────────────────
// Animated guides: a miniature copy of the app drawn at a fixed size
// (DESIGN_W × DESIGN_H, scaled to fit). A scene is one guide step: which
// screen is shown and which elements the cursor clicks (data-target).
// ─────────────────────────────────────────────────────────────────────────

export const DESIGN_W = 800;
export const DESIGN_H = 450;

export interface Action {
  /** data-target of the element the cursor goes to and clicks */
  target: string;
  /** text typed into it after the click */
  type?: string;
  /** flags turned on by the click, space-separated (open a menu, a modal…) */
  sets?: string;
}

type ScreenId =
  | "signin"
  | "home"
  | "planning"
  | "view-planning"
  | "shifts"
  | "kiosk"
  | "history"
  | "machine"
  | "employee-form"
  | "employees"
  | "payroll"
  | "bonuses"
  | "users"
  | "settings";

type MenuKey = "home" | "planning" | "clockin" | "employees" | "reporting" | "users" | "settings" | "help";

export interface Scene {
  screen: ScreenId;
  menu?: MenuKey;
  flags?: string[];
  actions: Action[];
}

export interface SceneState {
  flags: Set<string>;
  typed: Record<string, string>;
  active: string | null;
  menu: MenuKey | null;
}

const SceneContext = createContext<SceneState>({ flags: new Set(), typed: {}, active: null, menu: null });
const useScene = () => useContext(SceneContext);

// ─── Building blocks ─────────────────────────────────────────────────────

const ring = (on: boolean) => (on ? "ring-2 ring-brand-500 ring-offset-1 ring-offset-white dark:ring-offset-gray-900" : "");

function Btn({ id, children, primary, danger, small }: { id: string; children: React.ReactNode; primary?: boolean; danger?: boolean; small?: boolean }) {
  const { active } = useScene();
  const tone = primary
    ? "bg-brand-500 text-white"
    : danger
      ? "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400"
      : "bg-white text-gray-700 ring-1 ring-inset ring-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700";
  return (
    <span data-target={id} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg font-medium ${small ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-[11px]"} ${tone} ${ring(active === id)}`}>
      {children}
    </span>
  );
}

function Field({ id, label, placeholder = "", value, wide }: { id: string; label: string; placeholder?: string; value?: string; wide?: boolean }) {
  const { active, typed } = useScene();
  const text = typed[id] ?? value ?? "";
  const focused = active === id;
  return (
    <div className={wide ? "col-span-2" : ""}>
      <div className="mb-1 text-[10px] font-medium text-gray-600 dark:text-gray-400">{label}</div>
      <div
        data-target={id}
        className={`flex h-8 items-center rounded-lg border bg-white px-2.5 text-[11px] dark:bg-gray-900 ${focused ? "border-brand-400 ring-2 ring-brand-500/20" : "border-gray-300 dark:border-gray-700"}`}
      >
        <span className={text ? "text-gray-800 dark:text-white/90" : "text-gray-400"}>{text || placeholder}</span>
        {focused && <span className="ms-px inline-block h-3.5 w-px animate-pulse bg-gray-700 dark:bg-gray-200" />}
      </div>
    </div>
  );
}

function Select({ id, label, value }: { id: string; label: string; value: string }) {
  const { active } = useScene();
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium text-gray-600 dark:text-gray-400">{label}</div>
      <div data-target={id} className={`flex h-8 items-center justify-between rounded-lg border border-gray-300 bg-white px-2.5 text-[11px] text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 ${ring(active === id)}`}>
        {value}
        <span className="text-gray-400">▾</span>
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${className}`}>{children}</div>;
}

function Title({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="text-[15px] font-semibold text-gray-800 dark:text-white/90">{children}</div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

function Hit({ id, children, className = "" }: { id: string; children: React.ReactNode; className?: string }) {
  const { active } = useScene();
  return (
    <div data-target={id} className={`${className} ${ring(active === id)}`}>
      {children}
    </div>
  );
}

function Modal({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-900/40">
      <div className="w-[320px] rounded-2xl bg-white p-4 shadow-xl dark:bg-gray-900">
        <div className="mb-3 text-[13px] font-semibold text-gray-800 dark:text-white/90">{title}</div>
        {children}
      </div>
    </div>
  );
}

const PEOPLE = ["Sara Benali", "Yacine Haddad", "Amel Kaci", "Karim Saidi", "Nadia Ferhat", "Rami Cherif"];

// ─── App chrome: top bar + side menu ─────────────────────────────────────

const MENU: { key: MenuKey; label: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; sub?: [string, string][] }[] = [
  { key: "home", label: "Home", icon: HomeIcon },
  { key: "planning", label: "Planning", icon: CalendarDaysIcon, sub: [["new-planning", "New Planning"], ["view-planning", "View Planning"], ["shifts", "Shifts Management"]] },
  { key: "clockin", label: "Clock In/Out", icon: ClockIcon, sub: [["history", "Clock In/Out History"], ["face", "Face recognition"], ["kiosk", "Clock-in kiosk"]] },
  { key: "employees", label: "Employees", icon: UserGroupIcon, sub: [["add-employee", "Add Employee"], ["view-employees", "View Employees"]] },
  { key: "reporting", label: "Reporting", icon: BanknotesIcon, sub: [["weekly-advances", "Weekly Advances"], ["monthly-payroll", "Monthly Payroll"], ["bonuses", "Bonuses"]] },
  { key: "users", label: "Users", icon: UsersIcon },
  { key: "settings", label: "Company settings", icon: Cog6ToothIcon },
  { key: "help", label: "Help & guides", icon: QuestionMarkCircleIcon },
];

function Sidebar() {
  const { menu, flags, active } = useScene();
  return (
    <div className="flex w-[168px] shrink-0 flex-col gap-0.5 border-e border-gray-200 bg-white px-2 py-3 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-2 flex items-center gap-2 px-2">
        <span className="h-5 w-5 rounded-md bg-brand-500" />
        <span className="text-[12px] font-semibold text-gray-800 dark:text-white/90">Nexo InOuty</span>
      </div>
      {MENU.map(({ key, label, icon: Icon, sub }) => {
        const current = menu === key;
        const open = sub && (flags.has(`open:${key}`) || (current && flags.has("open")));
        return (
          <div key={key}>
            <div
              data-target={`menu:${key}`}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-medium ${current ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400" : "text-gray-600 dark:text-gray-400"} ${ring(active === `menu:${key}`)}`}
            >
              <Icon className="h-4 w-4" />
              {t(label)}
            </div>
            {open &&
              sub!.map(([id, subLabel]) => (
                <div
                  key={id}
                  data-target={`sub:${id}`}
                  className={`ms-6 rounded-md px-2 py-1 text-[10px] ${flags.has(`at:${id}`) ? "font-semibold text-brand-600 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"} ${ring(active === `sub:${id}`)}`}
                >
                  {t(subLabel)}
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}

function TopBar() {
  const { flags, active } = useScene();
  return (
    <div className="relative flex h-11 shrink-0 items-center justify-end gap-2 border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900">
      <Hit id="lang" className="flex h-7 items-center gap-1 rounded-full border border-gray-200 px-2.5 text-[10px] text-gray-600 dark:border-gray-700 dark:text-gray-300">
        <GlobeAltIcon className="h-3.5 w-3.5" />
        {flags.has("fr") ? "Français" : "English"}
      </Hit>
      <Hit id="theme" className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300">
        <MoonIcon className="h-3.5 w-3.5" />
      </Hit>
      <Hit id="avatar" className="flex items-center gap-1.5 rounded-full py-0.5 pe-2 ps-0.5 text-[10px] text-gray-700 dark:text-gray-300">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-[9px] font-semibold text-white">SB</span>
        Sara
      </Hit>
      {flags.has("langMenu") && (
        <div className="absolute end-[96px] top-10 z-10 w-28 rounded-lg border border-gray-200 bg-white p-1 text-[10px] shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {["English", "Français", "العربية"].map((l) => (
            <div key={l} data-target={`lang:${l}`} className={`rounded px-2 py-1 text-gray-700 dark:text-gray-300 ${active === `lang:${l}` ? "bg-brand-50 text-brand-600" : ""}`}>
              {l}
            </div>
          ))}
        </div>
      )}
      {flags.has("userMenu") && (
        <div className="absolute end-4 top-10 z-10 w-36 rounded-lg border border-gray-200 bg-white p-1 text-[10px] shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <div className="px-2 py-1 text-gray-500">{t("Edit profile")}</div>
          <div data-target="change-password" className={`rounded px-2 py-1 text-gray-700 dark:text-gray-300 ${active === "change-password" ? "bg-brand-50 text-brand-600" : ""}`}>
            {t("Change password")}
          </div>
          <div className="px-2 py-1 text-gray-500">{t("Sign out")}</div>
        </div>
      )}
    </div>
  );
}

// ─── Screens ─────────────────────────────────────────────────────────────

function SignIn() {
  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col justify-center px-24">
        <div className="text-[20px] font-semibold text-gray-800 dark:text-white/90">{t("Sign in")}</div>
        <div className="mb-5 text-[11px] text-gray-500">{t("Enter your email and password to sign in.")}</div>
        <div className="grid gap-3">
          <Field id="email" label={t("Email")} placeholder="you@example.com" />
          <Field id="password" label={t("Password")} placeholder="••••••••" />
          <div>
            <Btn id="submit" primary>
              {t("Sign in")}
            </Btn>
          </div>
        </div>
      </div>
      <div className="flex w-[300px] items-center justify-center bg-brand-950">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500 text-xl font-bold text-white">N</span>
      </div>
    </div>
  );
}

function Home() {
  return (
    <div>
      <Title>{t("Good morning, {name}", { name: "Sara" })}</Title>
      <Hit id="home-cards" className="mb-3 grid grid-cols-3 gap-3 rounded-xl">
        {["Clocked in now", "Planned today", "Not yet in"].map((l, i) => (
          <Card key={l} className="p-3">
            <div className="text-[10px] text-gray-500">{t(l)}</div>
            <div className="mt-1 text-[18px] font-semibold text-gray-800 dark:text-white/90">{["8 / 14", "12", "4"][i]}</div>
          </Card>
        ))}
      </Hit>
      <div className="grid grid-cols-2 gap-3">
        {["Plan the week", "Clock-in history", "Monthly payroll", "Add an employee"].map((l) => (
          <Card key={l} className="flex items-center gap-2 p-3 text-[11px] font-medium text-gray-700 dark:text-gray-300">
            <span className="h-7 w-7 rounded-lg bg-brand-50 dark:bg-brand-500/15" />
            {t(l)}
          </Card>
        ))}
      </div>
    </div>
  );
}

function Planning() {
  const { flags } = useScene();
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div className="relative h-full">
      <Title right={<><Btn id="import" small><ArrowUpTrayIcon className="h-3 w-3" />{t("Import")}</Btn><Btn id="save-every" small>{t("Save to every Monday")}</Btn><Btn id="save" primary small>{flags.has("saved") ? <><CheckIcon className="h-3 w-3" />{t("Saved")}</> : t("Save")}</Btn></>}>
        {t("New Planning")}
      </Title>
      <div className="mb-3 flex gap-1.5">
        {days.map((d, i) => (
          <Hit key={d} id={i === 0 ? "day" : `day-${i}`} className={`flex-1 rounded-lg py-1.5 text-center text-[10px] ${i === 0 ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400"}`}>
            {t(d)} {13 + i}
          </Hit>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="grid grid-cols-[110px_1fr_1fr] text-[10px]">
          <div className="bg-gray-50 p-2 font-medium text-gray-500 dark:bg-white/[0.03]">{t("Post")}</div>
          <div className="bg-gray-50 p-2 font-medium text-gray-500 dark:bg-white/[0.03]">08:00 – 16:00</div>
          <div className="bg-gray-50 p-2 font-medium text-gray-500 dark:bg-white/[0.03]">16:00 – 00:00</div>
          {["Cashier", "Kitchen", "Delivery"].map((post, r) => (
            <React.Fragment key={post}>
              <div className="border-t border-gray-100 p-2 font-medium text-gray-700 dark:border-gray-800 dark:text-gray-300">{t(post)}</div>
              {[0, 1].map((c) => (
                <div key={c} className="border-t border-gray-100 p-1.5 dark:border-gray-800">
                  <Hit id={r === 0 && c === 0 ? "cell" : `cell-${r}-${c}`} className={`flex h-7 items-center rounded-md px-2 ${r === 0 && c === 0 && flags.has("assigned") ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : r + c === 2 ? "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400" : "border border-dashed border-gray-300 text-gray-400 dark:border-gray-700"}`}>
                    {r === 0 && c === 0 && flags.has("assigned") ? "Sara Benali" : r + c === 2 ? PEOPLE[r + 1] : "+"}
                  </Hit>
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </Card>
      {flags.has("assign") && (
        <Modal title={t("Add an assignment")}>
          <div className="grid gap-2.5">
            <Field id="employee" label={t("Main employee")} placeholder={t("Name or number")} />
            <div className="flex gap-2">
              <Btn id="backup" small><PlusIcon className="h-3 w-3" />{t("Add backup")}</Btn>
              <Btn id="add-task" small><PlusIcon className="h-3 w-3" />{t("Add task")}</Btn>
            </div>
            {flags.has("task") && (
              <div className="grid grid-cols-3 gap-2">
                <Field id="task-start" label={t("Start")} value="08:00" />
                <Field id="task-end" label={t("End")} value="12:00" />
                <Field id="task-name" label={t("Task")} />
              </div>
            )}
            <div className="flex justify-end">
              <Btn id="ok" primary small>{t("Add")}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ViewPlanning() {
  const { flags } = useScene();
  return (
    <div className="relative h-full">
      <Title right={<><Btn id="export-day" small><ArrowDownTrayIcon className="h-3 w-3" />{t("Export Day")}</Btn><Btn id="export-week" small><ArrowDownTrayIcon className="h-3 w-3" />{t("Export week")}</Btn></>}>
        {t("View Planning")}
      </Title>
      {flags.has("exportMenu") && (
        <div className="absolute end-0 top-9 z-10 w-28 rounded-lg border border-gray-200 bg-white p-1 text-[10px] shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <Hit id="pdf" className="flex items-center gap-1 rounded px-2 py-1 text-gray-700 dark:text-gray-300"><DocumentTextIcon className="h-3 w-3" />PDF</Hit>
          <div className="px-2 py-1 text-gray-700 dark:text-gray-300">Excel</div>
        </div>
      )}
      <div className="grid grid-cols-[150px_1fr] gap-3">
        <Card className="p-2">
          <div className="mb-1 text-center text-[10px] font-medium text-gray-600 dark:text-gray-400">{t("October")} 2026</div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] text-gray-500">
            {Array.from({ length: 28 }, (_, i) => (
              <Hit key={i} id={i === 12 ? "day" : `d-${i}`} className={`rounded py-0.5 ${i === 12 ? "bg-brand-500 text-white" : ""}`}>{i + 1}</Hit>
            ))}
          </div>
        </Card>
        <Card className="p-3">
          {["08:00 – 16:00", "16:00 – 00:00"].map((shift, s) => (
            <div key={shift} className="mb-2">
              <div className="mb-1 text-[10px] font-semibold text-gray-500">{shift}</div>
              <div className="flex flex-wrap gap-1.5">
                {PEOPLE.slice(s * 3, s * 3 + 3).map((p, i) => (
                  <Hit key={p} id={s === 0 && i === 0 ? "name" : `n-${s}-${i}`} className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] text-gray-700 dark:bg-white/5 dark:text-gray-300">{p}</Hit>
                ))}
              </div>
            </div>
          ))}
          {flags.has("details") && (
            <div className="mt-2 rounded-lg bg-brand-50 p-2 text-[10px] text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              Sara Benali · #104 · {t("Cashier")} · {t("Backups")}: Amel Kaci
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Shifts() {
  const { flags } = useScene();
  const archived = flags.has("archived");
  return (
    <div className="relative h-full">
      <Title right={<Btn id="add" primary small><PlusIcon className="h-3 w-3" />{t("Add Shift")}</Btn>}>{t("Shifts Management")}</Title>
      <div className="mb-2 flex gap-3 text-[11px]">
        <span className={archived ? "text-gray-500" : "border-b-2 border-brand-500 pb-1 font-medium text-brand-600"}>{t("Active")}</span>
        <Hit id="archived-tab" className={archived ? "border-b-2 border-brand-500 pb-1 font-medium text-brand-600" : "text-gray-500"}>{t("Archived")}</Hit>
      </div>
      <div className="grid gap-2">
        {(archived ? ["06:00 – 14:00"] : ["08:00 – 16:00", "16:00 – 00:00", "22:00 – 06:00"]).map((s, i) => (
          <Card key={s} className="flex items-center justify-between p-2.5">
            <span className="flex items-center gap-2 text-[11px] font-medium text-gray-700 dark:text-gray-300"><ClockIcon className="h-4 w-4 text-brand-500" />{s}</span>
            <span className="flex gap-1.5">
              <Btn id={i === 0 ? "archive" : `archive-${i}`} small><ArchiveBoxIcon className="h-3 w-3" />{t(archived ? "Restore" : "Archive")}</Btn>
              <Btn id={i === 0 ? "delete" : `delete-${i}`} small danger><TrashIcon className="h-3 w-3" /></Btn>
            </span>
          </Card>
        ))}
      </div>
      {flags.has("modal") && (
        <Modal title={t("Add Shift")}>
          <div className="grid grid-cols-2 gap-2.5">
            <Field id="start" label={t("Start time")} placeholder="--:--" />
            <Field id="end" label={t("End time")} placeholder="--:--" />
          </div>
          <div className="mt-3 flex justify-end"><Btn id="create" primary small>{t("Save")}</Btn></div>
        </Modal>
      )}
    </div>
  );
}

function Kiosk() {
  const { flags, typed } = useScene();
  const q = (typed.search ?? "").toLowerCase();
  const people = PEOPLE.filter((p) => p.toLowerCase().includes(q));
  const chosen = flags.has("chosen");
  return (
    <div className="flex h-full flex-col bg-gray-50 p-5 dark:bg-gray-950">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[16px] font-semibold text-gray-800 dark:text-white/90">{t("Clock-in kiosk")}</div>
        <Hit id="time" className="rounded-lg bg-white px-3 py-1 text-[16px] font-semibold tabular-nums text-gray-800 dark:bg-gray-900 dark:text-white/90">08:02</Hit>
      </div>
      <div className="mb-3 w-64"><Field id="search" label="" placeholder={t("Search your name or number")} /></div>
      <div className="grid flex-1 grid-cols-3 content-start gap-3">
        {people.map((p, i) => (
          <Hit key={p} id={i === 0 ? "tile" : `tile-${i}`} className={`flex items-center gap-2 rounded-xl border bg-white p-3 dark:bg-gray-900 ${i === 0 && flags.has("in") ? "border-success-500" : "border-gray-200 dark:border-gray-800"}`}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-[10px] font-semibold text-brand-600 dark:bg-brand-500/15">{p.split(" ").map((x) => x[0]).join("")}</span>
            <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">{p}</span>
          </Hit>
        ))}
      </div>
      {chosen && (
        <Modal title="Sara Benali">
          <div className="flex gap-2">
            <Btn id="clock-in" primary><ClockIcon className="h-3.5 w-3.5" />{t("Clock in")}</Btn>
            <Btn id="clock-out"><ClockIcon className="h-3.5 w-3.5" />{t("Clock out")}</Btn>
          </div>
          {flags.has("in") && <div className="mt-3 rounded-lg bg-success-50 p-2 text-[10px] text-success-700 dark:bg-success-500/15 dark:text-success-400">{t("Clocked in at {time}", { time: "08:02" })}</div>}
        </Modal>
      )}
    </div>
  );
}

function History() {
  const { flags, typed } = useScene();
  const q = (typed.search ?? "").toLowerCase();
  const rows = PEOPLE.slice(0, 4).filter((p) => p.toLowerCase().includes(q));
  return (
    <div>
      <Title right={<><Btn id="add" small><PlusIcon className="h-3 w-3" />{t("Add clock-in")}</Btn><Btn id="delete" small danger><TrashIcon className="h-3 w-3" />{t("Delete")}</Btn></>}>
        {t("Clock In/Out History")}
      </Title>
      <div className="mb-3 flex gap-2">
        <Hit id="dates" className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[10px] text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"><CalendarDaysIcon className="h-3.5 w-3.5" />13 – 19 Oct</Hit>
        <div className="w-48"><Field id="search" label="" placeholder={t("Search an employee")} /></div>
      </div>
      <Card className="overflow-hidden text-[10px]">
        <div className="grid grid-cols-[24px_1.4fr_1fr_1fr_1fr] bg-gray-50 p-2 font-medium text-gray-500 dark:bg-white/[0.03]">
          <span />
          <span>{t("Employee")}</span><span>{t("Clock in")}</span><span>{t("Clock out")}</span><span>{t("Hours")}</span>
        </div>
        {rows.map((p, i) => (
          <div key={p} className="grid grid-cols-[24px_1.4fr_1fr_1fr_1fr] items-center border-t border-gray-100 p-2 text-gray-700 dark:border-gray-800 dark:text-gray-300">
            <Hit id={i === 0 ? "row-check" : `rc-${i}`} className={`h-3 w-3 rounded border ${i === 0 && flags.has("checked") ? "border-brand-500 bg-brand-500" : "border-gray-300"}`}>{""}</Hit>
            <span>{p}</span>
            {i === 0 && flags.has("editing") ? (
              <Field id="time-input" label="" value="" />
            ) : (
              <Hit id={i === 0 ? "time-cell" : `tc-${i}`} className="w-fit rounded px-1">{i === 0 && typed["time-input"] ? typed["time-input"] : ["08:12", "07:58", "16:03", "08:30"][i]}</Hit>
            )}
            <span>{i === 1 ? "—" : ["16:05", "", "00:02", "16:40"][i]}</span>
            <span>{["7:53", "—", "7:59", "8:10"][i]}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Machine() {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4">
      <Hit id="device" className="flex flex-col items-center gap-2 rounded-2xl bg-gray-800 p-4 text-white">
        <ViewfinderCircleIcon className="h-14 w-14 text-brand-300" />
        <div className="text-[11px] font-semibold">ZKTeco</div>
        <Hit id="device-id" className="rounded bg-white/10 px-2 py-1 text-[10px]">{t("User ID")}: 104</Hit>
        <div className="text-[9px] text-white/60">SN: CKUX20123456</div>
      </Hit>
      <div>
        <Title>{t("Clock In/Out with Face recognition")}</Title>
        <Card className="text-[10px]">
          {PEOPLE.slice(0, 4).map((p, i) => (
            <Hit key={p} id={i === 0 ? "today-row" : `tr-${i}`} className="flex items-center justify-between border-b border-gray-100 p-2 text-gray-700 last:border-0 dark:border-gray-800 dark:text-gray-300">
              <span>#{[104, 105, 107, 110][i]} · {p}</span>
              <span className="rounded-full bg-success-50 px-2 py-0.5 text-success-700 dark:bg-success-500/15 dark:text-success-400">{["08:01", "07:55", "08:10", "—"][i]}</span>
            </Hit>
          ))}
        </Card>
      </div>
    </div>
  );
}

function EmployeeForm() {
  return (
    <div>
      <Title>{t("Add Employee")}</Title>
      <Card className="grid grid-cols-2 gap-3 p-4">
        <Field id="number" label={t("Employee number")} placeholder="104" />
        <Field id="name" label={t("Full name")} />
        <Field id="salary" label={t("Base salary")} placeholder="0" />
        <Field id="phone" label={t("Phone (optional)")} />
        <div className="col-span-2 flex justify-end"><Btn id="save" primary>{t("Save")}</Btn></div>
      </Card>
    </div>
  );
}

function Employees() {
  return (
    <div>
      <Title right={<Btn id="add" primary small><PlusIcon className="h-3 w-3" />{t("Add Employee")}</Btn>}>{t("View Employees")}</Title>
      <Card className="text-[10px]">
        {PEOPLE.slice(0, 5).map((p, i) => (
          <div key={p} className="flex items-center justify-between border-b border-gray-100 p-2 text-gray-700 last:border-0 dark:border-gray-800 dark:text-gray-300">
            <span>#{104 + i} · {p}</span>
            <span className="flex gap-1.5">
              <Btn id={i === 0 ? "edit" : `e-${i}`} small><PencilSquareIcon className="h-3 w-3" /></Btn>
              <Btn id={i === 0 ? "delete" : `x-${i}`} small danger><TrashIcon className="h-3 w-3" /></Btn>
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Payroll() {
  const { flags } = useScene();
  const weekly = flags.has("weekly");
  const cols = weekly ? ["Employee", "Hours", "Weekly salary", "Advance"] : ["Employee", "Hours", "Advances", "Bonuses", "Net pay"];
  return (
    <div>
      <Title right={<Hit id="month" className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[10px] text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"><CalendarDaysIcon className="h-3.5 w-3.5" />{weekly ? "13 – 19 Oct" : `${t("October")} 2026`}</Hit>}>
        {t(weekly ? "Weekly Advances" : "Monthly Payroll")}
      </Title>
      <Card className="overflow-hidden text-[10px]">
        <div className="grid bg-gray-50 p-2 font-medium text-gray-500 dark:bg-white/[0.03]" style={{ gridTemplateColumns: `1.5fr repeat(${cols.length - 1}, 1fr) 70px` }}>
          {cols.map((c) => <span key={c}>{t(c)}</span>)}
          <span />
        </div>
        {PEOPLE.slice(0, 4).map((p, i) => (
          <Hit key={p} id={i === 0 ? "row" : `r-${i}`} className="grid items-center border-t border-gray-100 p-2 text-gray-700 dark:border-gray-800 dark:text-gray-300">
            <div className="grid items-center" style={{ gridTemplateColumns: `1.5fr repeat(${cols.length - 1}, 1fr) 70px` }}>
              <span>{p}</span>
              <span>{[168, 152, 160, 120][i]} h</span>
              {weekly ? (
                <>
                  <span>{["10 500", "9 500", "10 000", "7 500"][i]}</span>
                  <span className="font-semibold text-brand-600">{["5 250", "4 750", "5 000", "3 750"][i]}</span>
                </>
              ) : (
                <>
                  <span>{["10 000", "5 000", "0", "8 000"][i]}</span>
                  <span>{["5 000", "0", "2 000", "0"][i]}</span>
                  <span className="font-semibold text-gray-800 dark:text-white/90">{["37 000", "33 000", "42 000", "22 000"][i]}</span>
                </>
              )}
              {weekly ? <Btn id={i === 0 ? "give-advance" : `ga-${i}`} small primary>{t("Give")}</Btn> : <Btn id={i === 0 ? "details" : `dt-${i}`} small>{t("Details")}</Btn>}
            </div>
          </Hit>
        ))}
      </Card>
      {flags.has("details") && (
        <Card className="mt-3 grid grid-cols-7 gap-1 p-2 text-center text-[9px]">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
            <div key={d} className="rounded bg-gray-50 p-1 dark:bg-white/5"><div className="text-gray-500">{t(d)}</div><div className="font-semibold text-gray-700 dark:text-gray-300">{i === 5 ? "—" : "8 h"}</div></div>
          ))}
        </Card>
      )}
    </div>
  );
}

function Bonuses() {
  const { flags } = useScene();
  const history = flags.has("history");
  return (
    <div className="relative h-full">
      <Title>{t("Bonuses")}</Title>
      <div className="mb-2 flex gap-3 text-[11px]">
        <span className={history ? "text-gray-500" : "border-b-2 border-brand-500 pb-1 font-medium text-brand-600"}>{t("Give Bonuses")}</span>
        <Hit id="history-tab" className={history ? "border-b-2 border-brand-500 pb-1 font-medium text-brand-600" : "text-gray-500"}>{t("History")}</Hit>
      </div>
      <Card className="text-[10px]">
        {PEOPLE.slice(0, 4).map((p, i) => (
          <div key={p} className="flex items-center justify-between border-b border-gray-100 p-2 text-gray-700 last:border-0 dark:border-gray-800 dark:text-gray-300">
            <span>{p}</span>
            {history ? <span>{["5 000 · " + t("Great month"), "2 000", "—", "—"][i]}</span> : <Btn id={i === 0 ? "give" : `g-${i}`} small primary>{t("Give Bonus")}</Btn>}
          </div>
        ))}
      </Card>
      {flags.has("modal") && !history && (
        <Modal title={`${t("Give Bonus")} · Sara Benali`}>
          <div className="grid grid-cols-2 gap-2.5">
            <Field id="amount" label={t("Amount")} />
            <Field id="date" label={t("Date")} value="2026-10-20" />
            <Field id="reason" label={t("Reason")} wide />
          </div>
          <div className="mt-3 flex justify-end"><Btn id="confirm" primary small>{t("Give Bonus")}</Btn></div>
        </Modal>
      )}
    </div>
  );
}

function Users() {
  const { flags } = useScene();
  const roleLabel = flags.has("kioskRole") ? t("Clock-in kiosk") : t("Manager");
  return (
    <div className="relative h-full">
      <Title right={<Btn id="add" primary small><PlusIcon className="h-3 w-3" />{t("Add user")}</Btn>}>{t("Users")}</Title>
      <Card className="text-[10px]">
        {[["Sara Benali", "Admin"], ["Karim Saidi", "Manager"], ["Kiosk", "Clock-in kiosk"]].map(([n, r], i) => (
          <div key={n} className="flex items-center justify-between border-b border-gray-100 p-2 text-gray-700 last:border-0 dark:border-gray-800 dark:text-gray-300">
            <span>{n}</span>
            <span className="text-gray-500">{t(r)}</span>
            <span className="flex gap-1.5">
              <Btn id={i === 1 ? "reset" : `rs-${i}`} small>{t("Reset password")}</Btn>
              <Btn id={i === 1 ? "disable" : `ds-${i}`} small>{t("Disable")}</Btn>
            </span>
          </div>
        ))}
      </Card>
      {flags.has("modal") && (
        <Modal title={t("Add user")}>
          <div className="grid gap-2.5">
            <Field id="new-name" label={t("Name")} value="Karim Saidi" />
            <Field id="password" label={t("Temporary password (min 8 characters)")} />
            <Select id="role" label={t("Role")} value={roleLabel} />
            {flags.has("roleOpen") && (
              <div className="-mt-1 rounded-lg border border-gray-200 p-1 text-[10px] dark:border-gray-700">
                {["Manager", "Clock-in kiosk", "Admin"].map((r) => <div key={r} className="px-2 py-0.5 text-gray-700 dark:text-gray-300">{t(r)}</div>)}
              </div>
            )}
            <div className="flex justify-end"><Btn id="create" primary small>{t("Create user")}</Btn></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Settings() {
  const { flags } = useScene();
  return (
    <div>
      <Title>{t("Company settings")}</Title>
      <Card className="grid grid-cols-2 gap-3 p-4">
        <Select id="language" label={t("Default language")} value="Français" />
        <Select id="currency" label={t("Currency")} value="DZD" />
        <Select id="timezone" label={t("Machine time zone")} value="UTC+01:00" />
        <Hit id="rules" className="col-span-2 grid grid-cols-3 gap-2 rounded-lg bg-gray-50 p-2 dark:bg-white/5">
          {[["Hours per day", "8"], ["Working days", "26"], ["Advance %", "50"]].map(([l, v]) => (
            <div key={l}>
              <div className="text-[9px] text-gray-500">{t(l)}</div>
              <div className="text-[12px] font-semibold text-gray-800 dark:text-white/90">{v}</div>
            </div>
          ))}
        </Hit>
        <div className="col-span-2 flex justify-end">
          <Btn id="save" primary>{flags.has("saved") ? <><CheckIcon className="h-3 w-3" />{t("Saved")}</> : t("Save settings")}</Btn>
        </div>
      </Card>
    </div>
  );
}

const SCREENS: Record<ScreenId, () => React.ReactElement> = {
  signin: SignIn,
  home: Home,
  planning: Planning,
  "view-planning": ViewPlanning,
  shifts: Shifts,
  kiosk: Kiosk,
  history: History,
  machine: Machine,
  "employee-form": EmployeeForm,
  employees: Employees,
  payroll: Payroll,
  bonuses: Bonuses,
  users: Users,
  settings: Settings,
};

// Screens shown full-size, without the app's menu (sign-in, kiosk tablet)
const FULL_SCREEN: ScreenId[] = ["signin", "kiosk"];

/** Draws one scene at design size. */
export function SceneStage({ scene, state }: { scene: Scene; state: SceneState }) {
  const Screen = SCREENS[scene.screen];
  return (
    <SceneContext.Provider value={state}>
      <div className="flex h-full w-full bg-gray-50 font-[inherit] text-gray-800 dark:bg-gray-950">
        {FULL_SCREEN.includes(scene.screen) ? (
          <div className="relative h-full w-full bg-white dark:bg-gray-900">
            <Screen />
          </div>
        ) : (
          <>
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar />
              <div className="relative flex-1 overflow-hidden p-4">
                <Screen />
              </div>
            </div>
          </>
        )}
      </div>
    </SceneContext.Provider>
  );
}

// ─── Scenes for each guide (one per step, same order as the steps) ───────

/** Opens a menu, then one of its pages. */
const nav = (menu: MenuKey, page?: string): Action[] =>
  page ? [{ target: `menu:${menu}`, sets: `open:${menu}` }, { target: `sub:${page}`, sets: `at:${page}` }] : [{ target: `menu:${menu}` }];

const opened = (menu: MenuKey, page: string) => [`open:${menu}`, `at:${page}`];

export const SCENES: Record<string, Scene[]> = {
  "getting-started": [
    { screen: "signin", actions: [{ target: "email", type: "sara@nexo.dz" }, { target: "password", type: "••••••••" }, { target: "submit" }] },
    { screen: "home", menu: "home", actions: [{ target: "home-cards" }] },
    { screen: "home", menu: "home", actions: [{ target: "menu:planning", sets: "open:planning" }, { target: "menu:reporting", sets: "open:reporting" }] },
    { screen: "home", menu: "home", actions: [{ target: "lang", sets: "langMenu" }, { target: "lang:Français", sets: "fr" }] },
    { screen: "home", menu: "home", actions: [{ target: "theme", sets: "dark" }] },
    { screen: "home", menu: "home", actions: [{ target: "avatar", sets: "userMenu" }, { target: "change-password" }] },
  ],
  "plan-week": [
    { screen: "planning", menu: "planning", actions: [...nav("planning", "new-planning"), { target: "day" }] },
    { screen: "planning", menu: "planning", flags: opened("planning", "new-planning"), actions: [{ target: "cell", sets: "assign" }] },
    { screen: "planning", menu: "planning", flags: [...opened("planning", "new-planning"), "assign"], actions: [{ target: "employee", type: "Sara Benali" }, { target: "backup" }] },
    { screen: "planning", menu: "planning", flags: [...opened("planning", "new-planning"), "assign"], actions: [{ target: "add-task", sets: "task" }, { target: "task-name", type: "Cashier" }, { target: "ok" }] },
    { screen: "planning", menu: "planning", flags: [...opened("planning", "new-planning"), "assigned"], actions: [{ target: "save", sets: "saved" }] },
    { screen: "planning", menu: "planning", flags: [...opened("planning", "new-planning"), "assigned"], actions: [{ target: "save-every" }] },
    { screen: "planning", menu: "planning", flags: opened("planning", "new-planning"), actions: [{ target: "import" }] },
  ],
  "view-planning": [
    { screen: "view-planning", menu: "planning", actions: [...nav("planning", "view-planning"), { target: "day" }] },
    { screen: "view-planning", menu: "planning", flags: opened("planning", "view-planning"), actions: [{ target: "name", sets: "details" }] },
    { screen: "view-planning", menu: "planning", flags: opened("planning", "view-planning"), actions: [{ target: "export-day" }, { target: "export-week", sets: "exportMenu" }] },
    { screen: "view-planning", menu: "planning", flags: [...opened("planning", "view-planning"), "exportMenu"], actions: [{ target: "pdf" }] },
  ],
  shifts: [
    { screen: "shifts", menu: "planning", actions: nav("planning", "shifts") },
    { screen: "shifts", menu: "planning", flags: opened("planning", "shifts"), actions: [{ target: "add", sets: "modal" }, { target: "start", type: "08:00" }, { target: "end", type: "16:00" }, { target: "create" }] },
    { screen: "shifts", menu: "planning", flags: opened("planning", "shifts"), actions: [{ target: "archive" }, { target: "archived-tab", sets: "archived" }] },
    { screen: "shifts", menu: "planning", flags: opened("planning", "shifts"), actions: [{ target: "delete" }] },
  ],
  kiosk: [
    { screen: "users", menu: "users", actions: [{ target: "menu:users" }, { target: "add", sets: "modal" }, { target: "role", sets: "kioskRole" }, { target: "create" }] },
    { screen: "signin", actions: [{ target: "email", type: "kiosk@nexo.dz" }, { target: "password", type: "••••••••" }, { target: "submit" }] },
    { screen: "kiosk", actions: [{ target: "search", type: "Sa" }, { target: "tile", sets: "chosen" }] },
    { screen: "kiosk", flags: ["chosen"], actions: [{ target: "clock-in", sets: "in" }, { target: "clock-out" }] },
    { screen: "kiosk", actions: [{ target: "time" }] },
    { screen: "home", menu: "clockin", actions: nav("clockin", "kiosk") },
  ],
  history: [
    { screen: "history", menu: "clockin", actions: [...nav("clockin", "history"), { target: "dates" }] },
    { screen: "history", menu: "clockin", flags: opened("clockin", "history"), actions: [{ target: "search", type: "Sara" }] },
    { screen: "history", menu: "clockin", flags: opened("clockin", "history"), actions: [{ target: "time-cell", sets: "editing" }, { target: "time-input", type: "08:05" }] },
    { screen: "history", menu: "clockin", flags: opened("clockin", "history"), actions: [{ target: "add" }] },
    { screen: "history", menu: "clockin", flags: opened("clockin", "history"), actions: [{ target: "row-check", sets: "checked" }, { target: "delete" }] },
  ],
  machine: [
    { screen: "machine", menu: "clockin", actions: [{ target: "device" }] },
    { screen: "machine", menu: "clockin", actions: [{ target: "device-id" }, { target: "today-row" }] },
    { screen: "machine", menu: "clockin", actions: [...nav("clockin", "face"), { target: "today-row" }] },
    { screen: "settings", menu: "settings", actions: [{ target: "menu:settings" }, { target: "timezone" }] },
  ],
  employees: [
    { screen: "employee-form", menu: "employees", actions: nav("employees", "add-employee") },
    { screen: "employee-form", menu: "employees", flags: opened("employees", "add-employee"), actions: [{ target: "number", type: "104" }] },
    { screen: "employee-form", menu: "employees", flags: opened("employees", "add-employee"), actions: [{ target: "name", type: "Sara Benali" }, { target: "salary", type: "45000" }, { target: "save" }] },
    { screen: "employees", menu: "employees", actions: [...nav("employees", "view-employees"), { target: "edit" }, { target: "delete" }] },
  ],
  payroll: [
    { screen: "payroll", menu: "reporting", flags: ["weekly"], actions: [...nav("reporting", "weekly-advances"), { target: "give-advance" }] },
    { screen: "payroll", menu: "reporting", actions: [...nav("reporting", "monthly-payroll"), { target: "month" }] },
    { screen: "payroll", menu: "reporting", flags: opened("reporting", "monthly-payroll"), actions: [{ target: "row" }] },
    { screen: "payroll", menu: "reporting", flags: opened("reporting", "monthly-payroll"), actions: [{ target: "details", sets: "details" }] },
    { screen: "settings", menu: "settings", actions: [{ target: "menu:settings" }, { target: "rules" }] },
  ],
  bonuses: [
    { screen: "bonuses", menu: "reporting", actions: nav("reporting", "bonuses") },
    { screen: "bonuses", menu: "reporting", flags: opened("reporting", "bonuses"), actions: [{ target: "give", sets: "modal" }, { target: "amount", type: "5000" }, { target: "reason", type: "Great month" }, { target: "confirm" }] },
    { screen: "bonuses", menu: "reporting", flags: opened("reporting", "bonuses"), actions: [{ target: "history-tab", sets: "history" }] },
  ],
  users: [
    { screen: "users", menu: "users", actions: [{ target: "menu:users" }, { target: "add", sets: "modal" }] },
    { screen: "users", menu: "users", flags: ["modal"], actions: [{ target: "role", sets: "roleOpen" }] },
    { screen: "users", menu: "users", flags: ["modal"], actions: [{ target: "password", type: "Temp-2026" }, { target: "create" }] },
    { screen: "users", menu: "users", actions: [{ target: "disable" }, { target: "reset" }] },
  ],
  settings: [
    { screen: "settings", menu: "settings", actions: [{ target: "menu:settings" }] },
    { screen: "settings", menu: "settings", actions: [{ target: "language" }] },
    { screen: "settings", menu: "settings", actions: [{ target: "currency" }, { target: "timezone" }] },
    { screen: "settings", menu: "settings", actions: [{ target: "rules" }, { target: "save", sets: "saved" }] },
  ],
};
