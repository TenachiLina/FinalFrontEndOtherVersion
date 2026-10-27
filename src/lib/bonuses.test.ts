import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { API, server } from "@/test/server";
import { createBonus, deleteBonus, fetchBonuses } from "./bonuses";

describe("fetchBonuses", () => {
  it("passes the range and normalizes each bonus", async () => {
    let url = "";
    server.use(
      http.get(`${API}/bonuses`, ({ request }) => {
        url = request.url;
        return HttpResponse.json([
          { _id: "b1", emp_id: 101, amount: "2000", date: "2026-03-10T00:00:00.000Z", reason: "Top seller" },
          { _id: "b2", emp_id: "102", amount: null, date: null },
        ]);
      })
    );
    expect(await fetchBonuses({ start: "2026-03-01", end: "2026-03-31" })).toEqual([
      { id: "b1", empId: 101, amount: 2000, date: "2026-03-10", reason: "Top seller" },
      { id: "b2", empId: "102", amount: 0, date: "", reason: "" },
    ]);
    expect(url).toBe(`${API}/bonuses?start=2026-03-01&end=2026-03-31`);
  });

  it("works without a range and with a { rows } body", async () => {
    let url = "";
    server.use(
      http.get(`${API}/bonuses`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({ rows: [{ _id: "b1", emp_id: 1, amount: 5, date: "2026-03-01" }] });
      })
    );
    expect(await fetchBonuses()).toHaveLength(1);
    expect(url).toBe(`${API}/bonuses`);
  });

  it("returns an empty list for an unexpected body", async () => {
    server.use(http.get(`${API}/bonuses`, () => HttpResponse.json({})));
    expect(await fetchBonuses()).toEqual([]);
  });

  it("throws the server error", async () => {
    server.use(http.get(`${API}/bonuses`, () => HttpResponse.json({ message: "Off" }, { status: 403 })));
    await expect(fetchBonuses()).rejects.toMatchObject({ status: 403, message: "Off" });
  });
});

describe("createBonus", () => {
  it("sends the API field names and returns the saved bonus", async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/bonuses`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ _id: "b9", emp_id: 101, amount: 1500, date: "2026-03-02", reason: "Eid" });
      })
    );
    const saved = await createBonus({ empId: 101, amount: 1500, date: "2026-03-02", reason: "Eid" });
    expect(body).toEqual({ emp_id: 101, amount: 1500, date: "2026-03-02", reason: "Eid" });
    expect(saved).toEqual({ id: "b9", empId: 101, amount: 1500, date: "2026-03-02", reason: "Eid" });
  });

  it("throws on a validation error", async () => {
    server.use(http.post(`${API}/bonuses`, () => HttpResponse.json({ message: ["amount must be positive"] }, { status: 400 })));
    await expect(createBonus({ empId: 1, amount: -1, date: "2026-03-02", reason: "" })).rejects.toMatchObject({
      message: "amount must be positive",
    });
  });
});

describe("deleteBonus", () => {
  it("sends DELETE and throws on failure", async () => {
    server.use(
      http.delete(`${API}/bonuses/:id`, ({ params }) =>
        params.id === "b1" ? new HttpResponse(null, { status: 204 }) : new HttpResponse(null, { status: 404 })
      )
    );
    await expect(deleteBonus("b1")).resolves.toBeUndefined();
    await expect(deleteBonus("nope")).rejects.toMatchObject({ status: 404 });
  });
});
