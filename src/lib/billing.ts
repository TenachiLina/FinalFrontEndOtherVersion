// ─────────────────────────────────────────────────────────────────────────
// Packs and subscriptions (super admin)
//
// A pack is an offer: price, features, pages, employee limit, trial length.
// A company's subscription says which pack it has, as a trial or a paid
// period, until when, and the payments recorded for it. Payments are made
// outside the app (cash, transfer) and only written down here.
// The rules (warning 7 days before the end, read-only after it) live on the
// server: the app shows what /auth/me and the company routes answer.
// ─────────────────────────────────────────────────────────────────────────
import { API_BASE_URL } from "@/lib/config";
import { ensureOk } from "@/lib/errors";
import type { Feature, Page, SubscriptionState } from "@/lib/auth";

export interface Pack {
  _id: string;
  name: string;
  description?: string;
  /** Price of one billing period */
  price: number;
  currency: string;
  periodMonths: number;
  features: Feature[];
  disabledPages: Page[];
  /** null: no limit */
  maxEmployees: number | null;
  trialDays: number;
  /** false: archived, can't be given to a company any more */
  active: boolean;
}

export type PackInput = Omit<Pack, "_id">;

export interface SubscriptionPayment {
  _id: string;
  date: string; // "YYYY-MM-DD"
  amount: number;
  method?: string;
  reference?: string;
  note?: string;
  months: number;
  recordedBy: string;
}

export interface CompanySubscription {
  packId: string | null;
  packName: string;
  status: "trial" | "active";
  startsAt: string;
  endsAt: string;
  maxEmployees: number | null;
  price: number | null;
  currency: string | null;
  periodMonths: number | null;
  note?: string;
  payments: SubscriptionPayment[];
}

/** What the subscription routes answer: the company with its subscription and where it stands. */
export interface CompanyBilling {
  _id: string;
  features: Feature[];
  disabledPages: Page[];
  subscription: CompanySubscription | null;
  subscriptionState: SubscriptionState;
}

export interface SubscriptionInput {
  packId?: string;
  kind?: "trial" | "active";
  startsAt?: string;
  endsAt?: string;
  trialDays?: number | "";
  months?: number | "";
  maxEmployees?: number | "";
  note?: string;
}

export interface PaymentInput {
  amount: number | "";
  date?: string;
  method?: string;
  reference?: string;
  note?: string;
  months?: number | "";
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  await ensureOk(res);
  return (await res.json()) as T;
}

export async function fetchPacks(): Promise<Pack[]> {
  const res = await fetch(`${API_BASE_URL}/packs`);
  await ensureOk(res);
  const data = await res.json();
  return Array.isArray(data) ? (data as Pack[]) : [];
}

export const createPack = (input: Partial<PackInput>) => send<Pack>("/packs", "POST", input);

export const updatePack = (id: string, input: Partial<PackInput>) => send<Pack>(`/packs/${id}`, "PATCH", input);

export const deletePack = (id: string) => send<{ deleted: boolean }>(`/packs/${id}`, "DELETE");

/** Gives a company a pack, as a trial or a paid period, or changes its dates. */
export const setSubscription = (companyId: string, input: SubscriptionInput) =>
  send<CompanyBilling>(`/companies/${companyId}/subscription`, "PUT", input);

/** Records a payment received outside the app; its months extend the subscription. */
export const addPayment = (companyId: string, input: PaymentInput) =>
  send<CompanyBilling>(`/companies/${companyId}/subscription/payments`, "POST", input);

/** Removes the subscription: no end date and no limit any more. */
export const clearSubscription = (companyId: string) =>
  send<CompanyBilling>(`/companies/${companyId}/subscription`, "DELETE");

/**
 * Where a subscription stands, worked out from its end date for the super
 * admin's list (the same rule as the server: warning in the last 7 days,
 * expired after the end). Company users get theirs from the server.
 */
export function standingOf(
  subscription: Pick<CompanySubscription, "status" | "endsAt"> | null | undefined,
  now: Date = new Date()
): { status: "none" | "trial" | "active" | "expired"; daysLeft: number | null; endingSoon: boolean } {
  if (!subscription?.endsAt) return { status: "none", daysLeft: null, endingSoon: false };
  const left = new Date(subscription.endsAt).getTime() - now.getTime();
  if (Number.isNaN(left)) return { status: "none", daysLeft: null, endingSoon: false };
  if (left < 0) return { status: "expired", daysLeft: 0, endingSoon: false };
  return {
    status: subscription.status === "trial" ? "trial" : "active",
    daysLeft: Math.floor(left / 86_400_000),
    endingSoon: left <= 7 * 86_400_000,
  };
}
