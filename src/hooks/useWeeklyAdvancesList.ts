import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { DateRange } from "@/components/reporting/types";
import { getThisWeekRange, deleteAdvance } from "@/lib/reporting";
import { fetchPayrollPeriod, PayrollRow } from "@/lib/payrollApi";
import { API_BASE_URL } from "@/lib/config";
import { ensureOk, friendlyError } from "@/lib/errors";
import { toast } from "@/lib/notify";

export interface WeeklyAdvanceRow {
  empId: number | string;
  firstName: string;
  lastName: string;
  hourlyRate: number;
  hours: number;
  absences: number;
  weeklySalary: number; // brut for the week: hours * hourlyRate
  consommation: number;
  advanceOffer: number;
  advanceGiven: boolean;
  advanceId?: string; // present only when advanceGiven is true; needed to revoke
}

export function useWeeklyAdvancesList(initialRange?: DateRange) {
  const [range, setRangeState] = useState<DateRange>(initialRange ?? getThisWeekRange());
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
      console.error("Error loading weekly advances:", err);
      setError(friendlyError(err, "Couldn't load the weekly advances"));
    } finally {
      if (reqId === req.current) setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load(initialRange ?? getThisWeekRange());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const advanceRows: WeeklyAdvanceRow[] = useMemo(
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
          hourlyRate: l.hourlyRate,
          hours: l.hours,
          absences: l.absences,
          weeklySalary: l.gross,
          consommation: l.consommation,
          advanceOffer: l.advanceOffer,
          advanceGiven: l.advancesCount > 0,
          advanceId: l.advanceId ?? undefined,
        })),
    [lines, search]
  );

  // The line of one employee, changed in place (after giving or taking back an advance)
  const patchLine = (empId: number | string, change: (l: PayrollRow) => PayrollRow) =>
    setLines((prev) => prev.map((l) => (String(l.empId) === String(empId) ? change(l) : l)));

  const giveAdvance = useCallback(
    async (empId: number | string, amount: number, date: string) => {
      const res = await fetch(`${API_BASE_URL}/advances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emp_id: empId,
          amount,
          date,
          reason: `Weekly advance (${range.start} to ${range.end})`,
        }),
      });
      await ensureOk(res); // the modal catches this and shows the message
      const created = await res.json();
      patchLine(empId, (l) => ({ ...l, advancesCount: l.advancesCount + 1, advanceId: created._id }));
      toast.success("Advance given.");
    },
    [range]
  );

  const revokeAdvance = useCallback(async (advanceId: string | undefined) => {
    if (!advanceId) return;
    const previous = lines;
    setLines((prev) =>
      prev.map((l) =>
        l.advanceId === advanceId ? { ...l, advancesCount: Math.max(0, l.advancesCount - 1), advanceId: null } : l
      )
    );
    try {
      await deleteAdvance(advanceId);
    } catch (err) {
      setLines(previous);
      toast.error(friendlyError(err, "Couldn't remove the advance"));
    }
  }, [lines]);

  return {
    range,
    setRange: load,
    advanceRows,
    search,
    setSearch,
    loading,
    error,
    giveAdvance,
    revokeAdvance,
  };
}
