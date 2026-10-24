import { locale, t } from "@/lib/i18n";

/** A login session as the backend shows it (see auth/sessions.service.ts). */
export interface LoginSession {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  ip?: string;
  lastIp?: string;
  device?: string;
  userAgent?: string;
  createdAt: string;
  lastSeenAt?: string;
  // Id of the access token in use right now, and when it expires
  accessTokenId: string;
  accessTokenExpiresAt: string;
  // How many times the tokens were renewed during the session
  rotationCount: number;
  rotatedAt?: string;
  idleExpiresAt: string;
  expiresAt: string;
  active: boolean;
  endedAt?: string | null;
  endReason?: string;
  // Only in your own list: the session of this browser
  current?: boolean;
}

export const END_REASONS: Record<string, string> = {
  logout: "Signed out",
  logout_others: "Signed out from another device",
  revoked_by_user: "Ended by the user",
  revoked_by_admin: "Ended by an admin",
  password_changed: "Password changed",
  password_reset: "Password reset by an admin",
  role_changed: "Role changed",
  account_disabled: "Account disabled",
  account_deleted: "Account deleted",
  refresh_token_reused: "Stolen token detected",
  expired: "Expired",
  idle_timeout: "Ended after inactivity",
};

export function formatWhen(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(locale(), {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function endReasonLabel(reason?: string) {
  return reason ? t(END_REASONS[reason] ?? reason) : "";
}
