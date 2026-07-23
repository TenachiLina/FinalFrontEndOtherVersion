"use client";
import React, { useState } from "react";
import Button from "../ui/button/Button";
import { DateRange } from "@/components/reporting/types";
import { getThisWeekRange, getThisMonthRange } from "@/lib/reporting";
import DateInput from "./DateInput";

function getThisYearRange(): DateRange {
  const year = new Date().getFullYear();
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function formatPretty(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

interface SimpleRangePickerProps {
  range: DateRange;
  onApply: (range: DateRange) => void;
}

/**
 * Free-form start/end date picker for the Overview page, with quick preset
 * buttons (This Week / This Month / This Year) that just fill the fields —
 * unlike RangePicker, there's no week/month "mode", just two date inputs.
 */
const SimpleRangePicker: React.FC<SimpleRangePickerProps> = ({ range, onApply }) => {
  const [start, setStart] = useState(range.start);
  const [end, setEnd] = useState(range.end);

  const applyPreset = (preset: DateRange) => {
    setStart(preset.start);
    setEnd(preset.end);
    onApply(preset);
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-3 dark:border-gray-800">
        <PresetButton onClick={() => applyPreset(getThisWeekRange())}>This Week</PresetButton>
        <PresetButton onClick={() => applyPreset(getThisMonthRange())}>This Month</PresetButton>
        <PresetButton onClick={() => applyPreset(getThisYearRange())}>This Year</PresetButton>
      </div>

      <div className="flex flex-wrap items-end gap-4 p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Start</label>
          <DateInput value={start} onChange={setStart} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">End</label>
          <DateInput value={end} onChange={setEnd} />
        </div>
        <Button size="md" variant="primary" onClick={() => onApply({ start, end })}>
          Apply
        </Button>
      </div>

      <div className="flex items-center gap-2 rounded-b-2xl border-t border-gray-100 bg-gray-50 px-4 py-3 text-sm dark:border-gray-800 dark:bg-white/[0.02]">
        <span className="text-gray-500 dark:text-gray-400">Selected range:</span>
        <span className="font-medium text-gray-800 dark:text-white">
          {formatPretty(range.start)} → {formatPretty(range.end)}
        </span>
      </div>
    </div>
  );
};

const PresetButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button
    onClick={onClick}
    className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
  >
    {children}
  </button>
);

export default SimpleRangePicker;