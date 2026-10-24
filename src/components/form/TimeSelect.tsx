"use client";
import React from "react";
import { t } from "@/lib/i18n";

interface TimeSelectProps {
  value: string; // "HH:mm", or "" when not set
  onChange: (value: string) => void;
  minuteStep?: number; // gap between minute choices, e.g. 1, 5, 15
  className?: string; // applied to each of the two dropdowns
  id?: string;
  disabled?: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));

/**
 * A time field made of two dropdowns (hour and minute), so a time can be
 * picked without the keyboard. Writes "HH:mm" once both parts are chosen.
 */
const TimeSelect: React.FC<TimeSelectProps> = ({
  value,
  onChange,
  minuteStep = 1,
  className = "",
  id,
  disabled = false,
}) => {
  const [hour = "", minute = ""] = value ? value.split(":") : [];

  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => pad(i * minuteStep));
  // keep an existing minute that isn't on the step grid (e.g. "09:17" with step 5)
  if (minute && !minutes.includes(minute)) {
    minutes.push(minute);
    minutes.sort();
  }

  // picking only the hour defaults the minute to 00 so the value is always complete
  const setHour = (h: string) => onChange(`${h}:${minute || "00"}`);
  const setMinute = (m: string) => onChange(`${hour || "00"}:${m}`);

  const selectCls = `rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 ${className}`;

  return (
    <div className="flex items-center gap-1" dir="ltr">
      <select
        id={id}
        aria-label={t("Hour")}
        value={hour}
        disabled={disabled}
        onChange={(e) => setHour(e.target.value)}
        className={selectCls}
      >
        <option value="" disabled>
          --
        </option>
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-sm text-gray-400">:</span>
      <select
        aria-label={t("Minute")}
        value={minute}
        disabled={disabled}
        onChange={(e) => setMinute(e.target.value)}
        className={selectCls}
      >
        <option value="" disabled>
          --
        </option>
        {minutes.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
};

export default TimeSelect;
