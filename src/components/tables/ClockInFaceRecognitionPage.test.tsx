import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { delay, http, HttpResponse } from "msw";
import AttendancePage from "./ClockInFaceRecognitionPage";
import type { EmployeeRecord, PlanningRecord, ShiftRecord } from "@/components/calendar/types";
import type { WorktimeRecord } from "./worktime.api";
import { API, server } from "@/test/server";
import { act, answerConfirmDialog, configure, renderWithProviders, screen, waitFor, within } from "@/test/render";

// The page waits on several requests in a row; leave room when the machine is busy
configure({ asyncUtilTimeout: 3000 });

// ── Test data ──────────────────────────────────────────────────────────────

const DAY = "2026-03-10";
const NEXT_DAY = "2026-03-11";

const emp = (empNumber: number, firstName: string, lastName = "Test"): EmployeeRecord => ({
  _id: `e${empNumber}`,
  empNumber,
  firstName,
  lastName,
  baseSalary: 30000,
});

const shift = (_id: string, startTime: string, endTime: string): ShiftRecord => ({ _id, startTime, endTime });

const plan = (e: EmployeeRecord, s: ShiftRecord, extra: Partial<PlanningRecord> = {}): PlanningRecord => ({
  _id: `p-${e._id}-${s._id}`,
  empId: e,
  shiftId: s,
  taskId: 1,
  planDate: DAY,
  ...extra,
});

interface Punch {
  _id?: string;
  deviceUserId: string;
  timestamp: string;
  deviceLogId?: string;
}

/** A machine log for device user `user` at `time` ("HH:MM") on `date`. */
const punch = (user: string | number, time: string, date = DAY, extra: Partial<Punch> = {}): Punch => ({
  _id: `${user}@${date}T${time}`,
  deviceUserId: String(user),
  timestamp: `${date}T${time}:00`,
  ...extra,
});

const record = (overrides: Partial<WorktimeRecord> = {}): WorktimeRecord => ({
  _id: "w1",
  worktime_id: 1,
  emp_id: 101,
  shift_id: "s1",
  work_date: DAY,
  ...overrides,
});

const ALI = emp(101, "Ali", "Ben");
const SARA = emp(102, "Sara", "Kaci");
const OMAR = emp(103, "Omar", "Zid");
const DAY_SHIFT = shift("s1", "08:00", "17:00");
// The API sends times as HH:MM or HH:MM:SS
const LATE_SHIFT = shift("s2", "17:00:00", "23:00:00");
const NIGHT_SHIFT = shift("s3", "16:00", "02:00");

// ── Fake backend ───────────────────────────────────────────────────────────

interface Backend {
  employees?: EmployeeRecord[];
  shifts?: ShiftRecord[];
  planning?: PlanningRecord[] | "error";
  /** Machine logs by date; a function lets a test change them later. */
  logs?: Record<string, unknown> | ((date: string) => unknown);
  logsStatus?: number;
  /** Worktime records already in the database. */
  worktimes?: WorktimeRecord[];
  status?: Record<string, unknown> | "error";
  employeesStatus?: number;
  saveStatus?: number;
}

interface Call {
  method: string;
  path: string;
  query: Record<string, string>;
  body: Record<string, unknown> | undefined;
  audit: string | null;
}

function backend(b: Backend = {}) {
  const calls: Call[] = [];
  const logRequests: string[] = [];
  const remember = async (request: Request) => {
    const url = new URL(request.url);
    const text = request.method === "GET" ? "" : await request.text();
    calls.push({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body: text ? JSON.parse(text) : undefined,
      audit: request.headers.get("X-Audit-As"),
    });
  };
  const worktimes = b.worktimes ?? [];

  server.use(
    http.get(`${API}/device/status`, () =>
      b.status === "error"
        ? new HttpResponse(null, { status: 503 })
        : HttpResponse.json(b.status ?? { connected: true, name: "ZK Terminal", ip: "10.0.0.5" })
    ),
    http.get(`${API}/employees`, () =>
      b.employeesStatus
        ? HttpResponse.text("boom", { status: b.employeesStatus })
        : HttpResponse.json(b.employees ?? [ALI, SARA])
    ),
    http.get(`${API}/shifts`, () => HttpResponse.json(b.shifts ?? [DAY_SHIFT])),
    http.get(`${API}/planning`, () =>
      b.planning === "error"
        ? new HttpResponse(null, { status: 500 })
        : HttpResponse.json(b.planning ?? [plan(ALI, DAY_SHIFT), plan(SARA, DAY_SHIFT)])
    ),
    http.get(`${API}/attendance/device-logs`, ({ request }) => {
      const date = new URL(request.url).searchParams.get("date") ?? "";
      logRequests.push(date);
      if (b.logsStatus) return new HttpResponse(null, { status: b.logsStatus });
      const body = typeof b.logs === "function" ? b.logs(date) : b.logs?.[date];
      return HttpResponse.json((body ?? []) as never);
    }),
    http.get(`${API}/worktime`, async ({ request }) => {
      await remember(request);
      const q = new URL(request.url).searchParams;
      const empId = q.get("emp_id");
      const date = q.get("work_date");
      return HttpResponse.json(
        worktimes.filter((r) => (!empId || String(r.emp_id) === empId) && (!date || r.work_date === date))
      );
    }),
    http.post(`${API}/worktime`, async ({ request }) => {
      await remember(request);
      if (b.saveStatus) return HttpResponse.text("nope", { status: b.saveStatus });
      const body = calls[calls.length - 1].body ?? {};
      return HttpResponse.json({ ...body, _id: `new-${body.emp_id}`, worktime_id: 9 });
    }),
    http.put(`${API}/worktime/:id`, async ({ request, params }) => {
      await remember(request);
      if (b.saveStatus) return HttpResponse.text("nope", { status: b.saveStatus });
      const body = calls[calls.length - 1].body ?? {};
      return HttpResponse.json({ ...body, _id: String(params.id), worktime_id: 1 });
    })
  );

  return {
    calls,
    logRequests,
    saves: () => calls.filter((c) => c.method !== "GET"),
    searches: () => calls.filter((c) => c.method === "GET" && c.query.emp_id),
  };
}

// ── Page helpers ───────────────────────────────────────────────────────────

/** Renders the page for DAY (unless `currentDate` is null) and waits for the table. */
async function renderPage(b: Backend = {}, { currentDate = DAY as string | null } = {}) {
  const api = backend(b);
  const view = renderWithProviders(<AttendancePage currentDate={currentDate ?? undefined} />, {
    url: "/clockinfacerecognitionpage",
  });
  await tableReady();
  return { ...view, api };
}

/** Waits until the machine logs are read and the table is shown. */
async function tableReady() {
  await waitFor(() => {
    expect(screen.getByPlaceholderText("Search employee…")).toBeInTheDocument();
    expect(screen.queryByText("Reading machine…")).not.toBeInTheDocument();
  });
}

const cellText = (el: Element) => (el.textContent ?? "").replace("Face recognition", "").trim();

/** The cells of an employee's row, by column. */
function row(name: string) {
  const tr = screen.getByText(name).closest("tr") as HTMLTableRowElement;
  const cells = within(tr).getAllByRole("cell");
  return {
    tr,
    employee: cellText(cells[0]),
    status: cellText(cells[1]),
    clockIn: cellText(cells[2]),
    clockOut: cellText(cells[3]),
    hours: cellText(cells[4]),
    delay: cellText(cells[5]),
    overtime: cellText(cells[6]),
    consumption: within(cells[7]).getByRole("spinbutton") as HTMLInputElement,
    penalty: within(cells[8]).getByRole("spinbutton") as HTMLInputElement,
    absent: within(cells[9]).getByRole("checkbox") as HTMLInputElement,
    reason: within(cells[10]).getByRole("textbox") as HTMLInputElement,
    saved: cellText(cells[11]),
  };
}

const banner = () => screen.getByText(/^⚠/);
const SAVE_WAIT = { timeout: 3000 };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 2, 10, 12, 0));
  // The page and worktime.api log every step to the console
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Loading ────────────────────────────────────────────────────────────────

describe("loading the day", () => {
  it("shows a loading message, then the shifts, the machine and the planned employees", async () => {
    backend();
    renderWithProviders(<AttendancePage currentDate={DAY} />);
    expect(screen.getByText("Loading attendance data…")).toBeInTheDocument();

    await tableReady();
    expect(screen.getByText("Machine punches: 0")).toBeInTheDocument();
    expect(screen.getByText("Operation date: 2026-03-10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "08:00 – 17:00" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "08:00 – 17:00 shift" })).toBeInTheDocument();
    expect(await screen.findByText("ZK Terminal — Connected")).toBeInTheDocument();
    expect(screen.getByText("Ali Ben")).toBeInTheDocument();
    expect(screen.getByText("Sara Kaci")).toBeInTheDocument();
    expect(screen.getByText("2 employees in this shift")).toBeInTheDocument();
  });

  it("shows the machine as disconnected when its status can't be read", async () => {
    await renderPage({ status: "error" });
    expect(await screen.findByText("Face Recognition Machine — Disconnected")).toBeInTheDocument();
  });

  it("shows the machine as disconnected when it reports so", async () => {
    await renderPage({ status: { connected: false, name: "Door scanner" } });
    expect(await screen.findByText("Door scanner — Disconnected")).toBeInTheDocument();
  });

  it("asks to create shifts first when there are none", async () => {
    backend({ shifts: [] });
    renderWithProviders(<AttendancePage currentDate={DAY} />);
    expect(await screen.findByText("No shifts found. Add shifts in Shifts Management first.")).toBeInTheDocument();
  });

  it("does not show the table when the day's data can't be loaded", async () => {
    backend({ employeesStatus: 500 });
    renderWithProviders(<AttendancePage currentDate={DAY} />);
    await waitFor(() => expect(screen.queryByText("Loading attendance data…")).not.toBeInTheDocument());
    expect(screen.queryByPlaceholderText("Search employee…")).not.toBeInTheDocument();
  });

  // BUG-106: a failed load is reported as "No shifts found" and the error is never shown
  it("explains when the day's data can't be loaded", async () => {
    backend({ employeesStatus: 500 });
    renderWithProviders(<AttendancePage currentDate={DAY} />);
    await waitFor(() => expect(screen.queryByText("Loading attendance data…")).not.toBeInTheDocument());
    expect(screen.getByText(/Couldn't load today's data/)).toBeInTheDocument();
    expect(screen.queryByText("No shifts found. Add shifts in Shifts Management first.")).not.toBeInTheDocument();
  });

  it("still opens when the planning can't be loaded, with nobody in the shift", async () => {
    await renderPage({ planning: "error" });
    expect(screen.getByText("No employees assigned to this shift for today.")).toBeInTheDocument();
    expect(screen.getByText("0 employees in this shift")).toBeInTheDocument();
  });

  // BUG-107: with no employees the table stays on "Loading attendance..." for ever
  it("says when there are no employees at all", async () => {
    backend({ employees: [], planning: [] });
    renderWithProviders(<AttendancePage currentDate={DAY} />);
    expect(await screen.findByText("No employees found in the database.")).toBeInTheDocument();
  });

  it("asks for the day's records and the machine logs of the day", async () => {
    const { api } = await renderPage();
    expect(api.logRequests).toEqual([DAY]);
    expect(api.calls[0]).toMatchObject({ method: "GET", path: "/worktime", query: { work_date: DAY } });
  });

  it("explains when the machine logs can't be read, and the message can be closed", async () => {
    backend({ logsStatus: 500 });
    const { user } = renderWithProviders(<AttendancePage currentDate={DAY} />);
    expect(await screen.findByText(/Couldn't load the face-recognition clock-ins/)).toBeInTheDocument();
    await user.click(within(banner().parentElement as HTMLElement).getByRole("button"));
    expect(screen.queryByText(/Couldn't load the face-recognition clock-ins/)).not.toBeInTheDocument();
  });

  it("rejects a machine answer that is not a list of logs", async () => {
    backend({ logs: { [DAY]: { error: "bad" } } });
    renderWithProviders(<AttendancePage currentDate={DAY} />);
    expect(await screen.findByText(/Invalid face-recognition attendance response/)).toBeInTheDocument();
  });

  it("accepts machine logs wrapped in { data: [...] }", async () => {
    await renderPage({ logs: { [DAY]: { data: [punch(101, "08:00")] } } });
    expect(screen.getByText("Machine punches: 1")).toBeInTheDocument();
    expect(row("Ali Ben").clockIn).toBe("08:00");
  });
});

// ── Operational date ───────────────────────────────────────────────────────

describe("operational date", () => {
  it("is today when no shift crosses midnight", async () => {
    vi.setSystemTime(new Date(2026, 2, 11, 1, 0));
    const { api } = await renderPage({}, { currentDate: null });
    expect(screen.getByText("Operation date: 2026-03-11")).toBeInTheDocument();
    expect(api.logRequests).toContain("2026-03-11");
  });

  it("is still yesterday before an overnight shift has ended", async () => {
    vi.setSystemTime(new Date(2026, 2, 11, 1, 0));
    const { api } = await renderPage(
      { shifts: [NIGHT_SHIFT], planning: [plan(ALI, NIGHT_SHIFT)] },
      { currentDate: null }
    );
    await waitFor(() => expect(screen.getByText("Operation date: 2026-03-10")).toBeInTheDocument());
    await waitFor(() => expect(api.logRequests).toEqual(expect.arrayContaining([DAY, NEXT_DAY])));
  });

  it("moves to today once the overnight shift is over", async () => {
    vi.setSystemTime(new Date(2026, 2, 11, 2, 30));
    await renderPage({ shifts: [NIGHT_SHIFT], planning: [plan(ALI, NIGHT_SHIFT)] }, { currentDate: null });
    expect(screen.getByText("Operation date: 2026-03-11")).toBeInTheDocument();
  });
});

// ── Machine punches → times ────────────────────────────────────────────────

describe("turning machine punches into times", () => {
  it("pairs punches as in/out and leaves pauses out of the hours", async () => {
    await renderPage({
      logs: { [DAY]: [punch(101, "12:30"), punch(101, "08:00"), punch(101, "17:00"), punch(101, "12:00")] },
    });
    expect(screen.getByText("Machine punches: 4")).toBeInTheDocument();
    const ali = row("Ali Ben");
    expect(ali).toMatchObject({ status: "Present", clockIn: "08:00", clockOut: "17:00", hours: "08:30" });
    expect(row("Sara Kaci")).toMatchObject({ status: "Pending", clockIn: "No punch", clockOut: "No punch" });
  });

  it("keeps an employee who is still working pending, counting only finished periods", async () => {
    await renderPage({ logs: { [DAY]: [punch(101, "08:00"), punch(101, "12:00"), punch(101, "13:00")] } });
    expect(row("Ali Ben")).toMatchObject({ status: "Pending", clockIn: "08:00", clockOut: "No punch", hours: "04:00" });
  });

  it("matches device ids with stray spaces and control characters", async () => {
    await renderPage({ logs: { [DAY]: [punch(" 101\u0000", "08:00"), punch("101\r\n", "16:00")] } });
    expect(row("Ali Ben")).toMatchObject({ clockIn: "08:00", clockOut: "16:00", hours: "08:00" });
  });

  it("ignores punches of other days, unknown people and unreadable timestamps", async () => {
    await renderPage({
      logs: {
        [DAY]: [
          punch(101, "08:00"),
          punch(101, "09:00", "2026-03-09"),
          punch(999, "10:00"),
          { deviceUserId: "101", timestamp: "yesterday" },
          { deviceUserId: "101", timestamp: "" },
        ],
      },
    });
    expect(screen.getByText("Machine punches: 2")).toBeInTheDocument();
    expect(row("Ali Ben")).toMatchObject({ clockIn: "08:00", clockOut: "No punch" });
  });

  it("counts a punch sent twice only once", async () => {
    const twice = punch(101, "08:00");
    const sameLogId = { deviceUserId: "101", timestamp: `${DAY}T16:00:00`, deviceLogId: "L1" };
    const sameTime = { deviceUserId: "102", timestamp: `${DAY}T09:00:00` };
    await renderPage({ logs: { [DAY]: [twice, twice, sameLogId, { ...sameLogId }, sameTime, { ...sameTime }] } });
    expect(screen.getByText("Machine punches: 3")).toBeInTheDocument();
    expect(row("Ali Ben")).toMatchObject({ clockIn: "08:00", clockOut: "16:00" });
  });

  it("shows the delay and the overtime against the shift times", async () => {
    await renderPage({ logs: { [DAY]: [punch(101, "08:20"), punch(101, "17:45"), punch(102, "07:50"), punch(102, "16:30")] } });
    expect(row("Ali Ben")).toMatchObject({ delay: "00:20", overtime: "00:45" });
    expect(row("Sara Kaci")).toMatchObject({ delay: "00:00", overtime: "00:00" });
  });

  it("measures the delay from the planned task start when there is one", async () => {
    const task = { id: "t1", label: "Oven", startTime: "10:00", endTime: "15:00" };
    await renderPage({
      planning: [plan(ALI, DAY_SHIFT, { tasks: [task] }), plan(SARA, DAY_SHIFT)],
      logs: { [DAY]: [punch(101, "10:05"), punch(101, "15:30")] },
    });
    expect(row("Ali Ben")).toMatchObject({ delay: "00:05" });
  });

  it("reads the next morning too for an overnight shift", async () => {
    const { api } = await renderPage({
      shifts: [NIGHT_SHIFT],
      planning: [plan(ALI, NIGHT_SHIFT), plan(SARA, NIGHT_SHIFT)],
      logs: {
        [DAY]: [punch(101, "16:00"), punch(102, "16:10")],
        [NEXT_DAY]: [punch(101, "01:30", NEXT_DAY), punch(102, "02:00", NEXT_DAY), punch(102, "09:00", NEXT_DAY)],
      },
    });
    expect([...api.logRequests].sort()).toEqual([DAY, NEXT_DAY]);
    expect(screen.getByText("Machine punches: 4")).toBeInTheDocument();
    expect(row("Ali Ben")).toMatchObject({ status: "Present", clockIn: "16:00", clockOut: "01:30", hours: "09:30" });
    // 09:00 the next morning is a new operation day
    expect(row("Sara Kaci")).toMatchObject({ clockIn: "16:10", clockOut: "02:00", hours: "09:50", overtime: "00:00" });
  });

  it("counts overtime after the end of an overnight shift", async () => {
    await renderPage({
      shifts: [NIGHT_SHIFT],
      planning: [plan(ALI, NIGHT_SHIFT)],
      worktimes: [record({ shift_id: "s3", clock_in: "16:30", clock_out: "02:45", work_hours: "10:15" })],
    });
    expect(row("Ali Ben")).toMatchObject({ clockIn: "16:30", clockOut: "02:45", delay: "00:30", overtime: "00:45" });
  });

  // BUG-101: an overnight shift's clock-out after midnight is also taken as the next day's first clock-in
  it("does not take last night's clock-out as today's clock-in", async () => {
    await renderPage({
      shifts: [NIGHT_SHIFT],
      planning: [plan(ALI, NIGHT_SHIFT)],
      logs: {
        // 01:30 closes the shift of March 9; the March 10 shift is 16:00 → 01:45
        [DAY]: [punch(101, "01:30"), punch(101, "16:00")],
        [NEXT_DAY]: [punch(101, "01:45", NEXT_DAY)],
      },
    });
    expect(row("Ali Ben")).toMatchObject({ status: "Present", clockIn: "16:00", clockOut: "01:45", hours: "09:45" });
  });

  // BUG-102: a clock-out after an overnight shift's end time is dropped
  it("keeps a clock-out made a few minutes after an overnight shift ends", async () => {
    await renderPage({
      shifts: [NIGHT_SHIFT],
      planning: [plan(ALI, NIGHT_SHIFT)],
      logs: { [DAY]: [punch(101, "16:00")], [NEXT_DAY]: [punch(101, "02:10", NEXT_DAY)] },
    });
    expect(row("Ali Ben")).toMatchObject({ status: "Present", clockOut: "02:10", hours: "10:10", overtime: "00:10" });
  });

  // BUG-103: a punch at exactly 00:00 is read as "no punch"
  it("counts a clock-out at midnight", async () => {
    const MIDNIGHT_SHIFT = shift("s5", "16:00", "00:00");
    await renderPage({
      shifts: [MIDNIGHT_SHIFT],
      planning: [plan(ALI, MIDNIGHT_SHIFT)],
      logs: { [DAY]: [punch(101, "16:00")], [NEXT_DAY]: [punch(101, "00:00", NEXT_DAY)] },
    });
    expect(row("Ali Ben")).toMatchObject({ status: "Present", clockOut: "00:00", hours: "08:00" });
  });

  // BUG-104: shifts ending before 16:00 never get overtime
  it("gives overtime to someone leaving late from a morning shift", async () => {
    const MORNING = shift("s6", "06:00", "14:00");
    await renderPage({
      shifts: [MORNING],
      planning: [plan(ALI, MORNING)],
      logs: { [DAY]: [punch(101, "06:00"), punch(101, "15:00")] },
    });
    expect(row("Ali Ben")).toMatchObject({ hours: "09:00", overtime: "01:00" });
  });

  // BUG-105: no overtime after midnight for a shift that ends at 00:00
  it("gives overtime to someone leaving after a shift that ends at midnight", async () => {
    const MIDNIGHT_SHIFT = shift("s5", "16:00", "00:00");
    await renderPage({
      shifts: [MIDNIGHT_SHIFT],
      planning: [plan(ALI, MIDNIGHT_SHIFT)],
      worktimes: [record({ shift_id: "s5", clock_in: "16:00", clock_out: "00:30", work_hours: "08:30" })],
    });
    expect(row("Ali Ben")).toMatchObject({ clockOut: "00:30", overtime: "00:30" });
  });
});

// ── Database records and the browser copy ───────────────────────────────────

describe("records already saved", () => {
  it("shows a saved record for an employee the machine hasn't seen", async () => {
    await renderPage({
      worktimes: [record({ clock_in: "08:10", clock_out: "17:00", work_hours: "08:50", penalty: 200, consomation: 150 })],
    });
    const ali = row("Ali Ben");
    expect(ali).toMatchObject({ status: "Present", clockIn: "08:10", clockOut: "17:00", hours: "08:50", delay: "00:10", saved: "✓ Saved" });
    expect(ali.penalty).toHaveValue(200);
    expect(ali.consumption).toHaveValue(150);
    expect(row("Sara Kaci")).toMatchObject({ status: "Pending", hours: "00:00", saved: "—" });
  });

  it("shows absent employees with their replacement", async () => {
    await renderPage({
      employees: [ALI, SARA, OMAR],
      planning: [plan(ALI, DAY_SHIFT), plan(SARA, DAY_SHIFT), plan(OMAR, DAY_SHIFT)],
      worktimes: [
        record({ emp_id: 101, absent: true, absent_comment: "Sick", backup_emp_id: 102 }),
        record({ _id: "w2", emp_id: 102, absent: true, backup_emp_id: 999 }),
        record({ _id: "w3", emp_id: 103, absent: true }),
      ],
    });
    const ali = row("Ali Ben");
    expect(ali).toMatchObject({ status: "Absent", clockIn: "—", clockOut: "—" });
    expect(ali.employee).toContain("Backup: Sara Kaci");
    expect(ali.absent).toBeChecked();
    expect(ali.reason).toHaveValue("Sick");
    expect(ali.reason).toBeEnabled();
    expect(row("Sara Kaci").employee).toContain("Backup: Employee #999");
    expect(row("Omar Zid").employee).toContain("Backup: Not assigned");
    expect(screen.getByText("Absent", { selector: "p" }).nextElementSibling).toHaveTextContent("3");
  });

  it("brings back changes kept in the browser for the day", async () => {
    localStorage.setItem(
      `worktime_${DAY}`,
      JSON.stringify({ "102-s1": { clockIn: "09:00", clockOut: "00:00", periods: [], workHours: "00:00", absent: false, absentComment: "", consomation: 0, penalty: 75, workTimeId: null } })
    );
    await renderPage();
    const sara = row("Sara Kaci");
    expect(sara.clockIn).toBe("09:00");
    expect(sara.penalty).toHaveValue(75);
  });

  it("keeps an unsaved change from the browser over the database record", async () => {
    localStorage.setItem(
      `worktime_${DAY}`,
      JSON.stringify({ "101-s1": { clockIn: "08:00", clockOut: "00:00", periods: [], workHours: "00:00", absent: false, absentComment: "", consomation: 0, penalty: 500, workTimeId: "w1", _dirty: true } })
    );
    await renderPage({ worktimes: [record({ penalty: 100 })] });
    expect(row("Ali Ben").penalty).toHaveValue(500);
    expect(row("Ali Ben").saved).toBe("Unsaved");
  });

  it("ignores a damaged browser copy", async () => {
    localStorage.setItem(`worktime_${DAY}`, "{not json");
    await renderPage({ worktimes: [record({ clock_in: "08:00" })] });
    expect(row("Ali Ben").clockIn).toBe("08:00");
  });

  it("keeps the machine times over the saved ones", async () => {
    await renderPage({
      worktimes: [record({ clock_in: "07:00", clock_out: "12:00", penalty: 300 })],
      logs: { [DAY]: [punch(101, "08:00"), punch(101, "16:00")] },
    });
    const ali = row("Ali Ben");
    expect(ali).toMatchObject({ clockIn: "08:00", clockOut: "16:00", hours: "08:00" });
    expect(ali.penalty).toHaveValue(300);
  });
});

// ── Saving machine punches ─────────────────────────────────────────────────

describe("saving machine punches", () => {
  it("creates the day's worktime from the punches, as a clock-in", async () => {
    const { api } = await renderPage({
      logs: { [DAY]: [punch(101, "08:15"), punch(101, "12:00"), punch(101, "12:30"), punch(101, "17:30")] },
    });
    await waitFor(() => expect(row("Ali Ben").saved).toBe("✓ Saved"));
    // Under heavy load the effect can run again while data is still arriving and
    // save an intermediate state first (see Observations in docs/findings/clockin-face.md);
    // what matters is which day is searched and what is saved in the end.
    expect(api.searches().length).toBeGreaterThan(0);
    for (const search of api.searches()) expect(search.query).toEqual({ emp_id: "101", work_date: DAY });
    expect(api.saves().at(-1)).toMatchObject({
      method: "POST",
      path: "/worktime",
      audit: "clock",
      body: {
        emp_id: 101,
        shift_id: "s1",
        work_date: DAY,
        clock_in: "08:15",
        clock_out: "17:30",
        work_hours: "08:45",
        late_minutes: "15",
        overtime_minutes: "30",
        absent: false,
        consomation: 0,
        penalty: 0,
        backup_emp_id: null,
      },
    });
    expect(JSON.parse(localStorage.getItem(`worktime_${DAY}`) ?? "{}")["101-s1"]).toMatchObject({ workTimeId: "new-101" });
  });

  it("updates the record the employee already has for the day", async () => {
    const { api } = await renderPage({
      worktimes: [record({ _id: "w7", penalty: 100 })],
      logs: { [DAY]: [punch(101, "08:00")] },
    });
    await waitFor(() => expect(api.saves()).toHaveLength(1));
    expect(api.saves()[0]).toMatchObject({
      method: "PUT",
      path: "/worktime/w7",
      body: { clock_in: "08:00", penalty: 100 },
    });
    expect(api.saves()[0].body).not.toHaveProperty("clock_out");
  });

  it("does not send the same punches again when the shift tab changes", async () => {
    const { api, user } = await renderPage({
      shifts: [DAY_SHIFT, LATE_SHIFT],
      logs: { [DAY]: [punch(101, "08:00"), punch(101, "17:00")] },
    });
    await waitFor(() => expect(api.saves()).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "17:00 – 23:00" }));
    await user.click(screen.getByRole("button", { name: "08:00 – 17:00" }));
    await waitFor(() => expect(row("Ali Ben").saved).toBe("✓ Saved"));
    expect(api.saves()).toHaveLength(1);
  });

  it("files the punches under the shift on screen when the employee works several", async () => {
    const { api } = await renderPage({
      shifts: [LATE_SHIFT, DAY_SHIFT],
      planning: [plan(ALI, DAY_SHIFT), plan(ALI, LATE_SHIFT), plan(SARA, DAY_SHIFT)],
      logs: { [DAY]: [punch(101, "17:10"), punch(102, "08:00")] },
    });
    await waitFor(() => expect(api.saves()).toHaveLength(2));
    const byEmp = Object.fromEntries(api.saves().map((c) => [c.body?.emp_id, c.body]));
    // the first tab is the 17:00 shift
    expect(byEmp[101]).toMatchObject({ shift_id: "s2", late_minutes: "10" });
    expect(byEmp[102]).toMatchObject({ shift_id: "s1", late_minutes: "0" });
  });

  it("does not save punches of an employee with no shift today", async () => {
    const { api } = await renderPage({
      planning: [plan(SARA, DAY_SHIFT)],
      logs: { [DAY]: [punch(101, "08:00"), punch(102, "08:00")] },
    });
    await waitFor(() => expect(api.saves()).toHaveLength(1));
    expect(api.saves()[0].body).toMatchObject({ emp_id: 102 });
    expect(screen.queryByText("Ali Ben")).not.toBeInTheDocument();
  });

  it("explains when the punches can't be saved", async () => {
    await renderPage({ saveStatus: 500, logs: { [DAY]: [punch(101, "08:00")] } });
    expect(await screen.findByText(/Couldn't save the machine clock-in for employee 101/)).toBeInTheDocument();
  });

  // BUG-108: a failed save of an employee with machine punches still shows "✓ Saved"
  it("shows that a change was not saved for an employee with machine punches", async () => {
    const { api, user } = await renderPage({
      logs: { [DAY]: [punch(101, "08:00"), punch(101, "17:00")] },
    });
    await waitFor(() => expect(row("Ali Ben").saved).toBe("✓ Saved"));
    server.use(
      http.put(`${API}/worktime/:id`, () => HttpResponse.text("nope", { status: 500 })),
      http.post(`${API}/worktime`, () => HttpResponse.text("nope", { status: 500 }))
    );
    await user.type(row("Ali Ben").penalty, "5");
    expect(await screen.findByText(/Couldn't save the times for employee 101/, {}, SAVE_WAIT)).toBeInTheDocument();
    expect(api.saves()).toHaveLength(1);
    expect(row("Ali Ben").saved).toBe("Unsaved");
  });
});

// ── Editing a row ──────────────────────────────────────────────────────────

describe("editing a row", () => {
  it("saves a penalty once the manager stops typing, as an edit of the saved record", async () => {
    const { api, user } = await renderPage({ worktimes: [record({ _id: "w1", clock_in: "08:00", clock_out: "17:00" })] });
    await user.type(row("Ali Ben").penalty, "250");
    expect(row("Ali Ben").saved).toBe("Unsaved");
    await waitFor(() => expect(row("Ali Ben").saved).toBe("✓ Saved"), SAVE_WAIT);
    expect(api.saves()).toHaveLength(1);
    expect(api.saves()[0]).toMatchObject({
      method: "PUT",
      path: "/worktime/w1",
      audit: null,
      body: { emp_id: 101, penalty: 250, clock_in: "08:00", clock_out: "17:00", work_hours: "00:00" },
    });
    expect(JSON.parse(localStorage.getItem(`worktime_${DAY}`) ?? "{}")["101-s1"]).toMatchObject({ penalty: "250" });
  });

  it("shows that a change is being saved", async () => {
    const { user } = await renderPage({ worktimes: [record({ _id: "w1" })] });
    server.use(
      http.put(`${API}/worktime/:id`, async () => {
        await delay(300);
        return HttpResponse.json(record({ _id: "w1" }));
      })
    );
    await user.type(row("Ali Ben").penalty, "1");
    expect(await screen.findByText("Saving…", {}, SAVE_WAIT)).toBeInTheDocument();
    await waitFor(() => expect(row("Ali Ben").saved).toBe("✓ Saved"), SAVE_WAIT);
  });

  it("creates a record when a consumption is entered for someone without one", async () => {
    const { api, user } = await renderPage();
    await user.type(row("Sara Kaci").consumption, "120");
    await waitFor(() => expect(api.saves()).toHaveLength(1), SAVE_WAIT);
    expect(api.saves()[0]).toMatchObject({ method: "POST", body: { emp_id: 102, consomation: 120, absent: false } });
    await waitFor(() => expect(row("Sara Kaci").saved).toBe("✓ Saved"));
  });

  it("shows that a change could not be saved", async () => {
    const { user } = await renderPage({ saveStatus: 500 });
    await user.type(row("Sara Kaci").penalty, "9");
    expect(await screen.findByText(/Couldn't save the times for employee 102/, {}, SAVE_WAIT)).toBeInTheDocument();
    expect(row("Sara Kaci").saved).toBe("Unsaved");
  });

  it("finds employees by name or number", async () => {
    const { user } = await renderPage();
    const search = screen.getByPlaceholderText("Search employee…");
    await user.type(search, "sara");
    expect(screen.queryByText("Ali Ben")).not.toBeInTheDocument();
    expect(screen.getByText("1 employee in this shift")).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "101");
    expect(screen.getByText("Ali Ben")).toBeInTheDocument();
    expect(screen.queryByText("Sara Kaci")).not.toBeInTheDocument();
  });

  it("lists each shift's own employees", async () => {
    const { user } = await renderPage({
      shifts: [DAY_SHIFT, LATE_SHIFT],
      planning: [plan(ALI, DAY_SHIFT), plan(ALI, DAY_SHIFT), plan(SARA, LATE_SHIFT), plan(OMAR, LATE_SHIFT)],
    });
    expect(screen.getByText("Ali Ben")).toBeInTheDocument();
    expect(screen.queryByText("Sara Kaci")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "17:00 – 23:00" }));
    expect(screen.getByRole("heading", { name: "17:00 – 23:00 shift" })).toBeInTheDocument();
    expect(screen.getByText("Sara Kaci")).toBeInTheDocument();
    expect(screen.queryByText("Ali Ben")).not.toBeInTheDocument();
    // Omar is planned but no longer an employee
    expect(screen.getByText("1 employee in this shift")).toBeInTheDocument();
  });

  // BUG-109: the saved late_minutes ignore the planned task start the screen uses
  it("saves the same delay as the one shown", async () => {
    const task = { id: "t1", label: "Oven", startTime: "10:00", endTime: "17:00" };
    const { api } = await renderPage({
      planning: [plan(ALI, DAY_SHIFT, { tasks: [task] })],
      logs: { [DAY]: [punch(101, "10:05")] },
    });
    await waitFor(() => expect(api.saves()).toHaveLength(1));
    expect(row("Ali Ben").delay).toBe("00:05");
    expect(api.saves()[0].body).toMatchObject({ late_minutes: "5" });
  });
});

// ── Absence ────────────────────────────────────────────────────────────────

describe("marking someone absent", () => {
  it("marks an employee without planned backups absent at once and saves the reason", async () => {
    const { api, user } = await renderPage({ worktimes: [record({ _id: "w1" })] });
    await user.click(row("Ali Ben").absent);
    expect(row("Ali Ben")).toMatchObject({ status: "Absent", clockIn: "—", clockOut: "—" });
    expect(row("Ali Ben").employee).toContain("Backup: Not assigned");
    await user.type(row("Ali Ben").reason, "Sick");
    await waitFor(() => expect(api.saves()).toHaveLength(1), SAVE_WAIT);
    expect(api.saves()[0].body).toMatchObject({ absent: true, absent_comment: "Sick", backup_emp_id: null });
  });

  it("lets the manager pick one of the planned backups", async () => {
    const { api, user } = await renderPage({
      employees: [ALI, SARA, OMAR],
      planning: [plan(ALI, DAY_SHIFT, { backupEmpIds: [OMAR] }), plan(SARA, DAY_SHIFT)],
    });
    expect(screen.queryByText("Omar Zid")).not.toBeInTheDocument();
    await user.click(row("Ali Ben").absent);

    const dialog = screen.getByRole("dialog", { name: "Choose a replacement" });
    const confirm = within(dialog).getByRole("button", { name: "Confirm absence" });
    expect(confirm).toBeDisabled();
    await user.click(within(dialog).getByRole("radio", { name: /Omar Zid/ }));
    await user.click(confirm);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(row("Ali Ben").employee).toContain("Backup: Omar Zid");
    // the backup joins this shift's list
    expect(row("Omar Zid").status).toBe("Pending");
    await waitFor(() => expect(api.saves()).toHaveLength(2), SAVE_WAIT);
    const byEmp = Object.fromEntries(api.saves().map((c) => [c.body?.emp_id, c.body]));
    expect(byEmp[101]).toMatchObject({ absent: true, backup_emp_id: 103 });
    expect(byEmp[103]).toMatchObject({ absent: false, shift_id: "s1" });
  });

  it("leaves the employee present when the backup choice is cancelled", async () => {
    const { user } = await renderPage({
      employees: [ALI, SARA, OMAR],
      planning: [plan(ALI, DAY_SHIFT, { backupEmpIds: [OMAR, SARA] }), plan(SARA, DAY_SHIFT)],
    });
    await user.click(row("Ali Ben").absent);
    expect(within(screen.getByRole("dialog")).getAllByRole("radio")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(row("Ali Ben").absent).not.toBeChecked();
  });

  it("closes the backup choice when clicking outside it", async () => {
    const { user } = await renderPage({
      employees: [ALI, OMAR],
      planning: [plan(ALI, DAY_SHIFT, { backupEmpIds: [OMAR] })],
    });
    await user.click(row("Ali Ben").absent);
    const overlay = screen.getByRole("dialog").previousElementSibling as HTMLElement;
    await user.click(overlay);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(row("Ali Ben").status).toBe("Pending");
  });

  it("explains when the chosen backup is not an employee any more", async () => {
    const gone = emp(150, "Gone", "Away");
    const { user } = await renderPage({
      planning: [plan(ALI, DAY_SHIFT, { backupEmpIds: [gone] })],
    });
    await user.click(row("Ali Ben").absent);
    await user.click(screen.getByRole("radio", { name: /Gone Away/ }));
    await user.click(screen.getByRole("button", { name: "Confirm absence" }));
    expect(banner()).toHaveTextContent("The selected backup employee could not be found.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("brings an absent employee back, without backup", async () => {
    const { api, user } = await renderPage({
      worktimes: [record({ absent: true, backup_emp_id: 102 })],
    });
    await user.click(row("Ali Ben").absent);
    expect(row("Ali Ben").status).toBe("Pending");
    expect(row("Ali Ben").reason).toBeDisabled();
    await waitFor(() => expect(api.saves()).toHaveLength(1), SAVE_WAIT);
    expect(api.saves()[0].body).toMatchObject({ absent: false, backup_emp_id: null });
  });

  // BUG-110: marking an employee with machine punches absent still saves their worked hours
  it("does not save worked hours for an absent employee", async () => {
    const { api, user } = await renderPage({
      logs: { [DAY]: [punch(101, "08:00"), punch(101, "16:00")] },
    });
    await waitFor(() => expect(api.saves()).toHaveLength(1));
    await user.click(row("Ali Ben").absent);
    await waitFor(() => expect(api.saves()).toHaveLength(2), SAVE_WAIT);
    expect(api.saves()[1].body).toMatchObject({ absent: true, work_hours: "00:00" });
  });
});

// ── Reset ──────────────────────────────────────────────────────────────────

describe("resetting the day", () => {
  const punches = { [DAY]: [punch(101, "08:00"), punch(101, "17:00")] };

  it("keeps everything when the manager cancels", async () => {
    const { user } = await renderPage({ logs: punches });
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(await screen.findByText("Reset clock-ins for 2026-03-10?")).toBeInTheDocument();
    await answerConfirmDialog(false);
    expect(row("Ali Ben").clockIn).toBe("08:00");
  });

  it("clears the times shown once confirmed", async () => {
    const { api, user } = await renderPage({ logs: punches, worktimes: [record({ _id: "w1", penalty: 100 })] });
    await waitFor(() => expect(api.saves()).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Reset" }));
    await answerConfirmDialog(true);
    expect(row("Ali Ben")).toMatchObject({ status: "Pending", clockIn: "No punch", clockOut: "No punch" });
    expect(row("Ali Ben").penalty).toHaveValue(null);
    expect(screen.getByText("Machine punches: 0")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(`worktime_${DAY}`) ?? "{}")["101-s1"]).toMatchObject({ clockIn: "", penalty: 0 });
    expect(api.saves()).toHaveLength(1);
  });
});

// ── Live updates ───────────────────────────────────────────────────────────

describe("while the page stays open", () => {
  // BUG-111: machine punches are read once; new punches never show up or get saved until a reload
  it("picks up new machine punches", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date(2026, 2, 10, 12, 0));
    let logs = [punch(101, "08:00")];
    const { api } = await renderPage({ logs: () => logs }, { currentDate: null });
    expect(row("Ali Ben").clockOut).toBe("No punch");

    logs = [punch(101, "08:00"), punch(101, "12:05")];
    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    await waitFor(() => expect(row("Ali Ben").clockOut).toBe("12:05"));
    expect(api.logRequests.length).toBeGreaterThan(1);
  });
});

describe("privacy", () => {
  // BUG-112: the page prints every machine log and saved payload to the browser console
  it("doesn't print attendance data to the console", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { api } = await renderPage({ logs: { [DAY]: [punch(101, "08:00"), punch(101, "17:00")] } });
    await waitFor(() => expect(api.saves()).toHaveLength(1));
    await waitFor(() => expect(row("Ali Ben").saved).toBe("✓ Saved"));
    const printedByPage = log.mock.calls.filter(([first]) =>
      ["DEVICE LOGS:", "MACHINE ENTRIES:", "FINAL PAYLOAD SENT TO BACKEND:"].includes(String(first))
    );
    expect(printedByPage).toEqual([]);
  });
});
