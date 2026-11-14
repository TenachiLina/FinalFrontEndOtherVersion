import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { http, HttpResponse } from "msw";
import MonthClosingBar from "./MonthClosingBar";
import { API, server } from "@/test/server";
import { makeUser } from "@/test/factories";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";
import { clearFeedback, toastMessages } from "./__testutils__/reportingApi";
import type { MonthStatus } from "@/lib/payrollApi";

afterEach(clearFeedback);

const OPEN: MonthStatus = {
  month: "2026-02",
  closed: false,
  auto: false,
  closedAt: null,
  closedBy: null,
  reopenedAt: null,
  reopenedBy: null,
  closesAt: null,
  canClose: true,
};
const CLOSED: MonthStatus = {
  ...OPEN,
  closed: true,
  closedAt: "2026-03-04T09:00:00.000Z",
  closedBy: "Nadia Admin",
  canClose: false,
};

/** Answers the month's state, and records the close / reopen calls. */
function mockClosing(initial: MonthStatus) {
  let status = initial;
  const calls: string[] = [];
  server.use(
    http.get(`${API}/payroll/closings/:month`, () => HttpResponse.json(status)),
    http.post(`${API}/payroll/closings/:month/close`, ({ params }) => {
      calls.push(`close ${params.month}`);
      status = { ...CLOSED, month: String(params.month) };
      return HttpResponse.json(status, { status: 201 });
    }),
    http.post(`${API}/payroll/closings/:month/reopen`, ({ params }) => {
      calls.push(`reopen ${params.month}`);
      status = {
        ...OPEN,
        month: String(params.month),
        reopenedAt: "2026-03-10T09:00:00.000Z",
        reopenedBy: "Nadia Admin",
      };
      return HttpResponse.json(status, { status: 201 });
    })
  );
  return calls;
}

const confirm = async (user: ReturnType<typeof renderWithProviders>["user"], label: string) =>
  user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: label }));

describe("MonthClosingBar", () => {
  it("offers an admin to close a month that is over", async () => {
    mockClosing(OPEN);
    renderWithProviders(<MonthClosingBar month="2026-02" />);
    const bar = await screen.findByRole("status");
    expect(bar).toHaveTextContent("February 2026 is open");
    expect(within(bar).getByRole("button", { name: "Close month" })).toBeEnabled();
  });

  it("closes the month after a confirmation, and tells the page", async () => {
    const calls = mockClosing(OPEN);
    const onChanged = vi.fn();
    const { user } = renderWithProviders(<MonthClosingBar month="2026-02" onChanged={onChanged} />);
    await user.click(await screen.findByRole("button", { name: "Close month" }));
    expect(calls).toEqual([]);
    await confirm(user, "Close month");
    await waitFor(() => expect(calls).toEqual(["close 2026-02"]));
    expect(await screen.findByText("February 2026 is closed")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(toastMessages("success")).toEqual(["Month closed."]);
  });

  it("does nothing when the confirmation is cancelled", async () => {
    const calls = mockClosing(OPEN);
    const onChanged = vi.fn();
    const { user } = renderWithProviders(<MonthClosingBar month="2026-02" onChanged={onChanged} />);
    await user.click(await screen.findByRole("button", { name: "Close month" }));
    await confirm(user, "Cancel");
    expect(calls).toEqual([]);
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByText("February 2026 is open")).toBeInTheDocument();
  });

  it("says who closed the month and that nothing can change", async () => {
    mockClosing(CLOSED);
    renderWithProviders(<MonthClosingBar month="2026-02" />);
    const bar = await screen.findByRole("status");
    expect(bar).toHaveTextContent("February 2026 is closed");
    expect(bar).toHaveTextContent("Closed on 4 March 2026 by Nadia Admin.");
    expect(bar).toHaveTextContent("Its hours, advances and bonuses can no longer be changed.");
  });

  it("says when the month closed by itself", async () => {
    mockClosing({ ...CLOSED, auto: true, closedBy: null });
    renderWithProviders(<MonthClosingBar month="2026-02" />);
    expect(await screen.findByRole("status")).toHaveTextContent("Closed automatically on 4 March 2026.");
  });

  it("reopens the month after a confirmation", async () => {
    const calls = mockClosing(CLOSED);
    const onChanged = vi.fn();
    const { user } = renderWithProviders(<MonthClosingBar month="2026-02" onChanged={onChanged} />);
    await user.click(await screen.findByRole("button", { name: "Reopen month" }));
    await confirm(user, "Reopen month");
    await waitFor(() => expect(calls).toEqual(["reopen 2026-02"]));
    const bar = await screen.findByText("February 2026 is open");
    expect(bar.closest("[role=status]")).toHaveTextContent(
      "Reopened on 10 March 2026 by Nadia Admin. It stays open until an admin closes it again."
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(toastMessages("success")).toEqual(["Month reopened."]);
  });

  it("shows a manager the state, without the buttons", async () => {
    mockClosing(CLOSED);
    renderWithProviders(<MonthClosingBar month="2026-02" />, { user: makeUser({ role: "manager" }) });
    expect(await screen.findByText("February 2026 is closed")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows a manager nothing for an open month with no closing date", async () => {
    mockClosing(OPEN);
    const { container } = renderWithProviders(<MonthClosingBar month="2026-02" />, {
      user: makeUser({ role: "manager" }),
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector("[role=status]")).toBeNull();
  });

  it("says when a running month will close by itself", async () => {
    mockClosing({ ...OPEN, canClose: false, closesAt: "2026-03-10T23:00:00.000Z" });
    renderWithProviders(<MonthClosingBar month="2026-02" />);
    const bar = await screen.findByRole("status");
    expect(bar).toHaveTextContent(/This month will close automatically on 1[01] March 2026\./);
    expect(within(bar).queryByRole("button")).toBeNull();
  });

  it("explains when the month can't be closed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockClosing(OPEN);
    server.use(
      http.post(`${API}/payroll/closings/:month/close`, () =>
        HttpResponse.json({ message: "This month is not over yet" }, { status: 400 })
      )
    );
    const onChanged = vi.fn();
    const { user } = renderWithProviders(<MonthClosingBar month="2026-02" onChanged={onChanged} />);
    await user.click(await screen.findByRole("button", { name: "Close month" }));
    await confirm(user, "Close month");
    await waitFor(() => expect(toastMessages("error")).toHaveLength(1));
    expect(toastMessages("error")[0]).toContain("This month is not over yet");
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Close month" })).toBeEnabled();
  });

  it("explains when the month can't be reopened", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockClosing(CLOSED);
    server.use(
      http.post(`${API}/payroll/closings/:month/reopen`, () => HttpResponse.json({}, { status: 500 }))
    );
    const { user } = renderWithProviders(<MonthClosingBar month="2026-02" />);
    await user.click(await screen.findByRole("button", { name: "Reopen month" }));
    await confirm(user, "Reopen month");
    await waitFor(() => expect(toastMessages("error")).toHaveLength(1));
    expect(toastMessages("error")[0]).toContain("Couldn't reopen the month");
    expect(screen.getByText("February 2026 is closed")).toBeInTheDocument();
  });

  it("stays out of the way when the state can't be loaded", async () => {
    server.use(http.get(`${API}/payroll/closings/:month`, () => HttpResponse.json({}, { status: 500 })));
    const { container } = renderWithProviders(<MonthClosingBar month="2026-02" />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector("[role=status]")).toBeNull();
  });

  it("loads the new month when the month changes", async () => {
    const asked: string[] = [];
    server.use(
      http.get(`${API}/payroll/closings/:month`, ({ params }) => {
        asked.push(String(params.month));
        return HttpResponse.json(params.month === "2026-01" ? { ...CLOSED, month: "2026-01" } : OPEN);
      })
    );
    const { rerender } = renderWithProviders(<MonthClosingBar month="2026-02" />);
    expect(await screen.findByText("February 2026 is open")).toBeInTheDocument();
    rerender(<MonthClosingBar month="2026-01" />);
    expect(await screen.findByText("January 2026 is closed")).toBeInTheDocument();
    expect(asked).toEqual(["2026-02", "2026-01"]);
  });
});
