import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import AttendancePage from "./ClockInPage";
import { API, server } from "@/test/server";
import { answerConfirmDialog, fireEvent, renderWithProviders, screen, waitFor, within } from "@/test/render";
import { dismissToast, getToasts } from "@/lib/notify";
import type { EmployeeRecord, PlanningRecord, ShiftRecord } from "@/components/calendar/types";
import type { WorktimeRecord } from "./worktime.api";

// These tests type into forms and wait for debounced saves: give them room on a busy machine.
vi.setConfig({ testTimeout: 20000 });

// ─── Data ─────────────────────────────────────────────────────────────────────

const makeEmployee = (empNumber: number, firstName: string, lastName: string): EmployeeRecord => ({
  _id: `m${empNumber}`,
  empNumber,
  firstName,
  lastName,
  baseSalary: 30000,
});

const makeShift = (_id: string, startTime: string, endTime: string): ShiftRecord => ({ _id, startTime, endTime });

const makePlan = (emp: EmployeeRecord, shift: ShiftRecord, overrides: Partial<PlanningRecord> = {}): PlanningRecord => ({
  _id: `p-${emp.empNumber}-${shift._id}`,
  empId: emp,
  shiftId: shift,
  taskId: 1,
  planDate: "2026-03-02T00:00:00.000Z",
  ...overrides,
});

const ali = makeEmployee(101, "Ali", "Zerrouki");
const sara = makeEmployee(102, "Sara", "Amrani");
const bilal = makeEmployee(103, "Bilal", "Haddad");
const morning = makeShift("s1", "08:00", "16:00");
const evening = makeShift("s2", "17:00:00", "23:00:00");

const TODAY = "2026-03-02";

// ─── Fake backend ─────────────────────────────────────────────────────────────

interface Backend {
  employees: EmployeeRecord[];
  shifts: ShiftRecord[];
  planning: PlanningRecord[];
  worktimes: WorktimeRecord[];
}

let db: Backend;
let requests: { method: string; url: string; audit: string | null; body: Record<string, unknown> }[];
const writes = () => requests.filter((r) => r.method !== "GET");

const makeWorktime = (overrides: Partial<WorktimeRecord> = {}): WorktimeRecord => ({
  _id: "w1",
  worktime_id: 1,
  emp_id: 101,
  shift_id: "s1",
  work_date: TODAY,
  ...overrides,
});

function installBackend() {
  let created = 0;
  const remember = async (request: Request) => {
    const text = await request.text();
    const url = new URL(request.url);
    requests.push({
      method: request.method,
      url: url.pathname + url.search,
      audit: request.headers.get("X-Audit-As"),
      body: text ? JSON.parse(text) : undefined,
    });
    return text ? JSON.parse(text) : undefined;
  };
  server.use(
    http.get(`${API}/employees`, () => HttpResponse.json(db.employees)),
    http.get(`${API}/shifts`, () => HttpResponse.json(db.shifts)),
    http.get(`${API}/planning`, ({ request }) => {
      const date = new URL(request.url).searchParams.get("planDate");
      return HttpResponse.json(db.planning.filter((p) => p.planDate.slice(0, 10) === date));
    }),
    // A backend that applies the filters (the best case for BUG-015)
    http.get(`${API}/worktime`, async ({ request }) => {
      await remember(request);
      const q = new URL(request.url).searchParams;
      return HttpResponse.json(
        db.worktimes.filter(
          (w) =>
            (!q.get("emp_id") || String(w.emp_id) === q.get("emp_id")) &&
            (!q.get("work_date") || w.work_date === q.get("work_date"))
        )
      );
    }),
    http.post(`${API}/worktime`, async ({ request }) => {
      const body = await remember(request);
      const record = { ...body, _id: `new${++created}`, worktime_id: 100 + created };
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
  vi.setSystemTime(new Date("2026-03-02T08:05:00+01:00"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  requests = [];
  db = {
    employees: [ali, sara, bilal],
    shifts: [morning, evening],
    planning: [makePlan(ali, morning), makePlan(sara, morning), makePlan(bilal, evening)],
    worktimes: [],
  };
  installBackend();
});

afterEach(() => {
  vi.useRealTimers();
  process.env.TZ = realTZ;
  getToasts().forEach((t) => dismissToast(t.id));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SAVE_WAIT = { timeout: 3000 };

async function renderPage(props: { currentDate?: string } = { currentDate: TODAY }) {
  const view = renderWithProviders(<AttendancePage {...props} />, { url: "/clockinpage" });
  await screen.findByRole("heading", { name: "Attendance" });
  return view;
}

const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

function cell(name: string, column: string) {
  const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
  return within(rowOf(name)).getAllByRole("cell")[headers.indexOf(column)];
}

const stat = (label: string) => screen.getByText(label, { selector: "p" }).nextElementSibling?.textContent;

const savedIn = (name: string) => waitFor(() => expect(cell(name, "Saved")).toHaveTextContent("✓ Saved"), SAVE_WAIT);

async function pickTime(user: { selectOptions: (el: Element, v: string) => Promise<void> }, hhmm: string) {
  const [h, m] = hhmm.split(":");
  await user.selectOptions(screen.getByLabelText("Hour"), h);
  await user.selectOptions(screen.getByLabelText("Minute"), m);
}

// ─── Loading ──────────────────────────────────────────────────────────────────

describe("ClockInPage – loading", () => {
  it("shows a loading message, then the first shift with its planned employees", async () => {
    renderWithProviders(<AttendancePage currentDate={TODAY} />);
    expect(screen.getByText("Loading attendance data…")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "08:00 – 16:00 shift" })).toBeInTheDocument();
    expect(screen.getByDisplayValue(TODAY)).toBeInTheDocument();
    expect(screen.getByText("Ali Zerrouki")).toBeInTheDocument();
    expect(screen.getByText("EMP-102")).toBeInTheDocument();
    expect(screen.queryByText("Bilal Haddad")).not.toBeInTheDocument();
    expect(screen.getByText("2 employees in this shift")).toBeInTheDocument();
    expect(stat("Total")).toBe("2");
    expect(stat("Pending")).toBe("2");
    expect(cell("Ali Zerrouki", "Status")).toHaveTextContent("Pending");
    expect(cell("Ali Zerrouki", "Saved")).toHaveTextContent("—");
  });

  it("asks the planning for the selected date", async () => {
    let asked = "";
    server.use(
      http.get(`${API}/planning`, ({ request }) => {
        asked = new URL(request.url).search;
        return HttpResponse.json([]);
      })
    );
    await renderPage();
    expect(asked).toBe(`?planDate=${TODAY}`);
    expect(requests[0].url).toBe(`/worktime?work_date=${TODAY}`);
  });

  it("switches to another shift's employees", async () => {
    const { user } = await renderPage();
    await user.click(screen.getByRole("button", { name: "17:00 – 23:00" }));
    expect(screen.getByRole("heading", { name: "17:00 – 23:00 shift" })).toBeInTheDocument();
    expect(screen.getByText("Bilal Haddad")).toBeInTheDocument();
    expect(screen.queryByText("Ali Zerrouki")).not.toBeInTheDocument();
    expect(screen.getByText("1 employee in this shift")).toBeInTheDocument();
  });

  it("finds an employee by name or number", async () => {
    const { user } = await renderPage();
    const search = screen.getByPlaceholderText("Search employee…");
    await user.type(search, "sara");
    expect(screen.queryByText("Ali Zerrouki")).not.toBeInTheDocument();
    expect(screen.getByText("Sara Amrani")).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "emp-101");
    expect(screen.getByText("Ali Zerrouki")).toBeInTheDocument();
    expect(screen.queryByText("Sara Amrani")).not.toBeInTheDocument();
  });

  it("lists an employee once even when planned twice for the same shift", async () => {
    db.planning.push(makePlan(ali, morning, { _id: "dup" }));
    await renderPage();
    expect(screen.getAllByText("Ali Zerrouki")).toHaveLength(1);
  });

  it("ignores planning for employees that no longer exist", async () => {
    db.planning.push(makePlan(makeEmployee(999, "Gone", "Away"), morning));
    await renderPage();
    expect(screen.getByText("2 employees in this shift")).toBeInTheDocument();
  });

  it("says when nobody is planned on the shift", async () => {
    db.planning = [];
    await renderPage();
    expect(screen.getByText("No employees assigned to this shift for today.")).toBeInTheDocument();
    expect(screen.getByText("0 employees in this shift")).toBeInTheDocument();
  });

  it("says when there are no employees at all", async () => {
    db.employees = [];
    await renderPage();
    expect(screen.getByText("No employees found in the database.")).toBeInTheDocument();
  });

  it("still opens when the planning can't be loaded", async () => {
    server.use(http.get(`${API}/planning`, () => new HttpResponse("down", { status: 500 })));
    await renderPage();
    expect(screen.getByText("No employees assigned to this shift for today.")).toBeInTheDocument();
  });

  it("tells the user to create shifts first", async () => {
    db.shifts = [];
    renderWithProviders(<AttendancePage currentDate={TODAY} />);
    expect(await screen.findByText("No shifts found. Add shifts in Shifts Management first.")).toBeInTheDocument();
  });

  // BUG-205: when the employees or shifts can't be loaded, the page says "No shifts found" instead of the error
  it.fails("shows the load error when the employees can't be loaded", async () => {
    server.use(http.get(`${API}/employees`, () => new HttpResponse("down", { status: 500 })));
    renderWithProviders(<AttendancePage currentDate={TODAY} />);
    expect(await screen.findByText(/Couldn't load today's data/)).toBeInTheDocument();
  });

  it("shows a banner when the saved times can't be loaded, and hides it on request", async () => {
    server.use(http.get(`${API}/worktime`, () => new HttpResponse("down", { status: 500 })));
    const { user } = await renderPage();
    const banner = (await screen.findByText(/Couldn't load today's data/)).parentElement!;
    await user.click(within(banner).getByRole("button"));
    expect(screen.queryByText(/Couldn't load today's data/)).not.toBeInTheDocument();
  });

  it("shows the times already saved for the day", async () => {
    db.worktimes = [
      makeWorktime({ clock_in: "08:10", clock_out: "17:00", consomation: 150, penalty: 200 }),
      makeWorktime({ _id: "w2", emp_id: 102, clock_in: "07:50" }),
    ];
    await renderPage();
    await screen.findByRole("button", { name: "08:10" });
    expect(cell("Ali Zerrouki", "Status")).toHaveTextContent("Present");
    expect(cell("Ali Zerrouki", "Clock Out")).toHaveTextContent("17:00");
    expect(cell("Ali Zerrouki", "Hours")).toHaveTextContent("08:50");
    expect(cell("Ali Zerrouki", "Delay")).toHaveTextContent("00:10");
    expect(cell("Ali Zerrouki", "Overtime")).toHaveTextContent("01:00");
    expect(within(cell("Ali Zerrouki", "Consumption")).getByRole("spinbutton")).toHaveValue(150);
    expect(within(cell("Ali Zerrouki", "Penalty")).getByRole("spinbutton")).toHaveValue(200);
    expect(cell("Ali Zerrouki", "Saved")).toHaveTextContent("✓ Saved");
    // Early arrival is not a delay, and no clock-out means no hours yet
    expect(cell("Sara Amrani", "Delay")).toHaveTextContent("00:00");
    expect(cell("Sara Amrani", "Hours")).toHaveTextContent("00:00");
    expect(stat("Present")).toBe("2");
  });

  it("measures the delay from the planned task time when there is one", async () => {
    db.planning = [makePlan(ali, morning, { tasks: [{ id: "t", label: "Oven", startTime: "10:00", endTime: "14:00" }] })];
    db.worktimes = [makeWorktime({ clock_in: "10:05", clock_out: "14:30" })];
    await renderPage();
    await screen.findByRole("button", { name: "10:05" });
    expect(cell("Ali Zerrouki", "Delay")).toHaveTextContent("00:05");
    expect(cell("Ali Zerrouki", "Overtime")).toHaveTextContent("00:30");
  });
});

// ─── Clocking in and out ──────────────────────────────────────────────────────

describe("ClockInPage – clock in and out", () => {
  it("clocks an employee in at the current time and saves it", async () => {
    const { user } = await renderPage();
    await user.click(within(rowOf("Ali Zerrouki")).getByRole("button", { name: "Clock In" }));

    expect(within(rowOf("Ali Zerrouki")).getByRole("button", { name: "08:05" })).toBeInTheDocument();
    expect(cell("Ali Zerrouki", "Status")).toHaveTextContent("Present");
    expect(cell("Ali Zerrouki", "Saved")).toHaveTextContent("Unsaved");
    expect(cell("Ali Zerrouki", "Delay")).toHaveTextContent("00:05");
    expect(stat("Present")).toBe("1");

    await savedIn("Ali Zerrouki");
    expect(writes()).toEqual([
      {
        method: "POST",
        url: "/worktime",
        audit: "clock",
        body: {
          emp_id: 101,
          shift_id: "s1",
          work_date: TODAY,
          clock_in: "08:05",
          late_minutes: "5",
          overtime_minutes: "0",
          work_hours: "00:00",
          consomation: 0,
          penalty: 0,
          absent: false,
        },
      },
    ]);
  });

  it("shows that a save is in progress", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    server.use(
      http.post(`${API}/worktime`, async () => {
        await gate;
        return HttpResponse.json(makeWorktime());
      })
    );
    const { user } = await renderPage();
    await user.click(within(rowOf("Ali Zerrouki")).getByRole("button", { name: "Clock In" }));
    await waitFor(() => expect(cell("Ali Zerrouki", "Saved")).toHaveTextContent("Saving…"), SAVE_WAIT);
    release();
    await savedIn("Ali Zerrouki");
  });

  it("clocks out on the record already saved, with hours and overtime", async () => {
    db.worktimes = [makeWorktime({ clock_in: "08:00" })];
    vi.setSystemTime(new Date("2026-03-02T16:45:00+01:00"));
    const { user } = await renderPage();
    await screen.findByRole("button", { name: "08:00" });
    await user.click(within(rowOf("Ali Zerrouki")).getByRole("button", { name: "Clock Out" }));

    expect(cell("Ali Zerrouki", "Hours")).toHaveTextContent("08:45");
    expect(cell("Ali Zerrouki", "Overtime")).toHaveTextContent("00:45");
    await waitFor(() => expect(writes()).toHaveLength(1), SAVE_WAIT);
    expect(writes()[0]).toMatchObject({
      method: "PUT",
      url: "/worktime/w1",
      audit: "clock",
      body: { clock_in: "08:00", clock_out: "16:45", work_hours: "08:45", overtime_minutes: "45", late_minutes: "0" },
    });
  });

  it("counts hours across midnight", async () => {
    db.shifts = [makeShift("s3", "22:00", "00:00")];
    db.planning = [makePlan(ali, db.shifts[0])];
    db.worktimes = [makeWorktime({ shift_id: "s3", clock_in: "22:00", clock_out: "00:30" })];
    await renderPage();
    await screen.findByRole("button", { name: "22:00" });
    expect(cell("Ali Zerrouki", "Hours")).toHaveTextContent("02:30");
    expect(cell("Ali Zerrouki", "Overtime")).toHaveTextContent("00:30");
  });

  // BUG-206: on a shift that ends after midnight, leaving before midnight counts as ~21 h of overtime
  it.fails("gives no overtime for leaving early on a shift that ends after midnight", async () => {
    db.shifts = [makeShift("s3", "18:00", "02:00")];
    db.planning = [makePlan(ali, db.shifts[0])];
    db.worktimes = [makeWorktime({ shift_id: "s3", clock_in: "18:00", clock_out: "23:00" })];
    await renderPage();
    await screen.findByRole("button", { name: "18:00" });
    expect(cell("Ali Zerrouki", "Overtime")).toHaveTextContent("00:00");
  });

  // BUG-207: arriving after midnight for a shift that started before midnight isn't counted as late
  it.fails("counts the delay of a clock-in after midnight on a night shift", async () => {
    db.shifts = [makeShift("s3", "22:00", "06:00")];
    db.planning = [makePlan(ali, db.shifts[0])];
    db.worktimes = [makeWorktime({ shift_id: "s3", clock_in: "00:30" })];
    await renderPage();
    await screen.findByRole("button", { name: "00:30" });
    expect(cell("Ali Zerrouki", "Delay")).toHaveTextContent("02:30");
  });

  // BUG-208: the delay saved to the server ignores the planned task time the page shows
  it.fails("saves the same delay as the one shown", async () => {
    db.planning = [makePlan(ali, morning, { tasks: [{ id: "t", label: "Oven", startTime: "10:00", endTime: "14:00" }] })];
    vi.setSystemTime(new Date("2026-03-02T10:05:00+01:00"));
    const { user } = await renderPage();
    await user.click(within(rowOf("Ali Zerrouki")).getByRole("button", { name: "Clock In" }));
    expect(cell("Ali Zerrouki", "Delay")).toHaveTextContent("00:05");
    await savedIn("Ali Zerrouki");
    expect(writes()[0].body.late_minutes).toBe("5");
  });

  it("clocks in a backup on the same row layout", async () => {
    const { user } = await renderPage();
    await user.click(screen.getByRole("button", { name: "17:00 – 23:00" }));
    vi.setSystemTime(new Date("2026-03-02T17:20:00+01:00"));
    await user.click(within(rowOf("Bilal Haddad")).getByRole("button", { name: "Clock In" }));
    await savedIn("Bilal Haddad");
    expect(writes()[0].body).toMatchObject({ emp_id: 103, shift_id: "s2", clock_in: "17:20", late_minutes: "20" });
  });

  it("shows an error and keeps the change unsaved when saving fails", async () => {
    server.use(http.post(`${API}/worktime`, () => new HttpResponse("down", { status: 500 })));
    const { user } = await renderPage();
    await user.click(within(rowOf("Ali Zerrouki")).getByRole("button", { name: "Clock In" }));
    expect(await screen.findByText(/Couldn't save the times for employee 101/, {}, SAVE_WAIT)).toBeInTheDocument();
    expect(cell("Ali Zerrouki", "Saved")).toHaveTextContent("Unsaved");
  });

  it("saves the consumption and penalty typed in", async () => {
    const { user } = await renderPage();
    await user.type(within(cell("Ali Zerrouki", "Consumption")).getByRole("spinbutton"), "250");
    await user.type(within(cell("Ali Zerrouki", "Penalty")).getByRole("spinbutton"), "100");
    await savedIn("Ali Zerrouki");
    expect(writes()).toHaveLength(1);
    expect(writes()[0].body).toMatchObject({ consomation: 250, penalty: 100 });
    expect(writes()[0].audit).toBeNull();
  });

  // BUG-209: clocking in on a second shift overwrites the employee's record for the first shift
  it.fails("keeps a separate record for each shift of the day", async () => {
    db.planning.push(makePlan(ali, evening));
    db.worktimes = [makeWorktime({ clock_in: "08:00", clock_out: "12:00" })];
    vi.setSystemTime(new Date("2026-03-02T17:00:00+01:00"));
    const { user } = await renderPage();
    await user.click(screen.getByRole("button", { name: "17:00 – 23:00" }));
    await user.click(within(rowOf("Ali Zerrouki")).getByRole("button", { name: "Clock In" }));
    await savedIn("Ali Zerrouki");
    expect(writes()[0]).toMatchObject({ method: "POST", body: { shift_id: "s2", clock_in: "17:00" } });
    expect(db.worktimes.find((w) => w._id === "w1")).toMatchObject({ shift_id: "s1", clock_in: "08:00", clock_out: "12:00" });
  });
});

// ─── Manual edits ─────────────────────────────────────────────────────────────

describe("ClockInPage – editing a time by hand", () => {
  it("sets a clock-in time picked from the dropdowns", async () => {
    const { user } = await renderPage();
    await user.click(within(cell("Ali Zerrouki", "Clock In")).getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Edit Clock-In Time" })).toBeInTheDocument();
    expect(screen.getByLabelText("Hour")).toHaveValue("00");

    await pickTime(user, "07:45");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.queryByRole("heading", { name: "Edit Clock-In Time" })).not.toBeInTheDocument();
    expect(within(rowOf("Ali Zerrouki")).getByRole("button", { name: "07:45" })).toBeInTheDocument();
    await savedIn("Ali Zerrouki");
    expect(writes()[0]).toMatchObject({ audit: "edit", body: { clock_in: "07:45", late_minutes: "0" } });
  });

  it("sets a clock-out time and starts from the current value", async () => {
    db.worktimes = [makeWorktime({ clock_in: "08:00", clock_out: "16:00" })];
    const { user } = await renderPage();
    await screen.findByRole("button", { name: "16:00" });
    await user.click(within(cell("Ali Zerrouki", "Clock Out")).getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Edit Clock-Out Time" })).toBeInTheDocument();
    expect(screen.getByLabelText("Hour")).toHaveValue("16");
    await user.selectOptions(screen.getByLabelText("Minute"), "30");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await savedIn("Ali Zerrouki");
    expect(writes()[0]).toMatchObject({ method: "PUT", url: "/worktime/w1", audit: "edit", body: { clock_out: "16:30", overtime_minutes: "30" } });
  });

  it("closes without saving with Cancel, the close button or a click outside", async () => {
    const { user, container } = await renderPage();
    const editIn = () => within(cell("Ali Zerrouki", "Clock In")).getByRole("button", { name: "Edit" });
    const title = () => screen.queryByRole("heading", { name: "Edit Clock-In Time" });

    await user.click(editIn());
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(title()).not.toBeInTheDocument();

    await user.click(editIn());
    await user.click(within(title()!.parentElement!).getByRole("button"));
    expect(title()).not.toBeInTheDocument();

    await user.click(editIn());
    await user.click(container.querySelector(".backdrop-blur-sm") as HTMLElement);
    expect(title()).not.toBeInTheDocument();
    expect(writes()).toEqual([]);
  });

  it("refuses a stored time that isn't HH:MM", async () => {
    db.worktimes = [makeWorktime({ clock_in: "08:00:00" })];
    const { user } = await renderPage();
    await screen.findByRole("button", { name: "08:00:00" });
    await user.click(within(cell("Ali Zerrouki", "Clock In")).getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter the time as HH:MM, for example 08:30.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edit Clock-In Time" })).toBeInTheDocument();
  });
});

// ─── Absences and backups ─────────────────────────────────────────────────────

describe("ClockInPage – absences and backups", () => {
  const withBackup = () => {
    db.planning = [makePlan(ali, morning, { backupEmpIds: [bilal] }), makePlan(sara, morning)];
  };

  it("marks an employee without a planned backup absent, with a reason", async () => {
    const { user } = await renderPage();
    const reason = within(cell("Sara Amrani", "Reason")).getByRole("textbox");
    expect(reason).toBeDisabled();

    await user.click(within(cell("Sara Amrani", "Absent")).getByRole("checkbox"));
    expect(cell("Sara Amrani", "Status")).toHaveTextContent("Absent");
    expect(cell("Sara Amrani", "Clock In")).toHaveTextContent("—");
    expect(cell("Sara Amrani", "Clock Out")).toHaveTextContent("—");
    expect(stat("Absent")).toBe("1");
    expect(reason).toBeEnabled();

    await user.type(reason, "Sick");
    await savedIn("Sara Amrani");
    expect(writes()).toHaveLength(1);
    expect(writes()[0].body).toMatchObject({ emp_id: 102, absent: true, absent_comment: "Sick" });
    expect(writes()[0].body.clock_in).toBeUndefined();
  });

  it("asks who replaces an absent employee with planned backups", async () => {
    withBackup();
    const { user } = await renderPage();
    await user.click(within(cell("Ali Zerrouki", "Absent")).getByRole("checkbox"));

    expect(screen.getByRole("heading", { name: "Choose a replacement" })).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Confirm absence" });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /Bilal Haddad/ }));
    await user.click(confirm);

    expect(await screen.findByText("Backup for Ali Zerrouki")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Choose a replacement" })).not.toBeInTheDocument();
    expect(cell("Ali Zerrouki", "Status")).toHaveTextContent("Absent");
    expect(screen.getByText("EMP-103")).toBeInTheDocument();
    expect(writes()).toEqual([
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({ emp_id: 101, shift_id: "s1", absent: true, backup_emp_id: 103, clock_in: "00:00", clock_out: "00:00" }),
      }),
    ]);
    expect(cell("Ali Zerrouki", "Saved")).toHaveTextContent("✓ Saved");
  });

  it("leaves the employee present when the replacement choice is cancelled", async () => {
    withBackup();
    const { user, container } = await renderPage();
    await user.click(within(cell("Ali Zerrouki", "Absent")).getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Choose a replacement" })).not.toBeInTheDocument();

    await user.click(within(cell("Ali Zerrouki", "Absent")).getByRole("checkbox"));
    await user.click(container.querySelector(".bg-black\\/40") as HTMLElement);
    expect(screen.queryByRole("heading", { name: "Choose a replacement" })).not.toBeInTheDocument();
    expect(cell("Ali Zerrouki", "Status")).toHaveTextContent("Pending");
    expect(writes()).toEqual([]);
  });

  it("shows an error when the absence can't be saved", async () => {
    withBackup();
    server.use(http.post(`${API}/worktime`, () => new HttpResponse("down", { status: 500 })));
    const { user } = await renderPage();
    await user.click(within(cell("Ali Zerrouki", "Absent")).getByRole("checkbox"));
    await user.click(screen.getByRole("radio", { name: /Bilal Haddad/ }));
    await user.click(screen.getByRole("button", { name: "Confirm absence" }));
    expect(await screen.findByText(/Could not save the absence and selected backup/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Choose a replacement" })).toBeInTheDocument();
  });

  it("shows the backup saved earlier for an absent employee", async () => {
    withBackup();
    db.worktimes = [makeWorktime({ absent: true, backup_emp_id: 103 })];
    await renderPage();
    expect(await screen.findByText("Backup for Ali Zerrouki")).toBeInTheDocument();
    expect(cell("Bilal Haddad", "Status")).toHaveTextContent("Pending");
  });

  // BUG-214: a backup who is also planned on the shift is listed twice when the absent employee comes first
  it.fails("doesn't add a backup row for someone already listed on the shift", async () => {
    db.planning = [makePlan(ali, morning, { backupEmpIds: [sara] }), makePlan(sara, morning)];
    db.worktimes = [makeWorktime({ absent: true, backup_emp_id: 102 })];
    await renderPage();
    await waitFor(() => expect(cell("Ali Zerrouki", "Status")).toHaveTextContent("Absent"));
    expect(screen.getAllByText("Sara Amrani")).toHaveLength(1);
    expect(screen.queryByText(/Backup for/)).not.toBeInTheDocument();
  });

  it("doesn't repeat a backup who is listed above the absent employee", async () => {
    db.planning = [makePlan(ali, morning), makePlan(sara, morning, { backupEmpIds: [ali] })];
    db.worktimes = [makeWorktime({ _id: "w2", emp_id: 102, absent: true, backup_emp_id: 101 })];
    await renderPage();
    await waitFor(() => expect(cell("Sara Amrani", "Status")).toHaveTextContent("Absent"));
    expect(screen.getAllByText("Ali Zerrouki")).toHaveLength(1);
    expect(screen.queryByText(/Backup for/)).not.toBeInTheDocument();
  });

  it("clears the absence and the saved backup when unticked", async () => {
    withBackup();
    db.worktimes = [makeWorktime({ absent: true, backup_emp_id: 103 })];
    const { user } = await renderPage();
    await screen.findByText("Backup for Ali Zerrouki");
    await user.click(within(cell("Ali Zerrouki", "Absent")).getByRole("checkbox"));

    expect(screen.queryByText("Backup for Ali Zerrouki")).not.toBeInTheDocument();
    expect(cell("Ali Zerrouki", "Status")).toHaveTextContent("Pending");
    await waitFor(() => expect(writes()).toHaveLength(2), SAVE_WAIT);
    expect(writes()[0]).toEqual({
      method: "PUT",
      url: "/worktime/w1",
      audit: null,
      body: { emp_id: 101, shift_id: "s1", work_date: TODAY, absent: false, backup_emp_id: null },
    });
    expect(writes()[1].body).toMatchObject({ absent: false });
  });

  it("explains when the saved backup can't be cleared", async () => {
    withBackup();
    db.worktimes = [makeWorktime({ absent: true, backup_emp_id: 103 })];
    server.use(http.put(`${API}/worktime/:id`, () => new HttpResponse("down", { status: 500 })));
    const { user } = await renderPage();
    await screen.findByText("Backup for Ali Zerrouki");
    await user.click(within(cell("Ali Zerrouki", "Absent")).getByRole("checkbox"));
    expect(await screen.findByText(/Could not clear the saved backup assignment/)).toBeInTheDocument();
  });
});

// ─── Reset, dates and local copies ────────────────────────────────────────────

describe("ClockInPage – reset, dates and local copies", () => {
  it("clears the page's times after confirmation", async () => {
    db.worktimes = [makeWorktime({ clock_in: "08:00", penalty: 100 })];
    const { user } = await renderPage();
    await screen.findByRole("button", { name: "08:00" });

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Reset today's clock-ins?");
    await answerConfirmDialog(false);
    expect(screen.getByRole("button", { name: "08:00" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset" }));
    await answerConfirmDialog(true);
    expect(within(rowOf("Ali Zerrouki")).getByRole("button", { name: "Clock In" })).toBeInTheDocument();
    expect(within(cell("Ali Zerrouki", "Penalty")).getByRole("spinbutton")).toHaveValue(null);
  });

  // BUG-210: Reset only clears the screen; the times stay on the server and come back on reload
  it.fails("doesn't bring the times back after a reset and a reload", async () => {
    db.worktimes = [makeWorktime({ clock_in: "08:00" })];
    const { user, unmount } = await renderPage();
    await screen.findByRole("button", { name: "08:00" });
    await user.click(screen.getByRole("button", { name: "Reset" }));
    await answerConfirmDialog(true);
    await new Promise((r) => setTimeout(r, 1000));
    unmount();

    await renderPage();
    await waitFor(() => expect(requests.filter((r) => r.method === "GET")).toHaveLength(2));
    expect(within(rowOf("Ali Zerrouki")).getByRole("button", { name: "Clock In" })).toBeInTheDocument();
  });

  it("loads another day's planning and times when the date changes", async () => {
    db.planning.push(makePlan(sara, evening, { planDate: "2026-03-03T00:00:00.000Z" }));
    db.worktimes = [makeWorktime({ clock_in: "08:00" }), makeWorktime({ _id: "w9", emp_id: 102, shift_id: "s2", work_date: "2026-03-03", clock_in: "17:30" })];
    const { user } = await renderPage();
    await screen.findByRole("button", { name: "08:00" });

    fireEvent.change(screen.getByDisplayValue(TODAY), { target: { value: "2026-03-03" } });
    expect(await screen.findByRole("heading", { name: "08:00 – 16:00 shift" })).toBeInTheDocument();
    expect(screen.getByText("No employees assigned to this shift for today.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "17:00 – 23:00" }));
    expect(await screen.findByRole("button", { name: "17:30" })).toBeInTheDocument();
  });

  it("keeps unsaved changes from this browser over the server's copy", async () => {
    localStorage.setItem(
      `worktime_${TODAY}`,
      JSON.stringify({
        "101-s1": { clockIn: "07:58", clockOut: "00:00", absent: false, absentComment: "", consomation: 0, penalty: 0, workTimeId: "w1", _dirty: true },
        "102-s1": { clockIn: "07:40", clockOut: "00:00", absent: false, absentComment: "", consomation: 0, penalty: 0, workTimeId: "w2" },
      })
    );
    db.worktimes = [makeWorktime({ clock_in: "08:00" }), makeWorktime({ _id: "w2", emp_id: 102, clock_in: "07:55" })];
    await renderPage();
    expect(await screen.findByRole("button", { name: "07:58" })).toBeInTheDocument();
    expect(cell("Ali Zerrouki", "Saved")).toHaveTextContent("Unsaved");
    // a change that was saved is replaced by the server's copy
    expect(screen.getByRole("button", { name: "07:55" })).toBeInTheDocument();
  });

  // BUG-215: the browser's copy still says "unsaved" after a successful save, so on reload it hides the server's newer times
  it.fails("shows the server's times after a reload once a clock-in was saved", async () => {
    const { user, unmount } = await renderPage();
    await user.click(within(rowOf("Ali Zerrouki")).getByRole("button", { name: "Clock In" }));
    await savedIn("Ali Zerrouki");
    unmount();
    db.worktimes[0].clock_out = "16:00"; // clocked out on another device

    await renderPage();
    expect(await screen.findByRole("button", { name: "16:00" })).toBeInTheDocument();
    expect(cell("Ali Zerrouki", "Saved")).toHaveTextContent("✓ Saved");
  });

  it("ignores an unreadable local copy", async () => {
    localStorage.setItem(`worktime_${TODAY}`, "{not json");
    db.worktimes = [makeWorktime({ clock_in: "08:00" })];
    await renderPage();
    expect(await screen.findByRole("button", { name: "08:00" })).toBeInTheDocument();
  });

  it("keeps working when the browser refuses to store the local copy", async () => {
    const { user } = await renderPage();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    await user.click(within(rowOf("Ali Zerrouki")).getByRole("button", { name: "Clock In" }));
    await savedIn("Ali Zerrouki");
    expect(setItem).toHaveBeenCalled();
  });

  // BUG-211: after changing the date, the browser's copy of the new day's times is filed under the first day
  it.fails("doesn't show another day's clock-ins after a reload", async () => {
    server.use(http.post(`${API}/worktime`, () => new HttpResponse("down", { status: 500 })));
    db.planning.push(makePlan(ali, morning, { planDate: "2026-03-03T00:00:00.000Z" }));
    const { user, unmount } = await renderPage();
    fireEvent.change(screen.getByDisplayValue(TODAY), { target: { value: "2026-03-03" } });
    await screen.findByDisplayValue("2026-03-03");
    await user.click(await screen.findByRole("button", { name: "Clock In" }));
    await screen.findByText(/Couldn't save the times/, {}, SAVE_WAIT);
    unmount();

    await renderPage(); // back on March 2nd, where nobody clocked in
    await waitFor(() => expect(requests.filter((r) => r.url === `/worktime?work_date=${TODAY}`)).toHaveLength(2));
    expect(within(rowOf("Ali Zerrouki")).getByRole("button", { name: "Clock In" })).toBeInTheDocument();
  });

  // BUG-212: changing the date while a save is pending crashes the page
  it.fails("survives a date change while a clock-in is still being saved", async () => {
    const swallow = (e: ErrorEvent) => e.preventDefault();
    window.addEventListener("error", swallow);
    try {
      db.planning.push(makePlan(ali, morning, { planDate: "2026-03-03T00:00:00.000Z" }));
      const { user } = await renderPage();
      await user.click(within(rowOf("Ali Zerrouki")).getByRole("button", { name: "Clock In" }));
      fireEvent.change(screen.getByDisplayValue(TODAY), { target: { value: "2026-03-03" } });
      await waitFor(() => expect(writes()).toHaveLength(1), SAVE_WAIT);
      await new Promise((r) => setTimeout(r, 100));
      expect(within(rowOf("Ali Zerrouki")).getByRole("button", { name: "Clock In" })).toBeInTheDocument();
    } finally {
      window.removeEventListener("error", swallow);
    }
  });

  // BUG-213: the default date is the UTC date, so between midnight and 1 am in Algeria the page opens on yesterday
  it.fails("opens on today's local date just after midnight", async () => {
    vi.setSystemTime(new Date("2026-03-02T00:30:00+01:00"));
    db.planning = [];
    renderWithProviders(<AttendancePage />);
    await screen.findByRole("heading", { name: "Attendance" });
    expect(screen.getByPlaceholderText("YYYY-MM-DD")).toHaveValue("2026-03-02");
  });
});
