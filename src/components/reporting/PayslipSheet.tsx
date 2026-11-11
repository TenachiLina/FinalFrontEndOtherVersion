"use client";
import React, { useState } from "react";
import {
  COMPANY_PAYSLIP_FIELDS,
  formatPayslipDate,
  Payslip,
  PayslipField,
  SOCIAL_SECURITY_RATE,
} from "@/lib/payslip";
import { t } from "@/lib/i18n";

const money = (n: number) =>
  n === 0 ? "-" : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const boxed = "border border-black text-center";

const FAMILY_STATUSES = [
  ["C", "Single"],
  ["M", "Married"],
  ["D", "Divorced"],
  ["V", "Widowed"],
];

// Rows of the table, keyed by their row number in FICHE DE PAIE.xlsx. Empty rows are spacing.
function bodyRows(p: Payslip) {
  const rows: { label?: string; base?: string; rate?: string; gain?: string; deduction?: string }[] =
    Array.from({ length: 21 }, () => ({}));
  rows[1] = { label: "SALAIRE DE BASE", base: money(p.days), gain: money(p.baseSalary) };
  rows[3] = { label: "SALAIRE DE POSTE", gain: money(p.postSalary) };
  rows[5] = {
    label: "RETENUE SECU. SLE",
    rate: `${Math.round(SOCIAL_SECURITY_RATE * 100)}%`,
    deduction: money(p.socialSecurity),
  };
  rows[7] = { label: "PRIME DE TRANSPORT" };
  rows[9] = { label: "PRIME DE PANIER" };
  rows[11] = { label: "FRAIS DE MISSION", gain: money(0) };
  return rows;
}

type SaveField = (field: PayslipField, value: string) => Promise<void>;

interface ValueProps {
  field: PayslipField;
  label: string;
  value: string;
  /** What to show when it differs from the stored value, e.g. a formatted date. */
  shown?: string;
  type?: "text" | "date" | "select" | "textarea";
  /** Without onSave the value is plain text: exports, printing, or no right to change it. */
  onSave?: SaveField;
}

/** A value on the sheet. When it can be changed, a click turns it into a field. */
const PayslipValue: React.FC<ValueProps> = ({ field, label, value, shown = value, type = "text", onSave }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!onSave) return <>{shown}</>;

  const commit = async (next: string | null = draft) => {
    if (next === null || saving) return;
    if (next.trim() === value) {
      setDraft(null);
      return;
    }
    setSaving(true);
    await onSave(field, next.trim());
    setSaving(false);
    setDraft(null);
  };

  if (draft === null) {
    return (
      <button
        type="button"
        onClick={() => setDraft(value)}
        aria-label={t("Edit {field}", { field: t(label) })}
        title={t("Click to edit")}
        className={`block min-h-5 w-full cursor-text whitespace-pre-line px-1 text-inherit hover:bg-brand-50 ${
          shown ? "" : "bg-amber-50 font-normal italic text-amber-700"
        }`}
        style={{ textAlign: "inherit" }}
      >
        {shown || t("Click to fill in")}
      </button>
    );
  }

  const inputProps = {
    autoFocus: true,
    value: draft,
    disabled: saving,
    "aria-label": t(label),
    className: "block w-full bg-white px-1 text-black outline-2 outline-brand-500",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setDraft(e.target.value),
    onBlur: () => commit(),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") setDraft(null);
      // Enter adds a line in the address: Ctrl+Enter or clicking away saves it
      if (e.key === "Enter" && (type !== "textarea" || e.ctrlKey)) {
        e.preventDefault();
        commit();
      }
    },
  };

  if (type === "textarea") return <textarea rows={2} {...inputProps} />;
  if (type === "select") {
    return (
      <select {...inputProps} onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}>
        <option value="">—</option>
        {FAMILY_STATUSES.map(([code, name]) => (
          <option key={code} value={code}>{code} - {t(name)}</option>
        ))}
      </select>
    );
  }
  return <input type={type} {...inputProps} />;
};

/** The payslip on paper: always black on white, also in dark mode. */
const PayslipSheet: React.FC<{
  payslip: Payslip;
  /** Saves a clicked field. Left out when printing. */
  onSave?: SaveField;
  /** Company details can only be changed by a company admin. */
  canEditCompany?: boolean;
}> = ({ payslip: p, onSave, canEditCompany = false }) => {
  const editable = (field: PayslipField) =>
    COMPANY_PAYSLIP_FIELDS.includes(field) && !canEditCompany ? undefined : onSave;

  return (
    <div
      className="payslip-sheet mx-auto w-full max-w-[720px] bg-white p-6 text-[13px] font-bold leading-tight text-black"
      style={{ fontFamily: '"Times New Roman", Times, serif' }}
    >
      <div className="text-2xl">{p.company.name}</div>
      <div className="mt-1">
        <PayslipValue field="payslipActivity" label="Company activity" value={p.company.activity} onSave={editable("payslipActivity")} />
      </div>
      <div className="mt-1 whitespace-pre-line">
        <PayslipValue field="payslipAddress" label="Company address" type="textarea" value={p.company.address} onSave={editable("payslipAddress")} />
      </div>
      <div className="mt-1 flex items-center gap-1">
        <span className="shrink-0">N° Cotisant :</span>
        <span className="min-w-0 flex-1">
          <PayslipValue field="payslipContributorNumber" label="Contributor number" value={p.company.contributorNumber} onSave={editable("payslipContributorNumber")} />
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 items-center bg-[#8ea9db] px-1 py-1.5">
        <span>BULLETIN DE PAIE</span>
        <span>{p.period}</span>
      </div>

      <div className="mt-5 grid grid-cols-[1fr_auto_55%] items-center gap-2">
        <span />
        <span className="text-sm">NOM:</span>
        <span className={`${boxed} min-h-6 px-2 text-base`}>{p.employeeName}</span>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto_16%_29%] items-center gap-2">
        <span />
        <span className="text-sm">SIT. FAMILIALE:</span>
        <span className={`${boxed} min-h-5`}>
          <PayslipValue field="familyStatus" label="Family status" type="select" value={p.familyStatus} onSave={onSave} />
        </span>
        <span />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div className="grid grid-cols-[auto_1fr] items-center gap-2 self-center">
          <span>FONCTION:</span>
          <span className="min-h-5 border border-black text-xs">
            <PayslipValue field="jobTitle" label="Job title" value={p.jobTitle} onSave={onSave} />
          </span>
        </div>
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1">
          <span>DATE NAISSANCE</span>
          <span className={`${boxed} min-h-5`}>
            <PayslipValue field="birthDate" label="Date of birth" type="date" value={p.birthDate} shown={formatPayslipDate(p.birthDate)} onSave={onSave} />
          </span>
          <span>DATE ENT:</span>
          <span className={`${boxed} min-h-5`}>
            <PayslipValue field="hireDate" label="Hire date" type="date" value={p.hireDate} shown={formatPayslipDate(p.hireDate)} onSave={onSave} />
          </span>
          <span>N° SS:</span>
          <span className={`${boxed} min-h-5`}>
            <PayslipValue field="socialSecurityNumber" label="Insurance number" value={p.socialSecurityNumber} onSave={onSave} />
          </span>
        </div>
      </div>

      <table className="mt-6 w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-[40%]" />
          <col className="w-[10%]" />
          <col className="w-[20%]" />
          <col className="w-[15%]" />
          <col className="w-[15%]" />
        </colgroup>
        <thead>
          <tr className="text-sm">
            {["LIBELLE", "N/BASE", "TAUX", "GAIN", "RETENUE"].map((h) => (
              <th key={h} className="border border-black py-3 font-bold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows(p).map((r, i) => (
            <tr key={i} className="h-[17px]">
              <td className="border-x border-black px-1">{r.label}</td>
              <td className="border-x border-black px-1 text-right">{r.base}</td>
              <td className="border-x border-black px-1 text-center">{r.rate}</td>
              <td className="border-x border-black px-1 text-right">{r.gain}</td>
              <td className="border-x border-black px-1 text-right">{r.deduction}</td>
            </tr>
          ))}
          <tr className="text-sm">
            <td colSpan={3} className="border border-black py-3 pe-4 text-right">TOTAL</td>
            <td className="border border-black px-1 text-center">{money(p.postSalary)}</td>
            <td className="border border-black px-1 text-center">{money(p.socialSecurity)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-5 grid grid-cols-[1fr_30%] items-center gap-2">
        <span className="text-right text-lg">NET A PAYER</span>
        <span className="border border-black py-1 text-center text-2xl">{money(p.net)}</span>
      </div>
    </div>
  );
};

export default PayslipSheet;
