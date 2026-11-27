"use client";
import React, { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/button/Button";
import LoadError from "@/components/ui/feedback/LoadError";
import { Modal } from "@/components/ui/modal";
import PageChecks from "./PageChecks";
import { FEATURE_LABELS } from "@/lib/auth";
import type { Feature, Page } from "@/lib/auth";
import { createPack, deletePack, fetchPacks, Pack, updatePack } from "@/lib/billing";
import { friendlyError } from "@/lib/errors";
import { t } from "@/lib/i18n";
import { confirmDialog, toast } from "@/lib/notify";

const ALL_FEATURES = Object.keys(FEATURE_LABELS) as Feature[];

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30";
const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";
const cancelClass =
  "rounded-lg px-4 py-3 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03]";
const linkClass = "text-sm font-medium text-brand-500 hover:underline";

interface Form {
  name: string;
  description: string;
  price: string;
  currency: string;
  periodMonths: string;
  trialDays: string;
  /** Empty: no limit */
  maxEmployees: string;
  features: Feature[];
  disabledPages: Page[];
}

const emptyForm: Form = {
  name: "",
  description: "",
  price: "0",
  currency: "DA",
  periodMonths: "1",
  trialDays: "14",
  maxEmployees: "",
  features: ALL_FEATURES,
  disabledPages: [],
};

const toForm = (p: Pack): Form => ({
  name: p.name,
  description: p.description ?? "",
  price: String(p.price),
  currency: p.currency,
  periodMonths: String(p.periodMonths),
  trialDays: String(p.trialDays),
  maxEmployees: p.maxEmployees == null ? "" : String(p.maxEmployees),
  features: p.features,
  disabledPages: p.disabledPages ?? [],
});

/** "5 000 DA / month", "30 000 DA / 6 months", "Free" */
export function priceLabel(p: Pick<Pack, "price" | "currency" | "periodMonths">): string {
  if (!p.price) return t("Free");
  const amount = `${p.price.toLocaleString("fr-FR")} ${p.currency}`;
  return p.periodMonths === 1
    ? t("{amount} / month", { amount })
    : t("{amount} / {months} months", { amount, months: p.periodMonths });
}

/** Super admin: the packs (offers) that can be given to companies. */
export default function PacksView() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // null: closed; a pack: editing it; "new": adding one
  const [editing, setEditing] = useState<Pack | "new" | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPacks(await fetchPacks());
    } catch (err) {
      setError(friendlyError(err, "Couldn't load the packs"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = (pack: Pack | "new") => {
    setEditing(pack);
    setForm(pack === "new" ? emptyForm : toForm(pack));
    setFormError("");
  };

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setFormError("");
    const body = {
      name: form.name,
      description: form.description,
      price: Number(form.price),
      currency: form.currency,
      periodMonths: Number(form.periodMonths),
      trialDays: Number(form.trialDays),
      maxEmployees: form.maxEmployees === "" ? null : Number(form.maxEmployees),
      features: form.features,
      // A page of a feature that is off has nothing to switch off
      disabledPages: form.disabledPages,
    };
    try {
      if (editing === "new") await createPack(body);
      else await updatePack(editing._id, body);
      setEditing(null);
      toast.success(editing === "new" ? "Pack added." : "Pack saved.");
      await load();
    } catch (err) {
      setFormError(friendlyError(err, "Couldn't save the pack"));
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (pack: Pack, active: boolean) => {
    try {
      await updatePack(pack._id, { active });
      await load();
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't save the pack"));
    }
  };

  const remove = async (pack: Pack) => {
    const ok = await confirmDialog({
      title: t("Delete the pack {name}?", { name: pack.name }),
      message: t("A pack used by a company can't be deleted: archive it instead."),
      confirmLabel: t("Delete"),
      danger: true,
    });
    if (!ok) return;
    try {
      await deletePack(pack._id);
      toast.success("Pack deleted.");
      await load();
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't delete the pack"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("A pack is an offer: what a company gets, and for how much. Give one to a company from the Companies page, as a free trial or a paid subscription.")}
        </p>
        <Button size="sm" onClick={() => open("new")}>{t("Add pack")}</Button>
      </div>

      {error && <LoadError title="Couldn't load the packs" message={error} onRetry={load} />}
      {loading && <p className="text-sm text-gray-500 dark:text-gray-400">{t("Loading…")}</p>}
      {!loading && !error && packs.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          {t("No packs yet. Add the first one to start offering trials and subscriptions.")}
        </p>
      )}

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {packs.map((p) => (
          <li
            key={p._id}
            aria-label={p.name}
            className={`flex flex-col rounded-2xl border p-5 ${
              p.active
                ? "border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
                : "border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-transparent"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{p.name}</h3>
              {!p.active && (
                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  {t("Archived")}
                </span>
              )}
            </div>
            <p className="mt-1 text-2xl font-bold text-brand-500">{priceLabel(p)}</p>
            {p.description && <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{p.description}</p>}
            <dl className="mt-3 space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">{t("Employees")}</dt>
                <dd>{p.maxEmployees == null ? t("No limit") : t("Up to {count}", { count: p.maxEmployees })}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">{t("Free trial")}</dt>
                <dd>{p.trialDays ? t("{days} days", { days: p.trialDays }) : t("None")}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">{t("Features")}</dt>
                <dd className="text-end">
                  {p.features.length === ALL_FEATURES.length
                    ? t("All")
                    : p.features.map((f) => t(FEATURE_LABELS[f])).join(", ") || t("None")}
                </dd>
              </div>
              {p.disabledPages.length > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500 dark:text-gray-400">{t("Pages switched off")}</dt>
                  <dd>{p.disabledPages.length}</dd>
                </div>
              )}
            </dl>
            <div className="mt-4 flex flex-wrap gap-4 border-t border-gray-100 pt-3 dark:border-gray-800">
              <button type="button" className={linkClass} onClick={() => open(p)}>{t("Edit")}</button>
              <button type="button" className={linkClass} onClick={() => setActive(p, !p.active)}>
                {p.active ? t("Archive") : t("Restore")}
              </button>
              <button type="button" className="text-sm font-medium text-error-500 hover:underline" onClick={() => remove(p)}>
                {t("Delete")}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} className="max-w-[640px] p-6">
        <form onSubmit={save} className="max-h-[85vh] space-y-4 overflow-y-auto pe-1">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {editing === "new" ? t("Add pack") : t("Edit pack")}
          </h3>
          <div>
            <label className={labelClass} htmlFor="pack-name">{t("Pack name")}</label>
            <input id="pack-name" className={inputClass} required maxLength={60} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="pack-description">{t("Description")}</label>
            <input id="pack-description" className={inputClass} maxLength={300} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass} htmlFor="pack-price">{t("Price")}</label>
              <input id="pack-price" type="number" min={0} step="any" className={inputClass} value={form.price} onChange={(e) => set("price", e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="pack-currency">{t("Currency label")}</label>
              <input id="pack-currency" className={inputClass} maxLength={8} value={form.currency} onChange={(e) => set("currency", e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="pack-period">{t("Billed every (months)")}</label>
              <input id="pack-period" type="number" min={1} max={36} className={inputClass} value={form.periodMonths} onChange={(e) => set("periodMonths", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="pack-trial">{t("Free trial (days)")}</label>
              <input id="pack-trial" type="number" min={0} max={365} className={inputClass} value={form.trialDays} onChange={(e) => set("trialDays", e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="pack-employees">{t("Maximum employees")}</label>
              <input id="pack-employees" type="number" min={1} placeholder={t("No limit")} className={inputClass} value={form.maxEmployees} onChange={(e) => set("maxEmployees", e.target.value)} />
            </div>
          </div>
          <div>
            <span className={labelClass}>{t("Features")}</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ALL_FEATURES.map((f) => (
                <label key={f} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.features.includes(f)}
                    onChange={(e) =>
                      set("features", e.target.checked ? [...form.features, f] : form.features.filter((x) => x !== f))
                    }
                  />
                  {t(FEATURE_LABELS[f])}
                </label>
              ))}
            </div>
          </div>
          <div>
            <span className={labelClass}>{t("Pages")}</span>
            <PageChecks features={form.features} value={form.disabledPages} onChange={(pages) => set("disabledPages", pages)} />
          </div>
          {formError && <p role="alert" className="text-sm text-error-500">{formError}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" className={cancelClass} onClick={() => setEditing(null)}>{t("Cancel")}</button>
            <Button size="sm" disabled={saving}>{saving ? t("Saving…") : t("Save")}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
