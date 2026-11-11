"use client";
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { EmployeeRaw } from "@/components/reporting/types";
import PayslipSheet from "./PayslipSheet";
import Button from "@/components/ui/button/Button";
import LoadError from "@/components/ui/feedback/LoadError";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL } from "@/lib/config";
import { ensureOk, friendlyError } from "@/lib/errors";
import { locale, t } from "@/lib/i18n";
import { currency } from "@/lib/payrollConfig";
import { toast } from "@/lib/notify";
import {
  buildPayslip,
  COMPANY_PAYSLIP_FIELDS,
  missingPayslipFields,
  Payslip,
  PayslipField,
} from "@/lib/payslip";
import { fetchEmployeesRaw } from "@/lib/reporting";

const thisMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

// While printing, only the payslips show, one per page. They sit directly in
// <body> so the rest of the app can take no room at all (no blank pages).
const PRINT_CSS = `#payslip-print { display: none; }
@media print {
  @page { size: A4; margin: 10mm; }
  body { background: #fff !important; }
  body > *:not(#payslip-print) { display: none !important; }
  #payslip-print { display: block; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  #payslip-print .payslip-sheet { max-width: none; padding: 0 1px; }
  #payslip-print .payslip-sheet:not(:last-child) { break-after: page; }
}`;

const PayslipsView: React.FC = () => {
  const { user, company, refreshCompany } = useAuth();
  const canEditCompany = user?.role === "admin" || user?.role === "superadmin";
  const [employees, setEmployees] = useState<EmployeeRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [month, setMonth] = useState(thisMonth);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [printAll, setPrintAll] = useState(false);
  const [printRequest, setPrintRequest] = useState(0);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchEmployeesRaw();
      const visible = list.filter((e) => !e.otherManager);
      setEmployees(visible);
      setSelectedId((id) => id || String(visible[0]?._id ?? ""));
    } catch (err) {
      setError(friendlyError(err, "Couldn't load the employees"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Printing waits for the sheets to be on the page
  useEffect(() => {
    if (printRequest) window.print();
  }, [printRequest]);

  const payslipFor = (e: EmployeeRaw): Payslip =>
    buildPayslip(e, company ?? { name: "" }, month);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => `${e.firstName} ${e.lastName}`.toLowerCase().includes(q));
  }, [employees, search]);

  const selected = employees.find((e) => String(e._id) === selectedId);
  const payslip = selected ? payslipFor(selected) : null;
  const missing = payslip ? missingPayslipFields(payslip) : [];

  // A clicked field on the payslip: kept on the employee or the company, so it
  // is already there on next month's payslip
  const saveField = async (field: PayslipField, value: string) => {
    const headers = { "Content-Type": "application/json" };
    try {
      if (COMPANY_PAYSLIP_FIELDS.includes(field)) {
        const res = await fetch(`${API_BASE_URL}/company`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ settings: { [field]: value } }),
        });
        await ensureOk(res);
        await refreshCompany();
      } else if (selected) {
        const res = await fetch(`${API_BASE_URL}/employees/${selected._id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ [field]: value }),
        });
        await ensureOk(res);
        setEmployees((prev) => prev.map((e) => (e._id === selected._id ? { ...e, [field]: value } : e)));
      }
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't save this detail"));
    }
  };

  const handleMonth = (value: string) => {
    if (!value) return;
    setMonth(value);
  };

  const exportExcel = async (all: boolean) => {
    if (!payslip) return;
    setExporting(true);
    try {
      // Loaded here: the Excel library is too large for the page itself
      const { downloadPayslips } = await import("@/lib/payslipExcel");
      const slips = all ? employees.map(payslipFor) : [payslip];
      const name = all ? `Fiches de paie ${payslip.period}` : `Fiche de paie ${payslip.employeeName} ${payslip.period}`;
      await downloadPayslips(slips, `${name}.xlsx`);
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't export the payslips"));
    } finally {
      setExporting(false);
    }
  };

  const print = (all: boolean) => {
    setPrintAll(all);
    setPrintRequest((n) => n + 1);
  };

  return (
    <div className="flex flex-col gap-5">
      <style>{PRINT_CSS}</style>
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">{t("Payslips")}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("One payslip per employee: the declared salary (or the base salary when none is declared), minus 9% social security. This net doesn't use hours, advances or penalties, so it can differ from Monthly Payroll.")}
        </p>
      </div>

      {error && <LoadError title="Couldn't load the employees" message={error} onRetry={load} />}
      {loading && <div className="text-sm text-gray-500 dark:text-gray-400">{t("Loading…")}</div>}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
          {t("Month")}
          <input
            type="month"
            value={month}
            onChange={(e) => handleMonth(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          />
        </label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Search employee…")}
          aria-label={t("Search employee…")}
          className="w-56 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        />
        <div className="ms-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!payslip || exporting} onClick={() => exportExcel(false)}>
            {t("Export to Excel")}
          </Button>
          <Button size="sm" variant="outline" disabled={!payslip} onClick={() => print(false)}>
            {t("Print / PDF")}
          </Button>
          <Button size="sm" disabled={!payslip || exporting} onClick={() => exportExcel(true)}>
            {t("Export all to Excel")}
          </Button>
          <Button size="sm" disabled={!payslip} onClick={() => print(true)}>
            {t("Print all / PDF")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(280px,360px)_1fr]">
        <div className="self-start overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
          <table className="w-full">
            <thead className="bg-[#2563a0]">
              <tr>
                <th className="p-3 text-start text-xs font-bold uppercase tracking-wide text-white">{t("Employee")}</th>
                <th className="p-3 text-end text-xs font-bold uppercase tracking-wide text-white">{t("Payslip salary")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {shown.map((e) => {
                const id = String(e._id);
                const name = `${e.firstName} ${e.lastName}`;
                return (
                  <tr key={id} className={id === selectedId ? "bg-brand-50 dark:bg-brand-500/10" : ""}>
                    <td className="p-0">
                      <button
                        type="button"
                        onClick={() => setSelectedId(id)}
                        aria-current={id === selectedId}
                        className="w-full p-3 text-start text-sm font-medium text-gray-800 dark:text-white"
                      >
                        {name}
                      </button>
                    </td>
                    <td className="p-3 text-end text-sm text-gray-600 dark:text-gray-400">
                      {payslipFor(e).baseSalary.toLocaleString(locale())} {currency()}
                      {e.declaredSalary != null && (
                        <span className="block text-xs text-brand-600 dark:text-brand-400">{t("Declared")}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && shown.length === 0 && (
                <tr>
                  <td colSpan={2} className="p-6 text-center text-sm text-gray-400">{t("No employees found")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {missing.length > 0 && (
            <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-500/10 dark:text-amber-400">
              {t("Empty on this payslip: {fields}. Click a field on the payslip to fill it in.", {
                fields: missing.map((m) => t(m)).join(", "),
              })}
            </div>
          )}
          {payslip && (
            <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
              {/* Keyed by employee so a half-typed value can't move to the next one */}
              <PayslipSheet
                key={String(selected?._id)}
                payslip={payslip}
                onSave={saveField}
                canEditCompany={canEditCompany}
              />
            </div>
          )}
        </div>
      </div>

      {printRequest > 0 && payslip && createPortal(
        <div id="payslip-print">
          {(printAll ? employees.map(payslipFor) : [payslip]).map((p) => (
            <PayslipSheet key={String(p.empNumber)} payslip={p} />
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};

export default PayslipsView;
