"use client";
import React, { useEffect, useState } from "react";
import {
  addPayment,
  clearSubscription,
  CompanyBilling,
  CompanySubscription,
  fetchPacks,
  Pack,
  setSubscription,
  standingOf,
} from "@/lib/billing";
import { priceLabel } from "./PacksView";
import { friendlyError } from "@/lib/errors";
import { locale, t } from "@/lib/i18n";
import { confirmDialog, toast } from "@/lib/notify";

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const labelClass = "mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400";
const buttonClass =
  "rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });

/** "Trial · 9 days left", "Active · ends in 3 days", "Ended", "No subscription" */
export function standingLabel(subscription: Pick<CompanySubscription, "status" | "endsAt"> | null | undefined): string {
  const s = standingOf(subscription);
  if (s.status === "none") return t("No subscription");
  if (s.status === "expired") return t("Ended");
  const kind = s.status === "trial" ? t("Trial") : t("Active");
  return `${kind} · ${t("{days} days left", { days: s.daysLeft ?? 0 })}`;
}

interface Props {
  companyId: string;
  subscription: CompanySubscription | null;
  /** The company after a change (its features and pages follow the pack) */
  onChanged: (company: CompanyBilling) => void;
}

/**
 * Super admin: a company's subscription. Choose a pack and start a trial or
 * a paid period, record the payments received outside the app, or remove
 * the subscription.
 */
export default function CompanySubscriptionPanel({ companyId, subscription, onChanged }: Props) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [packId, setPackId] = useState(subscription?.packId ?? "");
  const [kind, setKind] = useState<"trial" | "active">(subscription?.status ?? "trial");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [amount, setAmount] = useState("");
  const [months, setMonths] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");

  useEffect(() => {
    let current = true;
    fetchPacks()
      .then((list) => {
        if (current) setPacks(list);
      })
      .catch((err) => {
        if (current) setError(friendlyError(err, "Couldn't load the packs"));
      });
    return () => {
      current = false;
    };
  }, []);

  const run = async (action: () => Promise<CompanyBilling>, done: string, failed: string) => {
    setBusy(true);
    setError("");
    try {
      onChanged(await action());
      toast.success(done);
      return true;
    } catch (err) {
      setError(friendlyError(err, failed));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(
      () =>
        setSubscription(companyId, {
          // Choosing the pack again applies its features, pages and limit
          ...(packId ? { packId } : {}),
          kind,
          ...(endsAt ? { endsAt } : {}),
        }),
      "Subscription saved.",
      "Couldn't save the subscription"
    ).then((ok) => {
      if (ok) setEndsAt("");
    });

  const pay = async () => {
    const ok = await run(
      () =>
        addPayment(companyId, {
          amount: amount === "" ? "" : Number(amount),
          ...(months === "" ? {} : { months: Number(months) }),
          ...(method ? { method } : {}),
          ...(reference ? { reference } : {}),
        }),
      "Payment recorded.",
      "Couldn't record the payment"
    );
    if (ok) {
      setAmount("");
      setMonths("");
      setMethod("");
      setReference("");
    }
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: t("Remove the subscription?"),
      message: t("The company keeps working with no end date and no employee limit. Its recorded payments are deleted."),
      confirmLabel: t("Remove"),
      danger: true,
    });
    if (ok) await run(() => clearSubscription(companyId), "Subscription removed.", "Couldn't remove the subscription");
  };

  const selectable = packs.filter((p) => p.active || p._id === packId);
  const chosen = packs.find((p) => p._id === packId);
  const standing = standingOf(subscription);

  return (
    <fieldset className="space-y-4 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <legend className="px-1 text-sm font-medium text-gray-700 dark:text-gray-300">{t("Subscription")}</legend>

      <p className="text-sm text-gray-700 dark:text-gray-300" data-testid="subscription-standing">
        {subscription ? (
          <>
            <span className="font-semibold">{subscription.packName || t("Custom")}</span> · {standingLabel(subscription)}
            {" · "}
            {t("{start} → {end}", { start: day(subscription.startsAt), end: day(subscription.endsAt) })}
            {subscription.maxEmployees != null && ` · ${t("Up to {count} employees", { count: subscription.maxEmployees })}`}
            {standing.status === "expired" && (
              <span className="ms-2 rounded-full bg-error-50 px-2 py-0.5 text-xs font-medium text-error-600 dark:bg-error-500/10">
                {t("Read-only")}
              </span>
            )}
          </>
        ) : (
          t("No subscription: this company has no end date and no limit.")
        )}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass} htmlFor="sub-pack">{t("Pack")}</label>
          <select id="sub-pack" className={inputClass} value={packId} onChange={(e) => setPackId(e.target.value)}>
            <option value="">{subscription ? t("Keep the current pack") : t("Choose a pack")}</option>
            {selectable.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} ({priceLabel(p)})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="sub-kind">{t("Type")}</label>
          <select id="sub-kind" className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as "trial" | "active")}>
            <option value="trial">{t("Free trial")}</option>
            <option value="active">{t("Paid subscription")}</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="sub-end">{t("Ends on (optional)")}</label>
          <input id="sub-end" type="date" className={inputClass} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {chosen
          ? kind === "trial"
            ? t("Without an end date: a trial of {days} days from today. The pack's features, pages and employee limit are applied to the company.", { days: chosen.trialDays || 14 })
            : t("Without an end date: {months} month(s) from today. The pack's features, pages and employee limit are applied to the company.", { months: chosen.periodMonths })
          : t("Choosing a pack applies its features, pages and employee limit to the company.")}
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={buttonClass} disabled={busy || (!packId && !subscription)} onClick={save}>
          {subscription ? t("Save subscription") : t("Start subscription")}
        </button>
        {subscription && (
          <button type="button" className="text-sm font-medium text-error-500 hover:underline" disabled={busy} onClick={remove}>
            {t("Remove subscription")}
          </button>
        )}
      </div>

      {subscription && (
        <div className="space-y-3 border-t border-gray-100 pt-3 dark:border-gray-800">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("Payments received")}</h4>
          {subscription.payments.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("No payment recorded yet.")}</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
              {subscription.payments.map((p) => (
                <li key={p._id} className="flex flex-wrap justify-between gap-2 py-1.5 text-gray-700 dark:text-gray-300">
                  <span>
                    {p.date} · <span className="font-medium">{p.amount.toLocaleString("fr-FR")} {subscription.currency ?? ""}</span>
                    {p.months > 0 && ` · ${t("+{months} month(s)", { months: p.months })}`}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">
                    {[p.method, p.reference, p.recordedBy].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={labelClass} htmlFor="pay-amount">{t("Amount")}</label>
              <input id="pay-amount" type="number" min={0} step="any" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="pay-months">{t("Months added")}</label>
              <input id="pay-months" type="number" min={0} max={36} placeholder={String(subscription.periodMonths ?? 1)} className={inputClass} value={months} onChange={(e) => setMonths(e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="pay-method">{t("Paid by")}</label>
              <input id="pay-method" className={inputClass} maxLength={40} placeholder={t("Cash, transfer…")} value={method} onChange={(e) => setMethod(e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="pay-reference">{t("Reference")}</label>
              <input id="pay-reference" className={inputClass} maxLength={80} value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>
          <button type="button" className={buttonClass} disabled={busy || amount === ""} onClick={pay}>
            {t("Record payment")}
          </button>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t("Payments are made outside the app. Recording one adds its months after the current end date (or from today if it has already ended) and turns a trial into a paid subscription.")}
          </p>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-error-500">{error}</p>}
    </fieldset>
  );
}
