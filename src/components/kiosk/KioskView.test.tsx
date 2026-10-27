import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import KioskView from "./KioskView";
import KioskPage from "@/app/(full-width-pages)/kiosk/page";
import { API, server } from "@/test/server";
import { makeCompany, makeUser } from "@/test/factories";
import { router } from "@/test/navigation";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";
import { setLang } from "@/lib/i18n";

interface KioskEmployee {
  id: string;
  empNumber: number;
  firstName: string;
  lastName: string;
  photo: string | null;
  clockedIn: boolean;
  since: string | null;
}

function makeKioskEmployee(overrides: Partial<KioskEmployee> = {}): KioskEmployee {
  return { id: "e1", empNumber: 7, firstName: "Sara", lastName: "Benali", photo: null, clockedIn: false, since: null, ...overrides };
}

const kioskAccount = makeUser({ role: "employee", name: "Kiosk", email: "kiosk@test.dz" });
const realTz = process.env.TZ;
const realLocation = window.location;

beforeEach(() => {
  process.env.TZ = "UTC";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-02T09:15:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  process.env.TZ = realTz;
  setLang("en");
  Object.defineProperty(window, "location", { value: realLocation, configurable: true });
});

/** Answers the employee list with each list in turn (the last repeats); returns how many times it was asked. */
function serveEmployees(...lists: KioskEmployee[][]) {
  const calls = { count: 0 };
  server.use(
    http.get(`${API}/kiosk/employees`, () => HttpResponse.json(lists[Math.min(calls.count++, lists.length - 1)]))
  );
  return calls;
}

function serveClock(time = "2026-03-02T09:16:00Z", name = "Sara Benali") {
  const bodies: unknown[] = [];
  server.use(
    http.post(`${API}/kiosk/clock`, async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ time, employee: { name } });
    })
  );
  return bodies;
}

const renderKiosk = (options: Parameters<typeof renderWithProviders>[1] = {}) =>
  renderWithProviders(<KioskView />, { user: kioskAccount, url: "/kiosk", ...options });

describe("KioskView access", () => {
  it("sends a signed-out visitor to sign in", async () => {
    renderKiosk({ user: null });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/signin?next=%2Fkiosk"));
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("sends an admin away when the company has no clock-in", async () => {
    renderKiosk({ user: makeUser(), company: makeCompany({ features: ["planning"] }) });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/home"));
  });

  // BUG-603: a kiosk account whose company has clock-in switched off is "redirected" to /kiosk itself and stays on "Loading…" with no way to sign out
  it("doesn't leave a kiosk account stuck when clock-in is switched off", async () => {
    renderKiosk({ company: makeCompany({ features: ["planning"] }) });
    expect(await screen.findByText("The clock-in kiosk is switched off for this company.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalledWith("/kiosk");
  });

  it("lets an admin use the kiosk and exit to the clock-in history", async () => {
    serveEmployees([]);
    const { user } = renderKiosk({ user: makeUser() });
    await user.click(await screen.findByRole("button", { name: "Exit kiosk" }));
    expect(router.push).toHaveBeenCalledWith("/clockinpagehistory");
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("lets the kiosk account sign out", async () => {
    const location = { href: "", pathname: "/kiosk", search: "" };
    Object.defineProperty(window, "location", { value: location, configurable: true });
    serveEmployees([]);
    server.use(http.post(`${API}/auth/logout`, () => HttpResponse.json({})));
    const { user } = renderKiosk({ company: makeCompany({ slug: "roma" }) });
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(location.href).toBe("/signin?company=roma"));
    expect(localStorage.getItem("auth_token")).toBeNull();
    expect(screen.queryByRole("button", { name: "Exit kiosk" })).not.toBeInTheDocument();
  });

  it("renders from the kiosk page with the company's name, logo and a live clock", async () => {
    serveEmployees([]);
    renderWithProviders(<KioskPage />, { user: kioskAccount, company: makeCompany({ name: "Pizza Roma", branding: { logo: "/roma.png" } }) });
    expect(await screen.findByText("Pizza Roma")).toBeInTheDocument();
    expect(document.querySelector('img[src="/roma.png"]')).not.toBeNull();
    expect(await screen.findByText("09:15:00")).toBeInTheDocument();
    expect(screen.getByText("Monday 2 March")).toBeInTheDocument();
  });
});

describe("KioskView list", () => {
  it("lists employees with their status", async () => {
    serveEmployees([
      makeKioskEmployee({ clockedIn: true, since: "2026-03-02T08:02:00Z" }),
      makeKioskEmployee({ id: "e2", empNumber: 12, firstName: "Ali", lastName: "Amrani", photo: "/ali.jpg" }),
      makeKioskEmployee({ id: "e3", empNumber: 13, firstName: "", lastName: "" }),
    ]);
    renderKiosk();
    const sara = (await screen.findByText("Sara Benali")).closest("button")!;
    expect(sara).toHaveTextContent("SB");
    expect(sara).toHaveTextContent("#7");
    expect(within(sara).getByText("In since 08:02")).toBeInTheDocument();
    const ali = screen.getByText("Ali Amrani").closest("button")!;
    expect(within(ali).getByText("Out")).toBeInTheDocument();
    expect(ali.querySelector("img")).toHaveAttribute("src", "/ali.jpg");
    expect(screen.getByText("#13").closest("button")).toHaveTextContent("?");
  });

  it("finds people by name or number", async () => {
    serveEmployees([makeKioskEmployee(), makeKioskEmployee({ id: "e2", empNumber: 12, firstName: "Ali", lastName: "Amrani" })]);
    const { user } = renderKiosk();
    await screen.findByText("Sara Benali");
    const search = screen.getByLabelText("Find your name");
    await user.type(search, "sara b");
    expect(screen.queryByText("Ali Amrani")).not.toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "12");
    expect(screen.getByText("Ali Amrani")).toBeInTheDocument();
    expect(screen.queryByText("Sara Benali")).not.toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "zzz");
    expect(screen.getByText("No one matches this search.")).toBeInTheDocument();
  });

  it("says when there are no employees", async () => {
    serveEmployees([]);
    renderKiosk();
    expect(await screen.findByText("No employees yet. An admin can add them.")).toBeInTheDocument();
  });

  it("shows a load error and retries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let fail = true;
    server.use(http.get(`${API}/kiosk/employees`, () => (fail ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json([makeKioskEmployee()]))));
    const { user } = renderKiosk();
    const alert = (await screen.findByText("Couldn't load the employees")).closest<HTMLElement>("[role=alert]")!;
    expect(screen.queryByText("No employees yet. An admin can add them.")).not.toBeInTheDocument();
    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Sara Benali")).toBeInTheDocument();
  });

  // BUG-604: the kiosk list's loading text is hard-coded in English
  it("shows the list's loading text in the kiosk's language", async () => {
    setLang("fr");
    let release: () => void = () => {};
    server.use(
      http.get(`${API}/kiosk/employees`, async () => {
        await new Promise<void>((r) => (release = r));
        return HttpResponse.json([]);
      })
    );
    renderKiosk();
    await screen.findByLabelText("Trouvez votre nom");
    try {
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
      expect(screen.getByText("Chargement…")).toBeInTheDocument();
    } finally {
      release();
    }
  });
});

describe("KioskView clock-in flow", () => {
  it("clocks an employee in, confirms it and refreshes the list", async () => {
    const calls = serveEmployees([makeKioskEmployee()], [makeKioskEmployee({ clockedIn: true, since: "2026-03-02T09:16:00Z" })]);
    const bodies = serveClock();
    const { user } = renderKiosk();
    await user.click(await screen.findByText("Sara Benali"));
    const dialog = screen.getByRole("dialog", { name: "Clock in or out for Sara Benali" });
    expect(dialog).toHaveTextContent("Not clocked in");
    expect(within(dialog).getByRole("button", { name: "Clock out" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Clock in" }));

    const status = await within(dialog).findByRole("status");
    expect(status).toHaveTextContent("Clocked in");
    expect(status).toHaveTextContent("Sara Benali at 09:16");
    expect(bodies).toEqual([{ empNumber: 7, action: "in" }]);
    await waitFor(() => expect(calls.count).toBe(2));
    await user.click(within(status).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("In since 09:16")).toBeInTheDocument();
  });

  it("clocks out, remembers it for today and shows it in the list", async () => {
    serveEmployees([makeKioskEmployee({ clockedIn: true, since: "2026-03-02T08:00:00Z" })], [makeKioskEmployee()]);
    const bodies = serveClock("2026-03-02T17:05:00Z");
    const { user } = renderKiosk();
    await user.click(await screen.findByText("Sara Benali"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Clocked in since 08:00");
    expect(within(dialog).getByRole("button", { name: "Clock in" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Clock out" }));
    expect(await within(dialog).findByRole("status")).toHaveTextContent("Clocked out");
    expect(bodies).toEqual([{ empNumber: 7, action: "out" }]);
    expect(JSON.parse(localStorage.getItem("kiosk_clockouts_2026-3-2")!)).toEqual({ 7: "2026-03-02T17:05:00Z" });

    await user.click(screen.getByRole("button", { name: "Done" }));
    const card = screen.getByText("Sara Benali").closest("button")!;
    expect(card).toHaveTextContent("Clocked out · saved");
    expect(card).toHaveTextContent("#7 · Out at 17:05");
    expect(within(card).queryByText("Out")).not.toBeInTheDocument();
  });

  it("shows today's saved clock-outs after a reload, and forgets them on clock-in", async () => {
    localStorage.setItem("kiosk_clockouts_2026-3-2", JSON.stringify({ 7: "2026-03-02T12:30:00Z" }));
    serveEmployees([makeKioskEmployee()]);
    serveClock();
    const { user } = renderKiosk();
    expect(await screen.findByText("Clocked out · saved")).toBeInTheDocument();
    await user.click(screen.getByText("Sara Benali"));
    await user.click(screen.getByRole("button", { name: "Clock in" }));
    await screen.findByRole("status");
    expect(JSON.parse(localStorage.getItem("kiosk_clockouts_2026-3-2")!)).toEqual({});
  });

  it("ignores a corrupt saved clock-out list", async () => {
    localStorage.setItem("kiosk_clockouts_2026-3-2", "{not json");
    serveEmployees([makeKioskEmployee()]);
    renderKiosk();
    expect(await screen.findByText("Out")).toBeInTheDocument();
  });

  it("explains a refused clock-in and reloads the list", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const calls = serveEmployees([makeKioskEmployee()]);
    server.use(http.post(`${API}/kiosk/clock`, () => HttpResponse.json({ message: "Already clocked in" }, { status: 409 })));
    const { user } = renderKiosk();
    await user.click(await screen.findByText("Sara Benali"));
    await user.click(screen.getByRole("button", { name: "Clock in" }));
    expect(await screen.findByText("Couldn't clock in. Already clocked in")).toBeInTheDocument();
    await waitFor(() => expect(calls.count).toBe(2));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("explains a refused clock-out", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    serveEmployees([makeKioskEmployee({ clockedIn: true })]);
    server.use(http.post(`${API}/kiosk/clock`, () => HttpResponse.json({ message: "Not clocked in" }, { status: 409 })));
    const { user } = renderKiosk();
    await user.click(await screen.findByText("Sara Benali"));
    expect(screen.getByRole("dialog")).toHaveTextContent("Not clocked in");
    await user.click(screen.getByRole("button", { name: "Clock out" }));
    expect(await screen.findByText("Couldn't clock out. Not clocked in")).toBeInTheDocument();
  });

  it("goes back with 'Not me' or by clicking outside", async () => {
    serveEmployees([makeKioskEmployee()]);
    const { user } = renderKiosk();
    await user.click(await screen.findByText("Sara Benali"));
    await user.click(screen.getByRole("button", { name: "Not me — go back" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByText("Sara Benali"));
    const backdrop = screen.getByRole("dialog").previousElementSibling as HTMLElement;
    await user.click(backdrop);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("KioskView timers", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-03-02T09:15:00Z"));
  });

  it("goes back to the list by itself 4 seconds after a clock-in", async () => {
    serveEmployees([makeKioskEmployee()]);
    serveClock();
    const { user } = renderKiosk();
    await user.click(await screen.findByText("Sara Benali"));
    await user.click(screen.getByRole("button", { name: "Clock in" }));
    await screen.findByRole("status");
    vi.advanceTimersByTime(4000);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("refreshes the list every 30 seconds", async () => {
    const calls = serveEmployees([makeKioskEmployee()], [makeKioskEmployee({ firstName: "Sarah" })]);
    renderKiosk();
    await screen.findByText("Sara Benali");
    vi.advanceTimersByTime(30_000);
    expect(await screen.findByText("Sarah Benali")).toBeInTheDocument();
    expect(calls.count).toBe(2);
  });
});
