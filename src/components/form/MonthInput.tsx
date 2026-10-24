"use client";
import React from "react";
import { monthName, t } from "@/lib/i18n";

interface MonthInputProps {
  value: string; // "YYYY-MM", or "" when not set
  onChange: (value: string) => void;
  className?: string; // applied to each of the two dropdowns
  id?: string;
}

/**
 * A month field made of two dropdowns (month and year), so a month can be
 * picked without the keyboard. Writes "YYYY-MM" (same format as <input type="month">).
 */
const MonthInput: React.FC<MonthInputProps> = ({ value, onChange, className = "", id }) => {
  const [year = "", month = ""] = value ? value.split("-") : [];

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 11 }, (_, i) => String(thisYear - 5 + i));
  if (year && !years.includes(year)) {
    years.push(year);
    years.sort();
  }

  // picking only one part fills the other with the current month/year
  const setMonth = (m: string) => onChange(`${year || thisYear}-${m}`);
  const setYear = (y: string) =>
    onChange(`${y}-${month || String(new Date().getMonth() + 1).padStart(2, "0")}`);

  const selectCls = `rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-white ${className}`;

  return (
    <div className="flex items-center gap-2">
      <select
        id={id}
        aria-label={t("Month")}
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        className={`flex-1 ${selectCls}`}
      >
        <option value="" disabled>
          {t("Month")}
        </option>
        {Array.from({ length: 12 }, (_, i) => (
          <option key={i} value={String(i + 1).padStart(2, "0")}>
            {monthName(i)}
          </option>
        ))}
      </select>
      <select
        aria-label={t("Year")}
        value={year}
        onChange={(e) => setYear(e.target.value)}
        className={selectCls}
      >
        <option value="" disabled>
          {t("Year")}
        </option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
};

export default MonthInput;
