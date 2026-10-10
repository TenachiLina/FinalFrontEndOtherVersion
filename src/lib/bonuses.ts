// → save as: lib/bonuses.ts
import { DateRange } from "@/components/reporting/types";
import { API_BASE_URL } from "@/lib/reporting";

export interface BonusRecord {
  id: string;
  empId: number | string;
  amount: number;
  date: string; // YYYY-MM-DD
  reason: string;
}

interface BonusRaw {
  _id: string;
  emp_id: number | string;
  amount: number;
  date: string;
  reason?: string;
}

function normalizeBonus(raw: BonusRaw): BonusRecord {
  return {
    id: raw._id,
    empId: raw.emp_id,
    amount: Number(raw.amount || 0),
    date: String(raw.date || "").split("T")[0],
    reason: raw.reason || "",
  };
}

export async function fetchBonuses(range?: DateRange): Promise<BonusRecord[]> {
  const params = new URLSearchParams();
  if (range?.start) params.set("start", range.start);
  if (range?.end) params.set("end", range.end);
  const qs = params.toString() ? `?${params}` : "";

  const res = await fetch(`${API_BASE_URL}/bonuses${qs}`);
  if (!res.ok) throw new Error(`Failed to fetch bonuses: ${res.status}`);
  const data = await res.json();
  const list: BonusRaw[] = Array.isArray(data) ? data : data.rows || [];
  return list.map(normalizeBonus);
}

export async function createBonus(input: {
  empId: number | string;
  amount: number;
  date: string;
  reason: string;
}): Promise<BonusRecord> {
  const res = await fetch(`${API_BASE_URL}/bonuses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emp_id: input.empId,
      amount: input.amount,
      date: input.date,
      reason: input.reason,
    }),
  });
  if (!res.ok) throw new Error("Failed to create bonus");
  return normalizeBonus(await res.json());
}

export async function deleteBonus(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/bonuses/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete bonus");
}