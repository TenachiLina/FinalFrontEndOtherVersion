"use client";

import React, { useState } from "react";
import { API_BASE_URL } from "@/lib/config";
import Button from "@/components/ui/button/Button";
import { t } from "@/lib/i18n";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

export default function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmNext, setConfirmNext] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirmNext) {
      setMessage({ ok: false, text: t("The new passwords do not match.") });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? t("Could not change password"));
      }
      setCurrent("");
      setNext("");
      setConfirmNext("");
      setMessage({ ok: true, text: t("Your password has been changed.") });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : t("Could not change password") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className={labelClass} htmlFor="current-password">{t("Current password")}</label>
        <input id="current-password" type="password" autoComplete="current-password" className={inputClass} value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div>
        <label className={labelClass} htmlFor="new-password">{t("New password (min 8 characters)")}</label>
        <input id="new-password" type="password" autoComplete="new-password" className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      <div>
        <label className={labelClass} htmlFor="confirm-password">{t("Confirm new password")}</label>
        <input id="confirm-password" type="password" autoComplete="new-password" className={inputClass} value={confirmNext} onChange={(e) => setConfirmNext(e.target.value)} />
      </div>
      {message && (
        <p role="status" className={`text-sm ${message.ok ? "text-success-600" : "text-error-500"}`}>
          {message.text}
        </p>
      )}
      <Button size="sm" disabled={saving}>{saving ? t("Saving…") : t("Change password")}</Button>
    </form>
  );
}
