"use client";

import React, { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { confirmDialog, toast } from "@/lib/notify";
import { AuthUser, Role } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { t } from "@/lib/i18n";

interface UserRow extends Omit<AuthUser, "id"> {
  _id: string;
  active: boolean;
  createdAt?: string;
  // For a manager: the employee record that is this person.
  employeeId?: string | null;
}

interface EmployeeOption {
  _id: string;
  empNumber: number;
  firstName: string;
  lastName: string;
}

const employeeLabel = (e: EmployeeOption) => `${e.firstName} ${e.lastName} (#${e.empNumber})`;

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30";
const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

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
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export default function UsersView() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const emptyForm = { name: "", email: "", password: "", role: "manager" as Role, employeeId: "" };
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const load = useCallback(async () => {
    try {
      const [userRows, employeeRows] = await Promise.all([
        api<UserRow[]>("/users"),
        api<EmployeeOption[]>("/employees").catch(() => [] as EmployeeOption[]),
      ]);
      setUsers(userRows);
      setEmployees(
        [...employeeRows].sort((a, b) => employeeLabel(a).localeCompare(employeeLabel(b)))
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Could not load users"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await load();
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't update the user"));
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          employeeId: form.role === "manager" && form.employeeId ? form.employeeId : null,
        }),
      });
      setCreateOpen(false);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("Could not create user"));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetFor) return;
    try {
      await api(`/users/${resetFor._id}/password`, {
        method: "POST",
        body: JSON.stringify({ password: newPassword }),
      });
      toast.success(t("Password updated for {name}.", { name: resetFor.name }));
      setResetFor(null);
      setNewPassword("");
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't reset the password"));
    }
  };

  // An employee can be linked to one user only.
  const linkedTo = (employeeId: string) => users.find((u) => u.employeeId === employeeId);

  const employeeOptions = (forUserId?: string) =>
    employees.map((e) => {
      const other = linkedTo(e._id);
      const taken = !!other && other._id !== forUserId;
      return (
        <option key={e._id} value={e._id} disabled={taken}>
          {employeeLabel(e)}
          {taken ? ` — ${other!.name}` : ""}
        </option>
      );
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("Admins have full access. Managers can use every feature, but not Users, Company settings or the Activity log, so they can't see other users' details. A clock-in kiosk account only sees the kiosk, where staff pick their name and clock in or out.")}
        </p>
        <Button size="sm" className="shrink-0 whitespace-nowrap" onClick={() => setCreateOpen(true)}>
          {t("Add user")}
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/15 dark:text-error-500">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-start text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
            <tr>
              <th className="px-4 py-3 font-medium">{t("Name")}</th>
              <th className="px-4 py-3 font-medium">{t("Email")}</th>
              <th className="px-4 py-3 font-medium">{t("Role")}</th>
              <th className="px-4 py-3 font-medium">{t("Employee")}</th>
              <th className="px-4 py-3 font-medium">{t("Status")}</th>
              <th className="px-4 py-3 font-medium text-end">{t("Actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-800 dark:divide-gray-800 dark:text-white/90">
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">{t("Loading…")}</td>
              </tr>
            )}
            {users.map((u) => {
              const isMe = u._id === me?.id;
              return (
                <tr key={u._id}>
                  <td className="px-4 py-3">
                    {u.name} {isMe && <span className="text-xs text-gray-400">{t("(you)")}</span>}
                  </td>
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3">
                    <select
                      aria-label={t("Role for {name}", { name: u.name })}
                      className="rounded-lg border border-gray-300 bg-transparent px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
                      value={u.role}
                      disabled={isMe}
                      onChange={(e) =>
                        run(() => api(`/users/${u._id}`, { method: "PATCH", body: JSON.stringify({ role: e.target.value }) }))
                      }
                    >
                      <option value="admin">{t("Admin")}</option>
                      <option value="manager">{t("Manager")}</option>
                      <option value="employee">{t("Clock-in kiosk")}</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {u.role === "manager" ? (
                      <select
                        aria-label={t("Employee record of {name}", { name: u.name })}
                        className="max-w-[220px] rounded-lg border border-gray-300 bg-transparent px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
                        value={u.employeeId ?? ""}
                        onChange={(e) =>
                          run(() =>
                            api(`/users/${u._id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ employeeId: e.target.value || null }),
                            })
                          )
                        }
                      >
                        <option value="">{t("Not linked")}</option>
                        {employeeOptions(u._id)}
                      </select>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        u.active
                          ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500"
                          : "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400"
                      }`}
                    >
                      {u.active ? t("Active") : t("Disabled")}
                    </span>
                  </td>
                  <td className="space-x-3 whitespace-nowrap px-4 py-3 text-end">
                    <button type="button" className="text-brand-500 hover:underline" onClick={() => setResetFor(u)}>
                      {t("Reset password")}
                    </button>
                    {!isMe && (
                      <>
                        <button
                          type="button"
                          className="text-gray-600 hover:underline dark:text-gray-300"
                          onClick={() =>
                            run(() => api(`/users/${u._id}`, { method: "PATCH", body: JSON.stringify({ active: !u.active }) }))
                          }
                        >
                          {u.active ? t("Disable") : t("Enable")}
                        </button>
                        <button
                          type="button"
                          className="text-error-500 hover:underline"
                          onClick={async () => {
                            const ok = await confirmDialog({
                              title: t("Delete {name}?", { name: u.name }),
                              message: "They will no longer be able to sign in. This can't be undone.",
                              danger: true,
                            });
                            if (ok) run(() => api(`/users/${u._id}`, { method: "DELETE" }));
                          }}
                        >
                          {t("Delete")}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} className="max-w-[480px] p-6">
        <form onSubmit={handleCreate} className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{t("Add user")}</h3>
          <div>
            <label className={labelClass} htmlFor="new-name">{t("Name")}</label>
            <input id="new-name" className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className={labelClass} htmlFor="new-email">{t("Email")}</label>
            <input id="new-email" type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className={labelClass} htmlFor="new-password">{t("Temporary password (min 8 characters)")}</label>
            <input id="new-password" type="text" autoComplete="off" className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label className={labelClass} htmlFor="new-role">{t("Role")}</label>
            <select id="new-role" className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="manager">{t("Manager")}</option>
              <option value="employee">{t("Clock-in kiosk")}</option>
              <option value="admin">{t("Admin")}</option>
            </select>
          </div>
          {form.role === "manager" && (
            <div>
              <label className={labelClass} htmlFor="new-employee">{t("This manager is the employee")}</label>
              <select id="new-employee" className={inputClass} value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                <option value="">{t("Not linked")}</option>
                {employeeOptions()}
              </select>
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                {t("Other managers won't see this employee's salary, advances, bonuses or payroll.")}
              </p>
            </div>
          )}
          {formError && <p role="alert" className="text-sm text-error-500">{formError}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" className="rounded-lg px-4 py-3 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03]" onClick={() => setCreateOpen(false)}>
              {t("Cancel")}
            </button>
            <Button size="sm" disabled={saving}>{saving ? t("Saving…") : t("Create user")}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!resetFor} onClose={() => setResetFor(null)} className="max-w-[420px] p-6">
        <form onSubmit={handleReset} className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{t("Reset password for {name}", { name: resetFor?.name ?? "" })}</h3>
          <div>
            <label className={labelClass} htmlFor="reset-password">{t("New password (min 8 characters)")}</label>
            <input id="reset-password" type="text" autoComplete="off" className={inputClass} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" className="rounded-lg px-4 py-3 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03]" onClick={() => setResetFor(null)}>
              {t("Cancel")}
            </button>
            <Button size="sm">{t("Set password")}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
