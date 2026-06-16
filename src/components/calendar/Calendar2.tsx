"use client";
import React, { useState, useRef, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import {
  EventInput,
  DateSelectArg,
  EventClickArg,
  EventContentArg,
} from "@fullcalendar/core";
import { useModal } from "@/hooks/useModal";
import { Modal } from "@/components/ui/modal";

interface CalendarEvent extends EventInput {
  extendedProps: {
    calendar: string;
  };
}

const Calendar: React.FC = () => {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null
  );
  const [eventTitle, setEventTitle] = useState("");
  const [eventStartDate, setEventStartDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [eventLevel, setEventLevel] = useState("");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const calendarRef = useRef<FullCalendar>(null);
  const { isOpen, openModal, closeModal } = useModal();

  const calendarsEvents = {
    Danger: "danger",
    Success: "success",
    Primary: "primary",
    Warning: "warning",
  };

  useEffect(() => {
    // Initialize with some events
    setEvents([
      {
        id: "1",
        title: "Event Conf.",
        start: new Date().toISOString().split("T")[0],
        extendedProps: { calendar: "Danger" },
      },
      {
        id: "2",
        title: "Meeting",
        start: new Date(Date.now() + 86400000).toISOString().split("T")[0],
        extendedProps: { calendar: "Success" },
      },
      {
        id: "3",
        title: "Workshop",
        start: new Date(Date.now() + 172800000).toISOString().split("T")[0],
        end: new Date(Date.now() + 259200000).toISOString().split("T")[0],
        extendedProps: { calendar: "Primary" },
      },
    ]);
  }, []);

  const handleDateSelect = (selectInfo: DateSelectArg) => {
    resetModalFields();
    setEventStartDate(selectInfo.startStr);
    setEventEndDate(selectInfo.endStr || selectInfo.startStr);
    openModal();
  };

  const handleEventClick = (clickInfo: EventClickArg) => {
    const event = clickInfo.event;
    setSelectedEvent(event as unknown as CalendarEvent);
    setEventTitle(event.title);
    setEventStartDate(event.start?.toISOString().split("T")[0] || "");
    setEventEndDate(event.end?.toISOString().split("T")[0] || "");
    setEventLevel(event.extendedProps.calendar);
    openModal();
  };

  const handleAddOrUpdateEvent = () => {
    if (selectedEvent) {
      // Update existing event
      setEvents((prevEvents) =>
        prevEvents.map((event) =>
          event.id === selectedEvent.id
            ? {
                ...event,
                title: eventTitle,
                start: eventStartDate,
                end: eventEndDate,
                extendedProps: { calendar: eventLevel },
              }
            : event
        )
      );
    } else {
      // Add new event
      const newEvent: CalendarEvent = {
        id: Date.now().toString(),
        title: eventTitle,
        start: eventStartDate,
        end: eventEndDate,
        allDay: true,
        extendedProps: { calendar: eventLevel },
      };
      setEvents((prevEvents) => [...prevEvents, newEvent]);
    }
    closeModal();
    resetModalFields();
  };

  const resetModalFields = () => {
    setEventTitle("");
    setEventStartDate("");
    setEventEndDate("");
    setEventLevel("");
    setSelectedEvent(null);
  };

  return (
    <div className="rounded-2xl border  border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="custom-calendar">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next addEventButton",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          events={events}
          selectable={true}
          select={handleDateSelect}
          eventClick={handleEventClick}
          eventContent={renderEventContent}
          customButtons={{
            addEventButton: {
              text: "Add Event +",
              click: openModal,
            },
          }}
        />
      </div>
      <Modal
        isOpen={isOpen}
        onClose={closeModal}
        className="max-w-[700px] p-6 lg:p-10"
      >
        <div className="flex flex-col px-2 overflow-y-auto custom-scrollbar">
          <div>
            <h5 className="mb-2 font-semibold text-gray-800 modal-title text-theme-xl dark:text-white/90 lg:text-2xl">
              {selectedEvent ? "Edit Event" : "Add Event"}
            </h5>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Plan your next big moment: schedule or edit an event to stay on
              track
            </p>
          </div>
          <div className="mt-8">
            <div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  Event Title
                </label>
                <input
                  id="event-title"
                  type="text"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  className="dark:bg-dark-900 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                />
              </div>
            </div>
            <div className="mt-6">
              <label className="block mb-4 text-sm font-medium text-gray-700 dark:text-gray-400">
                Event Color
              </label>
              <div className="flex flex-wrap items-center gap-4 sm:gap-5">
                {Object.entries(calendarsEvents).map(([key, value]) => (
                  <div key={key} className="n-chk">
                    <div
                      className={`form-check form-check-${value} form-check-inline`}
                    >
                      <label
                        className="flex items-center text-sm text-gray-700 form-check-label dark:text-gray-400"
                        htmlFor={`modal${key}`}
                      >
                        <span className="relative">
                          <input
                            className="sr-only form-check-input"
                            type="radio"
                            name="event-level"
                            value={key}
                            id={`modal${key}`}
                            checked={eventLevel === key}
                            onChange={() => setEventLevel(key)}
                          />
                          <span className="flex items-center justify-center w-5 h-5 mr-2 border border-gray-300 rounded-full box dark:border-gray-700">
                            <span
                              className={`h-2 w-2 rounded-full bg-white ${
                                eventLevel === key ? "block" : "hidden"
                              }`}  
                            ></span>
                          </span>
                        </span>
                        {key}
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Enter Start Date
              </label>
              <div className="relative">
                <input
                  id="event-start-date"
                  type="date"
                  value={eventStartDate}
                  onChange={(e) => setEventStartDate(e.target.value)}
                  className="dark:bg-dark-900 h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent bg-none px-4 py-2.5 pl-4 pr-11 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                />
              </div>
            </div>

            <div className="mt-6">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Enter End Date
              </label>
              <div className="relative">
                <input
                  id="event-end-date"
                  type="date"
                  value={eventEndDate}
                  onChange={(e) => setEventEndDate(e.target.value)}
                  className="dark:bg-dark-900 h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent bg-none px-4 py-2.5 pl-4 pr-11 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-6 modal-footer sm:justify-end">
            <button
              onClick={closeModal}
              type="button"
              className="flex w-full justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] sm:w-auto"
            >
              Close
            </button>
            <button
              onClick={handleAddOrUpdateEvent}
              type="button"
              className="btn btn-success btn-update-event flex w-full justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 sm:w-auto"
            >
              {selectedEvent ? "Update Changes" : "Add Event"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

const renderEventContent = (eventInfo: EventContentArg) => {
  const colorClass = `fc-bg-${eventInfo.event.extendedProps.calendar.toLowerCase()}`;
  return (
    <div
      className={`event-fc-color flex fc-event-main ${colorClass} p-1 rounded-sm`}
    >
      <div className="fc-daygrid-event-dot"></div>
      <div className="fc-event-time">{eventInfo.timeText}</div>
      <div className="fc-event-title">{eventInfo.event.title}</div>
    </div>
  );
};

export default Calendar;


// "use client";
// import React, { useState, useRef, useEffect } from "react";

// // ─── Types ───────────────────────────────────────────────────────────────────

// interface Shift {
//   shift_id: number;
//   name: string;
//   start_time: string;
//   end_time: string;
//   time: string;
// }

// interface Post {
//   id: number;
//   name: string;
// }

// interface Employee {
//   emp_id: number;
//   FirstName: string;
//   LastName: string;
// }

// interface AssignedEmployee extends Employee {
//   custom_start_time?: string;
//   custom_end_time?: string;
// }

// type PlanningMap = Record<string, Record<string, AssignedEmployee[]>>;

// // ─── Mock Data ────────────────────────────────────────────────────────────────

// const MOCK_POSTS: Post[] = [
//   { id: 1, name: "Reception" },
//   { id: 2, name: "Security Gate" },
//   { id: 3, name: "Control Room" },
//   { id: 4, name: "Patrol Zone A" },
// ];

// const MOCK_EMPLOYEES: Employee[] = [
//   { emp_id: 1, FirstName: "Ahmed", LastName: "Benali" },
//   { emp_id: 2, FirstName: "Sara", LastName: "Meziane" },
//   { emp_id: 3, FirstName: "Karim", LastName: "Oussama" },
//   { emp_id: 4, FirstName: "Nadia", LastName: "Hamdi" },
//   { emp_id: 5, FirstName: "Youssef", LastName: "Cherif" },
//   { emp_id: 6, FirstName: "Amina", LastName: "Boudali" },
// ];

// const MOCK_SHIFTS: Shift[] = [
//   { shift_id: 1, name: "Morning", start_time: "06:00", end_time: "14:00", time: "06:00 → 14:00" },
//   { shift_id: 2, name: "Afternoon", start_time: "14:00", end_time: "22:00", time: "14:00 → 22:00" },
//   { shift_id: 3, name: "Night", start_time: "22:00", end_time: "06:00", time: "22:00 → 06:00" },
// ];

// const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// // ─── Helpers ──────────────────────────────────────────────────────────────────

// function getWeekDates(baseDate: Date): string[] {
//   const day = baseDate.getDay();
//   const sunday = new Date(baseDate);
//   sunday.setDate(baseDate.getDate() - day);
//   return Array.from({ length: 7 }, (_, i) => {
//     const d = new Date(sunday);
//     d.setDate(sunday.getDate() + i);
//     return d.toISOString().split("T")[0];
//   });
// }

// function formatDateDisplay(dateStr: string): string {
//   if (!dateStr) return "";
//   const d = new Date(dateStr + "T00:00:00");
//   return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
// }

// function formatShortDate(dateStr: string): string {
//   if (!dateStr) return "";
//   const d = new Date(dateStr + "T00:00:00");
//   return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
// }

// // ─── DropDownList Sub-Component ───────────────────────────────────────────────

// const DropDownList: React.FC<{
//   employees: Employee[];
//   onSelect: (emp: Employee) => void;
// }> = ({ employees, onSelect }) => {
//   const [search, setSearch] = useState("");
//   const filtered = employees.filter(
//     (e) =>
//       `${e.FirstName} ${e.LastName}`.toLowerCase().includes(search.toLowerCase())
//   );

//   return (
//     <div style={{
//       border: "1px solid #e0e0e0",
//       borderRadius: 6,
//       background: "white",
//       boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
//       zIndex: 100,
//       minWidth: 180,
//       position: "relative",
//     }}>
//       <input
//         autoFocus
//         placeholder="Search employee…"
//         value={search}
//         onChange={(e) => setSearch(e.target.value)}
//         onClick={(e) => e.stopPropagation()}
//         style={{
//           width: "100%",
//           padding: "8px 10px",
//           border: "none",
//           borderBottom: "1px solid #eee",
//           fontSize: 13,
//           outline: "none",
//           boxSizing: "border-box",
//         }}
//       />
//       <div style={{ maxHeight: 160, overflowY: "auto" }}>
//         {filtered.length === 0 ? (
//           <div style={{ padding: "10px", fontSize: 12, color: "#999", textAlign: "center" }}>
//             No employees found
//           </div>
//         ) : (
//           filtered.map((emp) => (
//             <div
//               key={emp.emp_id}
//               onClick={(e) => {
//                 e.stopPropagation();
//                 onSelect(emp);
//               }}
//               style={{
//                 padding: "8px 12px",
//                 fontSize: 13,
//                 cursor: "pointer",
//                 transition: "background 0.15s",
//               }}
//               onMouseEnter={(e) => (e.currentTarget.style.background = "#FFF0EB")}
//               onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
//             >
//               {emp.FirstName} {emp.LastName}
//             </div>
//           ))
//         )}
//       </div>
//     </div>
//   );
// };

// // ─── Main Component ────────────────────────────────────────────────────────────

// const WeeklyPlanningTable: React.FC = () => {
//   // View mode
//   const [viewMode, setViewMode] = useState<"daily" | "template">("daily");

//   // Week navigation
//   const [weekOffset, setWeekOffset] = useState(0);
//   const [activeTab, setActiveTab] = useState(new Date().getDay());

//   const weekDates = getWeekDates(
//     (() => {
//       const d = new Date();
//       d.setDate(d.getDate() + weekOffset * 7);
//       return d;
//     })()
//   );

//   // Data
//   const [posts] = useState<Post[]>(MOCK_POSTS);
//   const [employees] = useState<Employee[]>(MOCK_EMPLOYEES);
//   const [allShifts, setAllShifts] = useState<Shift[]>(MOCK_SHIFTS);

//   // Daily planning data
//   // const existingPlannings = useRef<PlanningMap>({});
//   // const planningDataRefs = useRef<PlanningMap>({});
//   const planningDataRefs = useRef<Record<string, Record<string, AssignedEmployee[]>>>({});
//   const existingPlannings = useRef<Record<string, AssignedEmployee[]>>({});

//   // Template planning
//   const [templatePlanning, setTemplatePlanning] = useState<Record<string, AssignedEmployee[]>>({});
//   const [templateSelectedShifts, setTemplateSelectedShifts] = useState<number[]>(
//     MOCK_SHIFTS.map((s) => s.shift_id)
//   );
//   const [templateHoveredEmployee, setTemplateHoveredEmployee] = useState<number | null>(null);
//   const [templateDropdownVisibleFor, setTemplateDropdownVisibleFor] = useState<number | null>(null);

//   // Shift management
//   const [newShift, setNewShift] = useState({ start_time: "", end_time: "" });
//   const [editingShift, setEditingShift] = useState<Shift | null>(null);
//   const [showAddShiftForm, setShowAddShiftForm] = useState(false);
//   const [showShiftSelector, setShowShiftSelector] = useState(false);

//   // Modals
//   const [showSaveCalendar, setShowSaveCalendar] = useState(false);
//   const [showExportCalendar, setShowExportCalendar] = useState(false);
//   const [showImportCalendar, setShowImportCalendar] = useState(false);
//   const [savingTemplate, setSavingTemplate] = useState(false);

//   // Date pickers
//   const [selectedDates, setSelectedDates] = useState<string[]>([]);
//   const [dateRangeStart, setDateRangeStart] = useState("");
//   const [dateRangeEnd, setDateRangeEnd] = useState("");
//   const [importDate, setImportDate] = useState("");

//   // Tick for forcing re-renders on direct mutation
//   const [templateTick, setTemplateTick] = useState(0);

//   // ── Computed ──
//   const getCurrentDate = () => weekDates[activeTab];

//   const shiftsToDisplay =
//     templateSelectedShifts.length > 0
//       ? allShifts.filter((s) => templateSelectedShifts.includes(s.shift_id))
//       : allShifts;

//   const getShiftsForCurrentDay = () => allShifts;

//   // ── Daily view helpers ──
//   const getSelectedEmployee = (postId: number, shiftId: number, date: string): AssignedEmployee[] => {
//     const key = `${postId}-${shiftId}`;
//     return planningDataRefs.current[date]?.[key] || [];
//   };

//   // ── Template helpers ──
//   const getTemplateEmployee = (postId: number, shiftId: number): AssignedEmployee[] => {
//     const key = `${postId}-${shiftId}`;
//     return templatePlanning[key] || [];
//   };

//   const handleTemplateEmployeeSelect = (postId: number, shiftId: number, emp: Employee) => {
//     const key = `${postId}-${shiftId}`;
//     setTemplatePlanning((prev) => ({
//       ...prev,
//       [key]: [...(prev[key] || []), { ...emp }],
//     }));
//   };

//   const handleRemoveTemplateEmployee = (postId: number, shiftId: number, empId: number) => {
//     const key = `${postId}-${shiftId}`;
//     setTemplatePlanning((prev) => ({
//       ...prev,
//       [key]: (prev[key] || []).filter((e) => e.emp_id !== empId),
//     }));
//   };

//   const toggleShiftForTemplate = (shiftId: number) => {
//     setTemplateSelectedShifts((prev) =>
//       prev.includes(shiftId) ? prev.filter((id) => id !== shiftId) : [...prev, shiftId]
//     );
//   };

//   // ── Shift CRUD ──
//   const handleAddShift = (e: React.FormEvent) => {
//     e.preventDefault();
//     const newS: Shift = {
//       shift_id: Date.now(),
//       name: `${newShift.start_time}-${newShift.end_time}`,
//       start_time: newShift.start_time,
//       end_time: newShift.end_time,
//       time: `${newShift.start_time} → ${newShift.end_time}`,
//     };
//     setAllShifts((prev) => [...prev, newS]);
//     setNewShift({ start_time: "", end_time: "" });
//   };

//   const handleUpdateShift = (e: React.FormEvent) => {
//     e.preventDefault();
//     if (!editingShift) return;
//     setAllShifts((prev) =>
//       prev.map((s) =>
//         s.shift_id === editingShift.shift_id
//           ? { ...editingShift, time: `${editingShift.start_time} → ${editingShift.end_time}` }
//           : s
//       )
//     );
//     setEditingShift(null);
//   };

//   const handleDeleteShift = (shiftId: number) => {
//     setAllShifts((prev) => prev.filter((s) => s.shift_id !== shiftId));
//     setTemplateSelectedShifts((prev) => prev.filter((id) => id !== shiftId));
//   };

//   // ── Template actions ──
//   const applyTemplateToSelectedDates = (dates: string[]) => {
//     setSavingTemplate(true);
//     setTimeout(() => {
//       dates.forEach((date) => {
//         planningDataRefs.current[date] = JSON.parse(JSON.stringify(templatePlanning));
//         existingPlannings.current[date] = [];
//         Object.values(templatePlanning).forEach((emps) => {
//           existingPlannings.current[date].push(...emps);
//         });
//       });
//       setSavingTemplate(false);
//       setShowSaveCalendar(false);
//       setSelectedDates([]);
//       setDateRangeStart("");
//       setDateRangeEnd("");
//       alert(`✅ Planning applied to ${dates.length} date(s)!`);
//     }, 800);
//   };

//   const exportTemplateForSelectedDates = (dates: string[]) => {
//     alert(`📄 Exporting planning for ${dates.length} date(s)… (connect to your export logic)`);
//     setShowExportCalendar(false);
//     setSelectedDates([]);
//     setDateRangeStart("");
//     setDateRangeEnd("");
//   };

//   const importPlanningFromDate = () => {
//     if (!importDate) return;
//     const existing = planningDataRefs.current[importDate];
//     if (existing) {
//       setTemplatePlanning(JSON.parse(JSON.stringify(existing)));
//       alert(`✅ Planning imported from ${formatDateDisplay(importDate)}`);
//     } else {
//       alert(`⚠️ No planning found for ${formatDateDisplay(importDate)}`);
//     }
//     setShowImportCalendar(false);
//     setImportDate("");
//   };

//   const addDateRange = () => {
//     if (!dateRangeStart || !dateRangeEnd) {
//       alert("⚠️ Please select both start and end dates!");
//       return;
//     }
//     const start = new Date(dateRangeStart);
//     const end = new Date(dateRangeEnd);
//     if (start > end) {
//       alert("⚠️ Start date must be before end date!");
//       return;
//     }
//     const newDates: string[] = [];
//     const current = new Date(start);
//     while (current <= end) {
//       const dateStr = current.toISOString().split("T")[0];
//       if (!selectedDates.includes(dateStr)) newDates.push(dateStr);
//       current.setDate(current.getDate() + 1);
//     }
//     setSelectedDates([...selectedDates, ...newDates]);
//     setDateRangeStart("");
//     setDateRangeEnd("");
//   };

//   // ─── Render ────────────────────────────────────────────────────────────────

//   return (
//     <div className="wp-root">
//       {/* ── Page Header ── */}
//       <div className="wp-page-header">
//         <div>
//           <h1 className="wp-page-title">Weekly Planning Table</h1>
//           <p className="wp-page-subtitle">Organize and display work shifts for the entire week</p>
//         </div>
//       </div>

//       {/* ── View Mode Tabs ── */}
//       <div className="wp-tabs">
//         <button
//           className={`wp-tab${viewMode === "daily" ? " active" : ""}`}
//           onClick={() => setViewMode("daily")}
//         >
//           <span className="wp-tab-icon">📅</span> View Plannings
//         </button>
//         <button
//           className={`wp-tab${viewMode === "template" ? " active" : ""}`}
//           onClick={() => setViewMode("template")}
//         >
//           <span className="wp-tab-icon">📋</span> New Planning
//         </button>
//       </div>

//       {/* ══════════════ DAILY VIEW ══════════════ */}
//       {viewMode === "daily" && (
//         <div className="wp-section">
//           {/* Week navigation */}
//           <div className="wp-week-nav">
//             <button className="wp-nav-btn" onClick={() => setWeekOffset((o) => o - 1)}>
//               ← Previous Week
//             </button>
//             <span className="wp-week-label">
//               {formatShortDate(weekDates[0])} – {formatShortDate(weekDates[6])}
//             </span>
//             <button className="wp-nav-btn" onClick={() => setWeekOffset((o) => o + 1)}>
//               Next Week →
//             </button>
//           </div>

//           {/* Day tabs */}
//           <div className="wp-day-tabs">
//             {DAY_NAMES.map((day, index) => (
//               <button
//                 key={index}
//                 className={`wp-day-tab${activeTab === index ? " active" : ""}`}
//                 onClick={() => setActiveTab(index)}
//               >
//                 <span className="wp-day-name">{day.slice(0, 3)}</span>
//                 <span className="wp-day-num">{new Date(weekDates[index] + "T00:00:00").getDate()}</span>
//               </button>
//             ))}
//           </div>

//           {/* Current day info */}
//           <div className="wp-day-info">
//             <span className="wp-day-full">{formatDateDisplay(getCurrentDate())}</span>
//             <span className="wp-assignment-count">
//               {Object.values(planningDataRefs.current[getCurrentDate()] || {}).flat().length} assignments
//             </span>
//           </div>

//           {/* Table */}
//           <div className="wp-table-wrapper">
//             <table className="wp-table">
//               <thead>
//                 <tr>
//                   <th className="wp-th wp-th-post">Posts / Shifts</th>
//                   {getShiftsForCurrentDay().map((shift) => (
//                     <th key={shift.shift_id} className="wp-th">
//                       <div className="wp-shift-header">
//                         <span className="wp-shift-name">{shift.name}</span>
//                         <span className="wp-shift-time">{shift.time}</span>
//                       </div>
//                     </th>
//                   ))}
//                 </tr>
//               </thead>
//               <tbody>
//                 {posts.map((post, pi) => (
//                   <tr key={post.id} className={pi % 2 === 0 ? "wp-tr-even" : ""}>
//                     <td className="wp-td-post">
//                       <span className="wp-post-label">{post.name}</span>
//                     </td>
//                     {getShiftsForCurrentDay().map((shift) => {
//                       const emps = getSelectedEmployee(post.id, shift.shift_id, getCurrentDate());
//                       return (
//                         <td key={shift.shift_id} className="wp-td">
//                           {emps.length === 0 ? (
//                             <span className="wp-empty-cell">No assignment</span>
//                           ) : (
//                             emps.map((emp) => (
//                               <div key={emp.emp_id} className="wp-emp-chip">
//                                 <span className="wp-emp-name">{emp.FirstName} {emp.LastName}</span>
//                                 {(emp.custom_start_time || emp.custom_end_time) && (
//                                   <span className="wp-emp-time">
//                                     {emp.custom_start_time || shift.start_time.slice(0, 5)}–{emp.custom_end_time || shift.end_time.slice(0, 5)}
//                                   </span>
//                                 )}
//                               </div>
//                             ))
//                           )}
//                         </td>
//                       );
//                     })}
//                   </tr>
//                 ))}
//               </tbody>
//             </table>
//           </div>
//         </div>
//       )}

//       {/* ══════════════ TEMPLATE VIEW ══════════════ */}
//       {viewMode === "template" && (
//         <div className="wp-section">
//           {/* Global Shifts */}
//           <div className="wp-collapsible">
//             <div className="wp-collapsible-header" onClick={() => setShowAddShiftForm((v) => !v)}>
//               <div className="wp-collapsible-left">
//                 <span className="wp-coll-icon">⏰</span>
//                 <span className="wp-coll-title">Global Shifts</span>
//                 <span className="wp-coll-count">({allShifts.length} shifts)</span>
//               </div>
//               <button
//                 className="wp-toggle-btn"
//                 onClick={(e) => { e.stopPropagation(); setShowAddShiftForm((v) => !v); }}
//               >
//                 {showAddShiftForm ? "▼ Hide" : "▶ Manage"}
//               </button>
//             </div>

//             {showAddShiftForm && (
//               <div className="wp-collapsible-body">
//                 {editingShift ? (
//                   <form onSubmit={handleUpdateShift} className="wp-shift-form">
//                     <span className="wp-form-label">✏️ Edit:</span>
//                     <input
//                       type="time" required value={editingShift.start_time}
//                       onChange={(e) => setEditingShift({ ...editingShift, start_time: e.target.value })}
//                       className="wp-time-input"
//                     />
//                     <span className="wp-sep">→</span>
//                     <input
//                       type="time" required value={editingShift.end_time}
//                       onChange={(e) => setEditingShift({ ...editingShift, end_time: e.target.value })}
//                       className="wp-time-input"
//                     />
//                     <button type="submit" className="wp-mini-btn wp-btn-save">💾</button>
//                     <button type="button" className="wp-mini-btn wp-btn-cancel" onClick={() => setEditingShift(null)}>✖</button>
//                   </form>
//                 ) : (
//                   <form onSubmit={handleAddShift} className="wp-shift-form">
//                     <span className="wp-form-label">➕ New:</span>
//                     <input
//                       type="time" required value={newShift.start_time}
//                       onChange={(e) => setNewShift({ ...newShift, start_time: e.target.value })}
//                       className="wp-time-input"
//                     />
//                     <span className="wp-sep">→</span>
//                     <input
//                       type="time" required value={newShift.end_time}
//                       onChange={(e) => setNewShift({ ...newShift, end_time: e.target.value })}
//                       className="wp-time-input"
//                     />
//                     <button type="submit" className="wp-mini-btn wp-btn-save">✅</button>
//                   </form>
//                 )}
//                 <div className="wp-chips-grid">
//                   {allShifts.length === 0 ? (
//                     <span className="wp-empty-mini">No shifts yet. Add one above ↑</span>
//                   ) : (
//                     allShifts.map((shift) => (
//                       <div key={shift.shift_id} className="wp-shift-chip">
//                         <span className="wp-shift-chip-time">{shift.time}</span>
//                         <button className="wp-chip-action" onClick={() => setEditingShift(shift)}>Edit</button>
//                         <button className="wp-chip-action wp-chip-del" onClick={() => handleDeleteShift(shift.shift_id)}>Delete</button>
//                       </div>
//                     ))
//                   )}
//                 </div>
//               </div>
//             )}
//           </div>

//           {/* Shift Selector */}
//           <div className="wp-collapsible">
//             <div className="wp-collapsible-header" onClick={() => setShowShiftSelector((v) => !v)}>
//               <div className="wp-collapsible-left">
//                 <span className="wp-coll-icon">📋</span>
//                 <span className="wp-coll-title">Select Shifts for Template</span>
//                 <span className="wp-coll-count">
//                   ({shiftsToDisplay.length > 0 ? `${shiftsToDisplay.length} active` : "All shifts"})
//                 </span>
//               </div>
//               <button
//                 className="wp-toggle-btn"
//                 onClick={(e) => { e.stopPropagation(); setShowShiftSelector((v) => !v); }}
//               >
//                 {showShiftSelector ? "▼ Hide" : "▶ Select"}
//               </button>
//             </div>

//             {showShiftSelector && (
//               <div className="wp-collapsible-body">
//                 <div className="wp-instruction">💡 Click shifts to toggle for template</div>
//                 <div className="wp-chips-grid">
//                   {allShifts.map((shift) => {
//                     const selected = templateSelectedShifts.includes(shift.shift_id);
//                     return (
//                       <button
//                         key={shift.shift_id}
//                         className={`wp-select-chip${selected ? " selected" : ""}`}
//                         onClick={() => toggleShiftForTemplate(shift.shift_id)}
//                       >
//                         <span>{selected ? "✅" : "⬜"}</span>
//                         <span>{shift.time}</span>
//                       </button>
//                     );
//                   })}
//                 </div>
//               </div>
//             )}

//             {!showShiftSelector && shiftsToDisplay.length > 0 && (
//               <div className="wp-preview-strip">
//                 {shiftsToDisplay.map((shift) => (
//                   <span key={shift.shift_id} className="wp-preview-badge">{shift.time}</span>
//                 ))}
//               </div>
//             )}
//           </div>

//           {/* Template Table */}
//           <div className="wp-table-wrapper" style={{ marginTop: 20 }}>
//             <table className="wp-table">
//               <thead>
//                 <tr>
//                   <th className="wp-th wp-th-post">Posts / Shifts</th>
//                   {shiftsToDisplay.map((shift) => (
//                     <th key={shift.shift_id} className="wp-th">
//                       <div className="wp-shift-header">
//                         <span className="wp-shift-name">{shift.name}</span>
//                         <span className="wp-shift-time">{shift.time}</span>
//                       </div>
//                     </th>
//                   ))}
//                 </tr>
//               </thead>
//               <tbody>
//                 {posts.map((post, pi) => (
//                   <tr key={post.id} className={pi % 2 === 0 ? "wp-tr-even" : ""}>
//                     <td className="wp-td-post">
//                       <span className="wp-post-label">{post.name}</span>
//                     </td>
//                     {shiftsToDisplay.map((shift) => {
//                       const emps = getTemplateEmployee(post.id, shift.shift_id);
//                       return (
//                         <td key={shift.shift_id} className="wp-td">
//                           {emps.map((emp) => {
//                             const key = `${post.id}-${shift.shift_id}`;
//                             const empData = templatePlanning[key]?.find((e) => e.emp_id === emp.emp_id);
//                             const customStart = empData?.custom_start_time || "";
//                             const customEnd = empData?.custom_end_time || "";
//                             const isHovered = templateHoveredEmployee === emp.emp_id;

//                             return (
//                               <div
//                                 key={emp.emp_id}
//                                 className="wp-template-emp"
//                                 onMouseEnter={() => setTemplateHoveredEmployee(emp.emp_id)}
//                                 onMouseLeave={() => setTemplateHoveredEmployee(null)}
//                               >
//                                 <div className="wp-template-emp-row">
//                                   <span className="wp-emp-name">{emp.FirstName} {emp.LastName}</span>
//                                   {(customStart || customEnd) && (
//                                     <span style={{ fontSize: 11, color: "#999" }}>⏰</span>
//                                   )}
//                                   {isHovered && (
//                                     <>
//                                       <button
//                                         className="wp-emp-action wp-emp-add"
//                                         onClick={() => setTemplateDropdownVisibleFor(emp.emp_id)}
//                                       >+</button>
//                                       <button
//                                         className="wp-emp-action wp-emp-remove"
//                                         onClick={() => handleRemoveTemplateEmployee(post.id, shift.shift_id, emp.emp_id)}
//                                       >−</button>
//                                     </>
//                                   )}
//                                 </div>

//                                 {isHovered && (
//                                   <div className="wp-custom-times">
//                                     <input
//                                       type="time" value={customStart}
//                                       placeholder={shift.start_time.slice(0, 5)}
//                                       className="wp-custom-time-input"
//                                       onClick={(e) => e.stopPropagation()}
//                                       onChange={(e) => {
//                                         if (templatePlanning[key]) {
//                                           const idx = templatePlanning[key].findIndex((x) => x.emp_id === emp.emp_id);
//                                           if (idx !== -1) {
//                                             templatePlanning[key][idx].custom_start_time = e.target.value;
//                                             setTemplateTick((t) => t + 1);
//                                           }
//                                         }
//                                       }}
//                                     />
//                                     <span className="wp-sep">→</span>
//                                     <input
//                                       type="time" value={customEnd}
//                                       placeholder={shift.end_time.slice(0, 5)}
//                                       className="wp-custom-time-input"
//                                       onClick={(e) => e.stopPropagation()}
//                                       onChange={(e) => {
//                                         if (templatePlanning[key]) {
//                                           const idx = templatePlanning[key].findIndex((x) => x.emp_id === emp.emp_id);
//                                           if (idx !== -1) {
//                                             templatePlanning[key][idx].custom_end_time = e.target.value;
//                                             setTemplateTick((t) => t + 1);
//                                           }
//                                         }
//                                       }}
//                                     />
//                                     {(customStart || customEnd) && (
//                                       <button
//                                         className="wp-mini-btn wp-btn-cancel"
//                                         style={{ fontSize: 11 }}
//                                         onClick={() => {
//                                           if (templatePlanning[key]) {
//                                             const idx = templatePlanning[key].findIndex((x) => x.emp_id === emp.emp_id);
//                                             if (idx !== -1) {
//                                               templatePlanning[key][idx].custom_start_time = "";
//                                               templatePlanning[key][idx].custom_end_time = "";
//                                               setTemplateTick((t) => t + 1);
//                                             }
//                                           }
//                                         }}
//                                       >✖</button>
//                                     )}
//                                   </div>
//                                 )}

//                                 {templateDropdownVisibleFor === emp.emp_id && (
//                                   <DropDownList
//                                     employees={employees.filter(
//                                       (e) => !emps.some((sel) => sel.emp_id === e.emp_id)
//                                     )}
//                                     onSelect={(e) => {
//                                       handleTemplateEmployeeSelect(post.id, shift.shift_id, e);
//                                       setTemplateDropdownVisibleFor(null);
//                                     }}
//                                   />
//                                 )}
//                               </div>
//                             );
//                           })}

//                           {emps.length === 0 && (
//                             <DropDownList
//                               employees={employees}
//                               onSelect={(e) => handleTemplateEmployeeSelect(post.id, shift.shift_id, e)}
//                             />
//                           )}
//                         </td>
//                       );
//                     })}
//                   </tr>
//                 ))}
//               </tbody>
//             </table>
//           </div>

//           {/* Action Buttons */}
//           <div className="wp-actions">
//             <button className="wp-action-btn wp-btn-import" onClick={() => setShowImportCalendar(true)}>
//               📥 Import from Date
//             </button>
//             <button
//               className="wp-action-btn wp-btn-save-tpl"
//               onClick={() => setShowSaveCalendar(true)}
//               disabled={savingTemplate}
//             >
//               💾 Save
//             </button>
//             <button className="wp-action-btn wp-btn-export" onClick={() => setShowExportCalendar(true)}>
//               📄 Export
//             </button>
//           </div>
//         </div>
//       )}

//       {/* ══════════════ SAVE MODAL ══════════════ */}
//       {showSaveCalendar && (
//         <DatePickerModal
//           title="Select Planning Days"
//           subtitle="Choose which days this planning applies to"
//           icon="📅"
//           selectedDates={selectedDates}
//           setSelectedDates={setSelectedDates}
//           dateRangeStart={dateRangeStart}
//           setDateRangeStart={setDateRangeStart}
//           dateRangeEnd={dateRangeEnd}
//           setDateRangeEnd={setDateRangeEnd}
//           onAddRange={addDateRange}
//           onCancel={() => { setShowSaveCalendar(false); setSelectedDates([]); setDateRangeStart(""); setDateRangeEnd(""); }}
//           onConfirm={() => {
//             if (selectedDates.length === 0) { alert("⚠️ Please select at least one date!"); return; }
//             applyTemplateToSelectedDates(selectedDates);
//           }}
//           confirmLabel={savingTemplate ? "Applying…" : `Schedule (${selectedDates.length} dates)`}
//           confirmDisabled={savingTemplate || selectedDates.length === 0}
//           singleDateInputId="saveModalSingleDate"
//         />
//       )}

//       {/* ══════════════ EXPORT MODAL ══════════════ */}
//       {showExportCalendar && (
//         <DatePickerModal
//           title="Export Planning"
//           subtitle="Select date range to export"
//           icon="📄"
//           selectedDates={selectedDates}
//           setSelectedDates={setSelectedDates}
//           dateRangeStart={dateRangeStart}
//           setDateRangeStart={setDateRangeStart}
//           dateRangeEnd={dateRangeEnd}
//           setDateRangeEnd={setDateRangeEnd}
//           onAddRange={addDateRange}
//           onCancel={() => { setShowExportCalendar(false); setSelectedDates([]); setDateRangeStart(""); setDateRangeEnd(""); }}
//           onConfirm={() => {
//             if (selectedDates.length === 0) { alert("⚠️ Please select at least one date!"); return; }
//             exportTemplateForSelectedDates(selectedDates);
//           }}
//           confirmLabel={`Export (${selectedDates.length} dates)`}
//           confirmDisabled={selectedDates.length === 0}
//           singleDateInputId="exportModalSingleDate"
//         />
//       )}

//       {/* ══════════════ IMPORT MODAL ══════════════ */}
//       {showImportCalendar && (
//         <div className="wp-backdrop">
//           <div className="wp-modal-import">
//             <div className="wp-modal-header">
//               <span className="wp-modal-icon">📥</span>
//               <div>
//                 <div className="wp-modal-title">Import Planning from Date</div>
//                 <div className="wp-modal-subtitle">Select a date to import its planning into the template</div>
//               </div>
//             </div>

//             <div className="wp-import-body">
//               <input
//                 type="date"
//                 value={importDate}
//                 onChange={(e) => setImportDate(e.target.value)}
//                 className="wp-date-input"
//                 style={{ fontSize: 16, textAlign: "center" }}
//               />
//               <div className="wp-preset-row">
//                 {[
//                   { label: "Today", fn: () => setImportDate(new Date().toISOString().split("T")[0]) },
//                   {
//                     label: "Yesterday", fn: () => {
//                       const d = new Date(); d.setDate(d.getDate() - 1);
//                       setImportDate(d.toISOString().split("T")[0]);
//                     }
//                   },
//                   {
//                     label: "Last Saturday", fn: () => {
//                       const d = new Date();
//                       d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
//                       setImportDate(d.toISOString().split("T")[0]);
//                     }
//                   },
//                 ].map(({ label, fn }) => (
//                   <button key={label} className="wp-preset-btn" onClick={fn}>{label}</button>
//                 ))}
//               </div>

//               {importDate && (
//                 <div className="wp-import-preview">
//                   <strong>Selected:</strong> {formatDateDisplay(importDate)}
//                 </div>
//               )}

//               <div className="wp-import-note">
//                 <strong>⚠️ Note:</strong> Importing will replace your current template.
//               </div>
//             </div>

//             <div className="wp-modal-actions">
//               <button
//                 className="wp-modal-cancel"
//                 onClick={() => { setShowImportCalendar(false); setImportDate(""); }}
//               >Cancel</button>
//               <button
//                 className="wp-modal-confirm"
//                 disabled={!importDate}
//                 onClick={importPlanningFromDate}
//               >📥 Import Planning</button>
//             </div>
//           </div>
//         </div>
//       )}

//       {/* ══════════════ STYLES ══════════════ */}
//       <style>{`
//         /* ── Root & Layout ── */
//         .wp-root {
//           font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
//           color: #1a1a2e;
//           background: #f5f6fa;
//           min-height: 100vh;
//           padding-bottom: 60px;
//         }

//         /* ── Page Header ── */
//         .wp-page-header {
//           padding: 36px 35px 0;
//         }
//         .wp-page-title {
//           font-size: 28px;
//           font-weight: 700;
//           margin: 0 0 6px;
//           color: #1a1a2e;
//           letter-spacing: -0.3px;
//         }
//         .wp-page-subtitle {
//           font-size: 14px;
//           color: #6b7280;
//           margin: 0 0 24px;
//         }

//         /* ── Tabs ── */
//         .wp-tabs {
//           display: flex;
//           gap: 0;
//           margin: 0 35px 24px;
//           border-bottom: 2px solid #e5e7eb;
//         }
//         .wp-tab {
//           flex: 1;
//           max-width: 220px;
//           padding: 12px 20px;
//           border: none;
//           background: transparent;
//           font-size: 14px;
//           font-weight: 600;
//           color: #6b7280;
//           cursor: pointer;
//           border-bottom: 3px solid transparent;
//           margin-bottom: -2px;
//           transition: all 0.2s ease;
//           display: flex;
//           align-items: center;
//           justify-content: center;
//           gap: 7px;
//           border-radius: 6px 6px 0 0;
//         }
//         .wp-tab:hover { color: #EB4219; background: #fff5f2; }
//         .wp-tab.active { color: #EB4219; border-bottom-color: #EB4219; background: white; }
//         .wp-tab-icon { font-size: 16px; }

//         /* ── Section wrapper ── */
//         .wp-section { padding: 0 35px; }

//         /* ── Week Navigation ── */
//         .wp-week-nav {
//           display: flex;
//           align-items: center;
//           gap: 16px;
//           margin-bottom: 16px;
//           flex-wrap: wrap;
//         }
//         .wp-nav-btn {
//           padding: 9px 20px;
//           background: white;
//           border: 1.5px solid #e5e7eb;
//           border-radius: 8px;
//           font-size: 13px;
//           font-weight: 600;
//           color: #374151;
//           cursor: pointer;
//           transition: all 0.2s;
//           min-width: 150px;
//         }
//         .wp-nav-btn:hover { border-color: #EB4219; color: #EB4219; background: #fff5f2; }
//         .wp-week-label {
//           font-weight: 700;
//           font-size: 15px;
//           color: #1a1a2e;
//           flex: 1;
//           text-align: center;
//         }

//         /* ── Day Tabs ── */
//         .wp-day-tabs {
//           display: flex;
//           border-bottom: 2px solid #e5e7eb;
//           margin-bottom: 16px;
//           overflow-x: auto;
//         }
//         .wp-day-tab {
//           flex: 1;
//           min-width: 70px;
//           padding: 10px 6px;
//           border: none;
//           background: #f9fafb;
//           cursor: pointer;
//           transition: all 0.25s;
//           border-bottom: 3px solid transparent;
//           margin-bottom: -2px;
//           display: flex;
//           flex-direction: column;
//           align-items: center;
//           gap: 3px;
//         }
//         .wp-day-tab:hover { background: #fff5f2; }
//         .wp-day-tab.active { background: white; border-bottom-color: #EB4219; }
//         .wp-day-name { font-size: 12px; font-weight: 700; color: #6b7280; letter-spacing: 0.5px; text-transform: uppercase; }
//         .wp-day-tab.active .wp-day-name { color: #EB4219; }
//         .wp-day-num { font-size: 18px; font-weight: 700; color: #374151; }
//         .wp-day-tab.active .wp-day-num { color: #EB4219; }

//         /* ── Day info bar ── */
//         .wp-day-info {
//           display: flex;
//           align-items: center;
//           justify-content: space-between;
//           margin-bottom: 16px;
//           padding: 10px 16px;
//           background: white;
//           border-radius: 8px;
//           border: 1px solid #e5e7eb;
//         }
//         .wp-day-full { font-weight: 600; font-size: 14px; color: #374151; }
//         .wp-assignment-count {
//           font-size: 13px;
//           color: #10b981;
//           font-weight: 600;
//           background: #ecfdf5;
//           padding: 4px 12px;
//           border-radius: 20px;
//         }

//         /* ── Table ── */
//         .wp-table-wrapper {
//           border-radius: 12px;
//           overflow: hidden;
//           border: 1px solid #e5e7eb;
//           box-shadow: 0 1px 4px rgba(0,0,0,0.06);
//         }
//         .wp-table {
//           width: 100%;
//           border-collapse: collapse;
//           background: white;
//         }
//         .wp-th {
//           padding: 14px 16px;
//           background: #1a1a2e;
//           color: white;
//           font-size: 13px;
//           font-weight: 600;
//           text-align: left;
//           border-right: 1px solid rgba(255,255,255,0.1);
//         }
//         .wp-th:last-child { border-right: none; }
//         .wp-th-post { width: 160px; }
//         .wp-shift-header { display: flex; flex-direction: column; gap: 2px; }
//         .wp-shift-name { font-size: 13px; font-weight: 700; }
//         .wp-shift-time { font-size: 11px; opacity: 0.7; font-weight: 400; }
//         .wp-td {
//           padding: 12px 14px;
//           border-right: 1px solid #f3f4f6;
//           border-bottom: 1px solid #f3f4f6;
//           vertical-align: top;
//           min-width: 160px;
//         }
//         .wp-td:last-child { border-right: none; }
//         .wp-td-post {
//           padding: 12px 14px;
//           border-bottom: 1px solid #f3f4f6;
//           background: linear-gradient(135deg, #EB4219 0%, #F6892A 100%);
//         }
//         .wp-post-label { color: white; font-weight: 700; font-size: 13px; }
//         .wp-tr-even td { background: #fafafa; }
//         .wp-tr-even .wp-td-post { background: linear-gradient(135deg, #EB4219 0%, #F6892A 100%); }

//         /* ── Employee chips ── */
//         .wp-emp-chip {
//           display: flex;
//           flex-direction: column;
//           padding: 4px 0;
//           border-bottom: 1px solid #f3f4f6;
//         }
//         .wp-emp-chip:last-child { border-bottom: none; }
//         .wp-emp-name { font-size: 13px; font-weight: 600; color: #EB4219; }
//         .wp-emp-time { font-size: 11px; color: #9ca3af; }
//         .wp-empty-cell { font-size: 12px; color: #d1d5db; font-style: italic; }

//         /* ── Template employee row ── */
//         .wp-template-emp {
//           padding: 4px 0;
//           border-bottom: 1px solid #f3f4f6;
//           cursor: default;
//         }
//         .wp-template-emp:last-child { border-bottom: none; }
//         .wp-template-emp-row {
//           display: flex;
//           align-items: center;
//           gap: 5px;
//           flex-wrap: wrap;
//         }
//         .wp-emp-action {
//           border: none;
//           border-radius: 3px;
//           padding: 2px 7px;
//           font-size: 14px;
//           cursor: pointer;
//           font-weight: 700;
//           line-height: 1;
//           transition: opacity 0.15s;
//         }
//         .wp-emp-add { background: #10b981; color: white; }
//         .wp-emp-remove { background: #EB4219; color: white; }
//         .wp-emp-action:hover { opacity: 0.85; }
//         .wp-custom-times {
//           display: flex;
//           align-items: center;
//           gap: 4px;
//           margin-top: 5px;
//           flex-wrap: wrap;
//         }
//         .wp-custom-time-input {
//           padding: 3px 6px;
//           font-size: 11px;
//           border: 1px solid #e5e7eb;
//           border-radius: 4px;
//           width: 78px;
//         }

//         /* ── Collapsible containers ── */
//         .wp-collapsible {
//           border: 1.5px solid #e5e7eb;
//           border-radius: 8px;
//           background: white;
//           overflow: hidden;
//           margin-bottom: 12px;
//           transition: border-color 0.2s;
//         }
//         .wp-collapsible:hover { border-color: #EB4219; }
//         .wp-collapsible-header {
//           display: flex;
//           justify-content: space-between;
//           align-items: center;
//           padding: 12px 16px;
//           background: #f9fafb;
//           cursor: pointer;
//           transition: background 0.2s;
//         }
//         .wp-collapsible-header:hover { background: #fff5f2; }
//         .wp-collapsible-left { display: flex; align-items: center; gap: 10px; }
//         .wp-coll-icon { font-size: 18px; }
//         .wp-coll-title { font-weight: 700; font-size: 14px; color: #1a1a2e; }
//         .wp-coll-count { font-size: 12px; color: #9ca3af; }
//         .wp-toggle-btn {
//           padding: 5px 12px;
//           background: #EB4219;
//           color: white;
//           border: none;
//           border-radius: 5px;
//           cursor: pointer;
//           font-size: 12px;
//           font-weight: 700;
//           transition: background 0.2s;
//         }
//         .wp-toggle-btn:hover { background: #d63a15; }
//         .wp-collapsible-body { padding: 14px 16px; animation: wpSlide 0.25s ease; }
//         @keyframes wpSlide {
//           from { opacity: 0; transform: translateY(-8px); }
//           to { opacity: 1; transform: translateY(0); }
//         }

//         /* ── Shift form ── */
//         .wp-shift-form {
//           display: flex;
//           align-items: center;
//           gap: 8px;
//           flex-wrap: wrap;
//           padding: 10px;
//           background: #f9fafb;
//           border-radius: 6px;
//           margin-bottom: 12px;
//         }
//         .wp-form-label { font-size: 13px; font-weight: 600; color: #374151; }
//         .wp-time-input {
//           padding: 6px 10px;
//           font-size: 13px;
//           border: 1.5px solid #e5e7eb;
//           border-radius: 5px;
//           min-width: 110px;
//           flex: 1;
//         }
//         .wp-time-input:focus { outline: none; border-color: #EB4219; }
//         .wp-sep { font-size: 14px; color: #9ca3af; }
//         .wp-mini-btn {
//           padding: 6px 10px;
//           border: none;
//           border-radius: 5px;
//           cursor: pointer;
//           font-size: 14px;
//           transition: all 0.15s;
//         }
//         .wp-btn-save { background: #10b981; color: white; }
//         .wp-btn-save:hover { background: #059669; }
//         .wp-btn-cancel { background: #ef4444; color: white; }
//         .wp-btn-cancel:hover { background: #dc2626; }

//         /* ── Chips grid ── */
//         .wp-chips-grid { display: flex; flex-wrap: wrap; gap: 8px; }
//         .wp-shift-chip {
//           display: flex;
//           align-items: center;
//           gap: 8px;
//           padding: 6px 10px;
//           background: white;
//           border: 1.5px solid #e5e7eb;
//           border-radius: 5px;
//           font-size: 13px;
//           transition: all 0.2s;
//         }
//         .wp-shift-chip:hover { border-color: #EB4219; box-shadow: 0 2px 6px rgba(235,66,25,0.1); }
//         .wp-shift-chip-time { font-weight: 700; color: #1a1a2e; }
//         .wp-chip-action {
//           padding: 2px 8px;
//           background: transparent;
//           border: 1px solid #e5e7eb;
//           border-radius: 4px;
//           cursor: pointer;
//           font-size: 12px;
//           color: #6b7280;
//           transition: all 0.15s;
//         }
//         .wp-chip-action:hover { background: #f3f4f6; color: #374151; }
//         .wp-chip-del:hover { background: #fee2e2; color: #ef4444; border-color: #fca5a5; }

//         /* ── Select chips ── */
//         .wp-select-chip {
//           display: flex;
//           align-items: center;
//           gap: 6px;
//           padding: 6px 12px;
//           background: #f9fafb;
//           border: 1.5px solid #e5e7eb;
//           border-radius: 5px;
//           cursor: pointer;
//           font-size: 13px;
//           font-weight: 500;
//           transition: all 0.2s;
//         }
//         .wp-select-chip:hover { border-color: #3b82f6; background: #eff6ff; }
//         .wp-select-chip.selected { background: #d1fae5; border-color: #10b981; color: #065f46; font-weight: 700; }

//         /* ── Preview strip ── */
//         .wp-preview-strip {
//           display: flex;
//           flex-wrap: wrap;
//           gap: 6px;
//           padding: 8px 16px;
//           background: #f9fafb;
//           border-top: 1px solid #e5e7eb;
//         }
//         .wp-preview-badge {
//           padding: 3px 10px;
//           background: #d1fae5;
//           color: #065f46;
//           border-radius: 4px;
//           font-size: 12px;
//           font-weight: 700;
//         }

//         /* ── Instruction ── */
//         .wp-instruction {
//           padding: 8px 12px;
//           background: #fffbeb;
//           border-left: 3px solid #f59e0b;
//           border-radius: 4px;
//           font-size: 12px;
//           color: #92400e;
//           margin-bottom: 10px;
//         }
//         .wp-empty-mini { font-size: 13px; color: #9ca3af; font-style: italic; padding: 8px; }

//         /* ── Action buttons ── */
//         .wp-actions {
//           display: flex;
//           gap: 12px;
//           margin-top: 24px;
//           flex-wrap: wrap;
//         }
//         .wp-action-btn {
//           padding: 11px 24px;
//           border: none;
//           border-radius: 8px;
//           font-size: 14px;
//           font-weight: 700;
//           cursor: pointer;
//           transition: all 0.2s;
//           display: flex;
//           align-items: center;
//           gap: 6px;
//         }
//         .wp-btn-import { background: #7c3aed; color: white; }
//         .wp-btn-import:hover { background: #6d28d9; transform: translateY(-1px); }
//         .wp-btn-save-tpl { background: #EB4219; color: white; }
//         .wp-btn-save-tpl:hover:not(:disabled) { background: #d63a15; transform: translateY(-1px); }
//         .wp-btn-save-tpl:disabled { opacity: 0.5; cursor: not-allowed; }
//         .wp-btn-export { background: #10b981; color: white; }
//         .wp-btn-export:hover { background: #059669; transform: translateY(-1px); }

//         /* ── Backdrop ── */
//         .wp-backdrop {
//           position: fixed;
//           inset: 0;
//           background: rgba(0,0,0,0.5);
//           display: flex;
//           align-items: center;
//           justify-content: center;
//           z-index: 1000;
//           backdrop-filter: blur(2px);
//         }

//         /* ── Modal shared ── */
//         .wp-modal-header {
//           display: flex;
//           align-items: center;
//           gap: 14px;
//           padding: 20px 24px;
//           background: linear-gradient(135deg, #EB4219 0%, #F6892A 100%);
//           color: white;
//           border-radius: 12px 12px 0 0;
//         }
//         .wp-modal-icon {
//           font-size: 26px;
//           background: rgba(255,255,255,0.2);
//           width: 48px; height: 48px;
//           border-radius: 50%;
//           display: flex; align-items: center; justify-content: center;
//           flex-shrink: 0;
//         }
//         .wp-modal-title { font-size: 17px; font-weight: 700; }
//         .wp-modal-subtitle { font-size: 13px; opacity: 0.9; margin-top: 3px; }
//         .wp-modal-actions {
//           padding: 18px 24px;
//           background: #f9fafb;
//           display: flex;
//           gap: 10px;
//           justify-content: flex-end;
//           border-radius: 0 0 12px 12px;
//           border-top: 1px solid #e5e7eb;
//         }
//         .wp-modal-cancel {
//           padding: 10px 22px;
//           background: white;
//           border: 1.5px solid #e5e7eb;
//           border-radius: 7px;
//           color: #6b7280;
//           font-size: 14px;
//           font-weight: 600;
//           cursor: pointer;
//           transition: all 0.2s;
//         }
//         .wp-modal-cancel:hover { border-color: #9ca3af; background: #f3f4f6; }
//         .wp-modal-confirm {
//           padding: 10px 28px;
//           background: linear-gradient(135deg, #EB4219 0%, #F6892A 100%);
//           border: none;
//           border-radius: 7px;
//           color: white;
//           font-size: 14px;
//           font-weight: 700;
//           cursor: pointer;
//           transition: all 0.2s;
//           box-shadow: 0 3px 10px rgba(235,66,25,0.3);
//         }
//         .wp-modal-confirm:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 5px 14px rgba(235,66,25,0.4); }
//         .wp-modal-confirm:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

//         /* ── Date Picker Modal ── */
//         .wp-modal-datepicker {
//           background: white;
//           border-radius: 12px;
//           max-width: 580px;
//           width: 90%;
//           max-height: 90vh;
//           display: flex;
//           flex-direction: column;
//           box-shadow: 0 12px 40px rgba(0,0,0,0.2);
//           overflow: hidden;
//         }
//         .wp-modal-body {
//           padding: 20px 24px;
//           overflow-y: auto;
//           flex: 1;
//         }
//         .wp-modal-section-title {
//           font-size: 14px;
//           font-weight: 700;
//           color: #374151;
//           margin: 0 0 12px;
//         }
//         .wp-date-row { display: flex; gap: 10px; margin-bottom: 10px; }
//         .wp-date-group { display: flex; flex-direction: column; gap: 6px; flex: 1; }
//         .wp-date-group label { font-size: 13px; font-weight: 600; color: #374151; }
//         .wp-date-input {
//           padding: 10px 14px;
//           border: 1.5px solid #e5e7eb;
//           border-radius: 7px;
//           font-size: 14px;
//           transition: border-color 0.2s;
//           width: 100%;
//           box-sizing: border-box;
//         }
//         .wp-date-input:focus { outline: none; border-color: #EB4219; box-shadow: 0 0 0 3px rgba(235,66,25,0.1); }
//         .wp-add-range-btn {
//           width: 100%;
//           padding: 10px;
//           background: #3b82f6;
//           color: white;
//           border: none;
//           border-radius: 7px;
//           font-size: 14px;
//           font-weight: 700;
//           cursor: pointer;
//           transition: all 0.2s;
//           margin-bottom: 16px;
//         }
//         .wp-add-range-btn:hover { background: #2563eb; }
//         .wp-divider { border: none; border-top: 1px solid #e5e7eb; margin: 16px 0; }
//         .wp-single-date-row { display: flex; gap: 10px; align-items: flex-end; }
//         .wp-add-single-btn {
//           padding: 10px 16px;
//           background: #10b981;
//           color: white;
//           border: none;
//           border-radius: 7px;
//           font-size: 13px;
//           font-weight: 700;
//           cursor: pointer;
//           white-space: nowrap;
//           transition: background 0.2s;
//         }
//         .wp-add-single-btn:hover { background: #059669; }
//         .wp-selected-dates-box {
//           margin-top: 16px;
//           padding: 14px;
//           background: #f9fafb;
//           border-radius: 8px;
//           border: 1px solid #e5e7eb;
//         }
//         .wp-selected-dates-header {
//           display: flex;
//           justify-content: space-between;
//           align-items: center;
//           margin-bottom: 10px;
//         }
//         .wp-clear-btn {
//           padding: 4px 10px;
//           background: #ef4444;
//           color: white;
//           border: none;
//           border-radius: 5px;
//           cursor: pointer;
//           font-size: 12px;
//           font-weight: 600;
//           transition: background 0.2s;
//         }
//         .wp-clear-btn:hover { background: #dc2626; }
//         .wp-date-tags {
//           display: flex;
//           flex-wrap: wrap;
//           gap: 8px;
//           max-height: 150px;
//           overflow-y: auto;
//         }
//         .wp-date-tag {
//           display: flex;
//           align-items: center;
//           gap: 6px;
//           padding: 5px 10px;
//           background: white;
//           border: 1.5px solid #3b82f6;
//           border-radius: 5px;
//           font-size: 13px;
//           color: #3b82f6;
//           font-weight: 600;
//         }
//         .wp-date-tag-remove {
//           background: transparent;
//           border: none;
//           color: #ef4444;
//           cursor: pointer;
//           font-size: 16px;
//           line-height: 1;
//           padding: 0;
//         }

//         /* ── Import Modal ── */
//         .wp-modal-import {
//           background: white;
//           border-radius: 12px;
//           max-width: 460px;
//           width: 90%;
//           box-shadow: 0 12px 40px rgba(0,0,0,0.2);
//           overflow: hidden;
//         }
//         .wp-import-body { padding: 24px; }
//         .wp-preset-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
//         .wp-preset-btn {
//           padding: 7px 14px;
//           background: white;
//           border: 1.5px solid #e5e7eb;
//           border-radius: 6px;
//           cursor: pointer;
//           font-size: 13px;
//           font-weight: 600;
//           color: #374151;
//           transition: all 0.2s;
//         }
//         .wp-preset-btn:hover { border-color: #3b82f6; color: #3b82f6; background: #eff6ff; transform: translateY(-1px); }
//         .wp-import-preview {
//           margin-top: 16px;
//           padding: 12px;
//           background: #eff6ff;
//           border-radius: 7px;
//           font-size: 14px;
//           color: #1e40af;
//           text-align: center;
//         }
//         .wp-import-note {
//           margin-top: 14px;
//           padding: 10px 12px;
//           background: #fffbeb;
//           border-left: 3px solid #f59e0b;
//           border-radius: 5px;
//           font-size: 13px;
//           color: #92400e;
//         }

//         /* ── Responsive ── */
//         @media (max-width: 768px) {
//           .wp-section { padding: 0 16px; }
//           .wp-page-header { padding: 24px 16px 0; }
//           .wp-tabs { margin: 0 16px 16px; }
//           .wp-tab { font-size: 13px; padding: 10px 12px; }
//           .wp-week-nav { gap: 8px; }
//           .wp-nav-btn { min-width: 120px; font-size: 12px; padding: 8px 12px; }
//           .wp-table-wrapper { overflow-x: auto; }
//         }
//       `}</style>
//     </div>
//   );
// };

// // ─── DatePickerModal (reused for Save & Export) ───────────────────────────────

// interface DatePickerModalProps {
//   title: string;
//   subtitle: string;
//   icon: string;
//   selectedDates: string[];
//   setSelectedDates: React.Dispatch<React.SetStateAction<string[]>>;
//   dateRangeStart: string;
//   setDateRangeStart: React.Dispatch<React.SetStateAction<string>>;
//   dateRangeEnd: string;
//   setDateRangeEnd: React.Dispatch<React.SetStateAction<string>>;
//   onAddRange: () => void;
//   onCancel: () => void;
//   onConfirm: () => void;
//   confirmLabel: string;
//   confirmDisabled: boolean;
//   singleDateInputId: string;
// }

// const DatePickerModal: React.FC<DatePickerModalProps> = ({
//   title, subtitle, icon, selectedDates, setSelectedDates,
//   dateRangeStart, setDateRangeStart, dateRangeEnd, setDateRangeEnd,
//   onAddRange, onCancel, onConfirm, confirmLabel, confirmDisabled, singleDateInputId,
// }) => (
//   <div className="wp-backdrop">
//     <div className="wp-modal-datepicker">
//       <div className="wp-modal-header">
//         <span className="wp-modal-icon">{icon}</span>
//         <div>
//           <div className="wp-modal-title">{title}</div>
//           <div className="wp-modal-subtitle">{subtitle}</div>
//         </div>
//       </div>

//       <div className="wp-modal-body">
//         <h4 className="wp-modal-section-title">📆 Add Date Range</h4>
//         <div className="wp-date-row">
//           <div className="wp-date-group">
//             <label>Start date</label>
//             <input
//               type="date" value={dateRangeStart} className="wp-date-input"
//               onChange={(e) => setDateRangeStart(e.target.value)}
//             />
//           </div>
//           <div className="wp-date-group">
//             <label>End date</label>
//             <input
//               type="date" value={dateRangeEnd} className="wp-date-input"
//               onChange={(e) => setDateRangeEnd(e.target.value)}
//             />
//           </div>
//         </div>
//         <button className="wp-add-range-btn" onClick={onAddRange}>➕ Add Range</button>

//         <hr className="wp-divider" />
//         <h4 className="wp-modal-section-title">📍 Or Add Single Date</h4>
//         <div className="wp-single-date-row">
//           <div className="wp-date-group" style={{ flex: 1 }}>
//             <label>Select date</label>
//             <input type="date" id={singleDateInputId} className="wp-date-input" />
//           </div>
//           <button
//             className="wp-add-single-btn"
//             onClick={() => {
//               const input = document.getElementById(singleDateInputId) as HTMLInputElement;
//               const date = input?.value;
//               if (date && !selectedDates.includes(date)) {
//                 setSelectedDates((prev) => [...prev, date]);
//                 input.value = "";
//               }
//             }}
//           >➕ Add</button>
//         </div>

//         {selectedDates.length > 0 && (
//           <div className="wp-selected-dates-box">
//             <div className="wp-selected-dates-header">
//               <strong style={{ fontSize: 14 }}>Selected Dates ({selectedDates.length})</strong>
//               <button className="wp-clear-btn" onClick={() => setSelectedDates([])}>Clear All</button>
//             </div>
//             <div className="wp-date-tags">
//               {[...selectedDates].sort().map((date) => (
//                 <div key={date} className="wp-date-tag">
//                   <span>{new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
//                   <button
//                     className="wp-date-tag-remove"
//                     onClick={() => setSelectedDates((prev) => prev.filter((d) => d !== date))}
//                   >×</button>
//                 </div>
//               ))}
//             </div>
//           </div>
//         )}
//       </div>

//       <div className="wp-modal-actions">
//         <button className="wp-modal-cancel" onClick={onCancel}>Cancel</button>
//         <button className="wp-modal-confirm" disabled={confirmDisabled} onClick={onConfirm}>
//           {confirmLabel}
//         </button>
//       </div>
//     </div>
//   </div>
// );

// export default WeeklyPlanningTable;