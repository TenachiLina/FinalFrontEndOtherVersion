import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { DateRange } from "@/components/reporting/types";
import { getThisMonthRange } from "@/lib/reporting";
import { fetchPayrollPeriod, PayrollRow } from "@/lib/payrollApi";
import { friendlyError } from "@/lib/errors";
import { locale } from "@/lib/i18n";

export interface MonthlyPayrollRow {
  empId: number | string;
  firstName: string;
  lastName: string;
  baseSalary: number;
  hourlyRate: number;
  hours: number;
  brut: number;
  penalties: number;
  consommation: number;
  advancesDeducted: number;
  bonuses: number; // bonuses given in the month — added to net
  net: number;
  absences: number;
}

// initialRange: lets the page reopen on a specific month (e.g. when coming back from an employee's details)
export function useMonthlyPayrollList(initialRange?: DateRange) {
  const [range, setRangeState] = useState<DateRange>(initialRange ?? getThisMonthRange());
  // The pay of each employee, calculated by the server (GET /payroll/period)
  const [lines, setLines] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Each call gets an id; a response is only applied if no newer call started meanwhile
  const req = useRef(0);

  const load = useCallback(async (r: DateRange = range) => {
    const reqId = ++req.current;
    setLoading(true);
    setError("");
    try {
      const period = await fetchPayrollPeriod(r);
      if (reqId !== req.current) return; // outdated response → ignore
      setLines(period.rows);
      setRangeState(r);
    } catch (err) {
      if (reqId !== req.current) return;
      console.error("Error loading monthly payroll:", err);
      setError(friendlyError(err, "Couldn't load the monthly payroll"));
    } finally {
      if (reqId === req.current) setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load(initialRange ?? getThisMonthRange());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const payrollRows: MonthlyPayrollRow[] = useMemo(
    () =>
      lines
        .filter((l) => {
          if (!search) return true;
          const name = `${l.firstName} ${l.lastName}`.toLowerCase();
          return name.includes(search.toLowerCase());
        })
        .map((l) => ({
          empId: l.empId,
          firstName: l.firstName,
          lastName: l.lastName,
          baseSalary: l.baseSalary,
          hourlyRate: l.hourlyRate,
          hours: l.hours,
          brut: l.gross,
          penalties: l.penalties,
          consommation: l.consommation,
          advancesDeducted: l.advances,
          bonuses: l.bonuses,
          net: l.net,
          absences: l.absences,
        })),
    [lines, search]
  );

  // Totals of the lines on screen (they follow the search)
  const totals = useMemo(
    () => ({
      totalBrut: payrollRows.reduce((sum, r) => sum + r.brut, 0).toFixed(2),
      totalNet: payrollRows.reduce((sum, r) => sum + r.net, 0).toFixed(2),
      totalAdvances: payrollRows.reduce((sum, r) => sum + r.advancesDeducted, 0).toFixed(2),
      totalBonuses: payrollRows.reduce((sum, r) => sum + r.bonuses, 0).toFixed(2),
    }),
    [payrollRows]
  );

  // e.g. "September 2025" — derived from the range's start date, for column headers.
  const monthLabel = useMemo(() => {
    if (!range.start) return "";
    const d = new Date(`${range.start}T00:00:00`);
    return d.toLocaleDateString(locale(), { month: "long", year: "numeric" });
  }, [range.start]);

  return {
    range,
    setRange: load,
    payrollRows,
    totals,
    monthLabel,
    search,
    setSearch,
    loading,
    error,
  };
}
