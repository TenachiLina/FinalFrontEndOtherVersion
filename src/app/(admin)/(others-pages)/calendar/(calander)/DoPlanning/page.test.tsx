import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { fixTheClock, makeRecord, mockPlanningApi, ALICE } from "@/hooks/useNewPlanning.fixtures";
import Page, { metadata } from "./page";

fixTheClock();

describe("DoPlanning page", () => {
  it("has the browser tab title", () => {
    expect(metadata.title).toBe("New planning | Nexo InOuty");
  });

  it("shows the Planning heading above the planning grid", async () => {
    mockPlanningApi({ plannings: { "2026-10-24": [makeRecord(ALICE)] } });
    renderWithProviders(<Page />, { url: "/calendar/DoPlanning" });

    expect(screen.getByRole("heading", { name: "Planning" })).toBeInTheDocument();
    expect(await screen.findByText("Alice Martin")).toBeInTheDocument();
    expect(screen.getByText("Pizzaiolo")).toBeInTheDocument();
  });
});
