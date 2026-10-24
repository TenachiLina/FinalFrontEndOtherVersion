import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import ClockInPageRoute, { metadata } from "./page";
import { API, server } from "@/test/server";
import { renderWithProviders, screen } from "@/test/render";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 2, 10, 12, 0));
  vi.spyOn(console, "log").mockImplementation(() => {});
  server.use(
    http.get(`${API}/device/status`, () => HttpResponse.json({ connected: true, name: "ZK Terminal" })),
    http.get(`${API}/employees`, () => HttpResponse.json([])),
    http.get(`${API}/shifts`, () => HttpResponse.json([{ _id: "s1", startTime: "08:00", endTime: "17:00" }])),
    http.get(`${API}/planning`, () => HttpResponse.json([]))
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("/clockinfacerecognitionpage", () => {
  it("is titled Clock In / Out", () => {
    expect(metadata.title).toBe("Clock In / Out");
  });

  it("shows the breadcrumb and today's face-recognition attendance", async () => {
    renderWithProviders(<ClockInPageRoute />, { url: "/clockinfacerecognitionpage" });
    expect(screen.getByRole("link", { name: /Home/ })).toHaveAttribute("href", "/");
    expect(await screen.findByRole("heading", { name: "Attendance" })).toBeInTheDocument();
    expect(screen.getByText("Operation date: 2026-03-10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "08:00 – 17:00" })).toBeInTheDocument();
  });
});
