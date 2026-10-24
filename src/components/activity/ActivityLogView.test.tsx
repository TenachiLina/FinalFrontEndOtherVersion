import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import ActivityLogView from "./ActivityLogView";
import ActivityLogPage from "@/app/(admin)/activity-log/page";
import { API, server } from "@/test/server";
import { fireEvent, renderWithProviders, screen, waitFor, within } from "@/test/render";

interface LogEntry {
  _id: string;
  createdAt: string;
  userId: string | null;
  action: string;
  method: string;
  path: string;
  success: boolean;
  [key: string]: unknown;
}

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    _id: "l1",
    createdAt: "2026-03-01T08:05:09Z",
    userId: "u2",
    userName: "Mia",
    userEmail: "mia@test.dz",
    userRole: "manager",
    action: "employee.update",
    target: "Sara Benali",
    method: "PATCH",
    path: "/employees/7",
    success: true,
    ...overrides,
  };
}

const realTz = process.env.TZ;
beforeEach(() => {
  process.env.TZ = "UTC";
});
afterEach(() => {
  process.env.TZ = realTz;
});

function serveLog(
  items: (url: URL) => { items: LogEntry[]; total?: number } = () => ({ items: [] }),
  actors: unknown = [{ id: "u2", name: "Mia" }, { id: "u3", email: "kiosk@test.dz" }]
) {
  const urls: URL[] = [];
  server.use(
    http.get(`${API}/audit-logs`, ({ request }) => {
      const url = new URL(request.url);
      urls.push(url);
      const r = items(url);
      return HttpResponse.json({ items: r.items, total: r.total ?? r.items.length, page: Number(url.searchParams.get("page")), limit: 50 });
    }),
    http.get(`${API}/audit-logs/users`, () => (actors ? HttpResponse.json(actors) : HttpResponse.json({}, { status: 500 })))
  );
  return urls;
}

const lastParams = (urls: URL[]) => Object.fromEntries(urls.at(-1)!.searchParams);

describe("ActivityLogView list", () => {
  it("shows loading, then who did what and whether it worked", async () => {
    const urls = serveLog(() => ({
      items: [
        makeEntry(),
        makeEntry({ _id: "l2", userName: undefined, userEmail: "kiosk@test.dz", userRole: "employee", action: "kiosk.clockIn", target: undefined, success: false, error: "Already clocked in" }),
        makeEntry({ _id: "l3", userName: undefined, userEmail: undefined, userRole: "robot", action: "something.new", target: undefined }),
      ],
    }));
    renderWithProviders(<ActivityLogView />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByText("3 entries")).toBeInTheDocument();
    expect(lastParams(urls)).toEqual({ page: "1", limit: "50" });

    const first = screen.getByText("Sara Benali").closest("tr")!;
    expect(first).toHaveTextContent("01 Mar 2026, 08:05:09");
    expect(within(first).getByText("Mia")).toBeInTheDocument();
    expect(within(first).getByText("mia@test.dz · Manager")).toBeInTheDocument();
    expect(within(first).getByText("Edited an employee")).toBeInTheDocument();
    expect(within(first).getByText("Succeeded")).toBeInTheDocument();

    const kiosk = screen.getByText("Clocked in at the kiosk").closest("tr")!;
    expect(within(kiosk).getByText("kiosk@test.dz")).toBeInTheDocument();
    expect(within(kiosk).getByText("Clock-in kiosk")).toBeInTheDocument();
    expect(within(kiosk).getByText("Failed")).toBeInTheDocument();

    const unknown = screen.getByText("Other change").closest("tr")!;
    expect(within(unknown).getByText("Unknown")).toBeInTheDocument();
    expect(within(unknown).getByText("robot")).toBeInTheDocument();
  });

  it.each([
    ["worktime.clockIn", "Clocked in at 08:01"],
    ["worktime.clockOut", "Clocked out at 17:02"],
    ["worktime.clockInOut", "Clocked in at 08:01 and out at 17:02"],
  ])("describes %s with its time", async (action, text) => {
    serveLog(() => ({
      items: [makeEntry({ action, changes: [{ label: "Clock-in time", after: "08:01" }, { label: "Clock-out time", after: "17:02" }] })],
    }));
    renderWithProviders(<ActivityLogView />);
    expect(await screen.findByText(text)).toBeInTheDocument();
    // The times are already in the sentence: no change list
    expect(screen.queryByText(/click to see/)).not.toBeInTheDocument();
  });

  it("leaves the time blank for a clock action without changes", async () => {
    serveLog(() => ({ items: [makeEntry({ action: "worktime.clockIn" })] }));
    renderWithProviders(<ActivityLogView />);
    expect(await screen.findByText("Clocked in at")).toBeInTheDocument();
  });

  it("shows what changed when a row is opened", async () => {
    serveLog(() => ({
      items: [
        makeEntry({
          changes: [
            { label: "Clock-out time", before: "17:00", after: "18:30" },
            { label: "Employee", after: "Sara Benali · Shift 08:00–16:00" },
            { label: "Task", before: "Cleaning" },
            { label: "Reset" },
          ],
        }),
        makeEntry({ _id: "l2", target: "One", changes: [{ label: "Name", before: "A", after: "B" }] }),
      ],
    }));
    const { user } = renderWithProviders(<ActivityLogView />);
    expect(await screen.findByText("4 changes, click to see them")).toBeInTheDocument();
    expect(screen.getByText("1 change, click to see it")).toBeInTheDocument();
    const row = screen.getByText("Sara Benali").closest("tr")!;
    await user.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    const items = within(row).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([
      "Clock-out time: 17:00→18:30",
      "Employee: Sara Benali · Shift 08:00–16:00",
      "Task: Cleaning",
      "Reset",
    ]);
    await user.click(row);
    expect(within(row).queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("shows the error of a failed action when opened", async () => {
    serveLog(() => ({ items: [makeEntry({ success: false, error: "Employee has plannings" })] }));
    const { user } = renderWithProviders(<ActivityLogView />);
    const row = (await screen.findByText("Sara Benali")).closest("tr")!;
    expect(screen.queryByText("Employee has plannings")).not.toBeInTheDocument();
    await user.click(row);
    expect(row.nextElementSibling).toHaveTextContent("Error: Employee has plannings");
  });

  it("says when nothing has been recorded", async () => {
    serveLog();
    renderWithProviders(<ActivityLogView />);
    expect(await screen.findByText("No activity recorded yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("shows a load error and retries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let fail = true;
    server.use(
      http.get(`${API}/audit-logs`, () =>
        fail ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json({ items: [], total: 0, page: 1, limit: 50 })
      ),
      http.get(`${API}/audit-logs/users`, () => HttpResponse.json([]))
    );
    const { user } = renderWithProviders(<ActivityLogView />);
    const alert = (await screen.findByText("Couldn't load the activity log")).closest<HTMLElement>("[role=alert]")!;
    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No activity recorded yet.")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load the activity log")).not.toBeInTheDocument();
  });

  it("pages through entries", async () => {
    const urls = serveLog(() => ({ items: [makeEntry()], total: 101 }));
    const { user } = renderWithProviders(<ActivityLogView />);
    expect(await screen.findByText("Page 1 of 3")).toBeInTheDocument();
    // Let the search debounce settle first (see BUG-602)
    await new Promise((r) => setTimeout(r, 450));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Page 2 of 3")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByText("Page 1 of 3")).toBeInTheDocument();
    expect(urls.map((u) => u.searchParams.get("page"))).toContain("2");
  });

  // BUG-602: the search debounce resets the page to 1 on first load, undoing a quick click on "Next"
  it.fails("stays on page 2 when Next is clicked right after the list loads", async () => {
    serveLog(() => ({ items: [makeEntry()], total: 101 }));
    const { user } = renderWithProviders(<ActivityLogView />);
    await user.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByText("Page 2 of 3")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 500));
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("renders inside the Activity log page", async () => {
    serveLog();
    renderWithProviders(<ActivityLogPage />);
    expect(await screen.findByText("No activity recorded yet.")).toBeInTheDocument();
  });
});

describe("ActivityLogView filters", () => {
  it("lists the people who did something, by name or email", async () => {
    serveLog();
    renderWithProviders(<ActivityLogView />);
    const select = screen.getByLabelText("User");
    await waitFor(() => expect(within(select).getAllByRole("option")).toHaveLength(3));
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Everyone", "Mia", "kiosk@test.dz"]);
  });

  it("still works when the list of people can't be loaded", async () => {
    serveLog(undefined, null);
    renderWithProviders(<ActivityLogView />);
    await screen.findByText("No activity recorded yet.");
    expect(within(screen.getByLabelText("User")).getAllByRole("option")).toHaveLength(1);
  });

  it("filters by search, user, action, result and dates, then clears them", async () => {
    const urls = serveLog();
    const { user } = renderWithProviders(<ActivityLogView />);
    await screen.findByText("No activity recorded yet.");
    await user.type(screen.getByLabelText("Search"), "Sara");
    await waitFor(() => expect(lastParams(urls).search).toBe("Sara"));
    expect(urls.filter((u) => u.searchParams.has("search"))).toHaveLength(1);
    await waitFor(() => expect(within(screen.getByLabelText("User")).getAllByRole("option")).toHaveLength(3));
    await user.selectOptions(screen.getByLabelText("User"), "u2");
    await user.selectOptions(screen.getByLabelText("Action"), "planning");
    await user.click(screen.getByRole("button", { name: "Failed" }));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-03-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-03-31" } });
    await waitFor(() =>
      expect(lastParams(urls)).toEqual({
        page: "1",
        limit: "50",
        search: "Sara",
        userId: "u2",
        action: "planning",
        status: "failed",
        from: "2026-03-01",
        to: "2026-03-31",
      })
    );
    expect(await screen.findByText("No activity matches these filters.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Succeeded" }));
    await waitFor(() => expect(lastParams(urls).status).toBe("success"));

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(lastParams(urls)).toEqual({ page: "1", limit: "50" }));
    expect(screen.getByLabelText("Search")).toHaveValue("");
    expect(await screen.findByText("No activity recorded yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "All" }));
  });

  it("reloads on Refresh", async () => {
    const urls = serveLog();
    const { user } = renderWithProviders(<ActivityLogView />);
    await screen.findByText("No activity recorded yet.");
    const before = urls.length;
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(urls.length).toBe(before + 1));
  });
});
