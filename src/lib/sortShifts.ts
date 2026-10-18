// Place at: src/lib/sortShifts.ts
//
// Orders shifts by start time, then end time. "HH:mm" strings are
// zero-padded, so a plain string comparison sorts them correctly.
export const sortShifts = <T extends { startTime: string; endTime: string }>(
  list: T[]
): T[] =>
  [...list].sort(
    (a, b) =>
      a.startTime.localeCompare(b.startTime) ||
      a.endTime.localeCompare(b.endTime)
  );