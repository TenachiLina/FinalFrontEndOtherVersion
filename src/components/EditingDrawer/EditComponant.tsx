"use client";
import React, { useState, useEffect } from "react";
import Image from "next/image";
import { Employee } from "@/types/employee";

interface EditEmployeeDrawerProps {
  employee: Employee | null;
  onClose: () => void;
  onSave: (updated: Employee) => void;
}

const XIcon = () => (
  <svg
    className="w-5 h-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function EditEmployeeDrawer({
  employee,
  onClose,
  onSave,
}: EditEmployeeDrawerProps) {
  const [form, setForm] = useState<Employee | null>(null);
  const isOpen = employee !== null;

  useEffect(() => {
    if (employee) setForm(structuredClone(employee));
  }, [employee]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const set = (path: string, value: any) =>
    setForm((prev) => {
      if (!prev) return prev;

      if (path.startsWith("user.")) {
        const key = path.split(".")[1] as keyof Employee["user"];
        return { ...prev, user: { ...prev.user, [key]: value } };
      }

      return { ...prev, [path]: value };
    });

  const handleSave = () => {
    if (form) {
      onSave(form);
      onClose();
    }
  };

  // 🎯 Unified styles
  const inputCls =
    "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 " +
    "focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-400 " +
    "dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-gray-200 dark:placeholder-gray-500 transition-colors";

  const labelCls =
    "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] transition-opacity duration-300 ${
          isOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-md 
        bg-white dark:bg-gray-900 shadow-2xl flex flex-col 
        transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 
          bg-gray-50 dark:bg-white/[0.04]
          border-b border-gray-100 dark:border-white/[0.08]">
          
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Edit Employee
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Update the employee's information below
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <XIcon />
          </button>
        </div>

        {/* Avatar Section */}
        {form && (
          <div className="flex items-center gap-4 px-6 py-4 
            bg-gray-50 dark:bg-white/[0.04]
            border-t border-gray-100 dark:border-white/[0.08]">

            <label className="relative cursor-pointer group">
              <div className="w-12 h-12 rounded-full overflow-hidden 
                bg-gray-200 dark:bg-gray-700 
                ring-2 ring-blue-500/30">
                
                <Image
                  width={48}
                  height={48}
                  src={
                    typeof form.user.image === "string"
                      ? form.user.image
                      : URL.createObjectURL(form.user.image)
                  }
                  alt={form.user.name}
                  className="w-full h-full object-cover"
                />
              </div>

              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;

                  set("user.image", file);
                }}
              />
            </label>

            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-white">
                Change photo by clicking it.
              </p>
            </div>
          </div>
        )}

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {form && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Full Name</label>
                  <input
                    className={inputCls}
                    value={form.user.name}
                    onChange={(e) => set("user.name", e.target.value)}
                  />
                </div>

                <div>
                  <label className={labelCls}>Phone Number</label>
                  <input
                    className={inputCls}
                    value={form.user.PhoneNumber}
                    onChange={(e) =>
                      set("user.PhoneNumber", e.target.value)
                    }
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Position</label>
                <input
                  className={inputCls}
                  value={form.position}
                  onChange={(e) => set("position", e.target.value)}
                />
              </div>

              <div>
                <label className={labelCls}>Salary</label>
                <input
                  className={inputCls}
                  value={form.salary}
                  onChange={(e) => set("salary", e.target.value)}
                />
              </div>

              <div>
                <label className={labelCls}>Address</label>
                <input
                  className={inputCls}
                  value={form.Address}
                  onChange={(e) => set("Address", e.target.value)}
                />
              </div>

              <div>
                <label className={labelCls}>Status</label>
                <select
                  className={inputCls}
                  value={form.status}
                  onChange={(e) =>
                    set("status", e.target.value as Employee["status"])
                  }
                >
                  <option value="In Progress">In Progress</option>
                  <option value="Vacation">Vacation</option>
                </select>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 
          bg-gray-50 dark:bg-white/[0.04]
          border-t border-gray-100 dark:border-white/[0.08] 
          flex items-center justify-end gap-3">

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium 
              text-gray-600 dark:text-gray-300 
              border border-gray-200 dark:border-white/[0.1] 
              hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-lg text-sm font-medium 
              text-white bg-blue-600 hover:bg-blue-700 transition"
          >
            Save Changes
          </button>
        </div>
      </div>
    </>
  );
}