// → save as: lib/rangeParams.ts
import { DateRange } from "@/components/reporting/types";

/** True for a real calendar date written "YYYY-MM-DD" (so not "hello" or "2026-02-30"). */
function isIsoDate(value: string | null): value is string {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

/** Reads ?start=YYYY-MM-DD&end=YYYY-MM-DD from the URL, or undefined if either is missing,
 *  not a date, or the range is reversed (start after end). */
export function readRange(params: { get(name: string): string | null }): DateRange | undefined {
  const start = params.get("start");
  const end = params.get("end");
  // "YYYY-MM-DD" strings sort like the dates they write
  return isIsoDate(start) && isIsoDate(end) && start <= end ? { start, end } : undefined;
}

/** "start=...&end=..." for building links. */
export function rangeQuery(range: DateRange): string {
  return `start=${range.start}&end=${range.end}`;
}