import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import ClockInPageHistory from "./ClockInPageHistory";
import { API, server } from "@/test/server";
import { answerConfirmDialog, fireEvent, renderWithProviders, screen, waitFor, within } from "@/test/render";
import { dismissToast, getToasts } from "@/lib/notify";
import type { WorktimeRecord } from "./worktime.api";

// These tests type into forms and wait for debounced saves: give them room on a busy machine.
vi.setConfig({ testTimeout: 20000 });

// ─── Data ─────────────────────────────────────────────────────────────────────

interface Log {
  _id?: string;
  deviceUserId: string;
  timestamp: string;
  employeeNumber?: number | string;
  firstName?: string;
  lastName?: string;
}

interface Emp {
  _id: string;
  empNumber: number;
  firstName: string;
  lastName: string;
}

const ali: Emp = { _id: "m101", empNumber: 101, firstName: "Ali", lastName: "Zerrouki" };
const sara: Emp = { _id: "m102", empNumber: 102, firstName: "Sara", lastName: "Amrani" };

/** Algeria is UTC+1 all year: "2026-03-09 08:00" local is 07:00Z. */
const at = (local: string) => new Date(`${local.replace(" ", "T")}:00+01:00`).toISOString();

let logSeq = 0;
const punch = (emp: Emp, local: string, overrides: Partial<Log> = {}): Log => ({
  _id: `L${++logSeq}`,
  deviceUserId: String(emp.empNumber),
  timestamp: at(local),
  employeeNumber: emp.empNumber,
  firstName: emp.firstName,
  lastName: emp.lastName,
  ...overrides,
});

/** The shape GET /shifts returns (see ShiftRecord in calendar/types.ts). */
const apiShift = { _id: "s1", startTime: "08:00", endTime: "16:00" };
/** A shift in the snake_case shape this page reads. */
const snakeShift = (start: string, end: string) => ({ shift_id: "s1", start_time: `${start}:00`, end_time: `${end}:00` });
const planFor = (emp: Emp, date = "2026-03-09") => ({ _id: `p${emp.empNumber}`, empId: { _id: emp._id }, shiftId: { _id: "s1" }, planDate: date });

// ─── Fake backend ─────────────────────────────────────────────────────────────

interface Backend {
  logs: Log[];
  employees: Emp[];
  shifts: unknown[];
  planning: unknown[];
  worktimes: WorktimeRecord[];
  device: { connected: boolean; name: string };
}

let db: Backend;
let requests: { method: string; url: string; audit: string | null; body: Record<string, unknown> }[];
const writes = (path = "") => requests.filter((r) => r.method !== "GET" && r.url.startsWith(path));
const worktimeWrite = () => writes("/worktime").at(-1)!;

function installBackend() {
  let created = 0;
  const remember = async (request: Request) => {
    const text = await request.text();
    const url = new URL(request.url);
    const body = text ? JSON.parse(text) : undefined;
    requests.push({ method: request.method, url: url.pathname + url.search, audit: request.headers.get("X-Audit-As"), body });
    return body;
  };
  server.use(
    http.get(`${API}/device/status`, () => HttpResponse.json(db.device)),
    http.get(`${API}/attendance/device-logs`, async ({ request }) => {
      await remember(request);
      const q = new URL(request.url).searchParams;
      const from = q.get("from")!;
      const to = q.get("to")!;
      return HttpResponse.json(db.logs.filter((l) => l.timestamp.slice(0, 10) >= from && l.timestamp.slice(0, 10) <= to));
    }),
    http.post(`${API}/attendance/device-logs`, async ({ request }) => {
      const body = await remember(request);
      const log = { _id: `L${++logSeq}`, ...body };
      db.logs.push(log);
      return HttpResponse.json({ status: "ok", data: log });
    }),
    http.patch(`${API}/attendance/device-logs/:id`, async ({ request, params }) => {
      const body = await remember(request);
      const log = db.logs.find((l) => l._id === params.id)!;
      log.timestamp = body.timestamp;
      return HttpResponse.json(log);
    }),
    http.delete(`${API}/attendance/device-logs/:id`, async ({ request, params }) => {
      await remember(request);
      db.logs = db.logs.filter((l) => l._id !== params.id);
      return HttpResponse.json({ deleted: true });
    }),
    http.get(`${API}/employees`, () => HttpResponse.json(db.employees)),
    http.get(`${API}/shifts`, () => HttpResponse.json(db.shifts)),
    http.get(`${API}/planning`, ({ request }) => {
      const date = new URL(request.url).searchParams.get("date");
      return HttpResponse.json(db.planning.filter((p) => (p as { planDate: string }).planDate === date));
    }),
    http.get(`${API}/worktime`, async ({ request }) => {
      await remember(request);
      const q = new URL(request.url).searchParams;
      return HttpResponse.json(
        db.worktimes.filter(
          (w) => (!q.get("emp_id") || String(w.emp_id) === q.get("emp_id")) && (!q.get("work_date") || w.work_date === q.get("work_date"))
        )
      );
    }),
    http.post(`${API}/worktime`, async ({ request }) => {
      const body = await remember(request);
      const record = { ...body, _id: `new${++created}`, worktime_id: created };
      db.worktimes.push(record);
      return HttpResponse.json(record);
    }),
    http.put(`${API}/worktime/:id`, async ({ request, params }) => {
      const body = await remember(request);
      const i = db.worktimes.findIndex((w) => w._id === params.id);
      db.worktimes[i] = { ...db.worktimes[i], ...body };
      return HttpResponse.json(db.worktimes[i]);
    })
  );
}

const realTZ = process.env.TZ;

beforeEach(() => {
  process.env.TZ = "Africa/Algiers";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-10T12:00:00+01:00"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  logSeq = 0;
  requests = [];
  db = {
    logs: [punch(ali, "2026-03-09 08:00"), punch(ali, "2026-03-09 16:30"), punch(sara, "2026-03-09 09:00")],
    employees: [ali, sara],
    shifts: [apiShift],
    planning: [planFor(ali), planFor(sara)],
    worktimes: [],
    device: { connected: true, name: "Face Recognition Machine" },
  };
  installBackend();
});

afterEach(() => {
  vi.useRealTimers();
  process.env.TZ = realTZ;
  getToasts().forEach((t) => dismissToast(t.id));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function renderHistory() {
  const view = renderWithProviders(<ClockInPageHistory />, { url: "/clockinpagehistory" });
  await waitFor(() => expect(screen.queryByText("Loading clock-in records…")).not.toBeInTheDocument());
  await screen.findByText("Machine:");
  return view;
}

const bodyRows = () => screen.getAllByRole("row").slice(1);
/** Each row as "number | last | first | date | in | out | status". */
const table = () =>
  bodyRows().map((r) =>
    within(r)
      .getAllByRole("cell")
      .slice(1)
      .map((c) => c.textContent)
      .join(" | ")
  );
const rowWith = (text: string) => screen.getAllByText(text)[0].closest("tr") as HTMLElement;
const dateInputs = () => screen.getAllByPlaceholderText("YYYY-MM-DD") as HTMLInputElement[];
const modalField = (label: string) => screen.getByText(label, { selector: "label" }).nextElementSibling as HTMLInputElement;
const employeeSelect = () => screen.getByRole("option", { name: "Select an employee" }).closest("select") as HTMLSelectElement;

type User = Awaited<ReturnType<typeof renderHistory>>["user"];

async function pickTime(user: User, scope: HTMLElement, hhmm: string) {
  const [h, m] = hhmm.split(":");
  await user.selectOptions(within(scope).getByLabelText("Hour"), h);
  await user.selectOptions(within(scope).getByLabelText("Minute"), m);
}

async function addPunch(user: User, empNumber: string, date: string, time: string) {
  await user.click(screen.getByRole("button", { name: "Add clock-in" }));
  await waitFor(() => expect(employeeSelect()).toBeEnabled());
  await user.selectOptions(employeeSelect(), empNumber);
  fireEvent.change(dateInputs()[2], { target: { value: date } });
  const modal = screen.getByRole("heading", { name: "Add a clock-in" }).parentElement!.parentElement!;
  await pickTime(user, modal, time);
  return modal;
}

// ─── Listing ──────────────────────────────────────────────────────────────────

describe("ClockInPageHistory – listing", () => {
  it("loads the last 50 days and pairs each employee's punches into rows", async () => {
    renderWithProviders(<ClockInPageHistory />);
    expect(screen.getByText("Loading clock-in records…")).toBeInTheDocument();
    await screen.findByText("Zerrouki");
    expect(requests[0].url).toBe("/attendance/device-logs?from=2026-01-19&to=2026-03-10");
    expect(dateInputs().map((i) => i.value)).toEqual(["2026-01-19", "2026-03-10"]);
    expect(table()).toEqual([
      "102 | Amrani | Sara | 09/03/2026 | 09:00 | — | Not validated",
      "101 | Zerrouki | Ali | 09/03/2026 | 08:00 | 16:30 | Validated",
    ]);
  });

  it("splits a day's punches into consecutive in/out pairs and flags short breaks", async () => {
    db.logs = [
      punch(ali, "2026-03-09 16:00"),
      punch(ali, "2026-03-09 08:00"),
      punch(ali, "2026-03-09 12:00"),
      punch(ali, "2026-03-09 12:10"),
    ];
    await renderHistory();
    expect(table()).toEqual([
      "101 | Zerrouki | Ali | 09/03/2026 | 12:10 | 16:00 | Validated",
      "101 | Zerrouki | Ali | 09/03/2026 | 08:00 | 12:00 | Validated",
    ]);
    db.logs = [punch(ali, "2026-03-09 12:00"), punch(ali, "2026-03-09 12:10")];
  });

  it("marks a pair less than 15 minutes apart as a pause", async () => {
    db.logs = [punch(ali, "2026-03-09 12:00"), punch(ali, "2026-03-09 12:10")];
    await renderHistory();
    expect(table()).toEqual(["101 | Zerrouki | Ali | 09/03/2026 | 12:00 | 12:10 | Pause"]);
  });

  it("falls back to the machine id, dashes and raw text for incomplete punches", async () => {
    db.logs = [{ _id: "x", deviceUserId: "\u0000 205 ", timestamp: "2026-03-09-bad" }];
    await renderHistory();
    expect(table()).toEqual(["205 | — | — | 2026-03-09-bad | 2026-03-09-bad | — | Not validated"]);
  });

  it("accepts the logs wrapped in a data field", async () => {
    server.use(http.get(`${API}/attendance/device-logs`, () => HttpResponse.json({ data: [punch(ali, "2026-03-09 08:00")] })));
    await renderHistory();
    expect(table()).toHaveLength(1);
  });

  it("says when there are no records in the period", async () => {
    server.use(http.get(`${API}/attendance/device-logs`, () => HttpResponse.json({ unexpected: true })));
    await renderHistory();
    expect(screen.getByText("No clock-in records in this period.")).toBeInTheDocument();
  });

  it("reloads for the dates picked", async () => {
    await renderHistory();
    fireEvent.change(dateInputs()[0], { target: { value: "2026-03-01" } });
    fireEvent.change(dateInputs()[1], { target: { value: "2026-03-05" } });
    await waitFor(() => expect(requests.at(-1)!.url).toBe("/attendance/device-logs?from=2026-03-01&to=2026-03-05"));
    expect(await screen.findByText("No clock-in records in this period.")).toBeInTheDocument();
  });

  it("explains a load failure and loads again on request", async () => {
    server.use(http.get(`${API}/attendance/device-logs`, () => HttpResponse.json({ message: "Database offline" }, { status: 400 }), { once: true }));
    const { user } = await renderHistory();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load the clock-in records");
    expect(alert).toHaveTextContent("Database offline");
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Zerrouki")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains when the employees can't be loaded", async () => {
    server.use(http.get(`${API}/employees`, () => new HttpResponse("down", { status: 500 })));
    await renderHistory();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the employees");
  });

  it("accepts the employees wrapped in a data field, and ignores other shapes", async () => {
    server.use(http.get(`${API}/employees`, () => HttpResponse.json({ data: [ali] }), { once: true }));
    const { user } = await renderHistory();
    await user.click(screen.getByPlaceholderText("Search for an employee…"));
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["101 — Zerrouki Ali"]);

    server.use(http.get(`${API}/employees`, () => HttpResponse.json({ nope: 1 })));
    await user.click(screen.getByRole("button", { name: "Add clock-in" }));
    await waitFor(() => expect(employeeSelect().options).toHaveLength(1));
  });
});

// ─── Machine status ───────────────────────────────────────────────────────────

describe("ClockInPageHistory – machine status", () => {
  it("shows that the machine is connected", async () => {
    await renderHistory();
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("shows the machine as disconnected when it can't be reached", async () => {
    server.use(http.get(`${API}/device/status`, () => HttpResponse.error()));
    await renderHistory();
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });

  it("checks again every 30 seconds and stops when the page closes", async () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const { unmount } = await renderHistory();
    const call = setIntervalSpy.mock.calls.find((c) => c[1] === 30000)!;
    db.device = { connected: false, name: "x" };
    (call[0] as () => void)();
    expect(await screen.findByText("Disconnected")).toBeInTheDocument();
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  // BUG-216: the machine status is always read from http://localhost:3001, not from the API server
  it("asks the API server for the machine status", async () => {
    db.device = { connected: false, name: "local" };
    server.use(http.get(`${API}/device/status`, () => HttpResponse.json({ connected: true, name: "api" })));
    await renderHistory();
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });
});

// ─── Employee search ──────────────────────────────────────────────────────────

describe("ClockInPageHistory – employee search", () => {
  it("suggests employees and filters the rows as you type", async () => {
    const { user } = await renderHistory();
    const box = screen.getByPlaceholderText("Search for an employee…");
    await user.click(box);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["101 — Zerrouki Ali", "102 — Amrani Sara"]);

    await user.type(box, "amr");
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["102 — Amrani Sara"]);
    expect(table()).toEqual(["102 | Amrani | Sara | 09/03/2026 | 09:00 | — | Not validated"]);

    await user.type(box, "zzz");
    expect(screen.getByText("No employee found")).toBeInTheDocument();
    expect(screen.getByText("No clock-in records in this period.")).toBeInTheDocument();
  });

  it("filters on the employee picked from the suggestions", async () => {
    const { user } = await renderHistory();
    await user.click(screen.getByPlaceholderText("Search for an employee…"));
    await user.click(screen.getByText("101 — Zerrouki Ali"));
    expect(screen.getByPlaceholderText("Search for an employee…")).toHaveValue("101 — Zerrouki Ali");
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(table()).toEqual(["101 | Zerrouki | Ali | 09/03/2026 | 08:00 | 16:30 | Validated"]);
  });

  it("clears the search with the ✕ button", async () => {
    const { user } = await renderHistory();
    await user.type(screen.getByPlaceholderText("Search for an employee…"), "sara");
    await user.click(screen.getByTitle("Clear"));
    expect(screen.getByPlaceholderText("Search for an employee…")).toHaveValue("");
    expect(table()).toHaveLength(2);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("closes the suggestions on a click elsewhere", async () => {
    const { user } = await renderHistory();
    await user.click(screen.getByPlaceholderText("Search for an employee…"));
    await user.click(screen.getByRole("heading", { name: "Clock-in history" }));
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("says the employees are loading", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    server.use(
      http.get(`${API}/employees`, async () => {
        await gate;
        return HttpResponse.json([ali]);
      })
    );
    const { user } = await renderHistory();
    await user.click(screen.getByPlaceholderText("Search for an employee…"));
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    release();
    expect(await screen.findByText("101 — Zerrouki Ali")).toBeInTheDocument();
  });
});

// ─── Selecting and deleting ───────────────────────────────────────────────────

describe("ClockInPageHistory – deleting", () => {
  const selectAll = () => screen.getAllByRole("checkbox")[0];
  const rowBox = (text: string) => within(rowWith(text)).getByRole("checkbox");

  it("selects every row with the header box, and unselects them again", async () => {
    const { user } = await renderHistory();
    await user.click(selectAll());
    expect(screen.getAllByRole("checkbox").every((b) => (b as HTMLInputElement).checked)).toBe(true);
    await user.click(rowBox("Amrani"));
    expect(selectAll()).not.toBeChecked();
    await user.click(rowBox("Amrani"));
    expect(selectAll()).toBeChecked();
    await user.click(selectAll());
    expect(screen.getAllByRole("checkbox").some((b) => (b as HTMLInputElement).checked)).toBe(false);
  });

  it("does nothing with the header box when there are no rows", async () => {
    db.logs = [];
    const { user } = await renderHistory();
    await user.click(selectAll());
    expect(selectAll()).not.toBeChecked();
  });

  it("asks to select something first", async () => {
    const { user } = await renderHistory();
    await user.click(screen.getByRole("button", { name: /Delete/ }));
    expect(await screen.findByText("Select at least one clock-in record to delete.")).toBeInTheDocument();
  });

  it("keeps the records when the confirmation is cancelled", async () => {
    const { user } = await renderHistory();
    await user.click(rowBox("Zerrouki"));
    await user.click(screen.getByRole("button", { name: /Delete/ }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Delete 1 clock-in record?");
    await answerConfirmDialog(false);
    expect(writes()).toEqual([]);
  });

  it("deletes both punches of each selected row once confirmed", async () => {
    const { user } = await renderHistory();
    await user.click(selectAll());
    await user.click(screen.getByRole("button", { name: /Delete/ }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Delete 2 clock-in records?");
    await answerConfirmDialog(true);
    expect(await screen.findByText("2 clock-in records deleted.")).toBeInTheDocument();
    expect(writes().map((w) => `${w.method} ${w.url}`).sort()).toEqual([
      "DELETE /attendance/device-logs/L1",
      "DELETE /attendance/device-logs/L2",
      "DELETE /attendance/device-logs/L3",
    ]);
    expect(screen.getByText("No clock-in records in this period.")).toBeInTheDocument();
  });

  it("confirms a single deletion in the singular", async () => {
    const { user } = await renderHistory();
    await user.click(rowBox("Amrani"));
    await user.click(screen.getByRole("button", { name: /Delete/ }));
    await answerConfirmDialog(true);
    expect(await screen.findByText("1 clock-in record deleted.")).toBeInTheDocument();
  });

  it("reports the punches that couldn't be deleted", async () => {
    db.logs.push(punch(ali, "2026-03-08 08:00", { _id: undefined }));
    server.use(http.delete(`${API}/attendance/device-logs/L3`, () => HttpResponse.json({ message: "Locked by payroll" }, { status: 409 })));
    const { user } = await renderHistory();
    await user.click(selectAll());
    await user.click(screen.getByRole("button", { name: /Delete/ }));
    await answerConfirmDialog(true);
    expect(await screen.findByText(/2 record\(s\) deleted, 2 couldn't be deleted\./)).toBeInTheDocument();
    expect(table()).toHaveLength(2);
  });

  it("shows a load error when the list can't be reloaded after deleting", async () => {
    const { user } = await renderHistory();
    await user.click(rowBox("Amrani"));
    await user.click(screen.getByRole("button", { name: /Delete/ }));
    server.use(http.get(`${API}/attendance/device-logs`, () => HttpResponse.error()));
    await answerConfirmDialog(true);
    expect(await screen.findByText("Couldn't load the clock-in records")).toBeInTheDocument();
    expect(writes()).toEqual([expect.objectContaining({ method: "DELETE", url: "/attendance/device-logs/L3" })]);
  });
});

// ─── Adding a punch ───────────────────────────────────────────────────────────

describe("ClockInPageHistory – adding a clock-in", () => {
  it("opens the form with the employees, and closes it with Cancel or ×", async () => {
    const { user } = await renderHistory();
    await user.click(screen.getByRole("button", { name: "Add clock-in" }));
    expect(screen.getByRole("heading", { name: "Add a clock-in" })).toBeInTheDocument();
    await waitFor(() => expect(Array.from(employeeSelect().options).map((o) => o.text)).toEqual(["Select an employee", "101 — Zerrouki Ali", "102 — Amrani Sara"]));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Add a clock-in" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add clock-in" }));
    await user.click(screen.getByRole("button", { name: "×" }));
    expect(screen.queryByRole("heading", { name: "Add a clock-in" })).not.toBeInTheDocument();
  });

  it("asks for an employee and a time", async () => {
    const { user } = await renderHistory();
    await user.click(screen.getByRole("button", { name: "Add clock-in" }));
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Choose an employee and enter the date and time.")).toBeInTheDocument();
    expect(writes()).toEqual([]);
  });

  it("uses today's date when only a time is picked", async () => {
    db.logs = [];
    const { user } = await renderHistory();
    await user.click(screen.getByRole("button", { name: "Add clock-in" }));
    const modal = screen.getByRole("heading", { name: "Add a clock-in" }).parentElement!.parentElement!;
    await pickTime(user, modal, "09:30");
    expect(dateInputs()[2]).toHaveValue("2026-03-10");
  });

  it("keeps the picked time when the date changes", async () => {
    const { user } = await renderHistory();
    await user.click(screen.getByRole("button", { name: "Add clock-in" }));
    const modal = screen.getByRole("heading", { name: "Add a clock-in" }).parentElement!.parentElement!;
    fireEvent.change(dateInputs()[2], { target: { value: "2026-03-08" } });
    expect(within(modal).getByLabelText("Hour")).toHaveValue("00");
    await pickTime(user, modal, "09:30");
    fireEvent.change(dateInputs()[2], { target: { value: "2026-03-09" } });
    expect(within(modal).getByLabelText("Hour")).toHaveValue("09");
  });

  it("saves a first punch of the day and creates the day's worktime", async () => {
    db.logs = [];
    const { user } = await renderHistory();
    await addPunch(user, "101", "2026-03-09", "08:10");
    await user.type(modalField("Consumption"), "150");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Clock-in added. Worked hours will be calculated after the clock-out.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Add a clock-in" })).not.toBeInTheDocument();
    expect(writes("/attendance")).toEqual([
      expect.objectContaining({ method: "POST", body: { deviceUserId: "101", timestamp: "2026-03-09T07:10:00.000Z", processed: false } }),
    ]);
    expect(requests.some((r) => r.url === "/attendance/device-logs?from=2026-03-08&to=2026-03-10")).toBe(true);
    expect(worktimeWrite()).toEqual({
      method: "POST",
      url: "/worktime",
      audit: "edit",
      body: {
        emp_id: 101,
        shift_id: "s1",
        work_date: "2026-03-09",
        clock_in: "08:10",
        clock_out: "00:00",
        late_minutes: expect.any(String),
        overtime_minutes: "0",
        work_hours: "00:00",
        consomation: 150,
        penalty: 0,
        bonus: 0,
        absent: false,
        absent_comment: "",
      },
    });
    expect(await screen.findByText("08:10")).toBeInTheDocument();
  });

  it("computes hours, delay and overtime once the day has a clock-out", async () => {
    db.shifts = [snakeShift("08:00", "16:00")];
    db.logs = [punch(ali, "2026-03-09 08:20")];
    const { user } = await renderHistory();
    await addPunch(user, "101", "2026-03-09", "17:00");
    await user.type(modalField("Penalty"), "200");
    await user.type(modalField("Bonus"), "50");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Clock-in added. Worked hours updated with the clock-in and clock-out.")).toBeInTheDocument();
    expect(worktimeWrite().body).toMatchObject({
      shift_id: "s1",
      clock_in: "08:20",
      clock_out: "17:00",
      work_hours: "08:40",
      late_minutes: "20",
      overtime_minutes: "60",
      penalty: 200,
      bonus: 50,
    });
  });

  it("handles a night shift that ends after midnight", async () => {
    db.shifts = [snakeShift("18:00", "02:00")];
    db.logs = [punch(ali, "2026-03-09 18:05")];
    const { user } = await renderHistory();
    await addPunch(user, "101", "2026-03-09", "23:30");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText(/Clock-in added/);
    expect(worktimeWrite().body).toMatchObject({ work_hours: "05:25", late_minutes: "5", overtime_minutes: "0" });
  });

  it("counts hours across midnight", async () => {
    db.shifts = [snakeShift("20:00", "00:00")];
    db.logs = [punch(ali, "2026-03-10 00:30")]; // 23:30 UTC on the 9th
    const { user } = await renderHistory();
    await addPunch(user, "101", "2026-03-09", "23:30");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText(/Clock-in added/);
    expect(worktimeWrite().body).toMatchObject({ clock_in: "23:30", clock_out: "00:30", work_hours: "01:00", late_minutes: "210" });
  });

  it("warns when the employee isn't in the planning, and still saves", async () => {
    db.planning = [];
    db.logs = [];
    const { user } = await renderHistory();
    await addPunch(user, "101", "2026-03-09", "08:10");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(
      await screen.findByText("Employee 101 isn't in the planning on 2026-03-09. The clock-in is saved, but lateness and overtime can't be calculated.")
    ).toBeInTheDocument();
    expect(await screen.findByText(/Clock-in added/)).toBeInTheDocument();
    expect(worktimeWrite().body).toMatchObject({ shift_id: null, late_minutes: "0", overtime_minutes: "0" });
  });

  it("reads planning and shift ids given as plain strings, and wrapped responses", async () => {
    db.logs = [];
    server.use(
      http.get(`${API}/shifts`, () => HttpResponse.json({ data: [snakeShift("08:00", "16:00")] })),
      http.get(`${API}/planning`, () => HttpResponse.json({ data: [{ empId: "m101", shiftId: "s1" }] })),
      http.get(`${API}/employees`, () => HttpResponse.json({ data: [ali] }))
    );
    const { user } = await renderHistory();
    await addPunch(user, "101", "2026-03-09", "08:10");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText(/Clock-in added/);
    expect(worktimeWrite().body).toMatchObject({ shift_id: "s1", late_minutes: "10" });
  });

  it("ignores shifts and planning in an unexpected shape", async () => {
    db.logs = [];
    server.use(
      http.get(`${API}/shifts`, () => HttpResponse.json({ nope: 1 })),
      http.get(`${API}/planning`, () => HttpResponse.json({ nope: 1 }))
    );
    const { user } = await renderHistory();
    await addPunch(user, "101", "2026-03-09", "08:10");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText(/Clock-in added/);
    expect(worktimeWrite().body).toMatchObject({ shift_id: null });
  });

  it("updates the day's existing worktime instead of creating another", async () => {
    db.logs = [punch(ali, "2026-03-09 08:00")];
    db.worktimes = [{ _id: "w1", worktime_id: 1, emp_id: 101, work_date: "2026-03-09", clock_in: "08:00" }];
    const { user } = await renderHistory();
    await addPunch(user, "101", "2026-03-09", "16:00");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText(/Clock-in added/);
    expect(worktimeWrite()).toMatchObject({ method: "PUT", url: "/worktime/w1" });
  });

  // BUG-217: adding a punch resets the day's penalty, consumption and bonus to the form's zeros
  it("keeps the day's penalty and consumption when a punch is added", async () => {
    db.logs = [punch(ali, "2026-03-09 08:00")];
    db.worktimes = [{ _id: "w1", worktime_id: 1, emp_id: 101, work_date: "2026-03-09", clock_in: "08:00", penalty: 500, consomation: 300 }];
    const { user } = await renderHistory();
    await addPunch(user, "101", "2026-03-09", "16:00");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText(/Clock-in added/);
    expect(db.worktimes[0]).toMatchObject({ penalty: 500, consomation: 300 });
  });

  // BUG-218: lateness is counted from midnight because the page reads start_time, but /shifts sends startTime
  it("measures the delay from the shift start sent by the API", async () => {
    db.shifts = [apiShift]; // { startTime: "08:00", endTime: "16:00" }
    db.logs = [];
    const { user } = await renderHistory();
    await addPunch(user, "101", "2026-03-09", "08:10");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText(/Clock-in added/);
    expect(worktimeWrite().body.late_minutes).toBe("10");
  });

  // BUG-219: worked hours run from the first to the last punch, so breaks are paid as work
  it("doesn't count a break between two periods as worked time", async () => {
    db.logs = [punch(ali, "2026-03-09 17:00"), punch(ali, "2026-03-09 18:00"), punch(ali, "2026-03-09 18:10")];
    const { user } = await renderHistory();
    await addPunch(user, "101", "2026-03-09", "19:10");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText(/Clock-in added/);
    // the example in worktime.api.ts: 17:00→18:00 + 18:10→19:10 = 02:00
    expect(worktimeWrite().body.work_hours).toBe("02:00");
  });

  // BUG-220: a punch between midnight and 1 am is filed under the previous day (UTC date), so it's "not found"
  it("adds a punch made just after midnight", async () => {
    db.logs = [];
    const { user } = await renderHistory();
    await addPunch(user, "101", "2026-03-09", "00:30");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText(/Clock-in added/)).toBeInTheDocument();
  });

  it("explains a refused punch", async () => {
    server.use(http.post(`${API}/attendance/device-logs`, () => HttpResponse.json({ status: "error", message: "Duplicate punch" })));
    const { user } = await renderHistory();
    await addPunch(user, "101", "2026-03-09", "08:10");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText(/Duplicate punch/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add a clock-in" })).toBeInTheDocument();
  });

  it("gives a generic message when the server refuses without one", async () => {
    server.use(http.post(`${API}/attendance/device-logs`, () => HttpResponse.json({}, { status: 500 })));
    const { user } = await renderHistory();
    await addPunch(user, "101", "2026-03-09", "08:10");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText(/The clock-in couldn't be saved/)).toBeInTheDocument();
  });

  it("reports when the saved punch can't be found again", async () => {
    server.use(http.get(`${API}/attendance/device-logs`, ({ request }) =>
      HttpResponse.json(new URL(request.url).searchParams.get("from") === "2026-03-08" ? { data: [] } : db.logs)
    ));
    const { user } = await renderHistory();
    await addPunch(user, "101", "2026-03-09", "08:10");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText(/no records were found for this employee/)).toBeInTheDocument();
  });

  it("reports an employee number nobody has", async () => {
    const { user } = await renderHistory();
    await addPunch(user, "101", "2026-03-09", "08:10");
    db.employees = [sara];
    server.use(http.get(`${API}/employees`, () => HttpResponse.json({ data: db.employees })));
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText(/No employee has the number 101\./)).toBeInTheDocument();
  });

  it("rejects an invalid date", async () => {
    const { user } = await renderHistory();
    await addPunch(user, "101", "2026-13-45", "08:10");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("The date and time aren't valid.")).toBeInTheDocument();
    expect(writes()).toEqual([]);
    // the form can be used again
    expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();
  });

  it("sends a punch only once when Add is clicked twice", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let posts = 0;
    server.use(
      http.post(`${API}/attendance/device-logs`, async () => {
        posts++;
        await gate;
        return HttpResponse.json({ status: "error", message: "stop" });
      })
    );
    const { user } = await renderHistory();
    await addPunch(user, "101", "2026-03-09", "08:10");
    const add = screen.getByRole("button", { name: "Add" });
    fireEvent.click(add);
    fireEvent.click(add);
    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "×" })).toBeDisabled();
    release();
    await screen.findByText(/stop/);
    expect(posts).toBe(1);
  });
});

// ─── Editing a punch ──────────────────────────────────────────────────────────

describe("ClockInPageHistory – editing a punch", () => {
  it("changes a clock-in time and recalculates the day, keeping payroll fields", async () => {
    db.shifts = [snakeShift("08:00", "16:00")];
    db.worktimes = [{ _id: "w1", worktime_id: 1, emp_id: 101, work_date: "2026-03-09", penalty: 300, consomation: 120, bonus: 40, absent: false, absent_comment: "x" }];
    const { user } = await renderHistory();
    await user.click(screen.getByText("08:00"));
    const row = rowWith("Zerrouki");
    await pickTime(user, row, "09:00");
    await user.click(within(row).getByRole("button", { name: "✓" }));

    expect(await screen.findByText("Worked 07:30, late 60 min, overtime 30 min.")).toBeInTheDocument();
    expect(screen.getByText("Clock-in updated")).toBeInTheDocument();
    expect(writes("/attendance")).toEqual([
      expect.objectContaining({ method: "PATCH", url: "/attendance/device-logs/L1", body: { timestamp: "2026-03-09T08:00:00.000Z" } }),
    ]);
    expect(worktimeWrite()).toEqual({
      method: "PUT",
      url: "/worktime/w1",
      audit: "edit",
      body: {
        emp_id: 101,
        shift_id: "s1",
        work_date: "2026-03-09",
        clock_in: "09:00",
        clock_out: "16:30",
        work_hours: "07:30",
        late_minutes: "60",
        overtime_minutes: "30",
        consomation: 120,
        penalty: 300,
        bonus: 40,
        absent: false,
        absent_comment: "x",
      },
    });
    await waitFor(() => expect(table()).toContain("101 | Zerrouki | Ali | 09/03/2026 | 09:00 | 16:30 | Validated"));
  });

  it("changes a clock-out time", async () => {
    db.shifts = [snakeShift("08:00", "16:00")];
    const { user } = await renderHistory();
    await user.click(screen.getByText("16:30"));
    const row = rowWith("Zerrouki");
    await pickTime(user, row, "17:45");
    await user.click(within(row).getByRole("button", { name: "✓" }));
    expect(await screen.findByText("Worked 09:45, late 0 min, overtime 105 min.")).toBeInTheDocument();
    expect(worktimeWrite()).toMatchObject({ method: "POST", body: { clock_out: "17:45", consomation: 0, penalty: 0 } });
  });

  it("recalculates delay and overtime for a night shift", async () => {
    db.shifts = [snakeShift("22:00", "06:00")];
    db.logs = [punch(ali, "2026-03-09 22:15"), punch(ali, "2026-03-09 23:30")];
    const { user } = await renderHistory();
    await user.click(screen.getByText("23:30"));
    const row = rowWith("Zerrouki");
    await pickTime(user, row, "23:50");
    await user.click(within(row).getByRole("button", { name: "✓" }));
    expect(await screen.findByText("Worked 01:35, late 15 min, overtime 0 min.")).toBeInTheDocument();
  });

  it("cancels an edit with ✕", async () => {
    const { user } = await renderHistory();
    await user.click(screen.getByText("08:00"));
    await user.click(within(rowWith("Zerrouki")).getByRole("button", { name: "✕" }));
    expect(within(rowWith("Zerrouki")).queryByLabelText("Hour")).not.toBeInTheDocument();
    await user.click(screen.getByText("16:30"));
    await user.click(within(rowWith("Zerrouki")).getByRole("button", { name: "✕" }));
    expect(within(rowWith("Zerrouki")).queryByLabelText("Hour")).not.toBeInTheDocument();
    expect(writes()).toEqual([]);
  });

  it("adds a missing clock-out", async () => {
    const { user } = await renderHistory();
    await user.click(within(rowWith("Amrani")).getByText("—", { selector: "button" }));
    const row = rowWith("Amrani");
    await user.click(within(row).getByRole("button", { name: "✓" }));
    expect(await screen.findByText("Enter a time.")).toBeInTheDocument();

    await pickTime(user, row, "17:00");
    await user.click(within(row).getByRole("button", { name: "✓" }));
    expect(await screen.findByText("Clock-out added")).toBeInTheDocument();
    expect(writes("/attendance")).toEqual([
      expect.objectContaining({ method: "POST", body: { deviceUserId: "102", timestamp: "2026-03-09T16:00:00.000Z", processed: false } }),
    ]);
    expect(worktimeWrite().body).toMatchObject({ emp_id: 102, clock_in: "09:00", clock_out: "17:00", work_hours: "08:00" });
  });

  it("cancels adding a clock-out", async () => {
    const { user } = await renderHistory();
    await user.click(within(rowWith("Amrani")).getByText("—", { selector: "button" }));
    await user.click(within(rowWith("Amrani")).getByRole("button", { name: "✕" }));
    expect(within(rowWith("Amrani")).queryByLabelText("Hour")).not.toBeInTheDocument();
  });

  it("doesn't open an editor for a clock-out without an id", async () => {
    db.logs = [punch(ali, "2026-03-09 08:00"), punch(ali, "2026-03-09 16:00", { _id: undefined })];
    const { user } = await renderHistory();
    await user.click(screen.getByText("16:00"));
    expect(screen.queryByLabelText("Hour")).not.toBeInTheDocument();
  });

  // BUG-223: a punch without an id is shown as an open time editor instead of its time
  it("shows the time of a punch that has no id", async () => {
    db.logs = [punch(ali, "2026-03-09 08:00", { _id: undefined })];
    await renderHistory();
    expect(screen.getByText("08:00")).toBeInTheDocument();
    expect(screen.queryByLabelText("Hour")).not.toBeInTheDocument();
  });

  it("warns when the employee isn't in the planning", async () => {
    db.planning = [];
    const { user } = await renderHistory();
    await user.click(screen.getByText("16:30"));
    const row = rowWith("Zerrouki");
    await pickTime(user, row, "16:00");
    await user.click(within(row).getByRole("button", { name: "✓" }));
    expect(await screen.findByText(/isn't in the planning on 2026-03-09/)).toBeInTheDocument();
    expect(await screen.findByText(/This employee wasn't in the planning\./)).toBeInTheDocument();
    expect(worktimeWrite().body).toMatchObject({ shift_id: null, late_minutes: "0" });
  });

  it("reads wrapped responses and plain-string ids", async () => {
    server.use(
      http.get(`${API}/shifts`, () => HttpResponse.json({ data: [snakeShift("08:00", "16:00")] })),
      http.get(`${API}/planning`, () => HttpResponse.json({ data: [{ empId: "m101", shiftId: "s1" }] }))
    );
    const { user } = await renderHistory();
    server.use(http.get(`${API}/employees`, () => HttpResponse.json({ data: db.employees })));
    server.use(
      http.get(`${API}/attendance/device-logs`, ({ request }) =>
        HttpResponse.json(new URL(request.url).searchParams.get("from") === "2026-03-08" ? { data: db.logs } : db.logs)
      )
    );
    await user.click(screen.getByText("16:30"));
    const row = rowWith("Zerrouki");
    await pickTime(user, row, "16:00");
    await user.click(within(row).getByRole("button", { name: "✓" }));
    expect(await screen.findByText("Worked 08:00, late 0 min, overtime 0 min.")).toBeInTheDocument();
  });

  it("ignores shift, planning and employee lists in an unexpected shape", async () => {
    server.use(
      http.get(`${API}/shifts`, () => HttpResponse.json({ nope: 1 })),
      http.get(`${API}/planning`, () => HttpResponse.json({ nope: 1 }))
    );
    const { user } = await renderHistory();
    server.use(http.get(`${API}/employees`, () => HttpResponse.json({ nope: 1 })));
    await user.click(screen.getByText("16:30"));
    const row = rowWith("Zerrouki");
    await pickTime(user, row, "16:00");
    await user.click(within(row).getByRole("button", { name: "✓" }));
    expect(await screen.findByText(/No employee has the number 101\./)).toBeInTheDocument();
  });

  it("explains a refused change, keeping the editor open", async () => {
    server.use(http.patch(`${API}/attendance/device-logs/:id`, () => HttpResponse.json({ message: "Too late to change" }, { status: 403 })));
    const { user } = await renderHistory();
    await user.click(screen.getByText("08:00"));
    const row = rowWith("Zerrouki");
    await pickTime(user, row, "09:00");
    await user.click(within(row).getByRole("button", { name: "✓" }));
    expect(await screen.findByText(/Too late to change/)).toBeInTheDocument();
    expect(within(row).getByLabelText("Hour")).toBeEnabled();
  });

  it("gives a generic message when a change or a new clock-out is refused without one", async () => {
    server.use(
      http.patch(`${API}/attendance/device-logs/:id`, () => new HttpResponse("oops", { status: 500 })),
      http.post(`${API}/attendance/device-logs`, () => new HttpResponse("oops", { status: 500 }))
    );
    const { user } = await renderHistory();
    await user.click(screen.getByText("08:00"));
    await pickTime(user, rowWith("Zerrouki"), "09:00");
    await user.click(within(rowWith("Zerrouki")).getByRole("button", { name: "✓" }));
    expect(await screen.findByText(/The clock-in couldn't be changed/)).toBeInTheDocument();
    await user.click(within(rowWith("Zerrouki")).getByRole("button", { name: "✕" }));

    await user.click(within(rowWith("Amrani")).getByText("—", { selector: "button" }));
    await pickTime(user, rowWith("Amrani"), "17:00");
    await user.click(within(rowWith("Amrani")).getByRole("button", { name: "✓" }));
    expect(await screen.findByText(/The clock-out couldn't be added/)).toBeInTheDocument();
  });

  it("reports when no punches are found to recalculate", async () => {
    const { user } = await renderHistory();
    server.use(http.get(`${API}/attendance/device-logs`, () => HttpResponse.json([])));
    await user.click(screen.getByText("08:00"));
    await pickTime(user, rowWith("Zerrouki"), "09:00");
    await user.click(within(rowWith("Zerrouki")).getByRole("button", { name: "✓" }));
    expect(await screen.findByText(/No records were found to recalculate the worked hours/)).toBeInTheDocument();
  });

  // BUG-221: the editor shows the punch's UTC time, so saving it unchanged moves the punch an hour earlier
  it("opens the editor on the time shown in the table", async () => {
    const { user } = await renderHistory();
    await user.click(screen.getByText("08:00"));
    expect(within(rowWith("Zerrouki")).getByLabelText("Hour")).toHaveValue("08");
  });
});

// BUG-222: punches are grouped by their UTC date, so a punch between midnight and 1 am lands on the previous day
it("pairs a punch just after midnight with the same morning's clock-out", async () => {
  db.logs = [punch(ali, "2026-03-09 00:30"), punch(ali, "2026-03-09 08:00")];
  await renderHistory();
  expect(table()).toEqual(["101 | Zerrouki | Ali | 09/03/2026 | 00:30 | 08:00 | Validated"]);
});
