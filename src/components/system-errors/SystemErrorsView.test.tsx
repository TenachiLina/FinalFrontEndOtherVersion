import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import SystemErrorsView from "./SystemErrorsView";
import SystemErrorsPage from "@/app/(admin)/system-errors/page";
import { API, server } from "@/test/server";
import { makeUser } from "@/test/factories";
import { fireEvent, renderWithProviders, screen, waitFor, within } from "@/test/render";

interface Entry {
  _id: string;
  createdAt: string;
  level: "error" | "warning";
  source: "request" | "background" | "process" | "frontend";
  name: string;
  message: string;
  fingerprint: string;
  [key: string]: unknown;
}

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    _id: "e1",
    createdAt: "2026-03-01T08:05:09Z",
    level: "error",
    source: "request",
    name: "TypeError",
    message: "Cannot read properties of undefined",
    fingerprint: "fp1",
    ...overrides,
  };
}

function makeGroup(overrides: Record<string, unknown> = {}) {
  return {
    fingerprint: "fp1",
    count: 12,
    firstSeen: "2026-02-20T10:00:00Z",
    lastSeen: "2026-03-01T08:05:09Z",
    level: "error",
    source: "request",
    name: "TypeError",
    message: "Cannot read properties of undefined",
    hint: "A planning row has no shift",
    method: "GET",
    route: "/plannings/:id",
    affectedUsers: 4,
    ...overrides,
  };
}

const superAdmin = makeUser({ role: "superadmin", companyId: null });
const realTz = process.env.TZ;
beforeEach(() => {
  process.env.TZ = "UTC";
});
afterEach(() => {
  process.env.TZ = realTz;
});

/** Serves the error list (from `items(url)`) and the summary; returns the list URLs requested. */
function serveErrors(
  items: (url: URL) => { items: Entry[]; total?: number } = () => ({ items: [] }),
  summary: { days: number; groups: ReturnType<typeof makeGroup>[] } | null = { days: 7, groups: [] }
) {
  const urls: URL[] = [];
  server.use(
    http.get(`${API}/error-logs`, ({ request }) => {
      const url = new URL(request.url);
      urls.push(url);
      const result = items(url);
      return HttpResponse.json({ items: result.items, total: result.total ?? result.items.length, page: Number(url.searchParams.get("page")), limit: 50 });
    }),
    http.get(`${API}/error-logs/summary`, () => (summary ? HttpResponse.json(summary) : HttpResponse.json({}, { status: 500 })))
  );
  return urls;
}

const renderView = () => renderWithProviders(<SystemErrorsView />, { user: superAdmin, company: null, url: "/system-errors" });
const lastParams = (urls: URL[]) => Object.fromEntries(urls.at(-1)!.searchParams);

describe("SystemErrorsView list", () => {
  it("loads only errors at first and lists them", async () => {
    const urls = serveErrors(() => ({
      items: [
        makeEntry({ reference: "ERR-7F3A", hint: "Check the shift", method: "GET", route: "/plannings/:id", path: "/plannings/42", statusCode: 500, userName: "Mia" }),
        makeEntry({ _id: "e2", level: "warning", source: "frontend", message: "Chunk failed", context: "Planning page", userEmail: "x@test.dz" }),
        makeEntry({ _id: "e3", source: "background", message: "Cron failed", where: "payroll.job.ts:42" }),
        makeEntry({ _id: "e4", source: "process", message: "Out of memory", method: "POST", path: "/x" }),
      ],
      total: 4,
    }));
    renderView();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByText("4 entries")).toBeInTheDocument();
    expect(lastParams(urls)).toEqual({ page: "1", limit: "50", level: "error" });

    const first = screen.getByText("ERR-7F3A").closest("tr")!;
    expect(first).toHaveTextContent("01 Mar 2026, 08:05:09");
    expect(within(first).getByText("Error")).toBeInTheDocument();
    expect(within(first).getByText("API request")).toBeInTheDocument();
    expect(within(first).getByText("Check the shift")).toBeInTheDocument();
    expect(within(first).getByText("GET /plannings/:id → 500")).toBeInTheDocument();
    expect(within(first).getByText("Mia")).toBeInTheDocument();

    const warning = screen.getByText("Chunk failed").closest("tr")!;
    expect(within(warning).getByText("Warning")).toBeInTheDocument();
    expect(within(warning).getByText("Browser")).toBeInTheDocument();
    expect(within(warning).getByText("Planning page")).toBeInTheDocument();
    expect(within(warning).getByText("x@test.dz")).toBeInTheDocument();

    const cron = screen.getByText("Cron failed").closest("tr")!;
    expect(within(cron).getByText("Background task")).toBeInTheDocument();
    expect(within(cron).getByText("payroll.job.ts:42")).toBeInTheDocument();
    const crash = screen.getByText("Out of memory").closest("tr")!;
    expect(within(crash).getByText("Server crash")).toBeInTheDocument();
    expect(within(crash).getByText("POST /x")).toBeInTheDocument();
    expect(within(crash).getAllByText("—")).toHaveLength(1);
  });

  it("says when there is nothing to show", async () => {
    serveErrors();
    renderView();
    expect(await screen.findByText("No errors found. Everything looks fine.")).toBeInTheDocument();
    expect(screen.queryByText(/Most frequent/)).not.toBeInTheDocument();
  });

  it("opens and closes an entry's details", async () => {
    serveErrors(() => ({
      items: [
        makeEntry({
          reference: "ERR-1",
          hint: "A planning row has no shift",
          where: "plannings.service.ts:10",
          method: "PATCH",
          path: "/plannings/42",
          statusCode: 500,
          pageUrl: "https://app.test/calendar",
          context: "Planning",
          userName: "Mia",
          userEmail: "mia@test.dz",
          userRole: "manager",
          code: "E_SHIFT",
          ip: "10.0.0.1",
          userAgent: "Firefox",
          query: { week: "10" },
          body: { shiftId: "s1" },
          stack: "TypeError at line 1",
        }),
      ],
    }));
    const { user } = renderView();
    const row = (await screen.findByText("ERR-1")).closest("tr")!;
    expect(row).toHaveAttribute("aria-expanded", "false");
    await user.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    const details = row.nextElementSibling as HTMLElement;
    expect(details).toHaveTextContent("Likely cause: A planning row has no shift");
    expect(details).toHaveTextContent("TypeError: Cannot read properties of undefined");
    expect(details).toHaveTextContent("plannings.service.ts:10");
    expect(details).toHaveTextContent("PATCH /plannings/42 → 500");
    expect(details).toHaveTextContent("https://app.test/calendar");
    expect(details).toHaveTextContent("Mia · mia@test.dz · manager");
    expect(details).toHaveTextContent("E_SHIFT");
    expect(details).toHaveTextContent("10.0.0.1");
    expect(details).toHaveTextContent("Firefox");
    expect(within(details).getByText(/"week": "10"/)).toBeInTheDocument();
    expect(within(details).getByText(/"shiftId": "s1"/)).toBeInTheDocument();
    expect(within(details).getByText("TypeError at line 1")).toBeInTheDocument();
    await user.click(row);
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Likely cause")).not.toBeInTheDocument();
  });

  it("shows minimal details for an anonymous error", async () => {
    serveErrors(() => ({ items: [makeEntry({ method: "GET", path: "/x", query: {}, body: null })] }));
    const { user } = renderView();
    const row = (await screen.findByText("Cannot read properties of undefined")).closest("tr")!;
    await user.click(row);
    const details = row.nextElementSibling as HTMLElement;
    expect(details).toHaveTextContent("Nobody signed in");
    expect(details).toHaveTextContent("GET /x");
    expect(details).not.toHaveTextContent("Query parameters");
    expect(details).not.toHaveTextContent("Data sent");
    expect(details).not.toHaveTextContent("Error code");
  });

  it("shows a load error with retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let fail = true;
    server.use(
      http.get(`${API}/error-logs`, () =>
        fail ? HttpResponse.json({ message: "Super admins only" }, { status: 403 }) : HttpResponse.json({ items: [], total: 0, page: 1, limit: 50 })
      ),
      http.get(`${API}/error-logs/summary`, () => HttpResponse.json({ days: 7, groups: [] }))
    );
    const { user } = renderView();
    const alert = (await screen.findByText("Couldn't load the system errors")).closest<HTMLElement>("[role=alert]")!;
    expect(alert).toHaveTextContent("Super admins only");
    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No errors found. Everything looks fine.")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load the system errors")).not.toBeInTheDocument();
  });

  it("pages through results", async () => {
    const urls = serveErrors(() => ({ items: [makeEntry()], total: 120 }));
    const { user } = renderView();
    expect(await screen.findByText("Page 1 of 3")).toBeInTheDocument();
    // Wait for the search debounce to settle so it doesn't reset the page
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
    serveErrors(() => ({ items: [makeEntry()], total: 120 }));
    const { user } = renderView();
    await user.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByText("Page 2 of 3")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 500));
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("renders inside the System errors page", async () => {
    serveErrors();
    renderWithProviders(<SystemErrorsPage />, { user: superAdmin, company: null });
    expect(await screen.findByText("No errors found. Everything looks fine.")).toBeInTheDocument();
  });
});

describe("SystemErrorsView filters", () => {
  it("searches after the user stops typing", async () => {
    const urls = serveErrors();
    const { user } = renderView();
    await screen.findByText("0 entries");
    await user.type(screen.getByLabelText("Search"), "ERR-7F3A");
    await waitFor(() => expect(lastParams(urls).search).toBe("ERR-7F3A"));
    // One request for the whole word, not one per letter
    expect(urls.filter((u) => u.searchParams.has("search"))).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });

  it("filters by level, source and dates, then clears everything", async () => {
    const urls = serveErrors();
    const { user } = renderView();
    await screen.findByText("0 entries");
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Level"), "");
    await waitFor(() => expect(lastParams(urls)).not.toHaveProperty("level"));
    await user.selectOptions(screen.getByLabelText("Source"), "frontend");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-03-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-03-31" } });
    await waitFor(() => expect(lastParams(urls)).toEqual({ page: "1", limit: "50", source: "frontend", from: "2026-03-01", to: "2026-03-31" }));
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(lastParams(urls)).toEqual({ page: "1", limit: "50", level: "error" }));
    expect(screen.getByLabelText("From")).toHaveValue("");
  });

  it("shows the most frequent problems and focuses on one of them", async () => {
    const urls = serveErrors(() => ({ items: [makeEntry()] }), {
      days: 7,
      groups: [makeGroup(), makeGroup({ fingerprint: "fp2", level: "warning", source: "frontend", name: "ChunkLoadError", message: "Loading chunk 5 failed", hint: undefined, method: undefined, route: undefined, where: "app.js", count: 2, affectedUsers: 1 })],
    });
    const { user } = renderView();
    expect(await screen.findByText("Most frequent in the last 7 days")).toBeInTheDocument();
    const group = screen.getByText("TypeError: Cannot read properties of undefined").closest("button")!;
    expect(group).toHaveTextContent("12 times");
    expect(group).toHaveTextContent("A planning row has no shift");
    expect(group).toHaveTextContent("GET /plannings/:id · 4 users affected · last 01 Mar 2026, 08:05:09");
    expect(screen.getByText("ChunkLoadError: Loading chunk 5 failed").closest("button")).toHaveTextContent("app.js · 1 users affected");

    await user.type(screen.getByLabelText("Search"), "abc");
    await user.click(group);
    expect(await screen.findByText("Showing every occurrence of: TypeError: Cannot read properties of undefined")).toBeInTheDocument();
    await waitFor(() => expect(lastParams(urls)).toEqual({ page: "1", limit: "50", fingerprint: "fp1" }));
    expect(screen.getByLabelText("Search")).toHaveValue("");
  });

  it("hides the summary when it can't be loaded", async () => {
    serveErrors(() => ({ items: [makeEntry()] }), null);
    renderView();
    expect(await screen.findByText("1 entries")).toBeInTheDocument();
    expect(screen.queryByText(/Most frequent/)).not.toBeInTheDocument();
  });

  it("reloads the list and the summary on Refresh", async () => {
    let summaries = 0;
    const urls = serveErrors();
    server.use(http.get(`${API}/error-logs/summary`, () => { summaries++; return HttpResponse.json({ days: 7, groups: [] }); }));
    const { user } = renderView();
    await screen.findByText("0 entries");
    await waitFor(() => expect(summaries).toBe(1));
    const before = urls.length;
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(summaries).toBe(2));
    expect(urls.length).toBeGreaterThan(before);
  });
});
