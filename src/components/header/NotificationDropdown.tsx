"use client";
import Link from "next/link";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { BellIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/context/AuthContext";
import { canOpen } from "@/lib/auth";
import { t } from "@/lib/i18n";
import {
  fetchNotifications,
  markNotificationsRead,
  NotificationItem,
  notificationText,
} from "@/lib/notifications";

/** How often the bell asks the server again while the page is open. */
export const REFRESH_MS = 60_000;

const DOT: Record<NotificationItem["level"], string> = {
  info: "bg-blue-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
};

/**
 * The bell: what is worth knowing right now (late arrivals, people who have
 * not clocked in, a month about to close, the subscription, a silent
 * clocking machine). For admins and managers working in a company.
 */
export default function NotificationDropdown() {
  const { user, company } = useAuth();
  const enabled = !!company && (user?.role === "admin" || user?.role === "manager" || user?.role === "superadmin");
  const [loaded, setItems] = useState<NotificationItem[]>([]);
  // Nothing is shown to someone the bell is not for, whatever was loaded before
  const items = enabled ? loaded : [];
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setItems((await fetchNotifications()).items);
    } catch {
      // The bell is extra: a failed refresh keeps what is shown
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [enabled, load, company?.id]);

  // Close on a click outside or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!enabled || !user) return null;

  const unread = items.filter((i) => !i.read);

  const toggle = () => {
    const opening = !open;
    setOpen(opening);
    // Opening the list is reading it: the badge clears, the list stays
    if (opening && unread.length) {
      const keys = unread.map((i) => i.key);
      markNotificationsRead(keys)
        .then(() => setItems((prev) => prev.map((i) => (keys.includes(i.key) ? { ...i, read: true } : i))))
        .catch(() => undefined);
    }
  };

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={
          unread.length ? t("Notifications, {count} unread", { count: unread.length }) : t("Notifications")
        }
        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
      >
        <BellIcon className="h-5 w-5" aria-hidden />
        {unread.length > 0 && (
          <span
            data-testid="notification-badge"
            className="absolute -end-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white"
          >
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="region"
          aria-label={t("Notifications")}
          className="absolute end-0 z-50 mt-3 w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900"
        >
          <h5 className="border-b border-gray-100 px-2 pb-2 text-base font-semibold text-gray-800 dark:border-gray-800 dark:text-white/90">
            {t("Notifications")}
          </h5>
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              {t("Nothing to report right now.")}
            </p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
              {items.map((item) => {
                const { title, detail } = notificationText(item);
                const body = (
                  <>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[item.level]}`} aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-800 dark:text-white/90">{title}</span>
                      {detail && <span className="block text-sm text-gray-500 dark:text-gray-400">{detail}</span>}
                    </span>
                  </>
                );
                const row = "flex items-start gap-3 rounded-lg px-2 py-2.5";
                return (
                  <li key={item.key}>
                    {canOpen(item.href, user, company) ? (
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={`${row} hover:bg-gray-50 dark:hover:bg-white/[0.03]`}
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className={row}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
