import { describe, expect, it } from "vitest";
import { rangeQuery, readRange } from "./rangeParams";

describe("readRange", () => {
  it("reads start and end from the URL", () => {
    const params = new URLSearchParams("start=2026-03-01&end=2026-03-31");
    expect(readRange(params)).toEqual({ start: "2026-03-01", end: "2026-03-31" });
  });

  it.each(["start=2026-03-01", "end=2026-03-31", "", "start=&end=2026-03-31"])(
    "returns undefined when a date is missing (%s)",
    (query) => {
      expect(readRange(new URLSearchParams(query))).toBeUndefined();
    }
  );

  // BUG-004: any non-empty text is accepted as a date
  it.fails("rejects values that are not YYYY-MM-DD dates", () => {
    expect(readRange(new URLSearchParams("start=hello&end=2026-03-31"))).toBeUndefined();
  });
});

describe("rangeQuery", () => {
  it("builds the query string", () => {
    expect(rangeQuery({ start: "2026-03-01", end: "2026-03-31" })).toBe("start=2026-03-01&end=2026-03-31");
  });

  it("round-trips through readRange", () => {
    const range = { start: "2026-01-05", end: "2026-02-04" };
    expect(readRange(new URLSearchParams(rangeQuery(range)))).toEqual(range);
  });
});
