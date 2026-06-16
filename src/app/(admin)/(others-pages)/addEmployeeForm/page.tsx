"use client";
import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createEmployee } from "./employee.api";

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
const [success, setSuccess] = useState<string | null>(null);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  // Convert image to base64 for storage (optional — remove if you handle uploads separately)
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      setForm((prev) => ({ ...prev, personalImage: reader.result as string }));
    reader.readAsDataURL(file);
  };

 const handleSave = async (e: React.FormEvent) => {
  e.preventDefault();

  setError(null);
  setSuccess(null);
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

    setSuccess("Employee saved successfully!");

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
    setError(
      err instanceof Error
        ? err.message
        : "Error saving employee."
    );
  } finally {
    setSaving(false);
  }
};

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Breadcrumb */}
      <div className="px-6 py-4 border-b border-gray-100 dark:border-white/[0.06] bg-white dark:bg-gray-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-gray-700 dark:text-gray-200">Employees Data</span>
          <span className="mx-2 text-gray-300 dark:text-gray-600">/</span>
          <span>Add Employee</span>
        </p>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <form
          onSubmit={handleSave}
          className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-white/[0.06] overflow-hidden"
        >
          {/* Header */}
          <div className="px-8 pt-7 pb-4 border-b border-gray-100 dark:border-white/[0.06]">
            <h1 className="text-xl font-bold text-gray-800 dark:text-white">Add Employee</h1>
          </div>

          {/* Error banner */}
          {error && (
            <div className="mx-8 mt-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-4 py-2 text-sm text-red-700 dark:text-red-300">
              ⚠ {error}
            </div>
          )}
          {success && (
  <div className="mx-8 mt-4 rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 px-4 py-2 text-sm text-green-700 dark:text-green-300">
    ✓ {success}
  </div>
)}

          {/* Fields */}
          <div className="px-8 py-6 space-y-5">

            {/* Employee Number */}
            <div>
              <label className={lbl}>Employee Number:</label>
              <input
                type="number"
                className={inp}
                placeholder="e.g. 101"
                value={form.empNumber}
                onChange={set("empNumber")}
                required
              />
            </div>

            {/* Personal Image */}
            <div>
              <label className={lbl}>Personal Image:</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-100 dark:file:bg-white/[0.08] file:text-gray-700 dark:file:text-gray-200 hover:file:bg-gray-200 dark:hover:file:bg-white/[0.12] transition-colors"
              />
              {form.personalImage && (
                <img
                  src={form.personalImage}
                  alt="Preview"
                  className="mt-2 h-16 w-16 rounded-full object-cover border border-gray-200 dark:border-white/[0.1]"
                />
              )}
            </div>

            {/* First Name */}
            <div>
              <label className={lbl}>First Name:</label>
              <input
                type="text"
                className={inp}
                placeholder="e.g. Amina"
                value={form.firstName}
                onChange={set("firstName")}
                required
              />
            </div>

            {/* Last Name */}
            <div>
              <label className={lbl}>Last Name:</label>
              <input
                type="text"
                className={inp}
                placeholder="e.g. Bouzenada"
                value={form.lastName}
                onChange={set("lastName")}
                required
              />
            </div>

            {/* Base Salary */}
            <div>
              <label className={lbl}>Base Salary:</label>
              <input
                type="number"
                className={inp}
                placeholder="e.g. 50000"
                value={form.baseSalary}
                onChange={set("baseSalary")}
                required
              />
            </div>

            {/* Address */}
            <div>
              <label className={lbl}>Address:</label>
              <input
                type="text"
                className={inp}
                placeholder="e.g. 12 Rue Didouche, Algiers"
                value={form.address}
                onChange={set("address")}
              />
            </div>

            {/* Phone */}
            <div>
              <label className={lbl}>Phone:</label>
              <input
                type="tel"
                className={inp}
                placeholder="e.g. 0555123456"
                value={form.phoneNumber}
                onChange={set("phoneNumber")}
              />
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 active:scale-[0.98] transition-all shadow-sm disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
