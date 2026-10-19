"use client";
import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createEmployee } from "./employee.api";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/notify";
import { t } from "@/lib/i18n";

type Field = "empNumber" | "firstName" | "lastName" | "baseSalary" | "phoneNumber" | "personalImage";
type FieldErrors = Partial<Record<Field, string>>;

const MAX_PHOTO_BYTES = 500 * 1024;

function validate(form: Record<Field | "address", string>): FieldErrors {
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
  return errors;
}

// ─── Style helpers ────────────────────────────────────────────────────────────
const inp =
  "w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition";
const lbl = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

export default function EmployeeDataForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    empNumber:     "",
    firstName:     "",
    lastName:      "",
    baseSalary:    "",
    address:       "",
    phoneNumber:   "",
    personalImage: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const set = (field: Field | "address") => (e: React.ChangeEvent<HTMLInputElement>) => {
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
  const errors = validate(form);
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
    });

    toast.success(t("{name} was added.", { name: `${form.firstName} ${form.lastName}` }));

    // Optional: clear the form after save
    setForm({
      empNumber: "",
      firstName: "",
      lastName: "",
      baseSalary: "",
      address: "",
      phoneNumber: "",
      personalImage: "",
    });

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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Breadcrumb */}
      <div className="px-6 py-4 border-b border-gray-100 dark:border-white/[0.06] bg-white dark:bg-gray-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-gray-700 dark:text-gray-200">{t("Employees Data")}</span>
          <span className="mx-2 text-gray-300 dark:text-gray-600">/</span>
          <span>{t("Add Employee")}</span>
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
            <h1 className="text-xl font-bold text-gray-800 dark:text-white">{t("Add Employee")}</h1>
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
