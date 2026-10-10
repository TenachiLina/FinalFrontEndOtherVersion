// → save as: lib/rangeParams.ts
import { DateRange } from "@/components/reporting/types";

/** Reads ?start=YYYY-MM-DD&end=YYYY-MM-DD from the URL, or undefined if either is missing. */
export function readRange(params: { get(name: string): string | null }): DateRange | undefined {
  const start = params.get("start");
  const end = params.get("end");
  return start && end ? { start, end } : undefined;
}

/** "start=...&end=..." for building links. */
export function rangeQuery(range: DateRange): string {
  return `start=${range.start}&end=${range.end}`;
}