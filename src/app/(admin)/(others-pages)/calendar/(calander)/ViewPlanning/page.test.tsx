import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { API, server } from "@/test/server";
import { renderWithProviders, screen } from "@/test/render";
import Page, { metadata } from "./page";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  server.use(
    http.get(`${API}/tasks`, () => HttpResponse.json([{ _id: "t1", taskId: 1, taskName: "Pizzaiolo" }])),
    http.get(`${API}/shifts`, () => HttpResponse.json([{ _id: "s1", startTime: "08:00", endTime: "16:00" }])),
    http.get(`${API}/employees`, () => HttpResponse.json([])),
    http.get(`${API}/planning`, () => HttpResponse.json([]))
  );
});

describe("View planning page", () => {
  it("has the page title", () => {
    expect(metadata.title).toBe("Planning | Nexo InOuty");
  });

  it("shows the breadcrumb and the planning", async () => {
    renderWithProviders(<Page />, { url: "/ViewPlanning" });
    expect(screen.getByRole("heading", { name: "Planning" })).toBeInTheDocument();
    expect(await screen.findByText("Pizzaiolo")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "08:00 - 16:00" })).toBeInTheDocument();
  });
});
