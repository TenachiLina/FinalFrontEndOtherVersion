"use client";

import React, { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { confirmDialog, toast } from "@/lib/notify";
import { Feature, FEATURE_LABELS } from "@/lib/auth";
import { Branding, DEFAULT_BRAND } from "@/lib/branding";
import { useAuth } from "@/context/AuthContext";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";

interface CompanyRow {
  _id: string;
  name: string;
  active: boolean;
  features: Feature[];
  devices: { serial: string; name?: string }[];
  slug?: string;
  branding?: Branding;
  createdAt?: string;
}

const MAX_LOGO_BYTES = 300 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const ALL_FEATURES = Object.keys(FEATURE_LABELS) as Feature[];

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30";
const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";
const cancelClass =
  "rounded-lg px-4 py-3 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03]";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = Array.isArray(body.message) ? body.message.join(", ") : String(body.message);
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

function FeatureChecks({
  value,
  onChange,
}: {
  value: Feature[];
  onChange: (f: Feature[]) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {ALL_FEATURES.map((f) => (
        <label key={f} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={value.includes(f)}
            onChange={(e) =>
              onChange(e.target.checked ? [...value, f] : value.filter((x) => x !== f))
            }
          />
          {FEATURE_LABELS[f]}
        </label>
      ))}
    </div>
  );
}

const emptyForm = {
  name: "",
  features: ALL_FEATURES,
  devices: "",
  adminName: "",
  adminEmail: "",
  adminPassword: "",
};

// Device serials are edited as one per line: "SERIAL" or "SERIAL, name".
function parseDevices(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, ...rest] = line.split(",");
      return { serial: serial.trim(), name: rest.join(",").trim() || undefined };
    });
}

function formatDevices(devices: CompanyRow["devices"]) {
  return devices.map((d) => (d.name ? `${d.serial}, ${d.name}` : d.serial)).join("\n");
}

export default function CompaniesView() {
  const { switchCompany } = useAuth();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<CompanyRow | null>(null);
  const [editFeatures, setEditFeatures] = useState<Feature[]>([]);
  const [editDevices, setEditDevices] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editBranding, setEditBranding] = useState<Branding>({});
  const [editError, setEditError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCompanies(await api<CompanyRow[]>("/companies"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load companies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api("/companies", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          features: form.features,
          devices: parseDevices(form.devices),
          admin: { name: form.adminName, email: form.adminEmail, password: form.adminPassword },
        }),
      });
      setCreateOpen(false);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create company");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (c: CompanyRow) => {
    setEditing(c);
    setEditFeatures(c.features);
    setEditDevices(formatDevices(c.devices));
    setEditSlug(c.slug ?? "");
    setEditBranding({ ...(c.branding ?? {}) });
    setEditError(null);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await api(`/companies/${editing._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          features: editFeatures,
          devices: parseDevices(editDevices),
          ...(editSlug.trim() ? { slug: editSlug.trim() } : {}),
          branding: editBranding,
        }),
      });
      setEditing(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Could not save");
    }
  };

  const handleLogo = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)) {
      setEditError("Logo must be a PNG, JPEG, WebP or SVG image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setEditError("Logo must be under 300 KB.");
      return;
    }
    setEditError(null);
    setEditBranding({ ...editBranding, logo: await readAsDataUrl(file) });
  };

  const signInLink = (slug: string) =>
    typeof window === "undefined" ? "" : `${window.location.origin}/signin?company=${encodeURIComponent(slug)}`;

  const toggleActive = async (c: CompanyRow) => {
    if (
      c.active &&
      !(await confirmDialog({
        title: `Suspend ${c.name}?`,
        message: "Its users won't be able to sign in and its clocking machines will be refused until you reactivate it. No data is deleted.",
        confirmLabel: "Suspend",
        danger: true,
      }))
    )
      return;
    try {
      await api(`/companies/${c._id}`, { method: "PATCH", body: JSON.stringify({ active: !c.active }) });
      await load();
      toast.success(c.active ? `${c.name} suspended.` : `${c.name} reactivated.`);
    } catch (err) {
      toast.error(friendlyError(err, c.active ? "Couldn't suspend the company" : "Couldn't reactivate the company"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Each company only sees its own data. Use <strong>Open</strong> to work inside a company as its admin.
        </p>
        <Button size="sm" className="shrink-0 whitespace-nowrap" onClick={() => setCreateOpen(true)}>
          Add company
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/15 dark:text-error-500">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
            <tr>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Features</th>
              <th className="px-4 py-3 font-medium">Devices</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-800 dark:divide-gray-800 dark:text-white/90">
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">Loading…</td>
              </tr>
            )}
            {!loading && companies.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">No companies yet.</td>
              </tr>
            )}
            {companies.map((c) => (
              <tr key={c._id}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 font-medium">
                    {c.branding?.logo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.branding.logo} alt="" className="h-6 w-6 rounded object-contain" />
                    )}
                    {c.name}
                  </div>
                  {c.slug && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">/signin?company={c.slug}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                  {c.features.length === ALL_FEATURES.length
                    ? "All"
                    : c.features.map((f) => FEATURE_LABELS[f]).join(", ") || "None"}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                  {c.devices.map((d) => d.serial).join(", ") || "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      c.active
                        ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500"
                        : "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400"
                    }`}
                  >
                    {c.active ? "Active" : "Suspended"}
                  </span>
                </td>
                <td className="space-x-3 whitespace-nowrap px-4 py-3 text-right">
                  <button type="button" className="font-medium text-brand-500 hover:underline" onClick={() => switchCompany(c._id)}>
                    Open
                  </button>
                  <button type="button" className="text-gray-600 hover:underline dark:text-gray-300" onClick={() => openEdit(c)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className={c.active ? "text-error-500 hover:underline" : "text-gray-600 hover:underline dark:text-gray-300"}
                    onClick={() => toggleActive(c)}
                  >
                    {c.active ? "Suspend" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} className="max-w-[560px] p-6">
        <form onSubmit={handleCreate} className="max-h-[80vh] space-y-4 overflow-y-auto pr-1">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Add company</h3>
          <div>
            <label className={labelClass} htmlFor="co-name">Company name</label>
            <input id="co-name" className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <span className={labelClass}>Features</span>
            <FeatureChecks value={form.features} onChange={(features) => setForm({ ...form, features })} />
          </div>
          <div>
            <label className={labelClass} htmlFor="co-devices">ZKTeco device serials (one per line, optional)</label>
            <textarea id="co-devices" rows={2} className={`${inputClass} h-auto`} placeholder="ABC123456, Main entrance" value={form.devices} onChange={(e) => setForm({ ...form, devices: e.target.value })} />
          </div>
          <fieldset className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <legend className="px-1 text-sm font-medium text-gray-700 dark:text-gray-300">First admin</legend>
            <div>
              <label className={labelClass} htmlFor="co-admin-name">Name</label>
              <input id="co-admin-name" className={inputClass} value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="co-admin-email">Email</label>
              <input id="co-admin-email" type="email" className={inputClass} value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="co-admin-password">Temporary password (min 8 characters)</label>
              <input id="co-admin-password" type="text" autoComplete="off" className={inputClass} value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} />
            </div>
          </fieldset>
          {formError && <p role="alert" className="text-sm text-error-500">{formError}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" className={cancelClass} onClick={() => setCreateOpen(false)}>Cancel</button>
            <Button size="sm" disabled={saving}>{saving ? "Creating…" : "Create company"}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} className="max-w-[640px] p-6">
        <form onSubmit={handleEdit} className="max-h-[85vh] space-y-4 overflow-y-auto pr-1">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{editing?.name}</h3>
          <div>
            <span className={labelClass}>Features</span>
            <FeatureChecks value={editFeatures} onChange={setEditFeatures} />
          </div>
          <div>
            <label className={labelClass} htmlFor="edit-devices">ZKTeco device serials (one per line)</label>
            <textarea id="edit-devices" rows={3} className={`${inputClass} h-auto`} value={editDevices} onChange={(e) => setEditDevices(e.target.value)} />
          </div>

          <fieldset className="space-y-4 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <legend className="px-1 text-sm font-medium text-gray-700 dark:text-gray-300">Sign-in page &amp; logo</legend>
            <div>
              <label className={labelClass} htmlFor="edit-slug">Sign-in link name</label>
              <input
                id="edit-slug"
                className={inputClass}
                placeholder="e.g. pizza-roma"
                value={editSlug}
                onChange={(e) => setEditSlug(e.target.value.toLowerCase())}
              />
              {editSlug && (
                <p className="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">
                  Staff sign in at <span className="font-medium">{signInLink(editSlug)}</span>
                </p>
              )}
            </div>
            <div>
              <span className={labelClass}>Logo (PNG, JPEG, WebP or SVG, under 300 KB)</span>
              <div className="flex flex-wrap items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={editBranding.logo || DEFAULT_BRAND.logo}
                  alt="Logo preview"
                  className="h-14 w-14 rounded-lg border border-gray-200 object-contain dark:border-gray-800"
                />
                <input
                  type="file"
                  aria-label="Upload logo"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="text-sm text-gray-600 dark:text-gray-400"
                  onChange={(e) => handleLogo(e.target.files?.[0])}
                />
                {editBranding.logo && (
                  <button type="button" className="text-sm text-error-500 hover:underline" onClick={() => setEditBranding({ ...editBranding, logo: undefined })}>
                    Remove
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
              <div>
                <label className={labelClass} htmlFor="edit-title">Title</label>
                <input id="edit-title" className={inputClass} placeholder={editing?.name} value={editBranding.title ?? ""} onChange={(e) => setEditBranding({ ...editBranding, title: e.target.value })} />
              </div>
              <div>
                <label className={labelClass} htmlFor="edit-color">Colour</label>
                <input
                  id="edit-color"
                  type="color"
                  className="h-11 w-16 cursor-pointer rounded-lg border border-gray-300 bg-transparent p-1 dark:border-gray-700"
                  value={editBranding.color || DEFAULT_BRAND.color}
                  onChange={(e) => setEditBranding({ ...editBranding, color: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="edit-subtitle">Welcome text</label>
              <input id="edit-subtitle" className={inputClass} placeholder="e.g. Welcome back! Sign in to see your planning." value={editBranding.subtitle ?? ""} onChange={(e) => setEditBranding({ ...editBranding, subtitle: e.target.value })} />
            </div>
            <div>
              <span className={labelClass}>Preview</span>
              <div
                className="flex flex-col items-center rounded-xl px-6 py-8 text-center"
                style={{ backgroundColor: editBranding.color || DEFAULT_BRAND.color }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={editBranding.logo || DEFAULT_BRAND.logo} alt="" className="mb-3 max-h-16 max-w-[160px] object-contain" />
                <div className="text-lg font-semibold text-white">{editBranding.title || editing?.name}</div>
                {editBranding.subtitle && <div className="mt-1 text-sm text-white/70">{editBranding.subtitle}</div>}
              </div>
            </div>
          </fieldset>
          {editError && <p role="alert" className="text-sm text-error-500">{editError}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" className={cancelClass} onClick={() => setEditing(null)}>Cancel</button>
            <Button size="sm">Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
