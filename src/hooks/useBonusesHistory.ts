// → save as: hooks/useBonusesHistory.ts
import { useState, useEffect, useMemo, useCallback } from "react";
import { Employee, DateRange } from "@/components/reporting/types";
import { getThisMonthRange, fetchEmployees } from "@/lib/reporting";
import { BonusRecord, fetchBonuses, deleteBonus } from "@/lib/bonuses";

export interface BonusHistoryRow extends BonusRecord {
  employeeName: string;
}

export function useBonusesHistory() {
  const [range, setRangeState] = useState<DateRange>(getThisMonthRange());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [bonuses, setBonuses] = useState<BonusRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (r: DateRange) => {
    setLoading(true);
    setError("");
    try {
      const [emps, list] = await Promise.all([fetchEmployees(), fetchBonuses(r)]);
      setEmployees(emps);
      setBonuses(list);
      setRangeState(r);
    } catch (err) {
      console.error("Error loading primes history:", err);
      setError("Failed to load the primes history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(getThisMonthRange());
  }, [load]);

  const rows: BonusHistoryRow[] = useMemo(() => {
    return bonuses
      .map((b) => {
        const emp = employees.find((e) => String(e.emp_id) === String(b.empId));
        return { ...b, employeeName: emp ? `${emp.FirstName} ${emp.LastName}`.trim() : `#${b.empId}` };
      })
      .filter((b) => !search || b.employeeName.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [bonuses, employees, search]);

  const total = useMemo(() => Number(rows.reduce((s, b) => s + b.amount, 0).toFixed(2)), [rows]);

  const revokeBonus = useCallback(
    async (id: string) => {
      const previous = bonuses;
      setBonuses((prev) => prev.filter((b) => b.id !== id));
      try {
        await deleteBonus(id);
      } catch (err) {
        console.error("Error revoking bonus:", err);
        setBonuses(previous);
      }
    },
    [bonuses]
  );

  return { range, setRange: load, rows, total, search, setSearch, loading, error, revokeBonus };
}