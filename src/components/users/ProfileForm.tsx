"use client";
import React, { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/button/Button";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL } from "@/lib/config";
import { ensureOk, friendlyError } from "@/lib/errors";
import { t } from "@/lib/i18n";

export const MAX_PHOTO_BYTES = 200 * 1024;
const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super admin",
  admin: "Admin",
  manager: "Manager",
  employee: "Clock-in kiosk",
  staff: "Mobile app employee",
};

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Up to two initials of a name, for someone without a photo. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * The signed-in user's own profile: they change their name and photo.
 * The email, role and company are shown; an admin changes those.
 */
export default function ProfileForm() {
  const { user, company, refreshCompany } = useAuth();
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Fill the form once the account is known (and again after a save)
  const userId = user?.id;
  const savedName = user?.name ?? "";
  const savedPhoto = user?.photo ?? null;
  useEffect(() => {
    setName(savedName);
    setPhoto(savedPhoto);
  }, [userId, savedName, savedPhoto]);

  if (!user) return null;

  const changed = name.trim() !== savedName || photo !== savedPhoto;

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    if (!PHOTO_TYPES.includes(file.type)) {
      setMessage({ ok: false, text: t("Choose a PNG, JPEG or WebP image.") });
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setMessage({ ok: false, text: t("The photo must be at most 200 KB.") });
      return;
    }
    setPhoto(await readAsDataUrl(file));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setMessage({ ok: false, text: t("Name is required") });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), photo: photo ?? "" }),
      });
      await ensureOk(res);
      // The header and the menu show the new name and photo
      await refreshCompany();
      setMessage({ ok: true, text: t("Profile saved.") });
    } catch (err) {
      setMessage({ ok: false, text: friendlyError(err, "Couldn't save your profile") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="max-w-xl space-y-6">
      <div className="flex flex-wrap items-center gap-5">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={t("Your photo")} className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <span
            aria-hidden
            className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-100 text-2xl font-semibold text-brand-600 dark:bg-brand-500/20 dark:text-brand-300"
          >
            {initialsOf(name || savedName)}
          </span>
        )}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="rounded-lg px-3 py-2 text-sm font-medium text-brand-500 ring-1 ring-inset ring-brand-200 hover:bg-brand-50 dark:ring-brand-500/30 dark:hover:bg-brand-500/10"
            >
              {photo ? t("Change photo") : t("Add a photo")}
            </button>
            {photo && (
              <button
                type="button"
                onClick={() => setPhoto(null)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-white/[0.03]"
              >
                {t("Remove photo")}
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("PNG, JPEG or WebP, at most 200 KB.")}</p>
          <input
            ref={fileInput}
            type="file"
            accept={PHOTO_TYPES.join(",")}
            aria-label={t("Photo file")}
            className="hidden"
            onChange={(e) => {
              pickPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="profile-name">{t("Name")}</label>
        <input id="profile-name" className={inputClass} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <dl className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 p-4 text-sm dark:border-gray-800 sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("Email")}</dt>
          <dd className="mt-1 break-all font-medium text-gray-800 dark:text-white/90">{user.email}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("Role")}</dt>
          <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">{t(ROLE_LABELS[user.role] ?? user.role)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("Company")}</dt>
          <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">{company?.name ?? "—"}</dd>
        </div>
      </dl>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {t("Your email, role and company are set by an admin. Ask them if one of these needs to change.")}
      </p>

      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-success-600" : "text-error-500"}`}>
          {message.text}
        </p>
      )}
      <Button size="sm" disabled={saving || !changed}>{saving ? t("Saving…") : t("Save profile")}</Button>
    </form>
  );
}
