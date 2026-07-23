import { useState, useEffect, useCallback } from "react";
import { Employee, AdvanceRecord } from "@/components/reporting/types";
import { fetchEmployees, fetchAdvances, deleteAdvance } from "@/lib/reporting";

export function useAdvancesReport() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [advances, setAdvances] = useState<AdvanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const emps = await fetchEmployees();
      setEmployees(emps);
      const records = await fetchAdvances(emps);
      setAdvances(records);
    } catch (err) {
      console.error("Error loading advances:", err);
      setError("Failed to load advances.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredAdvances = advances.filter((a) => {
    if (!search) return true;
    const name = `${a.employee?.FirstName || ""} ${a.employee?.LastName || ""}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const revokeAdvance = useCallback(
    async (advanceId: string | undefined) => {
      if (!advanceId) return;
      try {
        await deleteAdvance(advanceId);
        setAdvances((prev) => prev.filter((a) => a.id !== advanceId));
      } catch (err) {
        console.error("Error revoking advance:", err);
      }
    },
    []
  );

  const totalAdvanced = filteredAdvances.reduce((sum, a) => sum + a.amount, 0);

  return {
    employees,
    advances: filteredAdvances,
    totalAdvanced,
    search,
    setSearch,
    loading,
    error,
    revokeAdvance,
    reload: load,
  };
}