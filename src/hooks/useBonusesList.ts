// → hooks/useBonusesList.ts  (used by the "Give Primes" page)
import { useState, useEffect, useMemo, useCallback } from "react";
import { Employee, DateRange } from "@/components/reporting/types";
import { getThisMonthRange, fetchEmployees } from "@/lib/reporting";
import { BonusRecord, fetchBonuses, createBonus } from "@/lib/bonuses";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/notify";

export interface BonusEmployeeRow {
  empId: number | string;
  firstName: string;
  lastName: string;
  count: number; // primes received this month
  total: number; // total amount this month
}

export function useBonusesList() {
  // The page shows a "this month" summary per employee; the prime itself can have any date.
  const [range, setRange] = useState<DateRange>(getThisMonthRange());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [bonuses, setBonuses] = useState<BonusRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = getThisMonthRange();
      const [emps, list] = await Promise.all([fetchEmployees(), fetchBonuses(r)]);
      setEmployees(emps);
      setBonuses(list);
      setRange(r);
    } catch (err) {
      console.error("Error loading primes:", err);
      setError(friendlyError(err, "Couldn't load the primes"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const employeeRows: BonusEmployeeRow[] = useMemo(() => {
    return employees
      .filter((emp) => {
        if (!search) return true;
        return `${emp.FirstName} ${emp.LastName}`.toLowerCase().includes(search.toLowerCase());
      })
      .map((emp) => {
        const mine = bonuses.filter((b) => String(b.empId) === String(emp.emp_id));
        return {
          empId: emp.emp_id,
          firstName: emp.FirstName,
          lastName: emp.LastName,
          count: mine.length,
          total: Number(mine.reduce((s, b) => s + b.amount, 0).toFixed(2)),
        };
      });
  }, [employees, bonuses, search]);

  const totalGiven = useMemo(
    () => Number(bonuses.reduce((s, b) => s + b.amount, 0).toFixed(2)),
    [bonuses]
  );

  // Throws on failure so the modal can show an error
  const giveBonus = useCallback(
    async (empId: number | string, amount: number, date: string, reason: string) => {
      const created = await createBonus({ empId, amount, date, reason });
      // Only count it in this page's summary if it falls in the current month
      if (created.date >= range.start && created.date <= range.end) {
        setBonuses((prev) => [created, ...prev]);
      }
      toast.success("Prime given.");
    },
    [range]
  );

  return { range, employeeRows, totalGiven, search, setSearch, loading, error, giveBonus };
}