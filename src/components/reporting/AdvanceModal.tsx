"use client";
import React, { useEffect, useState } from "react";
import { Modal } from "../ui/modal";
import { DateRange } from "./types";

import { currency } from "@/lib/payrollConfig";
interface AdvanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeName: string;
  offer: number; // suggested amount
  range: DateRange; // selected week
  onConfirm: (amount: number, date: string) => Promise<void>;
}

const toLocalISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Today if it falls inside the selected week, otherwise the closest bound of the week.
const defaultDate = (range: DateRange) => {
  const today = toLocalISO(new Date());
  if (today < range.start) return range.start;
  if (today > range.end) return range.end;
  return today;
};

const AdvanceModal: React.FC<AdvanceModalProps> = ({ isOpen, onClose, employeeName, offer, range, onConfirm }) => {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Reset the form every time the modal opens for a (new) employee
  useEffect(() => {
    if (isOpen) {
      setAmount(offer.toFixed(2));
      setDate(defaultDate(range));
      setError("");
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, offer, range.start, range.end]);

  const numericAmount = Number(amount);
  const exceedsOffer = amount !== "" && numericAmount > offer;

  const handleSubmit = async () => {
    if (!amount || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    if (!date) {
      setError("Pick a date.");
      return;
    }
    if (date < range.start || date > range.end) {
      setError(`Date must be between ${range.start} and ${range.end}.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onConfirm(Number(numericAmount.toFixed(2)), date);
      onClose();
    } catch {
      setError("Failed to save the advance. Please try again.");
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="m-4 max-w-[460px] p-6">
      <h3 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white">Give Advance</h3>
      <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
        {employeeName} — suggested advance: <span className="font-semibold">{offer.toFixed(2)} {currency()}</span>
      </p>

      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Amount ({currency()})</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputCls}
          />
          {exceedsOffer && (
            <p className="mt-1 text-xs text-amber-600">
              This is higher than the suggested advance ({offer.toFixed(2)} {currency()}).
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Date</label>
          <input
            type="date"
            value={date}
            min={range.start}
            max={range.end}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onClose}
          disabled={saving}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Confirm"}
        </button>
      </div>
    </Modal>
  );
};

export default AdvanceModal;