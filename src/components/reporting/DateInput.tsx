"use client";
import React, { useState, useRef, useEffect } from "react";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

interface DateInputProps {
  value: string; // "YYYY-MM-DD"
  onChange: (value: string) => void;
  className?: string;
}

/**
 * A date field that can be used two ways, per requirement:
 *   1. Typed directly (still a real <input>, so typing/pasting works)
 *   2. Via a small calendar icon button that opens a click-to-pick popover
 * Both paths write to the same `value`/`onChange`.
 */
const DateInput: React.FC<DateInputProps> = ({ value, onChange, className = "" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = value ? new Date(`${value}T00:00:00`) : new Date();
  const [viewYear, setViewYear] = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth());

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const openCalendar = () => {
    const d = value ? new Date(`${value}T00:00:00`) : new Date();
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setIsOpen(true);
  };

  const buildDays = (year: number, monthIndex: number) => {
    const firstDay = new Date(year, monthIndex, 1).getDay();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const days: { day: number; inMonth: boolean }[] = [];
    for (let i = 0; i < firstDay; i++) days.push({ day: 0, inMonth: false });
    for (let d = 1; d <= daysInMonth; d++) days.push({ day: d, inMonth: true });
    return days;
  };

  const days = buildDays(viewYear, viewMonth);

  const handlePick = (day: number) => {
    const mm = String(viewMonth + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    onChange(`${viewYear}-${mm}-${dd}`);
    setIsOpen(false);
  };

  const isSelectedDay = (day: number) =>
    value === `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const isToday = (day: number) => {
    const t = new Date();
    return t.getFullYear() === viewYear && t.getMonth() === viewMonth && t.getDate() === day;
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="numeric"
          placeholder="YYYY-MM-DD"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 ${className}`}
        />
        <button
          type="button"
          onClick={openCalendar}
          aria-label="Open calendar"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
        >
          <CalendarGlyph />
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                if (viewMonth === 0) {
                  setViewMonth(11);
                  setViewYear((y) => y - 1);
                } else {
                  setViewMonth((m) => m - 1);
                }
              }}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-gray-800 dark:text-white">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={() => {
                if (viewMonth === 11) {
                  setViewMonth(0);
                  setViewYear((y) => y + 1);
                } else {
                  setViewMonth((m) => m + 1);
                }
              }}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-1 text-center">
            {WEEKDAY_LABELS.map((w, i) => (
              <div key={i} className="text-[11px] font-medium text-gray-400">
                {w}
              </div>
            ))}
            {days.map((d, idx) =>
              d.inMonth ? (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handlePick(d.day)}
                  className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors ${
                    isSelectedDay(d.day)
                      ? "bg-brand-500 font-semibold text-white"
                      : isToday(d.day)
                      ? "font-semibold text-brand-500"
                      : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                  }`}
                >
                  {d.day}
                </button>
              ) : (
                <div key={idx} />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const CalendarGlyph: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

export default DateInput;