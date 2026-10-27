import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import ClockInPageRoute, { metadata } from "./page";
import { API, server } from "@/test/server";
import { renderWithProviders, screen } from "@/test/render";

describe("Clock in / out page", () => {
  it("shows the attendance for the day under its title", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    server.use(
      http.get(`${API}/employees`, () => HttpResponse.json([])),
      http.get(`${API}/shifts`, () => HttpResponse.json([{ _id: "s1", startTime: "08:00", endTime: "16:00" }])),
      http.get(`${API}/planning`, () => HttpResponse.json([])),
      http.get(`${API}/worktime`, () => HttpResponse.json([]))
    );
    renderWithProviders(<ClockInPageRoute />, { url: "/clockinpage" });
    expect(screen.getByRole("heading", { name: "Clock In / Out" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "08:00 – 16:00 shift" })).toBeInTheDocument();
    expect(metadata.title).toBe("Clock In / Out");
  });
});
