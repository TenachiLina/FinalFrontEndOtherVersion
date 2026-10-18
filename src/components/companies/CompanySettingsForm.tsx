"use client";

import React, { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/config";
import { CompanySettings } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";
import Button from "@/components/ui/button/Button";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";
const hintClass = "mt-1 text-xs text-gray-500 dark:text-gray-400";

export default function CompanySettingsForm() {
  const { company, refreshCompany } = useAuth();
  const [name, setName] = useState("");
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (company) {
      setName(company.name);
      setSettings({ ...company.settings });
    }
  }, [company]);

  if (!settings) return null;

  const set = <K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) =>
    setSettings({ ...settings, [key]: value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/company`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, settings }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? "Could not save settings");
      }
      await refreshCompany();
      setMessage({ ok: true, text: "Settings saved." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not save settings" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
      <section className="space-y-4">
        <h4 className="font-semibold text-gray-800 dark:text-white/90">General</h4>
        <div>
          <label className={labelClass} htmlFor="company-name">Company name</label>
          <input id="company-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="currency">Currency label</label>
            <input id="currency" className={inputClass} value={settings.currency} onChange={(e) => set("currency", e.target.value)} />
            <p className={hintClass}>Shown next to amounts, e.g. DA, EUR, MAD.</p>
          </div>
          <div>
            <label className={labelClass} htmlFor="utc-offset">Clocking machine time zone</label>
            <input id="utc-offset" className={inputClass} value={settings.utcOffset} onChange={(e) => set("utcOffset", e.target.value)} />
            <p className={hintClass}>UTC offset, e.g. +01:00 for Algeria.</p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h4 className="font-semibold text-gray-800 dark:text-white/90">Payroll rules</h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass} htmlFor="hours-per-day">Hours per day</label>
            <input id="hours-per-day" type="number" min={1} max={24} step="0.5" className={inputClass} value={settings.hoursPerDay} onChange={(e) => set("hoursPerDay", Number(e.target.value))} />
          </div>
          <div>
            <label className={labelClass} htmlFor="days-per-month">Working days / month</label>
            <input id="days-per-month" type="number" min={1} max={31} className={inputClass} value={settings.workingDaysPerMonth} onChange={(e) => set("workingDaysPerMonth", Number(e.target.value))} />
          </div>
          <div>
            <label className={labelClass} htmlFor="advance-ratio">Weekly advance (%)</label>
            <input
              id="advance-ratio"
              type="number"
              min={1}
              max={100}
              className={inputClass}
              value={Math.round(settings.weeklyAdvanceRatio * 100)}
              onChange={(e) => set("weeklyAdvanceRatio", Number(e.target.value) / 100)}
            />
          </div>
        </div>
        <p className={hintClass}>
          Hourly rate = base salary ÷ hours per day ÷ working days. The weekly advance offered is this percentage of
          the week&apos;s earned pay, after consommation.
        </p>
      </section>

      {message && (
        <p role="status" className={`text-sm ${message.ok ? "text-success-600" : "text-error-500"}`}>
          {message.text}
        </p>
      )}
      <Button size="sm" disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>
    </form>
  );
}
