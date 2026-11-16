"use client";
import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createEmployee } from "./employee.api";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/notify";
import { t } from "@/lib/i18n";

type Field =
  | "empNumber"
  | "firstName"
  | "lastName"
  | "baseSalary"
  | "phoneNumber"
  | "personalImage"
  | "declaredSalary";
type FieldErrors = Partial<Record<Field, string>>;

const MAX_PHOTO_BYTES = 500 * 1024;

const emptyForm = () => ({
  empNumber: "",
  firstName: "",
  lastName: "",
  baseSalary: "",
  address: "",
  phoneNumber: "",
  personalImage: "",
  // Optional: shown on the payslip
  jobTitle: "",
  birthDate: "",
  hireDate: "",
  // Insured employees only
  declaredSalary: "",
  socialSecurityNumber: "",
});

type Form = ReturnType<typeof emptyForm>;

function validate(form: Form, insured: boolean): FieldErrors {
  const errors: FieldErrors = {};
  const num = Number(form.empNumber);
  if (!form.empNumber.trim()) errors.empNumber = t("Enter the employee number.");
  else if (!Number.isInteger(num) || num <= 0) errors.empNumber = t("Use a whole number above 0, e.g. 101.");
  if (!form.firstName.trim()) errors.firstName = t("Enter the first name.");
  if (!form.lastName.trim()) errors.lastName = t("Enter the last name.");
  const salary = Number(form.baseSalary);
  if (!form.baseSalary.trim()) errors.baseSalary = t("Enter the base salary (0 if none).");
  else if (!Number.isFinite(salary) || salary < 0) errors.baseSalary = t("Use a number of 0 or more.");
  if (form.phoneNumber.trim() && !/^\+?[\d\s-]{6,20}$/.test(form.phoneNumber.trim())) {
    errors.phoneNumber = t("Use digits only, e.g. 0555123456.");
  }
  if (insured) {
    const declared = Number(form.declaredSalary);
    if (!form.declaredSalary.trim()) errors.declaredSalary = t("Enter the declared salary.");
    else if (!Number.isFinite(declared) || declared < 0) errors.declaredSalary = t("Use a number of 0 or more.");
  }
  return errors;
}

// ─── Style helpers ────────────────────────────────────────────────────────────
const inp =
  "w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition";
const lbl = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

/**
 * The Add Employee form. With `insured`, it also asks for the declared salary
 * and the insurance number, and marks the employee as insured.
 */
export default function EmployeeDataForm({ insured = false }: { insured?: boolean }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const set = (field: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    // Clear a field's message as soon as it is edited
    if (fieldErrors[field as Field]) setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  // Red outline and message under a field that needs fixing
  const inpFor = (field: Field) =>
    fieldErrors[field] ? `${inp} border-error-400 focus:ring-error-500/30 dark:border-error-500` : inp;
  const FieldError = ({ field }: { field: Field }) =>
    fieldErrors[field] ? (
      <p id={`${field}-error`} className="mt-1 text-xs text-error-500">
        {fieldErrors[field]}
      </p>
    ) : null;

  // Convert image to base64 for storage (optional — remove if you handle uploads separately)
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFieldErrors((prev) => ({ ...prev, personalImage: t("Choose an image file (JPG, PNG…).") }));
      e.target.value = "";
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setFieldErrors((prev) => ({ ...prev, personalImage: t("This photo is too large. Use one under 500 KB.") }));
      e.target.value = "";
      return;
    }
    setFieldErrors((prev) => ({ ...prev, personalImage: undefined }));
    const reader = new FileReader();
    reader.onload = () =>
      setForm((prev) => ({ ...prev, personalImage: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    setError(null);
    const errors = validate(form, insured);
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      // Bring the first problem into view
      const first = (Object.keys(errors) as Field[]).find((k) => errors[k]);
      document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setSaving(true);

    try {
      await createEmployee({
        empNumber: Number(form.empNumber),
        firstName: form.firstName,
        lastName: form.lastName,
        baseSalary: Number(form.baseSalary),
        address: form.address || undefined,
        phoneNumber: form.phoneNumber || undefined,
        personalImage: form.personalImage || undefined,
        jobTitle: form.jobTitle.trim() || undefined,
        birthDate: form.birthDate || undefined,
        hireDate: form.hireDate || undefined,
        ...(insured
          ? {
              insured: true,
              declaredSalary: Number(form.declaredSalary),
              socialSecurityNumber: form.socialSecurityNumber.trim() || undefined,
            }
          : {}),
      });

      toast.success(t("{name} was added.", { name: `${form.firstName} ${form.lastName}` }));

      if (insured) {
        router.push("/insured-employees");
        return;
      }
      // Clear the form for the next employee
      setForm(emptyForm());
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      const message = friendlyError(err);
      // A duplicate number belongs next to the number field
      if (/employee number/i.test(message)) {
        setFieldErrors((prev) => ({ ...prev, empNumber: t("Another employee already has this number.") }));
      } else {
        setError(friendlyError(err, "Couldn't save the employee"));
      }
    } finally {
      setSaving(false);
    }
  };

  const title = insured ? t("Add Insured Employee") : t("Add Employee");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Breadcrumb */}
      <div className="px-6 py-4 border-b border-gray-100 dark:border-white/[0.06] bg-white dark:bg-gray-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-gray-700 dark:text-gray-200">{t("Employees Data")}</span>
          <span className="mx-2 text-gray-300 dark:text-gray-600">/</span>
          <span>{title}</span>
        </p>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <form
          onSubmit={handleSave}
          noValidate
          className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-white/[0.06] overflow-hidden"
        >
          {/* Header */}
          <div className="px-8 pt-7 pb-4 border-b border-gray-100 dark:border-white/[0.06]">
            <h1 className="text-xl font-bold text-gray-800 dark:text-white">{title}</h1>
          </div>

          {/* Error banner */}
          {error && (
            <div role="alert" className="mx-8 mt-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-4 py-2 text-sm text-red-700 dark:text-red-300">
              ⚠ {error}
            </div>
          )}

          {/* Fields */}
          <div className="px-8 py-6 space-y-5">

            {/* Employee Number */}
            <div>
              <label className={lbl} htmlFor="empNumber">{t("Employee Number: *")}</label>
              <input
                id="empNumber"
                name="empNumber"
                type="number"
                className={inpFor("empNumber")}
                placeholder={t("e.g. 101")}
                value={form.empNumber}
                onChange={set("empNumber")}
                aria-invalid={!!fieldErrors.empNumber}
                aria-describedby={fieldErrors.empNumber ? "empNumber-error" : undefined}
              />
              <FieldError field="empNumber" />
            </div>

            {/* Personal Image */}
            <div>
              <label className={lbl}>{t("Personal Image:")}</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                aria-invalid={!!fieldErrors.personalImage}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-100 dark:file:bg-white/[0.08] file:text-gray-700 dark:file:text-gray-200 hover:file:bg-gray-200 dark:hover:file:bg-white/[0.12] transition-colors"
              />
              <FieldError field="personalImage" />
              {form.personalImage && (
                <img
                  src={form.personalImage}
                  alt={t("Preview")}
                  className="mt-2 h-16 w-16 rounded-full object-cover border border-gray-200 dark:border-white/[0.1]"
                />
              )}
            </div>

            {/* First Name */}
            <div>
              <label className={lbl} htmlFor="firstName">{t("First Name: *")}</label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                className={inpFor("firstName")}
                placeholder={t("e.g. Amina")}
                value={form.firstName}
                onChange={set("firstName")}
                aria-invalid={!!fieldErrors.firstName}
                aria-describedby={fieldErrors.firstName ? "firstName-error" : undefined}
              />
              <FieldError field="firstName" />
            </div>

            {/* Last Name */}
            <div>
              <label className={lbl} htmlFor="lastName">{t("Last Name: *")}</label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                className={inpFor("lastName")}
                placeholder={t("e.g. Bouzenada")}
                value={form.lastName}
                onChange={set("lastName")}
                aria-invalid={!!fieldErrors.lastName}
                aria-describedby={fieldErrors.lastName ? "lastName-error" : undefined}
              />
              <FieldError field="lastName" />
            </div>

            {/* Base Salary */}
            <div>
              <label className={lbl} htmlFor="baseSalary">{t("Base Salary: *")}</label>
              <input
                id="baseSalary"
                name="baseSalary"
                type="number"
                className={inpFor("baseSalary")}
                placeholder={t("e.g. 50000")}
                value={form.baseSalary}
                onChange={set("baseSalary")}
                aria-invalid={!!fieldErrors.baseSalary}
                aria-describedby={fieldErrors.baseSalary ? "baseSalary-error" : undefined}
              />
              <FieldError field="baseSalary" />
            </div>

            {/* Address */}
            <div>
              <label className={lbl}>{t("Address:")}</label>
              <input
                type="text"
                className={inp}
                placeholder={t("e.g. 12 Rue Didouche, Algiers")}
                value={form.address}
                onChange={set("address")}
              />
            </div>

            {/* Phone */}
            <div>
              <label className={lbl} htmlFor="phoneNumber">{t("Phone:")}</label>
              <input
                id="phoneNumber"
                name="phoneNumber"
                type="tel"
                className={inpFor("phoneNumber")}
                placeholder={t("e.g. 0555123456")}
                value={form.phoneNumber}
                onChange={set("phoneNumber")}
                aria-invalid={!!fieldErrors.phoneNumber}
                aria-describedby={fieldErrors.phoneNumber ? "phoneNumber-error" : undefined}
              />
              <FieldError field="phoneNumber" />
            </div>

            {/* Job title (optional) */}
            <div>
              <label className={lbl} htmlFor="jobTitle">{t("Job title (optional):")}</label>
              <input
                id="jobTitle"
                name="jobTitle"
                type="text"
                className={inp}
                placeholder={t("e.g. Kitchen agent")}
                value={form.jobTitle}
                onChange={set("jobTitle")}
              />
            </div>

            {/* Dates (optional) */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className={lbl} htmlFor="birthDate">{t("Date of birth (optional):")}</label>
                <input id="birthDate" name="birthDate" type="date" className={inp} value={form.birthDate} onChange={set("birthDate")} />
              </div>
              <div>
                <label className={lbl} htmlFor="hireDate">{t("Hire date (optional):")}</label>
                <input id="hireDate" name="hireDate" type="date" className={inp} value={form.hireDate} onChange={set("hireDate")} />
              </div>
            </div>

            {insured && (
              <div className="space-y-5 border-t border-gray-100 pt-5 dark:border-white/[0.06]">
                <h2 className="text-sm font-semibold text-gray-800 dark:text-white">{t("Insurance")}</h2>
                {/* Declared salary */}
                <div>
                  <label className={lbl} htmlFor="declaredSalary">{t("Declared salary: *")}</label>
                  <input
                    id="declaredSalary"
                    name="declaredSalary"
                    type="number"
                    className={inpFor("declaredSalary")}
                    placeholder={t("e.g. 24000")}
                    value={form.declaredSalary}
                    onChange={set("declaredSalary")}
                    aria-invalid={!!fieldErrors.declaredSalary}
                    aria-describedby={fieldErrors.declaredSalary ? "declaredSalary-error" : undefined}
                  />
                  <FieldError field="declaredSalary" />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("Used on the payslip instead of the base salary.")}</p>
                </div>
                {/* Insurance number */}
                <div>
                  <label className={lbl} htmlFor="socialSecurityNumber">{t("Insurance number (N° SS):")}</label>
                  <input
                    id="socialSecurityNumber"
                    name="socialSecurityNumber"
                    type="text"
                    className={inp}
                    value={form.socialSecurityNumber}
                    onChange={set("socialSecurityNumber")}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-8 py-5 border-t border-gray-100 dark:border-white/[0.06] bg-gray-50/50 dark:bg-white/[0.01]">
            <button
              type="button"
              onClick={() => router.back()}
              disabled={saving}
              className="px-6 py-2 rounded-lg bg-[#E5484D] text-sm font-semibold text-white hover:bg-[#CC3D42] active:scale-[0.98] transition-all shadow-sm disabled:opacity-50"
            >
              {t("Cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 active:scale-[0.98] transition-all shadow-sm disabled:opacity-50"
            >
              {saving ? t("Saving…") : t("Save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
