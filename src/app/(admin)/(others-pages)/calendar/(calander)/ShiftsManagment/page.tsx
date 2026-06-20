"use client";

import React from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { useShiftsManagement } from "@/hooks/ShiftsmanagmentHook";

export default function ShiftsManagementPage() {
  const {
    view,
    switchView,
    shifts,
    loading,
    error,

    openAddModal,
    openEditModal,

    archiveShift,
    restoreShift,

    requestDelete,

    // modal
    isOpen,
    modalMode,
    form,
    updateForm,
    handleSubmit,
    closeShiftModal,
    saving,
    formError,

    // delete modal
    pendingDelete,
    cancelDelete,
    confirmDelete,
    deleting,
  } = useShiftsManagement();

  return (
    <div>
      <PageBreadcrumb pageTitle="Shifts Management" />

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] p-4 min-w-[260px] text-gray-800 dark:text-white">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => switchView("active")}
              className={`rounded-lg px-4 py-2 ${
                view === "active"
                  ? "bg-brand-500 text-white"
                  : "border border-gray-300"
              }`}
            >
              Active
            </button>

            <button
              onClick={() => switchView("archived")}
              className={`rounded-lg px-4 py-2 ${
                view === "archived"
                  ? "bg-brand-500 text-white"
                  : "border border-gray-300"
              }`}
            >
              Archived
            </button>
          </div>

          {view === "active" && (
            <button
              onClick={openAddModal}
              className="rounded-lg bg-brand-500 px-4 py-2 text-white"
            >
              Add Shift
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-red-600">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left">Start</th>
                <th className="px-4 py-3 text-left">End</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="p-6 text-center">
                    Loading...
                  </td>
                </tr>
              ) : shifts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-6 text-center">
                    No shifts found.
                  </td>
                </tr>
              ) : (
                shifts.map((shift) => (
                  <tr key={shift._id} className="border-b">
                    <td className="px-4 py-4">{shift.startTime}</td>

                    <td className="px-4 py-4">{shift.endTime}</td>

                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        {view === "active" ? (
                          <>
                            <button
                              onClick={() => openEditModal(shift)}
                              className="rounded border border-yellow-500 px-3 py-1 text-yellow-500 hover:bg-orange-50"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => archiveShift(shift)}
                              className="rounded border border-orange-500 px-3 py-1 text-orange-500 hover:bg-orange-50"
                            >
                              Archive
                            </button>
                          </>
                        ) : (
                          <>
                           <button
                            onClick={() => restoreShift(shift)}
                            className="rounded border border-green-500 px-3 py-1 text-green-500 hover:bg-green-50"
                           >
                            Restore
                           </button>
                           <button
                            onClick={() => requestDelete(shift)}
                            className="rounded border border-red-300 px-3 py-1 text-red-600"
                           >
                              Delete
                           </button>
                          </>                          
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6">
            <h2 className="mb-5 text-lg font-semibold">
              {modalMode === "add" ? "Add Shift" : "Edit Shift"}
            </h2>

            <div className="space-y-3">
              <div>
                <label htmlFor="shift-start-time" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Start time
                </label>
                <input
                  id="shift-start-time"
                  type="time"
                  value={form.startTime}
                  onChange={(e) => updateForm("startTime", e.target.value)}
                  className="w-full rounded-lg border p-3"
                />
              </div>

              <div>
                <label htmlFor="shift-end-time" className="mb-1.5 block text-sm font-medium text-gray-700">
                  End time
                </label>
                <input
                  id="shift-end-time"
                  type="time"
                  value={form.endTime}
                  onChange={(e) => updateForm("endTime", e.target.value)}
                  className="w-full rounded-lg border p-3"
                />
              </div>

              {formError && (
                <div className="text-sm text-red-500">
                  {formError}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={closeShiftModal}
                className="rounded-lg border px-4 py-2"
              >
                Cancel
              </button>

              <button
                onClick={handleSubmit}
                disabled={saving}
                className="rounded-lg bg-brand-500 px-4 py-2 text-white"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold">
              Delete Shift
            </h2>

            <p className="mb-5">
              Are you sure you want to permanently delete this shift?
            </p>

            {pendingDelete.usageCount !== undefined && (
              <div className="mb-4 rounded-lg bg-yellow-50 p-3 text-yellow-700">
                This shift is used in {pendingDelete.usageCount} planning
                entries.
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={cancelDelete}
                className="rounded-lg border px-4 py-2"
              >
                Cancel
              </button>

              <button
                disabled={deleting}
                onClick={() =>
                  confirmDelete(
                    pendingDelete.usageCount !== undefined
                  )
                }
                className="rounded-lg bg-red-600 px-4 py-2 text-white"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}





