import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { API, server } from "@/test/server";
import { makeRow } from "@/test/factories";
import {
  deleteAdvance,
  fetchAdvances,
  fetchEmployees,
  fetchScheduledEmpIds,
  fetchWorktimeRows,
  fillMissingDates,
  generateDateRange,
  getCalendarMonthRange,
  getLastWeekRange,
  getThisMonthRange,
  getThisWeekRange,
  normalizeAdvance,
  normalizeEmployee,
  normalizeRow,
  timeToDecimalHours,
  toLocalDateString,
} from "./reporting";
import { ApiError } from "./errors";

/** Runs `fn` with the process time zone switched to `tz`. */
function inTimeZone<T>(tz: string, fn: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    process.env.TZ = previous;
  }
}

describe("toLocalDateString", () => {
  it("formats with zero padding", () => {
    expect(toLocalDateString(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("uses the local date, not the UTC date, just after midnight", () => {
    inTimeZone("Africa/Algiers", () => {
      expect(toLocalDateString(new Date(2026, 5, 1, 0, 30))).toBe("2026-06-01");
    });
  });
});

describe("timeToDecimalHours", () => {
  it.each([
    [null, 0],
    [undefined, 0],
    [7.5, 7.5],
    ["", 0],
    ["00:00", 0],
    ["00:00:00", 0],
    ["08:30", 8.5],
    ["08:30:00", 8.5],
    ["01:00:36", 1.01],
    ["7.25", 7.25],
    ["abc", 0],
    ["aa:bb", 0],
    ["aa:bb:cc", 0],
    ["1:2:3:4", 0],
    ["  08:15  ", 8.25],
  ])("%j → %d", (input, expected) => {
    expect(timeToDecimalHours(input as string | number | null | undefined)).toBeCloseTo(expected, 5);
  });

  // BUG-005: the minus sign only applies to the hours part
  it.fails("converts a negative duration", () => {
    expect(timeToDecimalHours("-01:30")).toBe(-1.5);
  });
});

describe("normalizeRow", () => {
  it("maps the API fields", () => {
    expect(
      normalizeRow({
        emp_id: 101,
        work_date: "2026-03-01T00:00:00.000Z",
        work_hours: "08:00:00",
        late_minutes: "5",
        overtime_minutes: 10,
        penalty: "200",
        consommation: 150,
        absent: true,
        absent_comment: "sick",
      })
    ).toEqual({
      emp_id: 101,
      work_date: "2026-03-01",
      work_hours: "08:00:00",
      late_minutes: 5,
      overtime_minutes: 10,
      penalty: 200,
      consommation: 150,
      absent: 1,
      absent_comment: "sick",
      is_empty: false,
    });
  });

  it("accepts the camelCase and misspelled variants", () => {
    const row = normalizeRow({ empId: 7, workDate: "2026-03-02", consomation: 90 });
    expect(row).toMatchObject({ emp_id: 7, work_date: "2026-03-02", consommation: 90 });
  });

  it("fills defaults for an empty record", () => {
    expect(normalizeRow({})).toEqual({
      emp_id: "",
      work_date: "",
      work_hours: null,
      late_minutes: 0,
      overtime_minutes: 0,
      penalty: 0,
      consommation: 0,
      absent: 0,
      absent_comment: "",
      is_empty: false,
    });
  });

  // BUG-006: text that is not a number becomes NaN and spreads into every total
  it.fails("never produces NaN for bad numeric fields", () => {
    const row = normalizeRow({ penalty: "n/a", late_minutes: "abc" });
    expect(Number.isNaN(row.penalty)).toBe(false);
    expect(Number.isNaN(row.late_minutes)).toBe(false);
  });
});

describe("normalizeEmployee", () => {
  it("maps the Mongo fields", () => {
    expect(
      normalizeEmployee({ _id: "x", empNumber: 101, firstName: "Amine", lastName: "B", baseSalary: 41600 })
    ).toEqual({ emp_id: 101, FirstName: "Amine", LastName: "B", Base_salary: 41600, _visible: true });
  });

  it("falls back to _id and empty values", () => {
    expect(normalizeEmployee({ _id: "abc" })).toEqual({
      emp_id: "abc",
      FirstName: "",
      LastName: "",
      Base_salary: 0,
      _visible: true,
    });
    expect(normalizeEmployee({}).emp_id).toBe("");
  });

  it("keeps employee number 0", () => {
    expect(normalizeEmployee({ _id: "abc", empNumber: 0 }).emp_id).toBe(0);
  });
});

describe("normalizeAdvance", () => {
  const employees = [normalizeEmployee({ empNumber: 101, firstName: "Amine" })];

  it("maps the old field names and links the employee", () => {
    const advance = normalizeAdvance(
      { _id: "a1", emp_id: "101", Advances_amount: 5000, Advances_date: "2026-03-04T10:00:00Z", Advances_reason: "rent" },
      employees
    );
    expect(advance).toEqual({
      id: "a1",
      empId: "101",
      employee: employees[0],
      amount: 5000,
      date: "2026-03-04",
      reason: "rent",
    });
  });

  it("maps the new field names", () => {
    const advance = normalizeAdvance({ _id: "a2", empId: 101, amount: 100, date: "2026-03-05", reason: "x" }, employees);
    expect(advance).toMatchObject({ empId: 101, amount: 100, date: "2026-03-05", reason: "x" });
  });

  it("handles an unknown employee and missing fields", () => {
    const advance = normalizeAdvance({ _id: "a3" }, employees);
    expect(advance).toMatchObject({ empId: "", employee: undefined, amount: 0, date: "", reason: "" });
  });
});

describe("generateDateRange", () => {
  it("lists every day, both ends included", () => {
    expect(generateDateRange("2026-02-27", "2026-03-02")).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
  });

  it("returns one day when start = end, nothing when reversed", () => {
    expect(generateDateRange("2026-03-01", "2026-03-01")).toEqual(["2026-03-01"]);
    expect(generateDateRange("2026-03-02", "2026-03-01")).toEqual([]);
  });

  it("crosses a daylight-saving change without skipping a day", () => {
    inTimeZone("Europe/Paris", () => {
      expect(generateDateRange("2026-03-28", "2026-03-30")).toEqual(["2026-03-28", "2026-03-29", "2026-03-30"]);
    });
  });

  // BUG-001: "YYYY-MM-DD" is parsed as UTC midnight, which is the previous day west of UTC
  it.fails("starts on the requested day in a time zone behind UTC", () => {
    inTimeZone("America/New_York", () => {
      expect(generateDateRange("2026-03-01", "2026-03-02")).toEqual(["2026-03-01", "2026-03-02"]);
    });
  });
});

describe("fillMissingDates", () => {
  it("keeps real rows and adds placeholders for missing days", () => {
    const real = makeRow({ work_date: "2026-03-02" });
    const filled = fillMissingDates([real], { start: "2026-03-01", end: "2026-03-03" });
    expect(filled).toHaveLength(3);
    expect(filled[1]).toBe(real);
    expect(filled[0]).toMatchObject({ work_date: "2026-03-01", is_empty: true, work_hours: null });
    expect(filled[2]).toMatchObject({ work_date: "2026-03-03", is_empty: true });
  });

  it("returns nothing without a complete range", () => {
    expect(fillMissingDates([makeRow()], { start: "", end: "2026-03-03" })).toEqual([]);
  });
});

describe("week and month ranges", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // 2026-10-19 is a Monday
  it.each([
    ["2026-10-19T12:00:00", "2026-10-15", "2026-10-21"], // Monday
    ["2026-10-21T12:00:00", "2026-10-15", "2026-10-21"], // Wednesday
    ["2026-10-22T12:00:00", "2026-10-22", "2026-10-28"], // Thursday
    ["2026-10-25T12:00:00", "2026-10-22", "2026-10-28"], // Sunday
  ])("getLastWeekRange on %s → Thursday %s to Wednesday %s", (now, start, end) => {
    vi.setSystemTime(new Date(now));
    expect(getLastWeekRange()).toEqual({ start, end });
  });

  it.each([
    ["2026-10-19T12:00:00", "2026-10-19", "2026-10-25"], // Monday
    ["2026-10-25T12:00:00", "2026-10-19", "2026-10-25"], // Sunday
  ])("getThisWeekRange on %s → %s to %s", (now, start, end) => {
    vi.setSystemTime(new Date(now));
    expect(getThisWeekRange()).toEqual({ start, end });
  });

  it("getThisMonthRange covers the whole current month", () => {
    vi.setSystemTime(new Date("2026-02-14T12:00:00"));
    expect(getThisMonthRange()).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });

  it("getCalendarMonthRange handles leap years and December", () => {
    expect(getCalendarMonthRange(2028, 1)).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(getCalendarMonthRange(2026, 11)).toEqual({ start: "2026-12-01", end: "2026-12-31" });
  });
});

describe("fetchers", () => {
  const employeesRaw = [
    { empNumber: 101, firstName: "Amine", baseSalary: 41600 },
    { empNumber: 102, firstName: "Other manager", otherManager: true },
  ];
  const range = { start: "2026-03-01", end: "2026-03-31" };

  it("fetchEmployees leaves out other managers", async () => {
    server.use(http.get(`${API}/employees`, () => HttpResponse.json(employeesRaw)));
    const list = await fetchEmployees();
    expect(list.map((e) => e.emp_id)).toEqual([101]);
  });

  it("fetchEmployees throws an ApiError on failure", async () => {
    server.use(http.get(`${API}/employees`, () => HttpResponse.json({ message: "nope" }, { status: 403 })));
    await expect(fetchEmployees()).rejects.toMatchObject({ status: 403, message: "nope" });
  });

  it("fetchWorktimeRows filters by employee, range and hidden managers", async () => {
    let query = "";
    server.use(
      http.get(`${API}/employees`, () => HttpResponse.json(employeesRaw)),
      http.get(`${API}/worktime`, ({ request }) => {
        query = new URL(request.url).search;
        return HttpResponse.json({
          rows: [
            { emp_id: 101, work_date: "2026-03-05" },
            { emp_id: 101, work_date: "2026-04-01" }, // outside the range
            { emp_id: 103, work_date: "2026-03-05" }, // another employee
            { emp_id: 102, work_date: "2026-03-05" }, // hidden manager
            { emp_id: 101 }, // no date
          ],
        });
      })
    );
    const rows = await fetchWorktimeRows(range, 101);
    expect(query).toBe("?start=2026-03-01&end=2026-03-31&empId=101");
    expect(rows.map((r) => [r.emp_id, r.work_date])).toEqual([[101, "2026-03-05"]]);
  });

  it("fetchWorktimeRows returns every visible employee without an empId", async () => {
    server.use(
      http.get(`${API}/employees`, () => HttpResponse.json(employeesRaw)),
      http.get(`${API}/worktime`, () =>
        HttpResponse.json([
          { emp_id: 101, work_date: "2026-03-05" },
          { emp_id: 103, work_date: "2026-03-06" },
          { emp_id: 102, work_date: "2026-03-06" },
        ])
      )
    );
    const rows = await fetchWorktimeRows(range, null);
    expect(rows.map((r) => r.emp_id)).toEqual([101, 103]);
  });

  it("fetchWorktimeRows accepts a response with no rows", async () => {
    server.use(
      http.get(`${API}/employees`, () => HttpResponse.json([])),
      http.get(`${API}/worktime`, () => HttpResponse.json({}))
    );
    expect(await fetchWorktimeRows(range)).toEqual([]);
  });

  it("fetchWorktimeRows throws when the worktime call fails", async () => {
    server.use(
      http.get(`${API}/employees`, () => HttpResponse.json([])),
      http.get(`${API}/worktime`, () => new HttpResponse("boom", { status: 500 }))
    );
    await expect(fetchWorktimeRows(range)).rejects.toBeInstanceOf(ApiError);
  });

  it("fetchAdvances calls the per-employee URL with the range", async () => {
    let url = "";
    server.use(
      http.get(`${API}/advances/employee/:id`, ({ request }) => {
        url = request.url;
        return HttpResponse.json([{ _id: "a1", emp_id: 101, amount: 10 }]);
      })
    );
    const list = await fetchAdvances([], 101, range);
    expect(url).toBe(`${API}/advances/employee/101?start=2026-03-01&end=2026-03-31`);
    expect(list[0]).toMatchObject({ id: "a1", amount: 10 });
  });

  it("fetchAdvances calls the list URL with no range", async () => {
    let url = "";
    server.use(
      http.get(`${API}/advances`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({ rows: [{ _id: "a1" }] });
      })
    );
    expect(await fetchAdvances([])).toHaveLength(1);
    expect(url).toBe(`${API}/advances`);
  });

  it("fetchAdvances returns an empty list for an unexpected body", async () => {
    server.use(http.get(`${API}/advances`, () => HttpResponse.json({})));
    expect(await fetchAdvances([])).toEqual([]);
  });

  it("deleteAdvance sends DELETE and reports failures", async () => {
    const calls: string[] = [];
    server.use(
      http.delete(`${API}/advances/:id`, ({ params }) => {
        calls.push(String(params.id));
        return params.id === "bad" ? new HttpResponse(null, { status: 404 }) : new HttpResponse(null, { status: 204 });
      })
    );
    await deleteAdvance("a1");
    await expect(deleteAdvance("bad")).rejects.toMatchObject({ status: 404 });
    expect(calls).toEqual(["a1", "bad"]);
  });

  it("fetchScheduledEmpIds keeps employees planned inside the range", async () => {
    server.use(
      http.get(`${API}/planning`, () =>
        HttpResponse.json([
          { empId: { empNumber: 101 }, planDate: "2026-03-10T08:00:00" },
          { empId: 102, planDate: "2026-03-31T20:00:00" },
          { empId: 103, planDate: "2026-04-01T08:00:00" }, // after
          { empId: 104, planDate: "2026-02-28T08:00:00" }, // before
          { empId: 105 }, // no date
          { empId: null, planDate: "2026-03-10T08:00:00" }, // no employee
          { empId: {}, planDate: "2026-03-10T08:00:00" }, // employee without number
        ])
      )
    );
    expect([...(await fetchScheduledEmpIds(range))]).toEqual(["101", "102"]);
  });

  it("fetchScheduledEmpIds ignores a non-list body", async () => {
    server.use(http.get(`${API}/planning`, () => HttpResponse.json({ rows: [] })));
    expect((await fetchScheduledEmpIds(range)).size).toBe(0);
  });

  // BUG-003: a plan stored as UTC midnight falls on the previous day west of UTC
  it.fails("counts a plan on the first day of the range in a time zone behind UTC", async () => {
    server.use(http.get(`${API}/planning`, () => HttpResponse.json([{ empId: 101, planDate: "2026-03-01T00:00:00.000Z" }])));
    const previous = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      expect([...(await fetchScheduledEmpIds(range))]).toEqual(["101"]);
    } finally {
      process.env.TZ = previous;
    }
  });
});
