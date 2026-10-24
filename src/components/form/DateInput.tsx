"use client";
import React, { useState, useRef, useEffect } from "react";
import { monthName, t, weekdayInitial } from "@/lib/i18n";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

interface DateInputProps {
  value: string; // "YYYY-MM-DD"
  onChange: (value: string) => void;
  className?: string;
  id?: string;
  min?: string; // "YYYY-MM-DD", days before are disabled
  max?: string; // "YYYY-MM-DD", days after are disabled
  clearable?: boolean; // show a "Clear" button in the calendar (for optional filters)
  disabled?: boolean;
}

const toIso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * A date field that can be used two ways:
 *   1. Clicking the field (or the calendar icon) opens a click-to-pick calendar,
 *      so no keyboard is needed
 *   2. Typed directly (still a real <input>, so typing/pasting works)
 * Both paths write to the same `value`/`onChange`.
 */
const DateInput: React.FC<DateInputProps> = ({
  value,
  onChange,
  className = "",
  id,
  min,
  max,
  clearable = false,
  disabled = false,
}) => {
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
    const handleEscape = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const openCalendar = () => {
    if (disabled || isOpen) return;
    const d = value && !isNaN(Date.parse(value)) ? new Date(`${value}T00:00:00`) : new Date();
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
    onChange(toIso(viewYear, viewMonth, day));
    setIsOpen(false);
  };

  // ISO strings compare correctly as plain strings
  const isOutOfRange = (day: number) => {
    const iso = toIso(viewYear, viewMonth, day);
    return (!!min && iso < min) || (!!max && iso > max);
  };

  const isSelectedDay = (day: number) => value === toIso(viewYear, viewMonth, day);

  const isToday = (day: number) => {
    const t = new Date();
    return t.getFullYear() === viewYear && t.getMonth() === viewMonth && t.getDate() === day;
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const now = new Date();
  const todayIso = toIso(now.getFullYear(), now.getMonth(), now.getDate());
  const todayAllowed = !(min && todayIso < min) && !(max && todayIso > max);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          placeholder="YYYY-MM-DD"
          value={value}
          disabled={disabled}
          onClick={openCalendar}
          onChange={(e) => onChange(e.target.value)}
          className={`cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 ${className}`}
        />
        <button
          type="button"
          onClick={() => (isOpen ? setIsOpen(false) : openCalendar())}
          disabled={disabled}
          aria-label={t("Open calendar")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
        >
          <CalendarGlyph />
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-[100000] mt-2 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-gray-800 dark:text-white">
              {monthName(viewMonth)} {viewYear}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-1 text-center">
            {WEEKDAY_LABELS.map((_w, i) => (
              <div key={i} className="text-[11px] font-medium text-gray-400">
                {weekdayInitial(i)}
              </div>
            ))}
            {days.map((d, idx) =>
              d.inMonth ? (
                <button
                  key={idx}
                  type="button"
                  disabled={isOutOfRange(d.day)}
                  onClick={() => handlePick(d.day)}
                  className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
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

          <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-xs dark:border-gray-800">
            <button
              type="button"
              disabled={!todayAllowed}
              onClick={() => {
                onChange(todayIso);
                setIsOpen(false);
              }}
              className="font-medium text-brand-500 hover:text-brand-600 disabled:opacity-30"
            >
              {t("Today")}
            </button>
            {clearable && value && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setIsOpen(false);
                }}
                className="text-gray-500 hover:text-red-500 dark:text-gray-400"
              >
                {t("Clear")}
              </button>
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
