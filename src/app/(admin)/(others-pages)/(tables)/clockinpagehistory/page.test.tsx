import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import ClockInPageRoute, { metadata } from "./page";
import { API, server } from "@/test/server";
import { renderWithProviders, screen } from "@/test/render";

describe("Clock-in history page", () => {
  it("shows the clock-in history under its title", async () => {
    server.use(
      http.get(`${API}/attendance/device-logs`, () => HttpResponse.json([])),
      http.get(`${API}/employees`, () => HttpResponse.json([])),
      http.get("http://localhost:3001/device/status", () => HttpResponse.json({ connected: true, name: "Machine" }))
    );
    renderWithProviders(<ClockInPageRoute />, { url: "/clockinpagehistory" });
    expect(screen.getByRole("heading", { name: "Clock In / Out History" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Clock-in history" })).toBeInTheDocument();
    expect(await screen.findByText("No clock-in records in this period.")).toBeInTheDocument();
    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(metadata.title).toBe("Clock In / Out");
  });
});
