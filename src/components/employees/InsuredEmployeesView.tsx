"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/button/Button";
import LoadError from "@/components/ui/feedback/LoadError";
import {
  EmployeeRecord,
  getEmployees,
  updateEmployee,
} from "@/app/(admin)/(others-pages)/addEmployeeForm/employee.api";
import { friendlyError } from "@/lib/errors";
import { locale, t } from "@/lib/i18n";
import { confirmDialog, toast } from "@/lib/notify";
import { currency } from "@/lib/payrollConfig";

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

const money = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString(locale())} ${currency()}`;

/** Insured employees: their declared salary and insurance number, which the payslip uses. */
const InsuredEmployeesView: React.FC = () => {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // The insurance form: an employee to mark as insured, or an insured one being edited
  const [employeeId, setEmployeeId] = useState("");
  const [editing, setEditing] = useState(false);
  const [declaredSalary, setDeclaredSalary] = useState("");
  const [insuranceNumber, setInsuranceNumber] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      // Other managers' salaries are hidden from a manager: leave them out
      setEmployees((await getEmployees()).filter((e) => !e.otherManager));
    } catch (err) {
      setError(friendlyError(err, "Couldn't load the employees"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const insured = useMemo(() => employees.filter((e) => e.insured), [employees]);
  const notInsured = useMemo(() => employees.filter((e) => !e.insured), [employees]);

  const resetForm = () => {
    setEmployeeId("");
    setEditing(false);
    setDeclaredSalary("");
    setInsuranceNumber("");
    setFormError("");
  };

  const startEdit = (e: EmployeeRecord) => {
    setEmployeeId(e._id);
    setEditing(true);
    setDeclaredSalary(e.declaredSalary == null ? "" : String(e.declaredSalary));
    setInsuranceNumber(e.socialSecurityNumber ?? "");
    setFormError("");
    document.getElementById("insurance-form")?.scrollIntoView({ behavior: "smooth" });
  };

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const amount = Number(declaredSalary);
    if (!employeeId) return setFormError(t("Choose an employee."));
    if (!declaredSalary.trim()) return setFormError(t("Enter the declared salary."));
    if (!Number.isFinite(amount) || amount < 0) return setFormError(t("Use a number of 0 or more."));
    setSaving(true);
    setFormError("");
    try {
      const changes = { insured: true, declaredSalary: amount, socialSecurityNumber: insuranceNumber.trim() };
      await updateEmployee(employeeId, changes);
      setEmployees((prev) => prev.map((e) => (e._id === employeeId ? { ...e, ...changes } : e)));
      toast.success(editing ? t("Insurance details saved.") : t("Employee marked as insured."));
      resetForm();
    } catch (err) {
      setFormError(friendlyError(err, "Couldn't save the insurance details"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e: EmployeeRecord) => {
    const ok = await confirmDialog({
      title: t("Remove {name} from insured employees?", { name: `${e.firstName} ${e.lastName}` }),
      message: t("Their payslip will use the base salary again. The employee and their insurance number stay."),
      danger: true,
    });
    if (!ok) return;
    try {
      await updateEmployee(e._id, { insured: false, declaredSalary: null });
      setEmployees((prev) => prev.map((x) => (x._id === e._id ? { ...x, insured: false, declaredSalary: null } : x)));
      if (employeeId === e._id) resetForm();
      toast.success(t("Removed from insured employees."));
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't save the insurance details"));
    }
  };

  const editingEmployee = employees.find((e) => e._id === employeeId);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">{t("Insured Employees")}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("Employees declared to social security. Their payslip uses the declared salary and shows the insurance number.")}
          </p>
        </div>
        <Link
          href="/insured-employees/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {t("Add a new insured employee")}
        </Link>
      </div>

      {error && <LoadError title="Couldn't load the employees" message={error} onRetry={load} />}
      {loading && <div className="text-sm text-gray-500 dark:text-gray-400">{t("Loading…")}</div>}

      <div className="w-full overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
        <table className="w-full min-w-[760px]">
          <thead className="bg-[#2563a0]">
            <tr>
              {["Emp #", "Employee", "Job title", "Base Salary", "Declared salary", "Insurance number", ""].map((h, i) => (
                <th key={i} className="whitespace-nowrap p-3 text-start text-xs font-bold uppercase tracking-wide text-white">
                  {h && t(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {insured.map((e) => (
              <tr key={e._id}>
                <td className="p-3 font-mono text-sm text-gray-600 dark:text-gray-400">{e.empNumber}</td>
                <td className="p-3 text-sm font-medium text-gray-800 dark:text-white">{e.firstName} {e.lastName}</td>
                <td className="p-3 text-sm text-gray-600 dark:text-gray-400">{e.jobTitle || "—"}</td>
                <td className="p-3 text-sm text-gray-600 dark:text-gray-400">{money(e.baseSalary)}</td>
                <td className="p-3 text-sm font-semibold text-gray-800 dark:text-white">{money(e.declaredSalary)}</td>
                <td className="p-3 font-mono text-sm text-gray-600 dark:text-gray-400">{e.socialSecurityNumber || "—"}</td>
                <td className="whitespace-nowrap p-3 text-end">
                  <button
                    type="button"
                    onClick={() => startEdit(e)}
                    className="me-3 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                    aria-label={t("Edit {field}", { field: `${e.firstName} ${e.lastName}` })}
                  >
                    {t("Edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(e)}
                    className="text-sm font-medium text-red-500 hover:underline"
                    aria-label={t("Remove {name}", { name: `${e.firstName} ${e.lastName}` })}
                  >
                    {t("Remove")}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && insured.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-sm text-gray-400">{t("No insured employees yet.")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form
        id="insurance-form"
        onSubmit={save}
        noValidate
        className="max-w-2xl space-y-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <h2 className="font-semibold text-gray-800 dark:text-white">
          {editing && editingEmployee
            ? t("Insurance details of {name}", { name: `${editingEmployee.firstName} ${editingEmployee.lastName}` })
            : t("Mark an existing employee as insured")}
        </h2>
        {!editing && (
          <div>
            <label className={labelClass} htmlFor="insured-employee">{t("Employee")}</label>
            <select
              id="insured-employee"
              className={inputClass}
              value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                const picked = employees.find((x) => x._id === e.target.value);
                setInsuranceNumber(picked?.socialSecurityNumber ?? "");
              }}
            >
              <option value="">{t("Choose an employee")}</option>
              {notInsured.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.empNumber} — {e.firstName} {e.lastName}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="declared-salary">{t("Declared salary: *")}</label>
            <input
              id="declared-salary"
              type="number"
              min={0}
              className={inputClass}
              value={declaredSalary}
              onChange={(e) => setDeclaredSalary(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="insurance-number">{t("Insurance number (N° SS):")}</label>
            <input
              id="insurance-number"
              className={inputClass}
              value={insuranceNumber}
              onChange={(e) => setInsuranceNumber(e.target.value)}
            />
          </div>
        </div>
        {formError && <p role="alert" className="text-sm text-error-500">{formError}</p>}
        <div className="flex gap-2">
          <Button size="sm" disabled={saving}>{saving ? t("Saving…") : t("Save")}</Button>
          {editing && (
            <Button size="sm" variant="outline" type="button" onClick={resetForm}>
              {t("Cancel")}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
};

export default InsuredEmployeesView;
