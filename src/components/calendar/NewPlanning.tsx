"use client";
import React from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import TaskRow from "@/components/TaskRow/TaskRow";
// import { ArrowDownTrayIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";

import {
  ArrowDownTrayIcon,
  TableCellsIcon,
  ArrowUturnLeftIcon,
} from "@heroicons/react/24/outline";
import { useShiftGrid } from "@/hooks/useNewPlanning";
import Tooltip from "@/components/common/Tooltip";
import { locale, t } from "@/lib/i18n";

const ShiftGrid: React.FC = () => {
  //table mode view
  const [showTableOnly, setShowTableOnly] = React.useState(false);
  const {
  posts, shifts, filteredEmployees, loadingMeta, metaError, loadingGrid,
  grid,
  currentDate, setCurrentDate,
  calendarMonth, setCalendarMonth,
  goToToday, goPrev, goNext, formattedDate,
  isOpen, activeCell, empSearch, setEmpSearch, selectedEmployee, setSelectedEmployee, backupEmpSearch, setBackupEmpSearch, selectedBackupEmployees, addBackup, removeBackup,
  filteredBackupEmployees,
  handleCellClick, handleSave, handleClose,
  isEditModalOpen, editSelectedEmployee, editingEmployee, setEditSelectedEmployee, editTitle, setEditTitle, editBackupEmployees, addEditBackup, removeEditBackup, editBackupSearch, setEditBackupSearch,
  filteredEditBackupEmployees, filteredEditEmployees,
  addTasks, setAddTasks, addTask, updateTask, removeTask,
  editTasks, addEditTask, updateEditTask, removeEditTask,
  openEditModal, handleEdit, handleCloseEditModal,
  isListModalOpen, setIsListModalOpen,
  listCell, setListCell, listEmployees,
  handleDelete, handleSavePlanning,
  isImportModalOpen,
  setIsImportModalOpen,
  importDate,
  setImportDate,
  excelInputRef, pdfInputRef, handleImportClick, handleExcelImportClick, handlePdfImportClick ,handleImportFile, handleImportFromDate,
  showImportMenu,
  handleSaveToAllWeekdays, handleSaveToNextWeekdays,
  isCopyMonthModalOpen,
  setIsCopyMonthModalOpen,
  copySourceMonth,
  setCopySourceMonth,
  copyDestinationMonth,
  setCopyDestinationMonth,
  isCopyingMonth,
  handleCopyMonthClick,
  handleCopyMonth,
  } = useShiftGrid();

  const activePost  = activeCell ? posts.find((p) => p.id === activeCell.postId)  : null;
  const activeShift = activeCell ? shifts.find((s) => s.id === activeCell.shiftId) : null;

  // "Ali Ali, Akram Akram" or "No backup"
  const backupLabel = (backups?: { title: string }[]) =>
    backups && backups.length > 0
      ? backups.map((b) => b.title).join(", ")
      : t("No backup");

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
      {t("Loading shifts and tasks…")}
    </div>
  );

  if (metaError) return (
    <div className="flex items-center justify-center h-40 text-red-400 text-sm">
      ⚠ {metaError}
    </div>
  );


  return (
  <>
        {/* Page header / view controls */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 ms-auto">
            
            {/* Show table only */}
            <Tooltip text="Show table only">
              <button
                type="button"
                onClick={() => setShowTableOnly(true)}
                disabled={showTableOnly}
                className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-colors ${
                  !showTableOnly
                    ? "border-gray-700 text-brand-500 hover:bg-brand-500 hover:text-white"
                    : "border-gray-800 text-gray-600 opacity-40 cursor-not-allowed"
                }`}
                aria-label={t("Show table only")}
              >
                <TableCellsIcon className="h-5 w-5" />
              </button>
            </Tooltip>

            {/* Back to normal view */}
            <Tooltip text="Back to normal view">
              <button
                type="button"
                onClick={() => setShowTableOnly(false)}
                disabled={!showTableOnly}
                className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-colors ${
                  showTableOnly
                    ? "border-gray-700 text-brand-500 hover:bg-brand-500 hover:text-white"
                    : "border-gray-800 text-gray-600 opacity-40 cursor-not-allowed"
                }`}
                aria-label={t("Back to normal view")}
              >
                <ArrowUturnLeftIcon className="h-5 w-5" />
              </button>
            </Tooltip>

          </div>
        </div>
        {/* <div
          className={`flex gap-4 items-start ${
            showTableOnly ? "w-full" : ""
          }`}
          style={{ marginBottom: "20px" }}
        > */}
        <div
          className={`flex gap-4 items-start w-full`}
          style={{ marginBottom: "20px" }}
        >
        {/* ── Mini Calendar + Import actions ───────────────────────────────── */}
        {!showTableOnly && (
          <div className="flex flex-col gap-3 min-w-[260px]">
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-800 dark:text-white">
                  {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </span>
                <div className="flex gap-1">
                  <Tooltip text="Go to previous month">
                    <button onClick={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1))}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    </button>
                  </Tooltip>
                  <Tooltip text="Go to next month">
                    <button onClick={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1))}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </Tooltip>
                </div>
              </div>

              <div className="grid grid-cols-7 w-[224px] mx-auto mb-1">
                <Tooltip text="Sunday">
                  <div className="text-center text-[11px] font-medium text-gray-400 py-1">S</div>
                </Tooltip>
                <Tooltip text="Monday">
                  <div className="text-center text-[11px] font-medium text-gray-400 py-1">M</div>
                </Tooltip>
                <Tooltip text="Tuesday">
                  <div className="text-center text-[11px] font-medium text-gray-400 py-1">T</div>
                </Tooltip>
                <Tooltip text="Wednesday">
                  <div className="text-center text-[11px] font-medium text-gray-400 py-1">W</div>
                </Tooltip>
                <Tooltip text="Thursday">
                  <div className="text-center text-[11px] font-medium text-gray-400 py-1">T</div>
                </Tooltip>
                <Tooltip text="Friday">
                  <div className="text-center text-[11px] font-medium text-gray-400 py-1">F</div>
                </Tooltip>
                <Tooltip text="Saturday">
                  <div className="text-center text-[11px] font-medium text-gray-400 py-1">S</div>
                </Tooltip>
              </div>

              <div className="grid grid-cols-7 w-[224px] mx-auto">
                {getCalendarDays(calendarMonth).map(({ date, currentMonth }, i) => {
                  const isToday    = date.toDateString() === new Date().toDateString();
                  const isSelected = date.toDateString() === currentDate.toDateString();
                  return (
                    <Tooltip text="select this date to do its planning" key={i}>
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
                    </Tooltip>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.xls"
                hidden
                onChange={handleImportFile}
              />

              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf"
                hidden
                onChange={handleImportFile}
              />

              {/* Import File Dropdown */}
              <div className="relative">
                <Button
                    size="sm"
                    variant="primary"
                    onClick={handleImportClick}
                    className="w-full justify-center"
                >
                    <ArrowDownTrayIcon
                      className="w-4 h-4 text-gray-100"
                      strokeWidth={3}
                    />
                    {t("Import from File")}
                </Button>
                {showImportMenu && (
                  <div className="absolute start-0 end-0 mt-2 z-50 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">

                    {/* Excel */}
                    <Tooltip text="Import a daily planning from an Excel file (Local machine storage).">
                      <button
                        type="button"
                        onClick={handleExcelImportClick}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        📊
                        <span>{t("Import from Excel")}</span>
                      </button>
                    </Tooltip>

                    {/* PDF */}
                    <Tooltip text="Import a daily planning from a PDF file (Local machine storage).">
                      <button
                        type="button"
                        onClick={handlePdfImportClick}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        📄
                        <span>{t("Import from PDF")}</span>
                      </button>
                    </Tooltip>

                  </div>
                )}
              </div>

              <Tooltip text="Copy the planning of another day (no file needed, just pick the day).">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setIsImportModalOpen(true)}
                  className="w-full justify-center"
                >
                  <ArrowDownTrayIcon
                    className="w-4 h-4 text-gray-100"
                    strokeWidth={3}
                  />
                  {t("Import from Date")}
                </Button>
              </Tooltip>
              <Tooltip text="Copy and save the planning from one month to another month.">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleCopyMonthClick}
                  className="w-full justify-center"
                >
                  {t("Copy Month")}
                </Button>
              </Tooltip>
            </div>
          </div>
        )}

        {/* ── Grid ───────────────────────────────────────────────────────── */}
        <div
          className={`min-w-0 rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-hidden ${
            showTableOnly ? "w-full flex-1" : "flex-1"
          }`}
        >
          <div className="overflow-x-auto">
            {/* Date navigation */}
            {!showTableOnly && (
              <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
                {/* Today */}
                <Tooltip text="Go to today">
                  <button
                    onClick={goToToday}
                    type="button"
                    className="shrink-0 rounded-full border border-gray-300 dark:border-gray-600 px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    {t("Today")}
                  </button>
                </Tooltip>
                {/* Previous / Next */}
                <div className="flex shrink-0 items-center gap-1">
                  <Tooltip text="Go to Previous day">
                    <button
                      onClick={goPrev}
                      type="button"
                      className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 19l-7-7 7-7"
                        />
                      </svg>
                    </button>
                  </Tooltip>
                  <Tooltip text="Go to Next day">
                    <button
                      onClick={goNext}
                      type="button"
                      className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>
                  </Tooltip>
                </div>

                {/* Date */}
                {/* <div className="min-w-0 overflow-hidden">
                  <span className="block truncate text-sm font-medium text-gray-800 dark:text-white">
                    {formattedDate}
                  </span>
                </div> */}

                {/* Buttons */}
                <div className="flex shrink-0 flex-nowrap justify-end gap-2">

                  {/* Save */}
                  <Tooltip text="Save this planning to only the selected day in the calendar.">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleSavePlanning()}
                      className="h-10 shrink-0 px-3 justify-center text-center whitespace-nowrap"
                    >
                      {t("Save")}
                    </Button>
                  </Tooltip>

                  {/* Save to all */}
                  <Tooltip text="Save this planning to all corresponding weekdays.">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={handleSaveToAllWeekdays}
                      className="h-10 shrink-0 px-3 justify-center text-center whitespace-nowrap"
                    >
                      {t("Save to every {weekday}", {
                        weekday: currentDate.toLocaleDateString(locale(), { weekday: "long" }),
                      })}
                    </Button>
                  </Tooltip>

                  {/* Save to next weekdays */}
                  <Tooltip text="Save this planning to all occurrences of the selected weekday in this month.">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={handleSaveToNextWeekdays}
                      className="h-10 shrink-0 px-3 justify-center text-center whitespace-nowrap"
                    >
                      {t("Save to the next {weekday}s", {
                        weekday: currentDate.toLocaleDateString(locale(), { weekday: "long" }),
                      })}
                    </Button>
                  </Tooltip>
                </div>
              </div>
            )}

            {/* Tables */}
            {!showTableOnly && (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="w-32 min-w-[8rem] border-b border-e border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-3" />
                    {shifts.map((shift) => (
                      <th key={shift.id} className="border-b border-e border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-3 text-center last:border-e-0">
                        <span className="block text-sm font-bold text-gray-800 dark:text-white/90">{shift.label}</span>
                        {shift.sub && <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">{shift.sub}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {posts.map((post, rowIdx) => (
                    <tr key={post.id} className={rowIdx % 2 === 0 ? "" : "bg-gray-50/50 dark:bg-white/[0.01]"}>
                      <td className="border-b border-e border-gray-200 dark:border-gray-700 p-3 last:border-b-0">
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{post.label}</span>
                      </td>

                      {shifts.map((shift) => {
                        const events = grid[post.id]?.[shift.id] ?? [];
                        return (
                          <td key={shift.id}
                            onClick={() => handleCellClick(post.id, shift.id)}
                            className={[
                              "border-b border-e border-gray-200 dark:border-gray-700 p-2 cursor-pointer transition-colors duration-150 last:border-e-0",
                              rowIdx === posts.length - 1 ? "border-b-0" : "",
                              "hover:bg-brand-50 dark:hover:bg-brand-900/10",
                            ].join(" ")}
                            style={{ minWidth: "160px", height: "64px" }}
                          >
                            {events.length > 0 ? (
                              <div className="flex flex-col gap-[2px] overflow-hidden">
                                {events.slice(0, 2).map((emp) => (
                                  <div
                                    key={emp.id}
                                    className="flex flex-col"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setListCell({
                                        postId: post.id,
                                        shiftId: shift.id
                                      });
                                      setIsListModalOpen(true);
                                    }}
                                  >
                                    {/* Main employee */}
                                    <span
                                      className="text-[11px] px-2 py-[2px] text-gray-800 dark:text-white truncate"
                                      title={emp.title}
                                    >
                                      {emp.title}
                                    </span>

                                    {/* Backup employees */}
                                    <span
                                      className="text-[10px] px-2 text-gray-400 dark:text-gray-500 truncate"
                                      title={`Backup: ${backupLabel(emp.backups)}`}
                                    >
                                      Backup: {backupLabel(emp.backups)}
                                    </span>

                                    {/* Tasks */}
                                    {emp.tasks && emp.tasks.length > 0 && (
                                      <span className="text-[10px] text-gray-400 px-2 truncate">
                                        {emp.tasks
                                          .map(
                                            (t) =>
                                              `${t.startTime}-${t.endTime} ${t.label}`
                                          )
                                          .join(" · ")}
                                      </span>
                                    )}
                                  </div>
                                ))}

                                {events.length > 2 && (
                                  <div
                                    className="text-[10px] text-gray-400 px-2 cursor-pointer hover:text-gray-600"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setListCell({
                                        postId: post.id,
                                        shiftId: shift.id
                                      });
                                      setIsListModalOpen(true);
                                    }}
                                  >
                                    +{events.length - 2}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center justify-center h-full opacity-0 hover:opacity-100 transition-opacity">
                                <span className="text-xs text-gray-400 dark:text-gray-600">
                                  + Add
                                </span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* 2nd Table */}
            {showTableOnly && (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="w-32 min-w-[8rem] border-b border-e border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-3" />

                    {shifts.map((shift) => (
                      <th
                        key={shift.id}
                        className="border-b border-e border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-3 text-center last:border-e-0"
                      >
                        <span className="block text-sm font-bold text-gray-800 dark:text-white/90">
                          {shift.label}
                        </span>

                        {shift.sub && (
                          <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            {shift.sub}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {posts.map((post, rowIdx) => (
                    <tr
                      key={post.id}
                      className={
                        rowIdx % 2 === 0
                          ? ""
                          : "bg-gray-50/50 dark:bg-white/[0.01]"
                      }
                    >
                      {/* Post name */}
                      <td className="border-b border-e border-gray-200 dark:border-gray-700 p-3 last:border-b-0">
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          {post.label}
                        </span>
                      </td>

                      {shifts.map((shift) => {
                        const events = grid[post.id]?.[shift.id] ?? [];

                        return (
                          <td
                            key={shift.id}
                            onClick={() => handleCellClick(post.id, shift.id)}
                            className={[
                              "border-b border-e border-gray-200 dark:border-gray-700 p-2 cursor-pointer transition-colors duration-150 last:border-e-0",
                              rowIdx === posts.length - 1 ? "border-b-0" : "",
                              "hover:bg-brand-50 dark:hover:bg-brand-900/10",
                            ].join(" ")}
                            style={{
                              minWidth: "160px",
                              minHeight: "64px",
                            }}
                          >
                            {events.length > 0 ? (
                              <div className="flex flex-col gap-1">
                                {events.map((emp) => (
                                  <div
                                    key={emp.id}
                                    className="flex flex-col rounded-md px-2 py-1 hover:bg-gray-100 dark:hover:bg-white/[0.05]"
                                    onClick={(e) => {
                                      e.stopPropagation();

                                      setListCell({
                                        postId: post.id,
                                        shiftId: shift.id,
                                      });

                                      setIsListModalOpen(true);
                                    }}
                                  >
                                    {/* Main employee */}
                                    <span
                                      className="text-[11px] font-medium text-gray-800 dark:text-white truncate"
                                      title={emp.title}
                                    >
                                      {emp.title}
                                    </span>

                                    {/* Backup employees */}
                                    <span
                                      className="text-[10px] text-gray-400 dark:text-gray-500 truncate"
                                      title={`Backup: ${backupLabel(emp.backups)}`}
                                    >
                                      Backup: {backupLabel(emp.backups)}
                                    </span>

                                    {/* Tasks */}
                                    {emp.tasks && emp.tasks.length > 0 && (
                                      <span
                                        className="text-[10px] text-gray-400 dark:text-gray-500 truncate"
                                        title={emp.tasks
                                          .map(
                                            (t) =>
                                              `${t.startTime}-${t.endTime} ${t.label}`
                                          )
                                          .join(" · ")}
                                      >
                                        {emp.tasks
                                          .map(
                                            (t) =>
                                              `${t.startTime}-${t.endTime} ${t.label}`
                                          )
                                          .join(" · ")}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="flex items-center justify-center min-h-[64px] opacity-0 hover:opacity-100 transition-opacity">
                                <span className="text-xs text-gray-400 dark:text-gray-600">
                                  + Add
                                </span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>













          {/* ── Add Modal ─────────────────────────────────────────────────── */}
          <Modal isOpen={isOpen} onClose={handleClose} className="max-w-[500px] p-6 lg:p-10">
            <div className="flex flex-col gap-6">
              <div>
                <h5 className="mb-1 font-semibold text-gray-800 text-theme-xl dark:text-white/90 lg:text-2xl">
                  {t("Add Assignment")}
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
                  {t("Main Employee")}
                </label>
                <Tooltip text="Write the name of the main employee. Then optionally add backups below, and hit Add.">
                  <input
                    autoFocus
                    type="text"
                    value={selectedEmployee
                      ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}`
                      : empSearch}
                    onChange={(e) => { setEmpSearch(e.target.value); setSelectedEmployee(null); }}
                    placeholder={t("Type a name or employee number…")}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                  />
                </Tooltip>
                {/* Dropdown list */}
                {!selectedEmployee && empSearch.length > 0 && (
                  <ul className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg max-h-48 overflow-y-auto">
                    {filteredEmployees.length === 0 ? (
                      <li className="px-4 py-3 text-sm text-gray-400">{t("No employees found")}</li>
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
                    <span className="ms-2 text-xs text-brand-400">#{selectedEmployee.empNumber}</span>
                  </span>
                  <button
                    onClick={() => { setSelectedEmployee(null); setEmpSearch(""); }}
                    className="text-brand-400 hover:text-brand-600 text-xs"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Backup Employees */}
              <div className="relative">
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  {t("Backup Employees")}
                  <span className="ms-1 text-xs text-gray-400">{t("(optional)")}</span>
                </label>

                <Tooltip text="Type a name and press Enter (or click a result) to add a backup. Repeat to add more.">
                  <input
                    type="text"
                    value={backupEmpSearch}
                    onChange={(e) => setBackupEmpSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (backupEmpSearch.trim() && filteredBackupEmployees.length > 0) {
                          addBackup(filteredBackupEmployees[0]);
                        }
                      }
                    }}
                    placeholder={t("Search backup employee...")}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
                  />
                </Tooltip>

                {backupEmpSearch.trim().length > 0 && (
                  <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                    {filteredBackupEmployees.length === 0 ? (
                      <li className="px-4 py-3 text-sm text-gray-400">{t("No employees found")}</li>
                    ) : (
                      filteredBackupEmployees.map((emp, i) => (
                        <li
                          key={emp._id}
                          onClick={() => addBackup(emp)}
                          className={`flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm text-gray-700 hover:bg-brand-50 dark:text-gray-200 dark:hover:bg-brand-900/20 ${
                            i === 0 ? "bg-brand-50/60 dark:bg-brand-900/10" : ""
                          }`}
                        >
                          <span>{emp.firstName} {emp.lastName}</span>
                          <span className="font-mono text-xs text-gray-400">#{emp.empNumber}</span>
                        </li>
                      ))
                    )}
                  </ul>
                )}

                {selectedBackupEmployees.length > 0 && (
                  <div className="mt-2 flex flex-col gap-2">
                    {selectedBackupEmployees.map((b) => (
                      <div
                        key={b._id}
                        className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                      >
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                          {b.firstName} {b.lastName}
                          <span className="ms-2 text-xs text-gray-400">#{b.empNumber}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeBackup(b._id)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── task breakdown ─────────────────────────────────────── */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <Tooltip
                    text="Add a task within the shift: start time, end time, then its name. Use the cross to remove it."
                  >
                    <button
                      type="button"
                      onClick={addTask}
                      className="text-xs font-medium text-brand-500 hover:text-brand-600"
                    >
                      + Add task
                    </button>
                  </Tooltip>
                </div>

                {addTasks.length === 0 && (
                  <p className="text-xs text-gray-400 mb-2">
                    {t("No tasks yet — the employee is shown for the full shift. Add a task to split the time.")}
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2">
                    {addTasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onUpdate={(patch) => updateTask(task.id, patch)}
                        onRemove={() => removeTask(task.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>
              {/* ── end task breakdown block ───────────────────────────── */}
              <div className="flex items-center gap-3 sm:justify-end">
                <button onClick={handleClose} type="button"
                  className="flex w-full justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] sm:w-auto">
                  {t("Cancel")}
                </button>
                <button onClick={handleSave} type="button"
                  disabled={!selectedEmployee}
                  className="flex w-full justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed sm:w-auto">
                  {t("Add")}
                </button>
              </div>
            </div>
          </Modal>

          {/* ── List Modal ────────────────────────────────────────────────── */}
          <Modal isOpen={isListModalOpen} onClose={() => setIsListModalOpen(false)} className="max-w-[400px] p-6 relative">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">{t("Employees in Shift")}</h3>
                <p className="text-xs text-gray-400 mt-1">{listEmployees.length} assigned employee(s)</p>
              </div>
              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pe-1">
                {listEmployees.map((emp) => (
                  <div key={emp.id} className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm text-gray-700 dark:text-white">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col min-w-0">
                        <span className="truncate font-medium">{emp.title}</span>

                        {emp.backups && emp.backups.length > 0 ? (
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            <span className="text-xs text-gray-400">{t("Backup:")}</span>
                            {emp.backups.map((b) => (
                              <span
                                key={b.id}
                                className="rounded bg-white px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                              >
                                {b.title}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 truncate">{t("Backup:")} {t("No backup")}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ms-2 shrink-0">
                        <Tooltip text="Change this assignment: the main employee, the backups, or tasks within the shift.">
                        <button onClick={() => openEditModal(emp, listCell!)} type="button" className="text-blue-400 hover:text-blue-600 text-xs font-medium">{t("Edit")}</button>
                        </Tooltip>
                        <Tooltip text="Remove this employee from the planning.">
                        <button onClick={() => { if (!listCell) return; handleDelete(emp.id, listCell); if (listEmployees.length <= 1) setIsListModalOpen(false); }} type="button" className="text-red-400 hover:text-red-600 text-xs font-medium">{t("Remove")}</button>
                        </Tooltip>
                      </div>
                    </div>
                    {emp.tasks && emp.tasks.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {emp.tasks.map((t) => (
                          <span key={t.id} className="text-[10px] text-gray-500 bg-white dark:bg-gray-700 rounded px-1.5 py-0.5">
                            {t.startTime}-{t.endTime} {t.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {listEmployees.length === 0 && <div className="text-sm text-gray-400 text-center py-6">{t("No employees assigned")}</div>}
              </div>
              <Tooltip text="Close this list (or use the cross at the top of the window).">
              <button onClick={() => setIsListModalOpen(false)} type="button" className="flex w-full justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600">Hide details</button>
              </Tooltip>
            </div>
          </Modal>

          {/* ── Edit Modal ────────────────────────────────────────────────── */}
          <Modal isOpen={isEditModalOpen} onClose={handleCloseEditModal} className="max-w-[500px] p-6 lg:p-10">
            <div className="flex flex-col gap-6">
              <div>
                <h5 className="mb-1 font-semibold text-gray-800 text-theme-xl dark:text-white/90 lg:text-2xl">{t("Edit Assignment")}</h5>
              </div>

              <div className="relative">
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  {t("Main Employee")}
                </label>
                <Tooltip text="Click Remove below to clear the current employee, then type the new one here.">
                <input
                  autoFocus
                  type="text"
                  value={
                    editSelectedEmployee
                      ? `${editSelectedEmployee.firstName} ${editSelectedEmployee.lastName}`
                      : editTitle
                  }
                  onChange={(e) => {
                    setEditTitle(e.target.value);
                    setEditSelectedEmployee(null);
                  }}
                  placeholder={t("Search employee...")}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                />
                </Tooltip>
                {!editSelectedEmployee && editTitle.length > 0 && (
                  <ul className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg max-h-48 overflow-y-auto">

                    {filteredEditEmployees.length === 0 ? (
                      <li className="px-4 py-3 text-sm text-gray-400">
                        {t("No employees found")}
                      </li>
                    ) : (
                      filteredEditEmployees.map((employee) => (
                        <li
                          key={employee._id}
                          onClick={() => {
                            setEditSelectedEmployee(employee);
                            setEditTitle(
                              `${employee.firstName} ${employee.lastName}`
                            );
                          }}
                          className="flex items-center justify-between px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-brand-50 dark:hover:bg-brand-900/20 cursor-pointer"
                        >
                          <span>
                            {employee.firstName} {employee.lastName}
                          </span>

                          <span className="text-xs text-gray-400 font-mono">
                            #{employee.empNumber}
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                )}
                {editSelectedEmployee && (
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2">

                    <span className="text-sm text-gray-700 dark:text-gray-200">
                      {editSelectedEmployee.firstName}{" "}
                      {editSelectedEmployee.lastName}

                      <span className="ms-2 text-xs text-gray-400">
                        #{editSelectedEmployee.empNumber}
                      </span>
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setEditSelectedEmployee(null);
                        setEditTitle("");
                      }}
                      className="text-red-400 hover:text-red-600 text-xs"
                    >
                      {t("Remove")}
                    </button>
                  </div>
                )}
              </div>

              {/* Backup Employees */}
              <div className="relative">
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  {t("Backup Employees")}
                  <span className="ms-1 text-xs text-gray-400">{t("(optional)")}</span>
                </label>

                <Tooltip text="Type a name and press Enter (or click a result) to add a backup. Click ✕ on a backup to remove it.">
                  <input
                    type="text"
                    value={editBackupSearch}
                    onChange={(e) => setEditBackupSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (editBackupSearch.trim() && filteredEditBackupEmployees.length > 0) {
                          addEditBackup(filteredEditBackupEmployees[0]);
                        }
                      }
                    }}
                    placeholder={t("Search backup employee...")}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  />
                </Tooltip>

                {editBackupSearch.trim().length > 0 && (
                  <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                    {filteredEditBackupEmployees.length === 0 ? (
                      <li className="px-4 py-3 text-sm text-gray-400">{t("No employees found")}</li>
                    ) : (
                      filteredEditBackupEmployees.map((emp, i) => (
                        <li
                          key={emp._id}
                          onClick={() => addEditBackup(emp)}
                          className={`flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm text-gray-700 hover:bg-brand-50 dark:text-gray-200 dark:hover:bg-brand-900/20 ${
                            i === 0 ? "bg-brand-50/60 dark:bg-brand-900/10" : ""
                          }`}
                        >
                          <span>{emp.firstName} {emp.lastName}</span>
                          <span className="font-mono text-xs text-gray-400">#{emp.empNumber}</span>
                        </li>
                      ))
                    )}
                  </ul>
                )}

                {editBackupEmployees.length > 0 && (
                  <div className="mt-2 flex flex-col gap-2">
                    {editBackupEmployees.map((b) => (
                      <div
                        key={b._id}
                        className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                      >
                        <span className="text-sm text-gray-700 dark:text-gray-200">
                          {b.firstName} {b.lastName}
                          <span className="ms-2 text-xs text-gray-400">#{b.empNumber}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeEditBackup(b._id)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* ── task breakdown ─────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Tooltip text="Add a task within the shift: start time, end time, then its name. Use the cross to remove it.">
                  <button type="button" onClick={addEditTask} className="text-xs font-medium text-brand-500 hover:text-brand-600">
                    + Add task
                  </button>
                  </Tooltip>
                </div>

                {editTasks.length === 0 && (
                  <p className="text-xs text-gray-400 mb-2">
                    No tasks yet — the employee is shown for the full shift. Add a task to split the time.
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2">
                    {editTasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onUpdate={(patch) => updateEditTask(task.id, patch)}
                        onRemove={() => removeEditTask(task.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>
              {/* ── end task breakdown block ───────────────────────────────── */}

              <div className="flex items-center gap-3 sm:justify-end">
                <button onClick={handleCloseEditModal} type="button" className="flex w-full justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] sm:w-auto">{t("Cancel")}</button>
                <button onClick={handleEdit} type="button" className="flex w-full justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 sm:w-auto">{t("Update")}</button>
              </div>
            </div>
          </Modal>

          {/* ── Import From Date Modal ────────────────────────────────────── */}
          <Modal
            isOpen={isImportModalOpen}
            onClose={() => setIsImportModalOpen(false)}
            className="max-w-[450px] p-6"
          >
            <div className="flex flex-col gap-5">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                  {t("Import Planning")}
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Select the date to import planning from.
                </p>
              </div>
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t("Source Date")}
                </label>
                <input
                  type="date"
                  value={importDate}
                  onChange={(e) => setImportDate(e.target.value)}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4
                            dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-3">

                <Button
                  variant="outline"
                  onClick={() => setIsImportModalOpen(false)}
                >
                  {t("Cancel")}
                </Button>

                <Button
                  variant="primary"
                  disabled={!importDate}
                  onClick={async () => {
                    await handleImportFromDate(new Date(importDate));
                    setIsImportModalOpen(false);
                    setImportDate("");
                  }}
                >
                  {t("Import")}
                </Button>

              </div>

            </div>
          </Modal>

          {/* ── Copy Month Modal ────────────────────────────────────── */}
          {isCopyMonthModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900">

              <h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-white">
                {t("Copy Monthly Planning")}
              </h2>

              <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
                {t("Select the month you want to copy from and the month you want to copy to.")}
              </p>

              {/* Source */}
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t("Source month")}
                </label>

                <input
                  type="month"
                  value={copySourceMonth}
                  onChange={(e) => setCopySourceMonth(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              {/* Destination */}
              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t("Destination month")}
                </label>

                <input
                  type="month"
                  value={copyDestinationMonth}
                  onChange={(e) => setCopyDestinationMonth(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-3">

                <button
                  type="button"
                  onClick={() => setIsCopyMonthModalOpen(false)}
                  disabled={isCopyingMonth}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {t("Cancel")}
                </button>

                <button
                  type="button"
                  onClick={handleCopyMonth}
                  disabled={
                    isCopyingMonth ||
                    !copySourceMonth ||
                    !copyDestinationMonth
                  }
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCopyingMonth ? t("Copying…") : t("Copy Month")}
                </button>

              </div>

            </div>
          </div>
        )}
        </div>
      </div>
    </>
  );
};

export default ShiftGrid;



