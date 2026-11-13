import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import CorrectionsView from "./CorrectionsView";
import CorrectionsPage from "@/app/(admin)/corrections/page";
import AdminLayout from "@/app/(admin)/layout";
import { API, server } from "@/test/server";
import { makeCompany, makeUser } from "@/test/factories";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";
import { setLang } from "@/lib/i18n";
import type { Correction } from "@/lib/corrections";

function makeCorrection(overrides: Partial<Correction> = {}): Correction {
  return {
    id: "c1",
    kind: "worktime",
    recordId: "w1",
    date: "2026-11-02",
    snapshot: { clockIn: "10:12", clockOut: "18:00", workHours: "07:48", lateMinutes: 12, absent: false },
    message: "I arrived at 10:00, not 10:12",
    status: "pending",
    reply: null,
    handledBy: null,
    handledAt: null,
    createdAt: "2026-11-12T09:30:00.000Z",
    employee: { id: "e1", empNumber: 7, name: "Amine Bensalah" },
    ...overrides,
  };
}

/** Answers GET /corrections by status and records the answers sent. */
function serve(rows: Correction[]) {
  const asked: string[] = [];
  const answers: { id: string; body: unknown }[] = [];
  server.use(
    http.get(`${API}/corrections`, ({ request }) => {
      const status = new URL(request.url).searchParams.get("status") ?? "all";
      asked.push(status);
      return HttpResponse.json(status === "all" ? rows : rows.filter((r) => r.status === status));
    }),
    http.patch(`${API}/corrections/:id`, async ({ params, request }) => {
      const body = (await request.json()) as { status: Correction["status"]; reply?: string };
      answers.push({ id: String(params.id), body });
      const row = rows.find((r) => r.id === params.id)!;
      Object.assign(row, { status: body.status, reply: body.reply ?? null, handledBy: "Boss", handledAt: "2026-11-12T10:00:00.000Z" });
      return HttpResponse.json(row);
    })
  );
  return { asked, answers };
}

const card = (id: string) => screen.getByTestId(`correction-${id}`);

describe("CorrectionsView", () => {
  it("lists the waiting requests with what the app showed and the employee's words", async () => {
    const { asked } = serve([
      makeCorrection(),
      makeCorrection({ id: "c2", kind: "advance", recordId: "a1", date: "2026-11-07", snapshot: { amount: 5000, reason: "Rent" }, message: "I took 3000" }),
      makeCorrection({ id: "c3", kind: "bonus", recordId: null, date: "2026-11-30", snapshot: null, message: "Bonus missing" }),
    ]);
    renderWithProviders(<CorrectionsView />);
    expect(await screen.findByText("I arrived at 10:00, not 10:12")).toBeInTheDocument();
    expect(asked).toEqual(["pending"]);

    const first = card("c1");
    expect(within(first).getByText("Amine Bensalah")).toBeInTheDocument();
    expect(within(first).getByText("#7")).toBeInTheDocument();
    expect(within(first).getByText(/Worked time · Mon, 2 Nov 2026/)).toBeInTheDocument();
    expect(within(first).getByText("The app showed: In 10:12 · Out 18:00 · 07:48 worked · 12 min late")).toBeInTheDocument();
    expect(within(first).getByText("Waiting")).toBeInTheDocument();
    expect(within(first).getByRole("link", { name: /Open Clock In\/Out History/ })).toHaveAttribute("href", "/clockinpagehistory");

    expect(within(card("c2")).getByText(/5,000 DA · Rent/)).toBeInTheDocument();
    expect(within(card("c2")).getByRole("link", { name: /Open Advances/ })).toHaveAttribute("href", "/reporting/advances");
    expect(within(card("c3")).getByText("Missing record")).toBeInTheDocument();
    expect(within(card("c3")).queryByText(/The app showed/)).not.toBeInTheDocument();
    expect(within(card("c3")).getByRole("link", { name: /Open Bonuses history/ })).toHaveAttribute("href", "/reporting/bonuses/history");
  });

  it("marks a request corrected with an answer for the employee", async () => {
    const rows = [makeCorrection()];
    const { answers } = serve(rows);
    const { user } = renderWithProviders(<CorrectionsView />);
    await user.click(await screen.findByRole("button", { name: "Mark as corrected" }));
    await user.type(screen.getByLabelText("Answer for the employee (optional)"), "Fixed to 10:00");
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Mark as corrected" }));

    await waitFor(() => expect(answers).toEqual([{ id: "c1", body: { status: "corrected", reply: "Fixed to 10:00" } }]));
    expect(await screen.findByText("Marked as corrected. Amine Bensalah will see it in the app.")).toBeInTheDocument();
    // It left the waiting list
    expect(await screen.findByText("No request is waiting. All done!")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Corrected" }));
    const done = await screen.findByTestId("correction-c1");
    expect(within(done).getByText(/Corrected by Boss/)).toBeInTheDocument();
    expect(within(done).getByText("“Fixed to 10:00”")).toBeInTheDocument();
    expect(within(done).queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });

  it("rejects a request without an answer, and can be cancelled", async () => {
    const { answers } = serve([makeCorrection()]);
    const { user } = renderWithProviders(<CorrectionsView />);
    await user.click(await screen.findByRole("button", { name: "Reject" }));
    expect(screen.getByText("Say why, so the employee understands.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reject" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(answers).toEqual([{ id: "c1", body: { status: "rejected" } }]));
    expect(await screen.findByText("Request rejected. Amine Bensalah will see it in the app.")).toBeInTheDocument();
  });

  it("shows the server's reason when the answer fails, and keeps the dialog", async () => {
    serve([makeCorrection()]);
    server.use(
      http.patch(`${API}/corrections/:id`, () =>
        HttpResponse.json({ message: "This request was already handled" }, { status: 409 })
      )
    );
    const { user } = renderWithProviders(<CorrectionsView />);
    await user.click(await screen.findByRole("button", { name: "Mark as corrected" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Mark as corrected" }));
    expect(await screen.findByText(/This request was already handled/)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("filters by status, and shows absent days", async () => {
    const { asked } = serve([
      makeCorrection({ id: "c1", status: "rejected", reply: null, handledBy: "Boss", handledAt: null }),
      makeCorrection({ id: "c2", status: "corrected", snapshot: { absent: true }, reply: "Done", handledBy: "Mia", handledAt: "2026-11-12T10:00:00.000Z" }),
    ]);
    const { user } = renderWithProviders(<CorrectionsView />);
    expect(await screen.findByText("No request is waiting. All done!")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "All" }));
    expect(await screen.findByTestId("correction-c2")).toBeInTheDocument();
    expect(within(card("c2")).getByText("The app showed: Absent")).toBeInTheDocument();
    expect(within(card("c1")).getByText(/Rejected by Boss/)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Rejected" }));
    await waitFor(() => expect(screen.queryByTestId("correction-c2")).not.toBeInTheDocument());
    expect(asked).toEqual(["pending", "all", "rejected"]);
    expect(screen.getByRole("tab", { name: "Rejected" })).toHaveAttribute("aria-selected", "true");
  });

  it("says when a list is empty, and when it can't load", async () => {
    serve([makeCorrection({ status: "corrected" })]);
    const { user } = renderWithProviders(<CorrectionsView />);
    await user.click(await screen.findByRole("tab", { name: "Rejected" }));
    expect(await screen.findByText("No requests here.")).toBeInTheDocument();

    server.use(http.get(`${API}/corrections`, () => HttpResponse.json({ message: "boom" }, { status: 500 })));
    await user.click(screen.getByRole("tab", { name: "All" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the correction requests");
  });

  it("only links to fix pages the user can open", async () => {
    serve([makeCorrection({ kind: "advance", snapshot: { amount: 1000, reason: null } })]);
    renderWithProviders(<CorrectionsView />, {
      user: makeUser({ role: "manager" }),
      company: makeCompany({ features: ["clockin", "bonuses"] }),
    });
    expect(await screen.findByTestId("correction-c1")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open Advances/ })).not.toBeInTheDocument();
    expect(screen.getByText("The app showed: 1,000 DA")).toBeInTheDocument();
  });

  it("speaks French", async () => {
    serve([makeCorrection()]);
    setLang("fr");
    renderWithProviders(<CorrectionsView />);
    expect(await screen.findByText("En attente", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marquer comme corrigé" })).toBeInTheDocument();
    setLang("en");
  });

  it("renders inside the Correction requests page", async () => {
    serve([]);
    renderWithProviders(<CorrectionsPage />);
    expect(screen.getByText("Mistakes reported by employees")).toBeInTheDocument();
    expect(await screen.findByText("No request is waiting. All done!")).toBeInTheDocument();
  });
});

describe("the menu", () => {
  const layout = <AdminLayout>Page content</AdminLayout>;

  it("shows how many requests wait, and hides the badge at zero", async () => {
    server.use(http.get(`${API}/corrections/count`, () => HttpResponse.json({ pending: 3 })));
    renderWithProviders(layout, { url: "/home" });
    const sidebar = await screen.findByRole("complementary", { hidden: true });
    const link = within(sidebar).getByRole("link", { name: /Correction requests/ });
    expect(link).toHaveAttribute("href", "/corrections");
    expect(await within(link).findByLabelText("3 waiting")).toHaveTextContent("3");
  });

  it("has no badge when nothing waits", async () => {
    renderWithProviders(layout, { url: "/home" });
    const sidebar = await screen.findByRole("complementary", { hidden: true });
    const link = within(sidebar).getByRole("link", { name: /Correction requests/ });
    await new Promise((r) => setTimeout(r, 50));
    expect(within(link).queryByLabelText(/waiting/)).not.toBeInTheDocument();
  });

  it("is for managers and admins only", async () => {
    renderWithProviders(layout, { url: "/kiosk", user: makeUser({ role: "employee" }) });
    await screen.findByText("Page content").catch(() => undefined);
    expect(screen.queryByRole("link", { name: /Correction requests/ })).not.toBeInTheDocument();
  });
});
