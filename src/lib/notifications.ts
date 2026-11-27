// ─────────────────────────────────────────────────────────────────────────
// Notifications (the bell in the header)
//
// The server works out what is worth telling an admin or a manager right
// now (GET /notifications) and remembers what each user has read. It sends
// the facts; the sentences are written here, in the user's language.
// ─────────────────────────────────────────────────────────────────────────
import { API_BASE_URL } from "@/lib/config";
import { ensureOk, fetchJson } from "@/lib/errors";
import { locale, t } from "@/lib/i18n";

export type NotificationType =
  | "late"
  | "missing"
  | "absent"
  | "monthClosing"
  | "subscriptionEnding"
  | "subscriptionEnded"
  | "deviceSilent";

export interface NotificationItem {
  key: string;
  type: NotificationType;
  level: "info" | "warning" | "danger";
  params: Record<string, string | number | string[] | undefined>;
  /** The page where the matter is dealt with */
  href: string;
  read: boolean;
}

export interface NotificationList {
  items: NotificationItem[];
  unread: number;
}

export async function fetchNotifications(): Promise<NotificationList> {
  const data = await fetchJson<Partial<NotificationList>>(`${API_BASE_URL}/notifications`);
  const items = Array.isArray(data.items) ? data.items : [];
  return { items, unread: items.filter((i) => !i.read).length };
}

export async function markNotificationsRead(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const res = await fetch(`${API_BASE_URL}/notifications/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keys }),
  });
  await ensureOk(res);
}

const dayText = (iso: unknown) =>
  new Date(String(iso)).toLocaleDateString(locale(), { day: "numeric", month: "long" });

const timeText = (iso: unknown) =>
  new Date(String(iso)).toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const monthText = (month: unknown) =>
  new Date(`${String(month)}-01T00:00:00`).toLocaleDateString(locale(), { month: "long", year: "numeric" });

/** Up to three names, then "and N more". */
function people(names: unknown): string {
  const list = Array.isArray(names) ? names : [];
  if (list.length <= 3) return list.join(", ");
  return t("{names} and {count} more", { names: list.slice(0, 3).join(", "), count: list.length - 3 });
}

/** The sentence of a notification: a short title and a line of detail. */
export function notificationText(item: NotificationItem): { title: string; detail: string } {
  const p = item.params;
  const count = Number(p.count ?? 0);
  switch (item.type) {
    case "missing":
      return {
        title: count === 1 ? t("1 person has not clocked in") : t("{count} people have not clocked in", { count }),
        detail: t("Planned today, shift started: {names}", { names: people(p.names) }),
      };
    case "late":
      return {
        title: count === 1 ? t("1 late arrival today") : t("{count} late arrivals today", { count }),
        detail: people(p.names),
      };
    case "absent":
      return {
        title: count === 1 ? t("1 absence today") : t("{count} absences today", { count }),
        detail: people(p.names),
      };
    case "monthClosing":
      return {
        title: t("{month} closes soon", { month: monthText(p.month) }),
        detail: t("It closes automatically on {date}. After that its hours and pay can no longer be changed.", {
          date: dayText(p.closesAt),
        }),
      };
    case "subscriptionEnding":
      return {
        title:
          p.kind === "trial"
            ? t("Your free trial ends on {date}", { date: dayText(p.endsAt) })
            : t("Your subscription ends on {date}", { date: dayText(p.endsAt) }),
        detail: t("After that the account becomes read-only. Contact us to renew."),
      };
    case "subscriptionEnded":
      return {
        title: p.kind === "trial" ? t("Your free trial has ended.") : t("Your subscription has ended."),
        detail: t("The account is read-only until it is renewed."),
      };
    case "deviceSilent":
      return {
        title: t("The clocking machine {name} is not responding", { name: String(p.name ?? "") }),
        detail: t("Last contact: {date}. Check its power and network.", { date: timeText(p.lastSeenAt) }),
      };
    default:
      return { title: t("Notification"), detail: "" };
  }
}
