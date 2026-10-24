import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { API, server } from "@/test/server";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";
import type { EmployeeRecord, PlanningRecord, ShiftRecord, TaskRecord } from "./types";
import ViewPlanning from "./ViewPlanning";

// ── Factories ──────────────────────────────────────────────────────────────

const makeTask = (o: Partial<TaskRecord> = {}): TaskRecord => ({ _id: "t1", taskId: 1, taskName: "Pizzaiolo", ...o });
const makeShift = (o: Partial<ShiftRecord> = {}): ShiftRecord => ({ _id: "s1", startTime: "08:00", endTime: "16:00", ...o });
const makeEmployee = (o: Partial<EmployeeRecord> = {}): EmployeeRecord => ({
  _id: "e1",
  empNumber: 1,
  firstName: "Ali",
  lastName: "Ben",
  baseSalary: 30000,
  ...o,
});
const makePlanning = (o: Partial<PlanningRecord> = {}): PlanningRecord => ({
  _id: `p-${Math.random()}`,
  shiftId: makeShift(),
  empId: makeEmployee(),
  taskId: 1,
  planDate: "2026-10-24T00:00:00.000Z",
  ...o,
});

const ali = makeEmployee();
const sara = makeEmployee({ _id: "e2", firstName: "Sara", lastName: "Kaci" });
const omar = makeEmployee({ _id: "e3", firstName: "Omar", lastName: "Haddad" });
const lina = makeEmployee({ _id: "e4", firstName: "Lina", lastName: "Tenachi" });
const morning = makeShift();
const evening = makeShift({ _id: "s2", startTime: "16:00", endTime: "01:00" });
const pizzaiolo = makeTask();
const livreur = makeTask({ _id: "t2", taskId: 2, taskName: "Livreur" });

let planningCalls = 0;

function backend(planning: PlanningRecord[] = []) {
  planningCalls = 0;
  server.use(
    http.get(`${API}/tasks`, () => HttpResponse.json([pizzaiolo, livreur])),
    http.get(`${API}/shifts`, () => HttpResponse.json([evening, morning])),
    http.get(`${API}/employees`, () => HttpResponse.json([ali, sara, omar, lina])),
    http.get(`${API}/planning`, () => {
      planningCalls++;
      return HttpResponse.json(planning);
    })
  );
}

async function renderView() {
  const view = renderWithProviders(<ViewPlanning />, { url: "/ViewPlanning" });
  await screen.findByText("Pizzaiolo");
  await waitFor(() => expect(planningCalls).toBeGreaterThan(0));
  await waitFor(() => expect(screen.queryByText("Loading planning data...")).not.toBeInTheDocument());
  return view;
}

/** The planning table cell of a post and shift column (0 = first shift). */
const cell = (post: string, shiftIndex: number) =>
  screen.getByRole("row", { name: new RegExp(post) }).querySelectorAll("td")[shiftIndex + 1] as HTMLElement;

/** The unlabelled previous / next day arrows next to "Today". */
const dayArrows = () => {
  const [prev, next] = screen.getByRole("button", { name: "Today" }).nextElementSibling!.querySelectorAll("button");
  return { prev, next };
};

/** The unlabelled previous / next month arrows of the mini calendar. */
const monthArrows = (label: string) => {
  const [prev, next] = screen.getByText(label).nextElementSibling!.querySelectorAll("button");
  return { prev, next };
};

const previousTZ = process.env.TZ;

beforeEach(() => {
  process.env.TZ = "Africa/Algiers";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-24T10:00:00+01:00"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  process.env.TZ = previousTZ;
});

describe("ViewPlanning", () => {
  describe("loading", () => {
    it("shows a loading message, then a column per shift (by start time) and a row per post", async () => {
      backend();
      renderWithProviders(<ViewPlanning />);
      expect(screen.getByText("Loading...")).toBeInTheDocument();
      await screen.findByText("Pizzaiolo");
      const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
      expect(headers).toEqual(["", "08:00 - 16:00", "16:00 - 01:00"]);
      expect(screen.getByText("Livreur")).toBeInTheDocument();
    });

    it("shows an error instead of the planning when posts, shifts or employees can't be loaded", async () => {
      backend();
      server.use(http.get(`${API}/tasks`, () => new HttpResponse(null, { status: 500 })));
      renderWithProviders(<ViewPlanning />);
      expect(await screen.findByText(/Error: Couldn't load employees, shifts and posts\./)).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("offers to retry when the planning can't be loaded", async () => {
      backend();
      server.use(http.get(`${API}/planning`, () => new HttpResponse(null, { status: 500 })));
      const reload = vi.fn();
      const realLocation = window.location;
      Object.defineProperty(window, "location", { value: { ...realLocation, reload }, configurable: true });
      try {
        const { user } = renderWithProviders(<ViewPlanning />);
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("Couldn't load the planning");
        expect(alert).toHaveTextContent("Something went wrong on our side");
        await user.click(within(alert).getByRole("button", { name: "Try again" }));
        expect(reload).toHaveBeenCalled();
      } finally {
        Object.defineProperty(window, "location", { value: realLocation, configurable: true });
      }
    });
  });

  describe("planning grid", () => {
    it("shows each employee with their backup and tasks in their cell", async () => {
      backend([
        makePlanning({
          empId: ali,
          backupEmpId: sara,
          tasks: [
            { id: "1", label: "Dough", startTime: "08:00", endTime: "09:00" },
            { id: "2", label: "Oven", startTime: "09:00", endTime: "12:00" },
          ],
        }),
        makePlanning({ empId: omar, shiftId: evening, taskId: 2 }),
      ]);
      await renderView();
      const first = cell("Pizzaiolo", 0);
      expect(first).toHaveTextContent("Ali Ben (Backup: Sara Kaci)");
      expect(within(first).getByTitle("Ali Ben (Sara Kaci)")).toBeInTheDocument();
      expect(first).toHaveTextContent("08:00-09:00 Dough · 09:00-12:00 Oven");
      expect(cell("Livreur", 1)).toHaveTextContent("Omar Haddad");
      expect(within(cell("Livreur", 1)).getByTitle("Omar Haddad")).toBeInTheDocument();
      expect(cell("Pizzaiolo", 1).textContent).toBe("");
    });

    // BUG-406: backups saved by the planning editor (backupEmpIds) are never shown in the view
    it.fails("shows the backups saved with the planning", async () => {
      backend([makePlanning({ empId: ali, backupEmpIds: [sara] })]);
      await renderView();
      expect(cell("Pizzaiolo", 0)).toHaveTextContent("Ali Ben (Backup: Sara Kaci)");
    });

    it("shows two employees per cell and how many more there are", async () => {
      backend([ali, sara, omar, lina].map((empId) => makePlanning({ empId })));
      await renderView();
      const first = cell("Pizzaiolo", 0);
      expect(first).toHaveTextContent("Ali Ben");
      expect(first).toHaveTextContent("Sara Kaci");
      expect(first).not.toHaveTextContent("Omar Haddad");
      expect(within(first).getByText("+2")).toBeInTheDocument();
    });

    it("lists everyone of a cell in a modal", async () => {
      backend([makePlanning({ empId: ali, backupEmpId: sara }), makePlanning({ empId: omar }), makePlanning({ empId: lina })]);
      const { user } = await renderView();
      await user.click(within(cell("Pizzaiolo", 0)).getByText("+1"));
      expect(screen.getByRole("heading", { name: "Employees in Shift" })).toBeInTheDocument();
      expect(screen.getByText("3 assigned employee(s)")).toBeInTheDocument();
      const list = screen.getByText("3 assigned employee(s)").parentElement!.nextElementSibling as HTMLElement;
      expect(within(list).getByText("Ali Ben").parentElement).toHaveTextContent("Backup: Sara Kaci");
      expect(within(list).getByText("Lina Tenachi")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("heading", { name: "Employees in Shift" })).not.toBeInTheDocument();
    });

    it("closes the list with Escape", async () => {
      backend([makePlanning({ empId: ali })]);
      const { user } = await renderView();
      await user.click(within(cell("Pizzaiolo", 0)).getByText("Ali Ben"));
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("heading", { name: "Employees in Shift" })).not.toBeInTheDocument();
    });

    it("opens the list by clicking an employee's name too", async () => {
      backend([makePlanning({ empId: ali })]);
      const { user } = await renderView();
      await user.click(within(cell("Pizzaiolo", 0)).getByText("Ali Ben"));
      expect(screen.getByText("1 assigned employee(s)")).toBeInTheDocument();
    });
  });

  describe("table-only mode", () => {
    it("hides the calendar and tools and shows every employee with their backup", async () => {
      backend([
        makePlanning({ empId: ali, backupEmpId: sara, tasks: [{ id: "1", label: "Dough", startTime: "08:00", endTime: "09:00" }] }),
        makePlanning({ empId: omar }),
        makePlanning({ empId: lina }),
      ]);
      const { user } = await renderView();
      expect(screen.getByRole("button", { name: "Back to normal view" })).toBeDisabled();
      await user.click(screen.getByRole("button", { name: "Show table only" }));

      expect(screen.getByRole("button", { name: "Show table only" })).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Today" })).not.toBeInTheDocument();
      expect(screen.queryByText("October 2026")).not.toBeInTheDocument();
      const first = cell("Pizzaiolo", 0);
      expect(first).toHaveTextContent("Lina Tenachi");
      expect(within(first).getByTitle("Backup: Sara Kaci")).toBeInTheDocument();
      expect(within(first).getAllByTitle("No backup")).toHaveLength(2);
      expect(within(first).getByTitle("08:00-09:00 Dough")).toBeInTheDocument();
      expect(within(cell("Livreur", 1)).getByText("+ Add")).toBeInTheDocument();

      await user.click(within(first).getByText("Omar Haddad"));
      expect(screen.getByText("3 assigned employee(s)")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Close" }));

      await user.click(screen.getByRole("button", { name: "Back to normal view" }));
      expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
      expect(screen.getByText("October 2026")).toBeInTheDocument();
    });
  });

  describe("choosing the day", () => {
    const planningOnSeveralDays = () =>
      backend([
        makePlanning({ empId: ali, planDate: "2026-10-24T00:00:00.000Z" }),
        makePlanning({ empId: sara, planDate: "2026-10-25T00:00:00.000Z" }),
        makePlanning({ empId: omar, planDate: "2026-10-20T00:00:00.000Z" }),
        makePlanning({ empId: lina, planDate: "2026-11-03T00:00:00.000Z" }),
      ]);

    it("opens on today, highlighted in the mini calendar", async () => {
      planningOnSeveralDays();
      await renderView();
      expect(screen.getByText("October 2026")).toBeInTheDocument();
      expect(cell("Pizzaiolo", 0)).toHaveTextContent("Ali Ben");
      expect(screen.getByRole("button", { name: "24" })).toHaveClass("bg-brand-500");
    });

    it("shows the planning of a day picked in the mini calendar", async () => {
      planningOnSeveralDays();
      const { user } = await renderView();
      await user.click(screen.getByRole("button", { name: "20" }));
      await waitFor(() => expect(cell("Pizzaiolo", 0)).toHaveTextContent("Omar Haddad"));
      expect(screen.getByRole("button", { name: "20" })).toHaveClass("bg-brand-500");
      expect(screen.getByRole("button", { name: "24" })).not.toHaveClass("bg-brand-500");
    });

    it("moves a day forward and back with the arrows, and back to today", async () => {
      planningOnSeveralDays();
      const { user } = await renderView();
      await user.click(dayArrows().next);
      await waitFor(() => expect(cell("Pizzaiolo", 0)).toHaveTextContent("Sara Kaci"));
      await user.click(dayArrows().prev);
      await user.click(dayArrows().prev);
      await waitFor(() => expect(cell("Pizzaiolo", 0).textContent).toBe(""));
      await user.click(screen.getByRole("button", { name: "Today" }));
      await waitFor(() => expect(cell("Pizzaiolo", 0)).toHaveTextContent("Ali Ben"));
    });

    it("browses the months of the mini calendar and picks a day of the next month", async () => {
      planningOnSeveralDays();
      const { user } = await renderView();
      await user.click(monthArrows("October 2026").next);
      expect(screen.getByText("November 2026")).toBeInTheDocument();
      // November 2026 starts on a Sunday: the grid ends with December days
      await user.click(screen.getAllByRole("button", { name: "3" })[0]);
      await waitFor(() => expect(cell("Pizzaiolo", 0)).toHaveTextContent("Lina Tenachi"));
      await user.click(monthArrows("November 2026").prev);
      expect(screen.getByText("October 2026")).toBeInTheDocument();
    });

    it("picks a greyed day of the previous month and shows that month", async () => {
      planningOnSeveralDays();
      const { user } = await renderView();
      // October 2026 starts on a Thursday: the grid begins with Sep 27–30
      await user.click(screen.getAllByRole("button", { name: "27" })[0]);
      expect(await screen.findByText("September 2026")).toBeInTheDocument();
    });

    // BUG-407: "Today" (and the day arrows) don't bring the mini calendar to the selected day's month
    it.fails("brings the mini calendar back to today's month with the Today button", async () => {
      planningOnSeveralDays();
      const { user } = await renderView();
      await user.click(monthArrows("October 2026").next);
      await user.click(screen.getAllByRole("button", { name: "3" })[0]);
      await waitFor(() => expect(cell("Pizzaiolo", 0)).toHaveTextContent("Lina Tenachi"));
      await user.click(monthArrows("November 2026").next);
      await user.click(screen.getByRole("button", { name: "Today" }));
      await waitFor(() => expect(cell("Pizzaiolo", 0)).toHaveTextContent("Ali Ben"));
      expect(screen.getByText("October 2026")).toBeInTheDocument();
    });
  });

  describe("exports", () => {
    let downloads: string[];
    let requested: string[];

    beforeEach(() => {
      downloads = [];
      requested = [];
      URL.createObjectURL = vi.fn(() => "blob:fake");
      URL.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download);
      });
      server.use(
        http.get(`${API}/planning/:kind`, ({ request }) => {
          requested.push(request.url.replace(API, ""));
          return new HttpResponse("file");
        })
      );
    });

    it.each([
      ["Export Day", "📊 Excel (.xlsx)", "/planning/export-current-day?year=2026&month=10&day=24&format=excel", "planning-2026-10-24.xlsx"],
      ["Export Day", "📄 PDF (.pdf)", "/planning/export-current-day?year=2026&month=10&day=24&format=pdf", "planning-2026-10-24.pdf"],
      ["Manager Export", "📊 Excel (.xlsx)", "/planning/export-first-week-manager?year=2026&month=9&format=excel", "planning-week-manager-2026-10.xlsx"],
      ["Manager Export", "📄 PDF (.pdf)", "/planning/export-first-week-manager?year=2026&month=9&format=pdf", "planning-week-manager-2026-10.pdf"],
      ["Employees Export", "📊 Excel (.xlsx)", "/planning/export-first-week?year=2026&month=9&format=excel", "planning-week-2026-10.xlsx"],
      ["Employees Export", "📄 PDF (.pdf)", "/planning/export-first-week?year=2026&month=9&format=pdf", "planning-week-2026-10.pdf"],
    ])("%s › %s downloads the file and closes the menu", async (menu, choice, url, file) => {
      backend();
      const { user } = await renderView();
      await user.click(screen.getByRole("button", { name: menu }));
      await user.click(screen.getByRole("button", { name: choice }));
      await waitFor(() => expect(downloads).toEqual([file]));
      expect(requested).toEqual([url]);
      expect(screen.queryByRole("button", { name: choice })).not.toBeInTheDocument();
    });

    it("opens only one export menu at a time", async () => {
      backend();
      const { user } = await renderView();
      await user.click(screen.getByRole("button", { name: "Export Day" }));
      expect(screen.getAllByRole("button", { name: "📄 PDF (.pdf)" })).toHaveLength(1);
      await user.click(screen.getByRole("button", { name: "Employees Export" }));
      expect(screen.getAllByRole("button", { name: "📄 PDF (.pdf)" })).toHaveLength(1);
      await user.click(screen.getByRole("button", { name: "Employees Export" }));
      expect(screen.queryByRole("button", { name: "📄 PDF (.pdf)" })).not.toBeInTheDocument();
    });

    it("exports the day picked in the calendar", async () => {
      backend();
      const { user } = await renderView();
      await user.click(screen.getByRole("button", { name: "20" }));
      await user.click(screen.getByRole("button", { name: "Export Day" }));
      await user.click(screen.getByRole("button", { name: "📄 PDF (.pdf)" }));
      await waitFor(() => expect(requested).toEqual(["/planning/export-current-day?year=2026&month=10&day=20&format=pdf"]));
    });

    it("shows a message when the export fails", async () => {
      backend();
      server.use(
        http.get(`${API}/planning/export-current-day`, () =>
          HttpResponse.json({ message: "No planning for this day" }, { status: 404 })
        )
      );
      const { user } = await renderView();
      await user.click(screen.getByRole("button", { name: "Export Day" }));
      await user.click(screen.getByRole("button", { name: "📊 Excel (.xlsx)" }));
      expect(await screen.findByText("Couldn't export the planning. No planning for this day")).toBeInTheDocument();
      expect(downloads).toEqual([]);
    });
  });
});
