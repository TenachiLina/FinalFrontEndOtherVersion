"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { canOpen } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/notify";
import { locale, t } from "@/lib/i18n";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import {
  answerCorrection,
  CORRECTIONS_CHANGED,
  describeSnapshot,
  FIX_PAGE,
  KIND_LABELS,
  listCorrections,
  STATUS_LABELS,
  type Correction,
  type CorrectionStatus,
  type StatusFilter,
} from "@/lib/corrections";

const FILTERS: [StatusFilter, string][] = [
  ["pending", "Waiting"],
  ["corrected", "Corrected"],
  ["rejected", "Rejected"],
  ["all", "All"],
];

const STATUS_CLASS: Record<CorrectionStatus, string> = {
  pending: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-orange-400",
  corrected: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500",
  rejected: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400",
};

/** "Mon, Nov 2, 2026" for "2026-11-02", whatever the browser's time zone. */
function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? day
    : d.toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Mistakes employees reported from the mobile app. A manager fixes the record
 * on its usual page, then marks the request corrected (or rejects it), with
 * an optional answer the employee reads in the app.
 */
export default function CorrectionsView() {
  const { user, company } = useAuth();
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [rows, setRows] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [answering, setAnswering] = useState<{ row: Correction; status: "corrected" | "rejected" } | null>(null);
  const [reply, setReply] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (status: StatusFilter) => {
    setLoading(true);
    try {
      setRows(await listCorrections(status));
      setError(null);
    } catch (err) {
      setError(friendlyError(err, "Couldn't load the correction requests"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  const openAnswer = (row: Correction, status: "corrected" | "rejected") => {
    setReply("");
    setAnswering({ row, status });
  };

  const submitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answering) return;
    setSaving(true);
    try {
      await answerCorrection(answering.row.id, answering.status, reply);
      toast.success(
        answering.status === "corrected"
          ? t("Marked as corrected. {name} will see it in the app.", { name: answering.row.employee?.name ?? "" })
          : t("Request rejected. {name} will see it in the app.", { name: answering.row.employee?.name ?? "" })
      );
      setAnswering(null);
      window.dispatchEvent(new Event(CORRECTIONS_CHANGED));
      await load(filter);
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't save the answer"));
    } finally {
      setSaving(false);
    }
  };

  const canFix = (row: Correction) => !!user && canOpen(FIX_PAGE[row.kind].path, user, company);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t("Employees report mistakes in their worked time, advances and bonuses from the mobile app. Fix the record on its page, then mark the request as corrected, or reject it. The employee sees your answer in the app.")}
      </p>

      <div role="tablist" aria-label={t("Show")} className="flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={filter === value}
            onClick={() => setFilter(value)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              filter === value
                ? "bg-brand-500 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
            }`}
          >
            {t(label)}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/15 dark:text-error-500">
          {error}
        </p>
      )}

      {loading && <p className="py-6 text-center text-sm text-gray-500">{t("Loading…")}</p>}

      {!loading && !error && rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          {filter === "pending" ? t("No request is waiting. All done!") : t("No requests here.")}
        </p>
      )}

      {!loading && (
        <ul className="space-y-3">
          {rows.map((row) => {
            const snapshot = describeSnapshot(row);
            const fix = FIX_PAGE[row.kind];
            return (
              <li
                key={row.id}
                data-testid={`correction-${row.id}`}
                className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-800 dark:text-white/90">
                      {row.employee?.name ?? "—"}{" "}
                      {row.employee && <span className="text-sm font-normal text-gray-500">#{row.employee.empNumber}</span>}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {t(KIND_LABELS[row.kind])} · {formatDay(row.date)}
                      {row.recordId == null && <> · <strong>{t("Missing record")}</strong></>}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASS[row.status]}`}>
                    {t(STATUS_LABELS[row.status])}
                  </span>
                </div>

                {snapshot && (
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    {t("The app showed: {what}", { what: snapshot })}
                  </p>
                )}
                <blockquote className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-800 dark:bg-white/[0.03] dark:text-white/90">
                  {row.message}
                </blockquote>
                <p className="mt-1 text-xs text-gray-400">{t("Sent {when}", { when: formatWhen(row.createdAt) })}</p>

                {row.status !== "pending" && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    {t("{status} by {name}", { status: t(STATUS_LABELS[row.status]), name: row.handledBy ?? "—" })}
                    {row.handledAt && <span className="text-gray-400"> · {formatWhen(row.handledAt)}</span>}
                    {row.reply && <span className="block italic">“{row.reply}”</span>}
                  </p>
                )}

                {row.status === "pending" && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {canFix(row) && (
                      <Link href={fix.path} className="text-sm font-medium text-brand-500 hover:underline">
                        {t(fix.label)} →
                      </Link>
                    )}
                    <span className="ms-auto flex gap-2">
                      <button
                        type="button"
                        onClick={() => openAnswer(row, "rejected")}
                        className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-white/[0.03]"
                      >
                        {t("Reject")}
                      </button>
                      <Button size="sm" onClick={() => openAnswer(row, "corrected")}>
                        {t("Mark as corrected")}
                      </Button>
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal isOpen={!!answering} onClose={() => setAnswering(null)} className="max-w-[480px] p-6">
        <form onSubmit={submitAnswer} className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {answering?.status === "corrected" ? t("Mark as corrected") : t("Reject the request")}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {answering?.status === "corrected"
              ? t("Check that you fixed the record first. You can add a word for the employee.")
              : t("Say why, so the employee understands.")}
          </p>
          <div>
            <label htmlFor="correction-reply" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
              {t("Answer for the employee (optional)")}
            </label>
            <textarea
              id="correction-reply"
              rows={3}
              maxLength={500}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="rounded-lg px-4 py-3 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03]"
              onClick={() => setAnswering(null)}
            >
              {t("Cancel")}
            </button>
            <Button size="sm" disabled={saving}>
              {saving ? t("Saving…") : answering?.status === "corrected" ? t("Mark as corrected") : t("Reject")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
