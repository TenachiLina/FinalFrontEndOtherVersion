"use client";
import React, { useEffect, useState } from "react";
import { Modal } from "../ui/modal";

import { currency } from "@/lib/payrollConfig";
import { friendlyError } from "@/lib/errors";
interface BonusModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeName: string;
  onConfirm: (amount: number, date: string, reason: string) => Promise<void>;
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const BonusModal: React.FC<BonusModalProps> = ({ isOpen, onClose, employeeName, onConfirm }) => {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setAmount("");
      setDate(todayISO());
      setReason("");
      setError("");
      setSaving(false);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    const n = Number(amount);
    if (!amount || !Number.isFinite(n) || n <= 0) return setError("Enter an amount greater than 0.");
    if (!date) return setError("Pick a date.");
    if (!reason.trim()) return setError("Add a reason for this prime.");

    setSaving(true);
    setError("");
    try {
      await onConfirm(Number(n.toFixed(2)), date, reason.trim());
      onClose();
    } catch (err) {
      setError(friendlyError(err, "Couldn't save the prime"));
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";
  const labelCls = "mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300";

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="m-4 max-w-[460px] p-6">
      <h3 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white">Give Prime</h3>
      <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">{employeeName}</p>

      <div className="flex flex-col gap-4">
        <div>
          <label className={labelCls}>Amount ({currency()})</label>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} autoFocus />
        </div>
        <div>
          <label className={labelCls}>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Reason</label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Perfect attendance, great performance…"
            className={inputCls}
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</div>
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

export default BonusModal;