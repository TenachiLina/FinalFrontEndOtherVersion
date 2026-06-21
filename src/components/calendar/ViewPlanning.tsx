"use client";
import React from "react";
import { Modal } from "@/components/ui/modal";
import { useViewPlanning } from "@/hooks/useViewPlanning";
import Button from "../ui/button/Button";
import { ArrowDownTrayIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";

const ViewCalender: React.FC = () => {
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

  if (loadingMeta) return <div className="text-center text-gray-500 mt-4">Loading...</div>;
  if (metaError) return <div className="text-center text-red-500 mt-4">Error: {metaError}</div>;

  return (
    <>
      <div className="flex gap-4 items-start" style={{ marginBottom: "20px" }}>
        {/* ── Mini Calendar ──────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] p-4 min-w-[260px]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-800 dark:text-white">
              {calendarMonth.toLocaleDateString("en-CA", { month: "long", year: "numeric" })}
            </span>
            <div className="flex gap-1">
              <button onClick={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button onClick={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1))} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
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
              const isToday = date.toDateString() === new Date().toDateString();
              const isSelected = date.toDateString() === currentDate.toDateString();
              return (
                <button
                  key={i}
                  onClick={() => { setCurrentDate(date); setCalendarMonth(date); }}
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
            <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
              <button onClick={goToToday} type="button" className="rounded-full border border-gray-300 dark:border-gray-600 px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
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
              <span className="text-sm font-medium text-gray-800 dark:text-white mr-45">{formattedDate}</span>
            
              <div className="flex items-center gap-5">
                <Button size="md" variant="primary" onClick={handleExport}>
                  <ArrowTopRightOnSquareIcon className="w-4 h-4 text-gray-100" strokeWidth={3} />
                  Export Planning
                </Button>
              </div>
            </div>

            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="w-32 min-w-[8rem] border-b border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-3" />
                  {/* ✅ Use shifts from DB */}
                  {shifts.map((shift) => (
                    <th key={shift._id} className="border-b border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-3 text-center last:border-r-0">
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
                    <td className="border-b border-r border-gray-200 dark:border-gray-700 p-3 last:border-b-0">
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
                            "border-b border-r border-gray-200 dark:border-gray-700 p-2 transition-colors duration-150 last:border-r-0",
                            rowIdx === tasks.length - 1 ? "border-b-0" : "",
                          ].join(" ")}
                          style={{ minWidth: "160px", height: "64px" }}
                        >
                          {/* {employees.length > 0 ? (
                            <div className="flex flex-col gap-[2px] overflow-hidden">
                              {employees.slice(0, 2).map((emp) => (
                                <div
                                  key={emp.id}
                                  className="text-[11px] px-2 py-[2px] text-gray-800 dark:text-white truncate cursor-pointer hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                                  title={emp.title}
                                >
                                  {emp.title}
                                </div>
                              ))}
                              {employees.length > 2 && (
                                <div
                                  className="text-[10px] text-gray-400 px-2 cursor-pointer hover:text-gray-600"
                                  onClick={(e) => { e.stopPropagation(); handleListCellClick(task.taskId, shift._id); }}
                                >
                                  +{employees.length - 2}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center justify-center h-full">
                              <span className="text-xs text-gray-400 dark:text-gray-600">-</span>
                            </div>
                          )} */}
                          {employees.length > 0 ? (
                            <div className="flex flex-col gap-[2px] overflow-hidden">
                              {employees.slice(0, 2).map((emp) => (
                                <div
                                  key={emp.id}
                                  className="flex flex-col cursor-pointer hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                                  onClick={(e) => { e.stopPropagation(); handleListCellClick(task.taskId, shift._id); }}
                                >
                                  <span className="text-[11px] px-2 py-[2px] text-gray-800 dark:text-white truncate" title={emp.title}>
                                    {emp.title}
                                  </span>
                                  {emp.tasks && emp.tasks.length > 0 && (
                                    <span className="text-[10px] text-gray-400 px-2 truncate">
                                      {emp.tasks.map((t) => `${t.startTime}-${t.endTime} ${t.label}`).join(" · ")}
                                    </span>
                                  )}
                                </div>
                              ))}
                              {employees.length > 2 && (
                                <div
                                  className="text-[10px] text-gray-400 px-2 cursor-pointer hover:text-gray-600"
                                  onClick={(e) => { e.stopPropagation(); handleListCellClick(task.taskId, shift._id); }}
                                >
                                  +{employees.length - 2}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center justify-center h-full">
                              <span className="text-xs text-gray-400 dark:text-gray-600">-</span>
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

          {/* ── Modals ── */}
          <Modal isOpen={isDetailsModalOpen} onClose={handleCloseDetailsModal} className="max-w-[400px] p-6">
            <div className="flex flex-col gap-6">
              <h5 className="font-semibold text-gray-800 text-lg dark:text-white/90">Employee Details</h5>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-400">Name</label>
                <div className="px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white">{activeEmployee?.title}</div>
              </div>
              <div className="flex items-center gap-3 sm:justify-end">
                <button onClick={handleCloseDetailsModal} type="button" className="flex w-full justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 sm:w-auto">Close</button>
              </div>
            </div>
          </Modal>

          <Modal isOpen={isListModalOpen} onClose={() => setIsListModalOpen(false)} className="max-w-[400px] p-6 relative">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Employees in Shift</h3>
                <p className="text-xs text-gray-400 mt-1">{listEmployees.length} assigned employee(s)</p>
              </div>
              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                {listEmployees.map((emp) => (
                  <div key={emp.id} className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm text-gray-700 dark:text-white cursor-pointer hover:bg-brand-100 dark:hover:bg-brand-900/30 transition-colors">
                    {emp.title}
                  </div>
                ))}
                {listEmployees.length === 0 && (
                  <div className="text-sm text-gray-400 text-center py-6">No employees assigned</div>
                )}
              </div>
              <button onClick={() => setIsListModalOpen(false)} type="button" className="flex w-full justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 sm:w-auto">Close</button>
            </div>
          </Modal>
        </div>
      </div>
      {loading && <div className="text-center text-gray-500 mt-4">Loading planning data...</div>}
      {error && <div className="text-center text-red-500 mt-4">Error: {error}</div>}
    </>
  );
};

export default ViewCalender;