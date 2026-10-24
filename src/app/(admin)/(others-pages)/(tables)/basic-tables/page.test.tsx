import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import BasicTables, { metadata } from "./page";
import { API, server } from "@/test/server";
import { renderWithProviders, screen } from "@/test/render";

describe("Employees page", () => {
  it("shows the employees table under its title", async () => {
    server.use(
      http.get(`${API}/employees`, () =>
        HttpResponse.json([{ _id: "e1", empNumber: 101, firstName: "Ali", lastName: "Zerrouki", baseSalary: 30000 }])
      )
    );
    renderWithProviders(<BasicTables />, { url: "/basic-tables" });
    // the breadcrumb title and the table title
    expect(screen.getAllByRole("heading", { name: "Employees Management", level: 2 })).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Details" })).toBeInTheDocument();
    expect(await screen.findByText("Ali")).toBeInTheDocument();
    expect(metadata.title).toBe("Employees | Nexo InOuty");
  });
});
