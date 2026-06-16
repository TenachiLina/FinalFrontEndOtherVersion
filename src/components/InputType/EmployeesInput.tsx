"use client";
import React, { useState, useRef, useEffect } from "react";

// ─── Mock employees list (replace with your real data / API call) ─────────────
const EMPLOYEES = [
  "Alice Martin", "Bob Dupont", "Charlie Bernard", "Diana Leroy",
  "Ethan Moreau", "Fatima Ndiaye", "Georges Lambert", "Hana Petit",
  "Ibrahim Diallo", "Julie Simon", "Karim Benali", "Laura Thomas",
  "Mohamed Ait", "Nina Rousseau", "Omar Traore", "Paula Girard",
];

interface EmployeeInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

const EmployeeInput: React.FC<EmployeeInputProps> = ({ value, onChange, onKeyDown }) => {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = value.trim()
    ? EMPLOYEES.filter((e) =>
        e.toLowerCase().includes(value.toLowerCase())
      )
    : [];

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Reset highlight when suggestions change
  useEffect(() => { setHighlighted(0); }, [suggestions.length]);

  const select = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (open && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        select(suggestions[highlighted]);
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
    }
    // Fall through to parent handler (e.g. save on Enter when no dropdown)
    onKeyDown?.(e);
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
        Title
      </label>

      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="ex: John Doe"
        className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
      />

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900 max-h-48 overflow-y-auto">
          {suggestions.map((name, idx) => {
            // Bold the matching part
            const matchStart = name.toLowerCase().indexOf(value.toLowerCase());
            const matchEnd   = matchStart + value.length;

            return (
              <li
                key={name}
                onMouseDown={() => select(name)}
                onMouseEnter={() => setHighlighted(idx)}
                className={[
                  "flex items-center gap-2 px-4 py-2 cursor-pointer text-sm transition-colors",
                  idx === highlighted
                    ? "bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400"
                    : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.04]",
                ].join(" ")}
              >
                {/* Avatar initials */}
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
                  {name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </span>

                {/* Highlighted match */}
                <span>
                  {name.slice(0, matchStart)}
                  <strong className="font-semibold">{name.slice(matchStart, matchEnd)}</strong>
                  {name.slice(matchEnd)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default EmployeeInput;