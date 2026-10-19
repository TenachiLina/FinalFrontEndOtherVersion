"use client";

import React, { useEffect, useRef, useSyncExternalStore } from "react";
import {
  ToastKind,
  answerConfirm,
  dismissToast,
  getConfirm,
  getToasts,
  subscribe,
} from "@/lib/notify";
import { t } from "@/lib/i18n";

const EMPTY: never[] = [];

const STYLES: Record<ToastKind, { box: string; icon: string; symbol: string }> = {
  success: {
    box: "border-success-200 bg-success-50 dark:border-success-500/30 dark:bg-gray-900",
    icon: "bg-success-500",
    symbol: "✓",
  },
  error: {
    box: "border-error-200 bg-error-50 dark:border-error-500/30 dark:bg-gray-900",
    icon: "bg-error-500",
    symbol: "!",
  },
  warning: {
    box: "border-warning-200 bg-warning-50 dark:border-warning-500/30 dark:bg-gray-900",
    icon: "bg-warning-500",
    symbol: "!",
  },
  info: {
    box: "border-brand-200 bg-brand-50 dark:border-brand-500/30 dark:bg-gray-900",
    icon: "bg-brand-500",
    symbol: "i",
  },
};

function Toasts() {
  const toasts = useSyncExternalStore(subscribe, getToasts, () => EMPTY);
  return (
    <div
      className="pointer-events-none fixed end-4 top-4 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3"
      style={{ zIndex: 100000 }}
    >
      {toasts.map((item) => {
        const s = STYLES[item.kind];
        return (
          <div
            key={item.id}
            role={item.kind === "error" || item.kind === "warning" ? "alert" : "status"}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-theme-lg animate-[toast-in_0.2s_ease-out] ${s.box}`}
          >
            <span
              aria-hidden
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${s.icon}`}
            >
              {s.symbol}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              {item.title && <p className="font-semibold text-gray-800 dark:text-white/90">{item.title}</p>}
              <p className="text-gray-700 dark:text-gray-300">{item.message}</p>
            </div>
            <button
              type="button"
              aria-label={t("Dismiss")}
              onClick={() => dismissToast(item.id)}
              className="-m-1 rounded p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ConfirmDialog() {
  const req = useSyncExternalStore(subscribe, getConfirm, () => null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!req) return;
    // Risky actions start on Cancel so pressing Enter can't delete by accident
    (req.danger ? cancelRef : confirmRef).current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") answerConfirm(req.id, false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [req]);

  if (!req) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 100000 }}>
      <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => answerConfirm(req.id, false)} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`confirm-title-${req.id}`}
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-theme-xl dark:bg-gray-900"
      >
        <h3 id={`confirm-title-${req.id}`} className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {t(req.title)}
        </h3>
        {req.message && <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{t(req.message)}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => answerConfirm(req.id, false)}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-white/[0.03]"
          >
            {t(req.cancelLabel ?? "Cancel")}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => answerConfirm(req.id, true)}
            className={`rounded-lg px-4 py-2.5 text-sm font-medium text-white ${
              req.danger ? "bg-error-500 hover:bg-error-600" : "bg-brand-500 hover:bg-brand-600"
            }`}
          >
            {t(req.confirmLabel ?? (req.danger ? "Delete" : "Confirm"))}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Draws toasts and confirm dialogs (see lib/notify.ts). Mounted once. */
export default function FeedbackHost() {
  return (
    <>
      <Toasts />
      <ConfirmDialog />
    </>
  );
}
