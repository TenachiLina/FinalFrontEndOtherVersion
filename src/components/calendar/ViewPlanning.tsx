"use client";
import React from "react";
import { Modal } from "@/components/ui/modal";
import { useViewPlanning } from "@/hooks/useViewPlanning";
import Button from "../ui/button/Button";
import { ArrowDownTrayIcon, ArrowTopRightOnSquareIcon, ArrowUturnLeftIcon, TableCellsIcon } from "@heroicons/react/24/outline";
import Tooltip from "@/components/common/Tooltip";
import LoadError from "@/components/ui/feedback/LoadError";
import { t } from "@/lib/i18n";
import type { Cell } from "./types";

// Backups saved by the planning editor (backupEmpIds); the legacy backupEmpId only when there are none
const backupLabel = (emp: Cell): string | null =>
  emp.backups?.length ? emp.backups.map((b) => b.title).join(", ") : emp.backupTitle ?? null;

const ViewCalender: React.FC = () => {
  //table mode view
  const [showTableOnly, setShowTableOnly] = React.useState(false);
  const {
    tasks, shifts,
    loadingMeta, metaError,
    grid,
    currentDate, setCurrentDate,
    calendarMonth, setCalendarMonth,
    goToToday, goPrev, goNext, formattedDate,
    activeEmployee, isDetailsModalOpen,
    handleCloseDetailsModal,
    isListModalOpen, setIsListModalOpen,
    listCell, setListCell, listEmployees,
    handleListCellClick,
    loading, error,
    handleExport,
    handleWeeklyExport,
    handleWeeklyExportManager,
    showExportDayMenu,
    showWeeklyExportMenu,
    showWeeklyExportManagerMenu,
    toggleExportMenu,
    toggleWeeklyExportMenu,
    toggleWeeklyExportManagerMenu,
    closeMenus,  
  } = useViewPlanning();

  const getCalendarDays = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();
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

  if (loadingMeta) return <div className="text-center text-gray-500 mt-4">{t("Loading...")}</div>;
  if (metaError) return <div className="text-center text-red-500 mt-4">Error: {metaError}</div>;

  return (
    <>
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

      <div className="flex gap-4 items-start" style={{ marginBottom: "20px" }}>
        {/* ── Mini Calendar ──────────────────────────────────────────────── */}
        {!showTableOnly && (
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
                  <Tooltip text="Select a day to see its planning in the end-side grid." key={i}>
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
        )}

        {/* ── Grid ───────────────────────────────────────────────────────── */}
          <div className="flex-1 rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-hidden">
            <div className="overflow-x-auto">
              {!showTableOnly && (
                <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
                  <button onClick={goToToday} type="button" className="rounded-full border border-gray-300 dark:border-gray-600 px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    {t("Today")}
                  </button>
                  <div className="flex items-center gap-1">
                    <button onClick={goPrev} type="button" className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <button onClick={goNext} type="button" className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </div>
                  <div className="ms-auto flex min-w-0 flex-1 items-center justify-end gap-1">
                    {/* Date - LEFT */}
                    {/* <div className="shrink-0">
                      <span className="text-sm font-medium text-gray-800 dark:text-white whitespace-nowrap">
                        {formattedDate}
                      </span>
                    </div> */}
                   
                    {/* Export Buttons - RIGHT */}
                    <div className="ms-auto flex shrink-0 items-center gap-2">

                      {/* Export Day */}
                      <div className="relative shrink-0">
                        <Tooltip text="Download only the planning of the selected day. Choose PDF or Excel.">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={toggleExportMenu}
                            className="h-10 whitespace-nowrap px-2 text-sm"
                          >
                            <ArrowTopRightOnSquareIcon
                              className="h-4 w-4 text-gray-100"
                              strokeWidth={3}
                            />
                            {t("Export Day")}
                          </Button>
                        </Tooltip>

                        {showExportDayMenu && (
                          <div className="absolute end-0 z-50 mt-2 w-48 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                            <button
                              className="flex w-full items-center gap-2 px-4 py-2 text-start text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                              onClick={() => {
                                handleExport("excel");
                                closeMenus();
                              }}
                            >
                              📊 Excel (.xlsx)
                            </button>
                            <button
                              className="flex w-full items-center gap-2 px-4 py-2 text-start text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                              onClick={() => {
                                handleExport("pdf");
                                closeMenus();
                              }}
                            >
                              📄 PDF (.pdf)
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Export Week (Manager) */}
                      <div className="relative shrink-0">
                        <Tooltip text="Download the manager's weekly planning in PDF or Excel format.">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={toggleWeeklyExportManagerMenu}
                            className="h-10 whitespace-nowrap px-2 text-sm"
                          >
                            <ArrowTopRightOnSquareIcon
                              className="h-4 w-4 text-gray-100"
                              strokeWidth={3}
                            />
                            {t("Manager Export")}
                          </Button>
                        </Tooltip>

                        {showWeeklyExportManagerMenu && (
                          <div className="absolute end-0 z-50 mt-2 w-48 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                            <button
                              className="flex w-full items-center gap-2 px-4 py-2 text-start text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                              onClick={() => {
                                handleWeeklyExportManager("excel");
                                closeMenus();
                              }}
                            >
                              📊 Excel (.xlsx)
                            </button>
                            <button
                              className="flex w-full items-center gap-2 px-4 py-2 text-start text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                              onClick={() => {
                                handleWeeklyExportManager("pdf");
                                closeMenus();
                              }}
                            >
                              📄 PDF (.pdf)
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Export Week */}
                      <div className="relative shrink-0">
                        <Tooltip text="Download the weekly planning in PDF or Excel format.">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={toggleWeeklyExportMenu}
                            className="h-10 whitespace-nowrap px-2 text-sm"
                          >
                            <ArrowTopRightOnSquareIcon
                              className="h-4 w-4 text-gray-100"
                              strokeWidth={3}
                            />
                            {t("Employees Export")}
                          </Button>
                        </Tooltip>

                        {showWeeklyExportMenu && (
                          <div className="absolute end-0 z-50 mt-2 w-48 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                            <button
                              className="flex w-full items-center gap-2 px-4 py-2 text-start text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                              onClick={() => {
                                handleWeeklyExport("excel");
                                closeMenus();
                              }}
                            >
                              📊 Excel (.xlsx)
                            </button>
                            <button
                              className="flex w-full items-center gap-2 px-4 py-2 text-start text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                              onClick={() => {
                                handleWeeklyExport("pdf");
                                closeMenus();
                              }}
                            >
                              📄 PDF (.pdf)
                            </button>
                          </div>
                        )}
                      </div>

                    </div>

                  </div>
                </div>
              )}
              {!showTableOnly && (
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="w-32 min-w-[8rem] border-b border-e border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-3" />
                      {/* ✅ Use shifts from DB */}
                      {shifts.map((shift) => (
                        <th key={shift._id} className="border-b border-e border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-3 text-center last:border-e-0">
                          <span className="block text-sm font-bold text-gray-800 dark:text-white/90">
                            {shift.startTime} - {shift.endTime}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {/* ✅ Use tasks from DB */}
                    {tasks.map((task, rowIdx) => (
                      <tr key={task._id} className={rowIdx % 2 === 0 ? "" : "bg-gray-50/50 dark:bg-white/[0.01]"}>
                        <td className="border-b border-e border-gray-200 dark:border-gray-700 p-3 last:border-b-0">
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            {task.taskName}
                          </span>
                        </td>

                        {shifts.map((shift) => {
                          // ✅ Safe access with optional chaining
                          const employees = grid[task.taskId]?.[shift._id] ?? [];
                          return (
                            <td
                              key={shift._id}
                              className={[
                                "border-b border-e border-gray-200 dark:border-gray-700 p-2 transition-colors duration-150 last:border-e-0",
                                rowIdx === tasks.length - 1 ? "border-b-0" : "",
                              ].join(" ")}
                              style={{ minWidth: "160px", height: "64px" }}
                            >
                              {employees.slice(0, 2).map((emp) => (
                                <div
                                  key={emp.id}
                                  className="flex flex-col cursor-pointer hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleListCellClick(task.taskId, shift._id);
                                  }}
                                >
                                  <span
                                    className="text-[11px] px-2 py-[2px] text-gray-800 dark:text-white truncate"
                                    title={
                                      backupLabel(emp)
                                        ? `${emp.title} (${backupLabel(emp)})`
                                        : emp.title
                                    }
                                  >
                                    {emp.title}
                                    {backupLabel(emp) && (
                                      <>
                                        {" ("}
                                        <strong>{t("Backup:")}</strong> {backupLabel(emp)}
                                        {")"}
                                      </>
                                    )}
                                  </span>

                                  {emp.tasks && emp.tasks.length > 0 && (
                                    <span className="text-[10px] text-gray-400 px-2 truncate">
                                      {emp.tasks
                                        .map((t) => `${t.startTime}-${t.endTime} ${t.label}`)
                                        .join(" · ")}
                                    </span>
                                  )}
                                </div>
                              ))}
                              {employees.length > 2 && (
                                <div
                                  className="text-[10px] text-gray-400 px-2 cursor-pointer hover:text-gray-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleListCellClick(task.taskId, shift._id);
                                  }}
                                >
                                  +{employees.length - 2}
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
              
              {showTableOnly && (
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {/* Empty corner cell */}
                      <th className="w-32 min-w-[8rem] border-b border-e border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-3" />

                      {/* Shift columns */}
                      {shifts.map((shift) => (
                        <th
                          key={shift._id}
                          className="border-b border-e border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-3 text-center last:border-e-0"
                        >
                          <span className="block text-sm font-bold text-gray-800 dark:text-white/90">
                            {shift.startTime} - {shift.endTime}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {/* Task rows */}
                    {tasks.map((task, rowIdx) => (
                      <tr
                        key={task._id}
                        className={
                          rowIdx % 2 === 0
                            ? ""
                            : "bg-gray-50/50 dark:bg-white/[0.01]"  
                        }
                      >
                        {/* Task name */}
                        <td className="border-b border-e border-gray-200 dark:border-gray-700 p-3">
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            {task.taskName}
                          </span>
                        </td>

                        {/* Shift cells */}
                        {shifts.map((shift) => {
                          const employees =
                            grid[task.taskId]?.[shift._id] ?? [];

                          return (
                            <td
                              key={shift._id}
                              className={[
                                "border-b border-e border-gray-200 dark:border-gray-700 p-2 transition-colors duration-150 last:border-e-0",
                                rowIdx === tasks.length - 1 ? "border-b-0" : "",
                                "hover:bg-brand-50 dark:hover:bg-brand-900/10",
                              ].join(" ")}
                              style={{
                                minWidth: "160px",
                                minHeight: "64px",
                              }}
                            >
                              {employees.length > 0 ? (
                                <div className="flex flex-col gap-1">
                                  {employees.map((emp) => (
                                    <div
                                      key={emp.id}
                                      className="flex flex-col rounded-md px-2 py-1 hover:bg-gray-100 dark:hover:bg-white/[0.05]"
                                      onClick={(e) => {
                                        e.stopPropagation();

                                        handleListCellClick(
                                          task.taskId,
                                          shift._id
                                        );
                                      }}
                                    >
                                      {/* Main employee */}
                                      <span
                                        className="text-[11px] font-medium text-gray-800 dark:text-white truncate"
                                        title={emp.title}
                                      >
                                        {emp.title}
                                      </span>

                                      {/* Backup employee */}
                                      <span
                                        className="text-[10px] text-gray-400 dark:text-gray-500 truncate"
                                        title={
                                          backupLabel(emp)
                                            ? `${t("Backup:")} ${backupLabel(emp)}`
                                            : t("No backup")
                                        }
                                      >
                                        {t("Backup:")} {backupLabel(emp) ?? t("No backup")}
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
            {/* ── Modals ── */}
            <Modal isOpen={isDetailsModalOpen} onClose={handleCloseDetailsModal} className="max-w-[400px] p-6">
              <div className="flex flex-col gap-6">
                <h5 className="font-semibold text-gray-800 text-lg dark:text-white/90">{t("Employee Details")}</h5>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-400">{t("Name")}</label>
                  <div className="px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white">{activeEmployee?.title}</div>
                </div>
                <div className="flex items-center gap-3 sm:justify-end">
                  <button onClick={handleCloseDetailsModal} type="button" className="flex w-full justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 sm:w-auto">{t("Close")}</button>
                </div>
              </div>
            </Modal>
            <Modal
              isOpen={isListModalOpen}
              onClose={() => setIsListModalOpen(false)}
              className="max-w-[400px] p-6 relative"
            >
              <div className="flex flex-col gap-4">

                {/* Header */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                    {t("Employees in Shift")}
                  </h3>

                  <p className="text-xs text-gray-400 mt-1">
                    {listEmployees.length} assigned employee(s)
                  </p>
                </div>

                {/* Employee list */}
                <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pe-1">
                  {listEmployees.map((emp) => (
                    <div
                      key={emp.id}
                      className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm text-gray-700 dark:text-white cursor-pointer hover:bg-brand-100 dark:hover:bg-brand-900/30 transition-colors"
                    >
                      {/* Main employee */}
                      <div>
                        {emp.title}
                      </div>

                      {/* Backup employee */}
                      {backupLabel(emp) && (
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          <span className="font-bold text-gray-700 dark:text-gray-300">
                            {t("Backup:")}
                          </span>{" "}
                          {backupLabel(emp)}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* No employees */}
                  {listEmployees.length === 0 && (
                    <div className="text-sm text-gray-400 text-center py-6">
                      {t("No employees assigned")}
                    </div>
                  )}
                </div>

                {/* Close */}
                <button
                  onClick={() => setIsListModalOpen(false)}
                  type="button"
                  className="flex w-full justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 sm:w-auto"
                >
                  {t("Close")}
                </button>

              </div>
            </Modal>
          </div>
      </div>
      {loading && <div className="text-center text-gray-500 mt-4">{t("Loading planning data...")}</div>}
      {error && <LoadError className="mt-4" title="Couldn't load the planning" message={error} onRetry={() => window.location.reload()} />}
    </>
  );
};

export default ViewCalender;