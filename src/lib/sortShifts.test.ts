import { describe, expect, it } from "vitest";
import { sortShifts } from "./sortShifts";

const shift = (startTime: string, endTime: string) => ({ startTime, endTime });

describe("sortShifts", () => {
  it("orders by start time", () => {
    const sorted = sortShifts([shift("14:00", "22:00"), shift("08:00", "16:00"), shift("10:00", "18:00")]);
    expect(sorted.map((s) => s.startTime)).toEqual(["08:00", "10:00", "14:00"]);
  });

  it("breaks ties on end time", () => {
    const sorted = sortShifts([shift("08:00", "16:00"), shift("08:00", "12:00")]);
    expect(sorted.map((s) => s.endTime)).toEqual(["12:00", "16:00"]);
  });

  it("places an overnight shift by its start time", () => {
    const sorted = sortShifts([shift("22:00", "02:00"), shift("08:00", "16:00")]);
    expect(sorted.map((s) => s.startTime)).toEqual(["08:00", "22:00"]);
  });

  it("returns a new array and leaves the input unchanged", () => {
    const input = [shift("10:00", "18:00"), shift("08:00", "16:00")];
    const sorted = sortShifts(input);
    expect(sorted).not.toBe(input);
    expect(input[0].startTime).toBe("10:00");
  });

  it("keeps the other fields of each shift", () => {
    const [first] = sortShifts([{ ...shift("08:00", "16:00"), id: "a" }]);
    expect(first.id).toBe("a");
  });

  it("handles an empty list", () => {
    expect(sortShifts([])).toEqual([]);
  });
});
