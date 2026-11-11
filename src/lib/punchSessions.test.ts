import { describe, expect, it } from "vitest";
import {
  groupPunchesIntoSessions,
  plannedShiftsByEmployee,
  punchInstant,
  sessionMinutes,
  type PlannedShift,
} from "./punchSessions";

/** A punch at Algerian time "YYYY-MM-DD HH:MM", sent as a real UTC instant like the API does. */
const p = (local: string) => ({ timestamp: new Date(`${local.replace(" ", "T")}:00+01:00`).toISOString() });
const at = (local: string) => new Date(`${local.replace(" ", "T")}:00+01:00`).getTime();
const night = (workDate: string): PlannedShift => ({ workDate, start: "16:00", end: "02:00" });
const day = (workDate: string): PlannedShift => ({ workDate, start: "08:00", end: "17:00" });

/** Sessions as "workDate in→out [missing]" with Algerian times. */
const show = (sessions: ReturnType<typeof groupPunchesIntoSessions<{ timestamp: string }>>) =>
  sessions.map((s) => {
    const time = (x: { timestamp: string } | null) =>
      x ? new Date(punchInstant(x.timestamp) + 3600_000).toISOString().slice(11, 16) : "--";
    const periods = s.periods.map((q) => `${time(q.clockIn)}→${time(q.clockOut)}`).join(" ");
    return `${s.workDate} ${periods}${s.missing ? ` [missing ${s.missing}]` : ""}${s.open ? " [open]" : ""}`;
  });

describe("groupPunchesIntoSessions – planned shifts", () => {
  it("doesn't shift every later punch after a missing clock-in (night shift)", () => {
    // The machine starts on Nov 9: the Nov 8 clock-in was never recorded
    const punches = [p("2026-11-09 00:34"), p("2026-11-09 16:33"), p("2026-11-10 00:40"), p("2026-11-10 16:05")];
    const sessions = groupPunchesIntoSessions(punches, [night("2026-11-08"), night("2026-11-09"), night("2026-11-10")], {
      now: at("2026-11-10 18:00"),
    });
    expect(show(sessions)).toEqual([
      "2026-11-08 --→00:34 [missing clockIn]",
      "2026-11-09 16:33→00:40",
      "2026-11-10 16:05→-- [open]",
    ]);
  });

  it("keeps a lone punch as the clock-in while its shift is running", () => {
    const sessions = groupPunchesIntoSessions([p("2026-03-10 13:00")], [day("2026-03-10")], { now: at("2026-03-10 13:05") });
    expect(show(sessions)).toEqual(["2026-03-10 13:00→-- [open]"]);
  });

  it("reports a missing clock-out once the shift is over", () => {
    const sessions = groupPunchesIntoSessions([p("2026-03-10 08:05")], [day("2026-03-10")], { now: at("2026-03-11 09:00") });
    expect(show(sessions)).toEqual(["2026-03-10 08:05→-- [missing clockOut]"]);
  });

  it("splits breaks into periods and counts only complete ones", () => {
    const sessions = groupPunchesIntoSessions(
      [p("2026-03-10 08:00"), p("2026-03-10 12:00"), p("2026-03-10 12:30"), p("2026-03-10 17:00")],
      [day("2026-03-10")],
      { now: at("2026-03-11 09:00") }
    );
    expect(show(sessions)).toEqual(["2026-03-10 08:00→12:00 12:30→17:00"]);
    expect(sessionMinutes(sessions[0])).toBe(8 * 60 + 30);
  });

  it("gives an early-morning clock-out to last night and the day shift its own punches", () => {
    const sessions = groupPunchesIntoSessions(
      [p("2026-03-10 01:30"), p("2026-03-10 08:00"), p("2026-03-10 17:00")],
      [night("2026-03-09"), day("2026-03-10")],
      { now: at("2026-03-11 09:00") }
    );
    expect(show(sessions)).toEqual(["2026-03-09 --→01:30 [missing clockIn]", "2026-03-10 08:00→17:00"]);
  });

  it("keeps an early shift's clock-in before 05:00 on its own day", () => {
    const sessions = groupPunchesIntoSessions(
      [p("2026-11-09 01:56"), p("2026-11-09 10:02")],
      [{ workDate: "2026-11-09", start: "02:00", end: "10:00" }],
      { now: at("2026-11-09 18:00") }
    );
    expect(show(sessions)).toEqual(["2026-11-09 01:56→10:02"]);
  });

  it("takes the planning date for a shift past midnight", () => {
    const sessions = groupPunchesIntoSessions([p("2026-03-09 16:00"), p("2026-03-10 02:10")], [night("2026-03-09")], {
      now: at("2026-03-10 12:00"),
    });
    expect(show(sessions)).toEqual(["2026-03-09 16:00→02:10"]);
  });

  it("counts a shift planned twice once", () => {
    const sessions = groupPunchesIntoSessions([p("2026-03-10 08:00"), p("2026-03-10 17:00")], [day("2026-03-10"), day("2026-03-10")], {
      now: at("2026-03-11 09:00"),
    });
    expect(show(sessions)).toEqual(["2026-03-10 08:00→17:00"]);
  });
});

describe("groupPunchesIntoSessions – extra punches", () => {
  const extras = (s: { extra: { timestamp: string }[] }) =>
    s.extra.map((x) => new Date(punchInstant(x.timestamp) + 3600_000).toISOString().slice(11, 16));

  it("takes a last punch near the shift's end as the clock-out after a clock-in made twice", () => {
    const sessions = groupPunchesIntoSessions(
      [p("2026-11-08 16:18"), p("2026-11-08 17:39"), p("2026-11-09 00:11")],
      [night("2026-11-08")],
      { now: at("2026-11-09 12:00") }
    );
    expect(show(sessions)).toEqual(["2026-11-08 16:18→00:11"]);
    expect(extras(sessions[0])).toEqual(["17:39"]);
    expect(sessionMinutes(sessions[0])).toBe(7 * 60 + 53);
  });

  it("does it as soon as the clock-out is made, while the shift is still on", () => {
    const sessions = groupPunchesIntoSessions(
      [p("2026-11-08 16:18"), p("2026-11-08 17:39"), p("2026-11-09 00:11")],
      [night("2026-11-08")],
      { now: at("2026-11-09 00:12") }
    );
    expect(show(sessions)).toEqual(["2026-11-08 16:18→00:11 [open]"]);
  });

  it("keeps a missing clock-out after a break when the last punch is far from the end", () => {
    const sessions = groupPunchesIntoSessions(
      [p("2026-03-10 08:00"), p("2026-03-10 12:00"), p("2026-03-10 13:00")],
      [day("2026-03-10")],
      { now: at("2026-03-11 09:00") }
    );
    expect(show(sessions)).toEqual(["2026-03-10 08:00→12:00 13:00→-- [missing clockOut]"]);
    expect(sessions[0].extra).toEqual([]);
  });

  it("keeps breaks and leaves out the extra punch with five punches", () => {
    const sessions = groupPunchesIntoSessions(
      [p("2026-03-10 08:00"), p("2026-03-10 12:00"), p("2026-03-10 13:00"), p("2026-03-10 13:40"), p("2026-03-10 17:05")],
      [day("2026-03-10")],
      { now: at("2026-03-11 09:00") }
    );
    expect(show(sessions)).toEqual(["2026-03-10 08:00→12:00 13:00→17:05"]);
    expect(extras(sessions[0])).toEqual(["13:40"]);
  });

  it("leaves out the same face scanned twice", () => {
    const sessions = groupPunchesIntoSessions(
      [p("2026-03-10 08:00"), p("2026-03-10 08:03"), p("2026-03-10 17:00")],
      [day("2026-03-10")],
      { now: at("2026-03-11 09:00") }
    );
    expect(show(sessions)).toEqual(["2026-03-10 08:00→17:00"]);
    expect(extras(sessions[0])).toEqual(["08:03"]);
  });

  it("leaves out double scans without planning too", () => {
    const sessions = groupPunchesIntoSessions([p("2026-03-10 08:00"), p("2026-03-10 08:01"), p("2026-03-10 16:00")], [], {
      now: at("2026-03-11 12:00"),
    });
    expect(show(sessions)).toEqual(["2026-03-10 08:00→16:00"]);
    expect(extras(sessions[0])).toEqual(["08:01"]);
  });
});

describe("groupPunchesIntoSessions – without planning", () => {
  it("starts a new session after a long gap, so one missing punch doesn't spread", () => {
    const punches = [p("2026-11-09 00:34"), p("2026-11-09 16:33"), p("2026-11-10 00:40")];
    const sessions = groupPunchesIntoSessions(punches, [], { now: at("2026-11-11 12:00") });
    expect(show(sessions)).toEqual(["2026-11-09 00:34→-- [missing clockOut]", "2026-11-09 16:33→00:40"]);
  });

  it("keeps an overnight clock-out with its clock-in's day", () => {
    const sessions = groupPunchesIntoSessions([p("2026-03-09 22:00"), p("2026-03-10 06:00")], [], { now: at("2026-03-11 12:00") });
    expect(show(sessions)).toEqual(["2026-03-09 22:00→06:00"]);
  });

  it("keeps a recent lone punch open", () => {
    const sessions = groupPunchesIntoSessions([p("2026-03-10 08:00")], [], { now: at("2026-03-10 12:00") });
    expect(show(sessions)).toEqual(["2026-03-10 08:00→-- [open]"]);
  });

  it("shows an unreadable punch on its own", () => {
    const sessions = groupPunchesIntoSessions([{ timestamp: "2026-03-09-bad" }], [], { now: at("2026-03-10 12:00") });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ workDate: "2026-03-09", missing: null, clockOut: null });
  });
});

describe("punchInstant", () => {
  it("reads a time without a zone as Algerian time", () => {
    expect(punchInstant("2026-03-10T08:00:00")).toBe(at("2026-03-10 08:00"));
    expect(punchInstant("2026-03-10T08:00")).toBe(at("2026-03-10 08:00"));
    expect(punchInstant("2026-03-10T07:00:00.000Z")).toBe(at("2026-03-10 08:00"));
    expect(punchInstant("")).toBeNaN();
  });
});

describe("plannedShiftsByEmployee", () => {
  it("maps populated planning to each employee's shifts", () => {
    const map = plannedShiftsByEmployee([
      { planDate: "2026-11-09T00:00:00.000Z", empId: { _id: "a", empNumber: 15 }, shiftId: { _id: "s", startTime: "16:00", endTime: "02:00" } },
      { planDate: "2026-11-09", empId: "plain-id", shiftId: "plain" },
      { planDate: "2026-11-09", empId: { empNumber: 16 }, shiftId: { _id: "x" } },
    ]);
    expect([...map.entries()]).toEqual([["15", [{ workDate: "2026-11-09", start: "16:00", end: "02:00", shiftId: "s" }]]]);
  });

  it("can take the date the planning was asked for", () => {
    const map = plannedShiftsByEmployee(
      [{ planDate: "2026-01-01", empId: { empNumber: 1 }, shiftId: { startTime: "08:00", endTime: "17:00" } }],
      () => "2026-03-10"
    );
    expect(map.get("1")?.[0].workDate).toBe("2026-03-10");
  });
});
