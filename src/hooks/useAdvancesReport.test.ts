import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse } from "msw";
import { useAdvancesReport } from "./useAdvancesReport";
import {
  AMINE,
  SARA,
  captureWrites,
  failGet,
  mockReportingApi,
  rawAdvance,
  rawEmployee,
  toastMessages,
  clearFeedbackAfterEachTest,
  type ReportingData,
} from "@/components/reporting/__testutils__/reportingApi";

clearFeedbackAfterEachTest();

const DATA: ReportingData = {
  employees: [rawEmployee(AMINE), rawEmployee(SARA)],
  advances: [
    rawAdvance({ _id: "a1", emp_id: 101, amount: 1000, date: "2026-03-10" }),
    rawAdvance({ _id: "a2", emp_id: 102, amount: 250.5, date: "2026-02-03" }),
    rawAdvance({ _id: "a3", emp_id: 999, amount: 40, date: "2026-03-01" }),
  ],
};

async function renderLoaded(data: ReportingData = DATA) {
  const requests = mockReportingApi(data);
  const hook = renderHook(() => useAdvancesReport());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return { ...hook, requests };
}

describe("useAdvancesReport", () => {
  it("loads every advance, without a date filter, with its employee", async () => {
    const { result, requests } = await renderLoaded();
    const advancesCall = requests.find((u) => u.pathname === "/advances")!;
    expect(advancesCall.search).toBe("");
    expect(result.current.advances.map((a) => [a.id, a.employee?.FirstName, a.amount])).toEqual([
      ["a1", "Amine", 1000],
      ["a2", "Sara", 250.5],
      ["a3", undefined, 40],
    ]);
    expect(result.current.totalAdvanced).toBe(1290.5);
    expect(result.current.employees).toHaveLength(2);
  });

  it("filters by employee name and the total follows", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setSearch("sara"));
    expect(result.current.advances.map((a) => a.id)).toEqual(["a2"]);
    expect(result.current.totalAdvanced).toBe(250.5);
  });

  it("revokes an advance", async () => {
    const { result } = await renderLoaded();
    const deletes = captureWrites("delete", "/advances/:id");
    await act(() => result.current.revokeAdvance("a1"));
    expect(deletes.map((d) => d.url)).toEqual(["https://api.test/advances/a1"]);
    expect(result.current.advances.map((a) => a.id)).toEqual(["a2", "a3"]);
    expect(toastMessages("success")).toEqual(["Advance removed."]);
  });

  it("does nothing without an id", async () => {
    const { result } = await renderLoaded();
    const deletes = captureWrites("delete", "/advances/:id");
    await act(() => result.current.revokeAdvance(undefined));
    expect(deletes).toEqual([]);
  });

  it("keeps the advance and explains when the revoke fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = await renderLoaded();
    captureWrites("delete", "/advances/:id", () => HttpResponse.json({ message: "Already paid out" }, { status: 409 }));
    await act(() => result.current.revokeAdvance("a1"));
    expect(result.current.advances).toHaveLength(3);
    expect(toastMessages("error")).toEqual(["Couldn't remove the advance. Already paid out"]);
  });

  it("shows an error when loading fails, and reloads", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockReportingApi(DATA);
    failGet("/advances", 500);
    const { result } = renderHook(() => useAdvancesReport());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(
      "Couldn't load the advances. Something went wrong on our side. Please try again in a moment."
    );
    mockReportingApi(DATA);
    await act(() => result.current.reload());
    expect(result.current.error).toBe("");
    expect(result.current.advances).toHaveLength(3);
  });
});
