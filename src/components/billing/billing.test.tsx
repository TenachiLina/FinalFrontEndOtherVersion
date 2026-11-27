import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { useState } from "react";
import { http, HttpResponse } from "msw";
import PageChecks from "./PageChecks";
import PacksView, { priceLabel } from "./PacksView";
import SubscriptionBanner from "./SubscriptionBanner";
import CompanySubscriptionPanel, { standingLabel } from "./CompanySubscriptionPanel";
import PacksPage from "@/app/(admin)/packs/page";
import { API, server } from "@/test/server";
import { makeCompany, makeUser } from "@/test/factories";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { dismissToast, getToasts } from "@/lib/notify";
import type { Feature, Page, SubscriptionState } from "@/lib/auth";
import type { CompanyBilling, CompanySubscription, Pack } from "@/lib/billing";

afterEach(() => getToasts().forEach((t) => dismissToast(t.id)));

const DAY = 86_400_000;
const inDays = (days: number) => new Date(Date.now() + days * DAY + 60_000).toISOString();

const STARTER: Pack = {
  _id: "p1",
  name: "Starter",
  description: "For small teams",
  price: 3000,
  currency: "DA",
  periodMonths: 1,
  features: ["planning", "clockin"],
  disabledPages: ["kiosk"],
  maxEmployees: 15,
  trialDays: 30,
  active: true,
};
const PRO: Pack = {
  _id: "p2",
  name: "Pro",
  price: 30000,
  currency: "DA",
  periodMonths: 6,
  features: ["planning", "clockin", "faceRecognition", "reporting", "advances", "bonuses"],
  disabledPages: [],
  maxEmployees: null,
  trialDays: 0,
  active: true,
};
const OLD: Pack = { ...STARTER, _id: "p3", name: "Old offer", active: false, price: 0 };

// ── PageChecks ─────────────────────────────────────────────────────────────

function Checks({ features, initial = [] }: { features: Feature[]; initial?: Page[] }) {
  const [value, setValue] = useState<Page[]>(initial);
  return (
    <>
      <PageChecks features={features} value={value} onChange={setValue} />
      <output data-testid="off">{value.join(",")}</output>
    </>
  );
}

describe("PageChecks", () => {
  it("ticks the pages that are on, and switches one off and on again", async () => {
    const user = userEvent.setup();
    render(<Checks features={["clockin"]} initial={["kiosk"]} />);
    const kiosk = screen.getByRole("checkbox", { name: "Clock-in kiosk" });
    expect(kiosk).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Clock In / Out" })).toBeChecked();
    await user.click(kiosk);
    expect(screen.getByTestId("off")).toHaveTextContent("");
    await user.click(screen.getByRole("checkbox", { name: "Clock In/Out History" }));
    expect(screen.getByTestId("off")).toHaveTextContent("clockinHistory");
  });

  it("locks the pages of a feature that is off", () => {
    render(<Checks features={["clockin"]} />);
    expect(screen.getByRole("checkbox", { name: "Payslips" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Payslips" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Clock-in kiosk" })).toBeEnabled();
    // Pages that need no feature can always be switched
    expect(screen.getByRole("checkbox", { name: "Insured Employees" })).toBeEnabled();
  });
});

// ── SubscriptionBanner ─────────────────────────────────────────────────────

const state = (overrides: Partial<SubscriptionState>): SubscriptionState => ({
  status: "active",
  kind: "active",
  packName: "Pro",
  endsAt: inDays(30),
  daysLeft: 30,
  endingSoon: false,
  readOnly: false,
  maxEmployees: null,
  ...overrides,
});
const banner = (subscription: SubscriptionState | undefined, role: "admin" | "manager" | "employee" = "admin") =>
  renderWithProviders(<SubscriptionBanner />, { user: makeUser({ role }), company: makeCompany({ subscription }) });

describe("SubscriptionBanner", () => {
  it("shows nothing with time left, or without a subscription", async () => {
    for (const subscription of [state({}), state({ status: "none", kind: null, endsAt: null, daysLeft: null }), undefined]) {
      const { unmount } = banner(subscription);
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByTestId("subscription-banner")).toBeNull();
      unmount();
    }
  });

  it("warns during the last days of a subscription", async () => {
    banner(state({ endingSoon: true, daysLeft: 3, endsAt: "2026-11-17T12:00:00.000Z" }));
    const note = await screen.findByTestId("subscription-banner");
    expect(note).toHaveAttribute("role", "status");
    expect(note).toHaveTextContent("Your subscription ends in 3 days (17 November 2026).");
    expect(note).toHaveTextContent("After that the account becomes read-only. Contact us to renew.");
  });

  it("says 'tomorrow' and 'today' on the last two days, and names a trial", async () => {
    const first = banner(state({ kind: "trial", status: "trial", endingSoon: true, daysLeft: 1, endsAt: "2026-11-15T12:00:00.000Z" }));
    expect(await screen.findByTestId("subscription-banner")).toHaveTextContent("Your free trial ends tomorrow (15 November 2026).");
    first.unmount();
    banner(state({ endingSoon: true, daysLeft: 0, endsAt: "2026-11-14T12:00:00.000Z" }));
    expect(await screen.findByTestId("subscription-banner")).toHaveTextContent("Your subscription ends today (14 November 2026).");
  });

  it("says the account is read-only after the end", async () => {
    const first = banner(state({ status: "expired", readOnly: true, daysLeft: 0 }));
    const alert = await screen.findByTestId("subscription-banner");
    expect(alert).toHaveAttribute("role", "alert");
    expect(alert).toHaveTextContent("Your subscription has ended.");
    expect(alert).toHaveTextContent("you can still see and export everything, but nothing can be changed");
    first.unmount();
    banner(state({ status: "expired", kind: "trial", readOnly: true }), "manager");
    expect(await screen.findByTestId("subscription-banner")).toHaveTextContent("Your free trial has ended.");
  });

  it("stays off the kiosk account's screen", async () => {
    banner(state({ status: "expired", readOnly: true }), "employee");
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("subscription-banner")).toBeNull();
  });
});

// ── PacksView ──────────────────────────────────────────────────────────────

describe("priceLabel", () => {
  it("names the price and its period", () => {
    expect(priceLabel(STARTER)).toMatch(/^3[\s  ]000 DA \/ month$/);
    expect(priceLabel(PRO)).toMatch(/^30[\s  ]000 DA \/ 6 months$/);
    expect(priceLabel(OLD)).toBe("Free");
  });
});

/** A small in-memory /packs API. */
function mockPacks(initial: Pack[]) {
  let packs = [...initial];
  const calls: { method: string; id?: string; body?: unknown }[] = [];
  server.use(
    http.get(`${API}/packs`, () => HttpResponse.json(packs)),
    http.post(`${API}/packs`, async ({ request }) => {
      const body = (await request.json()) as Partial<Pack>;
      calls.push({ method: "POST", body });
      const created = { ...PRO, ...body, _id: `new-${packs.length}` } as Pack;
      packs = [...packs, created];
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(`${API}/packs/:id`, async ({ request, params }) => {
      const body = (await request.json()) as Partial<Pack>;
      calls.push({ method: "PATCH", id: String(params.id), body });
      packs = packs.map((p) => (p._id === params.id ? { ...p, ...body } : p));
      return HttpResponse.json(packs.find((p) => p._id === params.id));
    }),
    http.delete(`${API}/packs/:id`, ({ params }) => {
      calls.push({ method: "DELETE", id: String(params.id) });
      packs = packs.filter((p) => p._id !== params.id);
      return HttpResponse.json({ deleted: true });
    })
  );
  return calls;
}

describe("PacksView", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));

  it("lists each pack with its price, limits and what it contains", async () => {
    mockPacks([STARTER, PRO, OLD]);
    renderWithProviders(<PacksView />);
    const starter = await screen.findByRole("listitem", { name: "Starter" });
    expect(starter).toHaveTextContent(/3[\s  ]000 DA \/ month/);
    expect(starter).toHaveTextContent("For small teams");
    expect(starter).toHaveTextContent("Up to 15");
    expect(starter).toHaveTextContent("30 days");
    expect(starter).toHaveTextContent("Pages switched off1");
    const pro = screen.getByRole("listitem", { name: "Pro" });
    expect(pro).toHaveTextContent("No limit");
    expect(pro).toHaveTextContent("FeaturesAll");
    expect(pro).toHaveTextContent("Free trialNone");
    expect(screen.getByRole("listitem", { name: "Old offer" })).toHaveTextContent("Archived");
  });

  it("says so when there is no pack yet", async () => {
    mockPacks([]);
    renderWithProviders(<PacksView />);
    expect(await screen.findByText(/No packs yet/)).toBeInTheDocument();
  });

  it("adds a pack", async () => {
    const calls = mockPacks([]);
    const { user } = renderWithProviders(<PacksView />);
    await user.click(await screen.findByRole("button", { name: "Add pack" }));
    await user.type(screen.getByLabelText("Pack name"), "Starter");
    await user.clear(screen.getByLabelText("Price"));
    await user.type(screen.getByLabelText("Price"), "3000");
    await user.type(screen.getByLabelText("Maximum employees"), "15");
    await user.click(screen.getByRole("checkbox", { name: "Bonuses" }));
    await user.click(screen.getByRole("checkbox", { name: "Clock-in kiosk" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({
      name: "Starter",
      description: "",
      price: 3000,
      currency: "DA",
      periodMonths: 1,
      trialDays: 14,
      maxEmployees: 15,
      features: ["planning", "clockin", "faceRecognition", "reporting", "advances"],
      disabledPages: ["kiosk"],
    });
    expect(await screen.findByRole("listitem", { name: "Starter" })).toBeInTheDocument();
    expect(getToasts().map((t) => t.message)).toEqual(["Pack added."]);
  });

  it("edits a pack: an empty employee limit means no limit", async () => {
    const calls = mockPacks([STARTER]);
    const { user } = renderWithProviders(<PacksView />);
    await user.click(within(await screen.findByRole("listitem", { name: "Starter" })).getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Pack name")).toHaveValue("Starter");
    expect(screen.getByLabelText("Maximum employees")).toHaveValue(15);
    expect(screen.getByRole("checkbox", { name: "Clock-in kiosk" })).not.toBeChecked();
    await user.clear(screen.getByLabelText("Maximum employees"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: "PATCH", id: "p1", body: { maxEmployees: null, name: "Starter" } });
  });

  it("shows the server's refusal in the form and keeps it open", async () => {
    mockPacks([]);
    server.use(
      http.post(`${API}/packs`, () => HttpResponse.json({ message: "A pack with this name already exists" }, { status: 409 }))
    );
    const { user } = renderWithProviders(<PacksView />);
    await user.click(await screen.findByRole("button", { name: "Add pack" }));
    await user.type(screen.getByLabelText("Pack name"), "Starter");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A pack with this name already exists");
    expect(screen.getByLabelText("Pack name")).toHaveValue("Starter");
  });

  it("archives and restores a pack", async () => {
    const calls = mockPacks([STARTER]);
    const { user } = renderWithProviders(<PacksView />);
    const card = () => screen.getByRole("listitem", { name: "Starter" });
    await user.click(within(await screen.findByRole("listitem", { name: "Starter" })).getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(card()).toHaveTextContent("Archived"));
    await user.click(within(card()).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(card()).not.toHaveTextContent("Archived"));
    expect(calls.map((c) => c.body)).toEqual([{ active: false }, { active: true }]);
  });

  it("deletes a pack after a confirmation", async () => {
    const calls = mockPacks([STARTER]);
    const { user } = renderWithProviders(<PacksView />);
    await user.click(within(await screen.findByRole("listitem", { name: "Starter" })).getByRole("button", { name: "Delete" }));
    expect(calls).toEqual([]);
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("listitem", { name: "Starter" })).toBeNull());
    expect(calls).toEqual([{ method: "DELETE", id: "p1" }]);
  });

  it("explains when a pack in use can't be deleted, or a change fails", async () => {
    mockPacks([STARTER]);
    server.use(
      http.delete(`${API}/packs/:id`, () =>
        HttpResponse.json({ message: "This pack is used by a company: archive it instead of deleting it" }, { status: 409 })
      ),
      http.patch(`${API}/packs/:id`, () => HttpResponse.json({}, { status: 500 }))
    );
    const { user } = renderWithProviders(<PacksView />);
    const card = await screen.findByRole("listitem", { name: "Starter" });
    await user.click(within(card).getByRole("button", { name: "Delete" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(getToasts()).toHaveLength(1));
    expect(getToasts()[0].message).toContain("This pack is used by a company");
    expect(screen.getByRole("listitem", { name: "Starter" })).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(getToasts()).toHaveLength(2));
    expect(getToasts()[1].message).toContain("Couldn't save the pack");
  });

  it("shows an error with a retry when the packs can't be loaded", async () => {
    server.use(http.get(`${API}/packs`, () => HttpResponse.json({}, { status: 500 })));
    const { user } = renderWithProviders(<PacksView />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load the packs");
    mockPacks([STARTER]);
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("listitem", { name: "Starter" })).toBeInTheDocument();
  });

  it("is what the Packs page shows", async () => {
    mockPacks([PRO]);
    renderWithProviders(<PacksPage />, { user: makeUser({ role: "superadmin", companyId: null }), company: null });
    expect(await screen.findByRole("listitem", { name: "Pro" })).toBeInTheDocument();
    expect(screen.getByText("Packs and prices")).toBeInTheDocument();
  });
});

// ── CompanySubscriptionPanel ───────────────────────────────────────────────

const TRIAL: CompanySubscription = {
  packId: "p1",
  packName: "Starter",
  status: "trial",
  startsAt: new Date(Date.now() - 5 * DAY).toISOString(),
  endsAt: inDays(9),
  maxEmployees: 15,
  price: 3000,
  currency: "DA",
  periodMonths: 1,
  payments: [],
};

/** Records the subscription calls and answers the company after each. */
function mockSubscription() {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const answer = (subscription: CompanySubscription | null): CompanyBilling => ({
    _id: "c1",
    features: STARTER.features,
    disabledPages: STARTER.disabledPages,
    subscription,
    subscriptionState: {} as SubscriptionState,
  });
  server.use(
    http.get(`${API}/packs`, () => HttpResponse.json([STARTER, PRO, OLD])),
    http.put(`${API}/companies/c1/subscription`, async ({ request }) => {
      const body = (await request.json()) as { kind?: "trial" | "active" };
      calls.push({ method: "PUT", path: "subscription", body });
      return HttpResponse.json(answer({ ...TRIAL, status: body.kind ?? "trial" }));
    }),
    http.post(`${API}/companies/c1/subscription/payments`, async ({ request }) => {
      const body = (await request.json()) as { amount: number; months?: number };
      calls.push({ method: "POST", path: "payments", body });
      return HttpResponse.json(
        answer({
          ...TRIAL,
          status: "active",
          payments: [{ _id: "pay1", date: "2026-11-14", amount: body.amount, months: body.months ?? 1, recordedBy: "Root", method: "Cash" }],
        })
      );
    }),
    http.delete(`${API}/companies/c1/subscription`, () => {
      calls.push({ method: "DELETE", path: "subscription" });
      return HttpResponse.json(answer(null));
    })
  );
  return calls;
}

function Panel({ initial, onChanged }: { initial: CompanySubscription | null; onChanged?: (c: CompanyBilling) => void }) {
  const [subscription, setSub] = useState(initial);
  return (
    <CompanySubscriptionPanel
      companyId="c1"
      subscription={subscription}
      onChanged={(company) => {
        setSub(company.subscription);
        onChanged?.(company);
      }}
    />
  );
}

describe("standingLabel", () => {
  it("names where a subscription stands", () => {
    expect(standingLabel(null)).toBe("No subscription");
    expect(standingLabel(TRIAL)).toBe("Trial · 9 days left");
    expect(standingLabel({ status: "active", endsAt: inDays(40) })).toBe("Active · 40 days left");
    expect(standingLabel({ status: "active", endsAt: inDays(-2) })).toBe("Ended");
  });
});

describe("CompanySubscriptionPanel", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));

  it("starts a trial with the chosen pack, and tells the page", async () => {
    const calls = mockSubscription();
    const onChanged = vi.fn();
    const { user } = renderWithProviders(<Panel initial={null} onChanged={onChanged} />);
    expect(screen.getByTestId("subscription-standing")).toHaveTextContent("No subscription: this company has no end date and no limit.");
    const start = screen.getByRole("button", { name: "Start subscription" });
    expect(start).toBeDisabled();
    await screen.findByRole("option", { name: /Starter/ });
    // An archived pack can't be chosen
    expect(screen.queryByRole("option", { name: /Old offer/ })).toBeNull();
    await user.selectOptions(screen.getByLabelText("Pack"), "p1");
    expect(screen.getByText(/a trial of 30 days from today/)).toBeInTheDocument();
    await user.click(start);
    await waitFor(() => expect(calls).toEqual([{ method: "PUT", path: "subscription", body: { packId: "p1", kind: "trial" } }]));
    expect(await screen.findByTestId("subscription-standing")).toHaveTextContent("Starter · Trial · 9 days left");
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ features: STARTER.features, disabledPages: ["kiosk"] }));
    expect(getToasts().map((t) => t.message)).toEqual(["Subscription saved."]);
  });

  it("starts a paid period with an end date", async () => {
    const calls = mockSubscription();
    const { user } = renderWithProviders(<Panel initial={null} />);
    await screen.findByRole("option", { name: /Pro/ });
    await user.selectOptions(screen.getByLabelText("Pack"), "p2");
    await user.selectOptions(screen.getByLabelText("Type"), "active");
    expect(screen.getByText(/6 month\(s\) from today/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Ends on (optional)"), "2027-06-30");
    await user.click(screen.getByRole("button", { name: "Start subscription" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ packId: "p2", kind: "active", endsAt: "2027-06-30" });
  });

  it("shows the current subscription, its limit and its payments", async () => {
    mockSubscription();
    renderWithProviders(
      <Panel
        initial={{
          ...TRIAL,
          status: "active",
          payments: [{ _id: "x", date: "2026-11-01", amount: 3000, months: 1, recordedBy: "Root", method: "Transfer", reference: "VIR-1" }],
        }}
      />
    );
    const standing = screen.getByTestId("subscription-standing");
    expect(standing).toHaveTextContent("Starter · Active · 9 days left");
    expect(standing).toHaveTextContent("Up to 15 employees");
    expect(screen.getByText(/2026-11-01/).closest("li")).toHaveTextContent(/3[\s  ]000 DA · \+1 month\(s\)Transfer · VIR-1 · Root/);
  });

  it("marks an ended subscription as read-only", () => {
    mockSubscription();
    renderWithProviders(<Panel initial={{ ...TRIAL, endsAt: inDays(-3) }} />);
    expect(screen.getByTestId("subscription-standing")).toHaveTextContent("Ended");
    expect(screen.getByTestId("subscription-standing")).toHaveTextContent("Read-only");
  });

  it("records a payment and shows it", async () => {
    const calls = mockSubscription();
    const { user } = renderWithProviders(<Panel initial={TRIAL} />);
    expect(screen.getByText("No payment recorded yet.")).toBeInTheDocument();
    const record = screen.getByRole("button", { name: "Record payment" });
    expect(record).toBeDisabled();
    await user.type(screen.getByLabelText("Amount"), "9000");
    await user.type(screen.getByLabelText("Months added"), "3");
    await user.type(screen.getByLabelText("Paid by"), "Cash");
    await user.type(screen.getByLabelText("Reference"), "REC-7");
    await user.click(record);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ method: "POST", path: "payments", body: { amount: 9000, months: 3, method: "Cash", reference: "REC-7" } });
    expect(await screen.findByText(/2026-11-14/)).toBeInTheDocument();
    expect(screen.getByTestId("subscription-standing")).toHaveTextContent("Active");
    // Ready for the next payment
    expect(screen.getByLabelText("Amount")).toHaveValue(null);
    expect(getToasts().map((t) => t.message)).toEqual(["Payment recorded."]);
  });

  it("leaves the months to the pack when none are typed", async () => {
    const calls = mockSubscription();
    const { user } = renderWithProviders(<Panel initial={TRIAL} />);
    await user.type(screen.getByLabelText("Amount"), "3000");
    await user.click(screen.getByRole("button", { name: "Record payment" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ amount: 3000 });
  });

  it("changes the type without choosing the pack again", async () => {
    const calls = mockSubscription();
    const { user } = renderWithProviders(<Panel initial={{ ...TRIAL, packId: null }} />);
    await user.selectOptions(screen.getByLabelText("Type"), "active");
    await user.click(screen.getByRole("button", { name: "Save subscription" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ kind: "active" });
  });

  it("removes the subscription after a confirmation", async () => {
    const calls = mockSubscription();
    const { user } = renderWithProviders(<Panel initial={TRIAL} />);
    await user.click(screen.getByRole("button", { name: "Remove subscription" }));
    expect(calls).toEqual([]);
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls).toEqual([{ method: "DELETE", path: "subscription" }]));
    expect(await screen.findByText("No subscription: this company has no end date and no limit.")).toBeInTheDocument();
  });

  it("keeps the subscription when the removal is cancelled", async () => {
    const calls = mockSubscription();
    const { user } = renderWithProviders(<Panel initial={TRIAL} />);
    await user.click(screen.getByRole("button", { name: "Remove subscription" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(calls).toEqual([]);
    expect(screen.getByTestId("subscription-standing")).toHaveTextContent("Starter");
  });

  it("shows the server's refusal", async () => {
    mockSubscription();
    server.use(
      http.post(`${API}/companies/c1/subscription/payments`, () =>
        HttpResponse.json({ message: "amount must be greater than 0" }, { status: 400 })
      )
    );
    const { user } = renderWithProviders(<Panel initial={TRIAL} />);
    await user.type(screen.getByLabelText("Amount"), "0");
    await user.click(screen.getByRole("button", { name: "Record payment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("amount must be greater than 0");
    expect(screen.getByLabelText("Amount")).toHaveValue(0);
  });

  it("says so when the packs can't be loaded", async () => {
    server.use(http.get(`${API}/packs`, () => HttpResponse.json({}, { status: 500 })));
    renderWithProviders(<Panel initial={null} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the packs");
  });
});
