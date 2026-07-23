"use client";
import React, { useState, useMemo } from "react";
import Button from "../ui/button/Button";
import { DateRange } from "@/components/reporting/types";
import { getCalendarMonthRange, toLocalDateString } from "@/lib/reporting";
import DateInput from "./DateInput";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface WeekRangePickerProps {
  mode: "week";
  range: DateRange;
  onApply: (range: DateRange) => void;
}

interface MonthRangePickerProps {
  mode: "month";
  range: DateRange;
  onApply: (range: DateRange) => void;
}

type RangePickerProps = WeekRangePickerProps | MonthRangePickerProps;

function formatPretty(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

/**
 * Shared range picker for the Weekly Advances / Monthly Payroll list pages.
 * A segmented toggle switches between a quick picker (matching the mode:
 * week-start date, or month+year) and a fully custom start/end range.
 * The resolved range is always shown as a live preview before applying.
 */
const RangePicker: React.FC<RangePickerProps> = (props) => {
  const { range, onApply } = props;
  const [useCustom, setUseCustom] = useState(false);

  const [weekStart, setWeekStart] = useState(range.start);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [customStart, setCustomStart] = useState(range.start);
  const [customEnd, setCustomEnd] = useState(range.end);

  // Live preview of what Apply will produce, before the user clicks it.
  const previewRange: DateRange = useMemo(() => {
    if (useCustom) return { start: customStart, end: customEnd };
    if (props.mode === "week") {
      const start = new Date(weekStart);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { start: weekStart, end: toLocalDateString(end) };
    }
    return getCalendarMonthRange(year, month);
  }, [useCustom, customStart, customEnd, weekStart, year, month, props.mode]);

  const handleApply = () => onApply(previewRange);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 border-b border-gray-100 p-3 dark:border-gray-800">
        <ToggleButton active={!useCustom} onClick={() => setUseCustom(false)}>
          {props.mode === "week" ? "Pick a week" : "Pick a month"}
        </ToggleButton>
        <ToggleButton active={useCustom} onClick={() => setUseCustom(true)}>
          Custom range
        </ToggleButton>
      </div>

      <div className="flex flex-wrap items-end gap-4 p-4">
        {useCustom ? (
          <>
            <Field label="Start">
              <DateInput value={customStart} onChange={setCustomStart} />
            </Field>
            <Field label="End">
              <DateInput value={customEnd} onChange={setCustomEnd} />
            </Field>
          </>
        ) : props.mode === "week" ? (
          <Field label="Week starting on">
            <DateInput value={weekStart} onChange={setWeekStart} />
          </Field>
        ) : (
          <>
            <Field label="Month">
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Year">
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-24 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              />
            </Field>
          </>
        )}

        <Button size="md" variant="primary" onClick={handleApply}>
          Apply
        </Button>
      </div>

      {/* Resolved range preview — always visible, the key confirmation */}
      <div className="flex items-center gap-2 rounded-b-2xl border-t border-gray-100 bg-gray-50 px-4 py-3 text-sm dark:border-gray-800 dark:bg-white/[0.02]">
        <CalendarIcon />
        <span className="text-gray-500 dark:text-gray-400">
          Selected range:
        </span>
        <span className="font-medium text-gray-800 dark:text-white">
          {formatPretty(previewRange.start)} → {formatPretty(previewRange.end)}
        </span>
      </div>
    </div>
  );
};

const ToggleButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({
  active,
  onClick,
  children,
}) => (
  <button
    onClick={onClick}
    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
        : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
    }`}
  >
    {children}
  </button>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
    {children}
  </div>
);

const CalendarIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-gray-400">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

export default RangePicker;