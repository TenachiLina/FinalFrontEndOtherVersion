"use client";
import React from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { ArrowDownTrayIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { useShiftGrid } from "@/hooks/useNewPlanning";

const ShiftGrid: React.FC = () => {
  const {
  posts, shifts, filteredEmployees, loadingMeta, metaError, loadingGrid,
  grid,
  currentDate, setCurrentDate,
  calendarMonth, setCalendarMonth,
  goToToday, goPrev, goNext, formattedDate,
  isOpen, activeCell, empSearch, setEmpSearch, selectedEmployee, setSelectedEmployee,
  handleCellClick, handleSave, handleClose,
  isEditModalOpen, editingEmployee, editTitle, setEditTitle,
  openEditModal, handleEdit, handleCloseEditModal,
  isListModalOpen, setIsListModalOpen,
  listCell, setListCell, listEmployees,
  handleDelete, handleSavePlanning,
  fileInputRef, handleImportClick, handleImportFile,
} = useShiftGrid();

  const activePost  = activeCell ? posts.find((p) => p.id === activeCell.postId)  : null;
  const activeShift = activeCell ? shifts.find((s) => s.id === activeCell.shiftId) : null;

  const getCalendarDays = (date: Date) => {
    const year = date.getFullYear(), month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev  = new Date(year, month, 0).getDate();
    const days: { date: Date; currentMonth: boolean }[] = [];
    for (let i = firstDay - 1; i >= 0; i--)
      days.push({ date: new Date(year, month - 1, daysInPrev - i), currentMonth: false });
    for (let i = 1; i <= daysInMonth; i++)
      days.push({ date: new Date(year, month, i), currentMonth: true });
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++)
      days.push({ date: new Date(year, month + 1, i), currentMonth: false });
    return days;
  };

  if (loadingMeta) return (
    <div className="flex items-center justify-center h-40 text-gray-400 text-sm animate-pulse">
      Loading shifts and tasks…
    </div>
  );

  if (metaError) return (
    <div className="flex items-center justify-center h-40 text-red-400 text-sm">
      ⚠ {metaError}
    </div>
  );

  return (
    <>
      <div className="flex gap-4 items-start" style={{ marginBottom: "20px" }}>

        {/* ── Mini Calendar ──────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] p-4 min-w-[260px]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-800 dark:text-white">
              {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </span>
            <div className="flex gap-1">
              <button onClick={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1))}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button onClick={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1))}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {["S","M","T","W","T","F","S"].map((d, i) => (
              <div key={i} className="text-center text-[11px] font-medium text-gray-400 py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {getCalendarDays(calendarMonth).map(({ date, currentMonth }, i) => {
              const isToday    = date.toDateString() === new Date().toDateString();
              const isSelected = date.toDateString() === currentDate.toDateString();
              return (
                <button key={i} onClick={() => { setCurrentDate(date); setCalendarMonth(date); }}
                  className={[
                    "text-[12px] w-8 h-8 mx-auto flex items-center justify-center rounded-full transition-colors",
                    !currentMonth ? "text-gray-300 dark:text-gray-600" : "text-gray-700 dark:text-gray-300",
                    isSelected ? "bg-brand-500 text-white font-semibold" : "",
                    isToday && !isSelected ? "text-brand-500 font-semibold" : "",
                    !isSelected ? "hover:bg-gray-100 dark:hover:bg-gray-800" : "",
                  ].join(" ")}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Grid ───────────────────────────────────────────────────────── */}
        <div className="flex-1 rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-hidden">
          <div className="overflow-x-auto">

            {/* Date navigation */}
            <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
              <button onClick={goToToday} type="button"
                className="rounded-full border border-gray-300 dark:border-gray-600 px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                Today
              </button>
              <div className="flex items-center gap-1">
                <button onClick={goPrev} type="button" className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <button onClick={goNext} type="button" className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
              <span className="text-sm font-medium text-gray-800 dark:text-white mr-15">{formattedDate}</span>
              {/* {loadingGrid && (
                <span className="ml-2 text-xs text-gray-400 animate-pulse">Loading…</span>
              )} */}

              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  hidden
                  onChange={handleImportFile}
                />

                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleImportClick}
                >
                  <ArrowDownTrayIcon
                    className="w-4 h-4 text-gray-100"
                    strokeWidth={3}
                  />
                  Import Planning
                </Button>

                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    const replaceExisting = window.confirm(
                      "Replace existing planning for this day?\n\nOK = Replace\nCancel = Add only new entries"
                    );

                    handleSavePlanning(replaceExisting);
                  }}
                >
                  Save Planning
                </Button>
              </div>
            </div>

            {/* Table */}
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="w-32 min-w-[8rem] border-b border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-3" />
                  {shifts.map((shift) => (
                    <th key={shift.id} className="border-b border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-3 text-center last:border-r-0">
                      <span className="block text-sm font-bold text-gray-800 dark:text-white/90">{shift.label}</span>
                      {shift.sub && <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">{shift.sub}</span>}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {posts.map((post, rowIdx) => (
                  <tr key={post.id} className={rowIdx % 2 === 0 ? "" : "bg-gray-50/50 dark:bg-white/[0.01]"}>
                    <td className="border-b border-r border-gray-200 dark:border-gray-700 p-3 last:border-b-0">
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{post.label}</span>
                    </td>

                    {shifts.map((shift) => {
                      const events = grid[post.id]?.[shift.id] ?? [];
                      return (
                        <td key={shift.id}
                          onClick={() => handleCellClick(post.id, shift.id)}
                          className={[
                            "border-b border-r border-gray-200 dark:border-gray-700 p-2 cursor-pointer transition-colors duration-150 last:border-r-0",
                            rowIdx === posts.length - 1 ? "border-b-0" : "",
                            "hover:bg-brand-50 dark:hover:bg-brand-900/10",
                          ].join(" ")}
                          style={{ minWidth: "160px", height: "64px" }}
                        >
                          {events.length > 0 ? (
                            <div className="flex flex-col gap-[2px] overflow-hidden">
                              {events.slice(0, 2).map((emp) => (
                                <div key={emp.id}
                                  className="text-[11px] px-2 py-[2px] text-gray-800 dark:text-white truncate"
                                  title={emp.title}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setListCell({ postId: post.id, shiftId: shift.id });
                                    setIsListModalOpen(true);
                                  }}
                                >
                                  {emp.title}
                                </div>
                              ))}
                              {events.length > 2 && (
                                <div className="text-[10px] text-gray-400 px-2 cursor-pointer hover:text-gray-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setListCell({ postId: post.id, shiftId: shift.id });
                                    setIsListModalOpen(true);
                                  }}
                                >
                                  +{events.length - 2}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center justify-center h-full opacity-0 hover:opacity-100 transition-opacity">
                              <span className="text-xs text-gray-400 dark:text-gray-600">+ Add</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Add Modal ─────────────────────────────────────────────────── */}
          <Modal isOpen={isOpen} onClose={handleClose} className="max-w-[500px] p-6 lg:p-10">
            <div className="flex flex-col gap-6">
              <div>
                <h5 className="mb-1 font-semibold text-gray-800 text-theme-xl dark:text-white/90 lg:text-2xl">
                  Add Assignment
                </h5>
                {activePost && activeShift && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {activePost.label}: {activeShift.label}
                  </p>
                )}
              </div>

              {/* Search input */}
              <div className="relative">
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  Search Employee
                </label>
                <input
                  autoFocus
                  type="text"
                  value={selectedEmployee
                    ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}`
                    : empSearch}
                  onChange={(e) => { setEmpSearch(e.target.value); setSelectedEmployee(null); }}
                  placeholder="Type a name or employee number…"
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                />

                {/* Dropdown list */}
                {!selectedEmployee && empSearch.length > 0 && (
                  <ul className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg max-h-48 overflow-y-auto">
                    {filteredEmployees.length === 0 ? (
                      <li className="px-4 py-3 text-sm text-gray-400">No employees found</li>
                    ) : filteredEmployees.map((emp) => (
                      <li
                        key={emp._id}
                        onClick={() => { setSelectedEmployee(emp); setEmpSearch(""); }}
                        className="flex items-center justify-between px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-brand-50 dark:hover:bg-brand-900/20 cursor-pointer"
                      >
                        <span>{emp.firstName} {emp.lastName}</span>
                        <span className="text-xs text-gray-400 font-mono">#{emp.empNumber}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Selected badge */}
              {selectedEmployee && (
                <div className="flex items-center justify-between rounded-lg bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 px-3 py-2">
                  <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
                    ✓ {selectedEmployee.firstName} {selectedEmployee.lastName}
                    <span className="ml-2 text-xs text-brand-400">#{selectedEmployee.empNumber}</span>
                  </span>
                  <button
                    onClick={() => { setSelectedEmployee(null); setEmpSearch(""); }}
                    className="text-brand-400 hover:text-brand-600 text-xs"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="flex items-center gap-3 sm:justify-end">
                <button onClick={handleClose} type="button"
                  className="flex w-full justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] sm:w-auto">
                  Cancel
                </button>
                <button onClick={handleSave} type="button"
                  disabled={!selectedEmployee}
                  className="flex w-full justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed sm:w-auto">
                  Add
                </button>
              </div>
            </div>
          </Modal>

          {/* ── List Modal ────────────────────────────────────────────────── */}
          <Modal isOpen={isListModalOpen} onClose={() => setIsListModalOpen(false)} className="max-w-[400px] p-6 relative">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Employees in Shift</h3>
                <p className="text-xs text-gray-400 mt-1">{listEmployees.length} assigned employee(s)</p>
              </div>
              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                {listEmployees.map((emp) => (
                  <div key={emp.id} className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm text-gray-700 dark:text-white flex items-center justify-between">
                    <span className="truncate">{emp.title}</span>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <button onClick={() => openEditModal(emp, listCell!)} type="button" className="text-blue-400 hover:text-blue-600 text-xs font-medium">Edit</button>
                      <button onClick={() => { if (!listCell) return; handleDelete(emp.id, listCell); if (listEmployees.length <= 1) setIsListModalOpen(false); }} type="button" className="text-red-400 hover:text-red-600 text-xs font-medium">Remove</button>
                    </div>
                  </div>
                ))}
                {listEmployees.length === 0 && <div className="text-sm text-gray-400 text-center py-6">No employees assigned</div>}
              </div>
              <button onClick={() => setIsListModalOpen(false)} type="button" className="flex w-full justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600">Hide details</button>
            </div>
          </Modal>

          {/* ── Edit Modal ────────────────────────────────────────────────── */}
          <Modal isOpen={isEditModalOpen} onClose={handleCloseEditModal} className="max-w-[500px] p-6 lg:p-10">
            <div className="flex flex-col gap-6">
              <div>
                <h5 className="mb-1 font-semibold text-gray-800 text-theme-xl dark:text-white/90 lg:text-2xl">Edit Assignment</h5>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Title</label>
                <input autoFocus type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleEdit()} placeholder="ex: John Doe"
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                />
              </div>
              <div className="flex items-center gap-3 sm:justify-end">
                <button onClick={handleCloseEditModal} type="button" className="flex w-full justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] sm:w-auto">Cancel</button>
                <button onClick={handleEdit} type="button" className="flex w-full justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 sm:w-auto">Update</button>
              </div>
            </div>
          </Modal>
        </div>
      </div>
    </>
  );
};

export default ShiftGrid;
