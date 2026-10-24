import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse } from "msw";
import { useBonusesList } from "./useBonusesList";
import { useBonusesHistory } from "./useBonusesHistory";
import {
  AMINE,
  SARA,
  captureWrites,
  failGet,
  mockReportingApi,
  rangesRequested,
  rawBonus,
  rawEmployee,
  toastMessages,
  clearFeedbackAfterEachTest,
  fixTodayInEachTest,
  type ReportingData,
} from "@/components/reporting/__testutils__/reportingApi";
import { API, server } from "@/test/server";
import { http, delay } from "msw";
import { ApiError } from "@/lib/errors";

fixTodayInEachTest(); // 2026-03-11 → March
clearFeedbackAfterEachTest();

const DATA: ReportingData = {
  employees: [rawEmployee(AMINE), rawEmployee(SARA)],
  bonuses: [
    rawBonus({ _id: "b1", emp_id: 101, amount: 250, date: "2026-03-05", reason: "Perfect attendance" }),
    rawBonus({ _id: "b2", emp_id: 101, amount: 100.5, date: "2026-03-20", reason: "Extra shift" }),
    rawBonus({ _id: "b3", emp_id: 102, amount: 500, date: "2026-03-12T00:00:00.000Z", reason: "" }),
    rawBonus({ _id: "b4", emp_id: 999, amount: 75, date: "2026-03-01" }),
    rawBonus({ _id: "feb", emp_id: 101, amount: 1000, date: "2026-02-14" }),
  ],
};

describe("useBonusesList", () => {
  async function renderLoaded(data: ReportingData = DATA) {
    const requests = mockReportingApi(data);
    const hook = renderHook(() => useBonusesList());
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return { ...hook, requests };
  }

  it("sums this month's bonuses per employee", async () => {
    const { result, requests } = await renderLoaded();
    expect(rangesRequested(requests, "/bonuses")).toEqual(["2026-03-01..2026-03-31"]);
    expect(result.current.range).toEqual({ start: "2026-03-01", end: "2026-03-31" });
    expect(result.current.employeeRows).toEqual([
      { empId: 101, firstName: "Amine", lastName: "Kaci", count: 2, total: 350.5 },
      { empId: 102, firstName: "Sara", lastName: "Bel", count: 1, total: 500 },
    ]);
    // includes the bonus of an employee no longer listed (#999)
    expect(result.current.totalGiven).toBe(925.5);
  });

  it("filters employees by name", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setSearch("BEL"));
    expect(result.current.employeeRows.map((r) => r.empId)).toEqual([102]);
  });

  it("gives a bonus dated this month and counts it", async () => {
    const { result } = await renderLoaded();
    const posts = captureWrites("post", "/bonuses", (body) =>
      HttpResponse.json({ _id: "new", ...(body as object) })
    );
    await act(() => result.current.giveBonus(102, 300, "2026-03-15", "Great week"));
    expect(posts.map((p) => p.body)).toEqual([{ emp_id: 102, amount: 300, date: "2026-03-15", reason: "Great week" }]);
    expect(result.current.employeeRows[1]).toMatchObject({ count: 2, total: 800 });
    expect(result.current.totalGiven).toBe(1225.5);
    expect(toastMessages("success")).toEqual(["Bonus given."]);
  });

  it("gives a bonus dated another month without counting it here", async () => {
    const { result } = await renderLoaded();
    captureWrites("post", "/bonuses", (body) => HttpResponse.json({ _id: "new", ...(body as object) }));
    await act(() => result.current.giveBonus(102, 300, "2026-04-02", "April"));
    expect(result.current.employeeRows[1]).toMatchObject({ count: 1, total: 500 });
    expect(toastMessages("success")).toEqual(["Bonus given."]);
  });

  it("rejects when the bonus is refused, so the form can show why", async () => {
    const { result } = await renderLoaded();
    captureWrites("post", "/bonuses", () => HttpResponse.json({ message: "Amount too high" }, { status: 422 }));
    await expect(result.current.giveBonus(102, 1e9, "2026-03-15", "x")).rejects.toEqual(new ApiError(422, "Amount too high"));
    expect(toastMessages()).toEqual([]);
  });

  it("shows an error when loading fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockReportingApi(DATA);
    failGet("/bonuses", 403, "Bonuses are not enabled for this company");
    const { result } = renderHook(() => useBonusesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Couldn't load the bonuses. Bonuses are not enabled for this company");
    expect(result.current.employeeRows).toEqual([]);
  });
});

describe("useBonusesHistory", () => {
  async function renderLoaded(data: ReportingData = DATA) {
    const requests = mockReportingApi(data);
    const hook = renderHook(() => useBonusesHistory());
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return { ...hook, requests };
  }

  it("lists this month's bonuses, newest first, with names", async () => {
    const { result } = await renderLoaded();
    expect(result.current.rows.map((b) => [b.date, b.employeeName, b.amount])).toEqual([
      ["2026-03-20", "Amine Kaci", 100.5],
      ["2026-03-12", "Sara Bel", 500],
      ["2026-03-05", "Amine Kaci", 250],
      ["2026-03-01", "#999", 75],
    ]);
    expect(result.current.total).toBe(925.5);
  });

  it("keeps bonuses of the same day together", async () => {
    const { result } = await renderLoaded({
      employees: DATA.employees,
      bonuses: [rawBonus({ _id: "x", date: "2026-03-05" }), rawBonus({ _id: "y", date: "2026-03-05" })],
    });
    expect(result.current.rows.map((b) => b.id)).toEqual(["x", "y"]);
  });

  it("filters by name and the total follows", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setSearch("amine"));
    expect(result.current.rows).toHaveLength(2);
    expect(result.current.total).toBe(350.5);
  });

  it("loads another period", async () => {
    const { result, requests } = await renderLoaded();
    await act(() => result.current.setRange({ start: "2026-02-01", end: "2026-02-28" }));
    expect(rangesRequested(requests, "/bonuses").at(-1)).toBe("2026-02-01..2026-02-28");
    expect(result.current.range).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(result.current.rows.map((b) => b.id)).toEqual(["feb"]);
  });

  it("revokes a bonus", async () => {
    const { result } = await renderLoaded();
    const deletes = captureWrites("delete", "/bonuses/:id");
    await act(() => result.current.revokeBonus("b3"));
    expect(deletes.map((d) => d.url)).toEqual(["https://api.test/bonuses/b3"]);
    expect(result.current.rows.map((b) => b.id)).toEqual(["b2", "b1", "b4"]);
    expect(result.current.total).toBe(425.5);
    expect(toastMessages("success")).toEqual(["Bonus removed."]);
  });

  it("puts the bonus back and explains when the revoke fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = await renderLoaded();
    captureWrites("delete", "/bonuses/:id", () => HttpResponse.json({}, { status: 500 }));
    await act(() => result.current.revokeBonus("b3"));
    expect(result.current.rows).toHaveLength(4);
    expect(toastMessages("error")).toEqual([
      "Couldn't remove the bonus. Something went wrong on our side. Please try again in a moment.",
    ]);
  });

  it("shows an error when loading fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockReportingApi(DATA);
    failGet("/employees", 500);
    const { result } = renderHook(() => useBonusesHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(
      "Couldn't load the bonus history. Something went wrong on our side. Please try again in a moment."
    );
  });

  // BUG-501: no guard against an older, slower response
  it.fails("shows the last period chosen when an earlier request answers late", async () => {
    const { result } = await renderLoaded();
    server.use(
      http.get(`${API}/bonuses`, async ({ request }) => {
        if (new URL(request.url).searchParams.get("start") !== "2026-02-01") return undefined;
        await delay(150);
        return HttpResponse.json([rawBonus({ _id: "feb", date: "2026-02-14" })]);
      })
    );
    let first!: Promise<void>;
    act(() => {
      first = result.current.setRange({ start: "2026-02-01", end: "2026-02-28" });
    });
    await act(() => result.current.setRange({ start: "2026-03-01", end: "2026-03-31" }));
    await act(() => first);
    expect(result.current.range.start).toBe("2026-03-01");
    expect(result.current.rows).toHaveLength(4);
  });
});
