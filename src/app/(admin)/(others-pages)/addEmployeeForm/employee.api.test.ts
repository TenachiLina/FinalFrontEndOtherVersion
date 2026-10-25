import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { API, server } from "@/test/server";
import { createEmployee, deleteEmployee, getEmployee, getEmployees, updateEmployee } from "./employee.api";

const amine = { empNumber: 101, firstName: "Amine", lastName: "B", baseSalary: 41600 };

describe("employee.api", () => {
  it("lists and reads employees", async () => {
    server.use(
      http.get(`${API}/employees`, () => HttpResponse.json([{ _id: "e1", ...amine }])),
      http.get(`${API}/employees/:id`, ({ params }) => HttpResponse.json({ _id: params.id, ...amine }))
    );
    expect(await getEmployees()).toHaveLength(1);
    expect((await getEmployee("e9"))._id).toBe("e9");
  });

  it("creates, updates and deletes with JSON bodies", async () => {
    const calls: [string, string, unknown, string | null][] = [];
    const record = async (request: Request) => {
      const text = await request.text();
      calls.push([request.method, request.url.replace(API, ""), text ? JSON.parse(text) : null, request.headers.get("Content-Type")]);
    };
    server.use(
      http.post(`${API}/employees`, async ({ request }) => {
        await record(request);
        return HttpResponse.json({ _id: "new", ...amine });
      }),
      http.put(`${API}/employees/:id`, async ({ request }) => {
        await record(request);
        return HttpResponse.json({ _id: "e1", ...amine, baseSalary: 50000 });
      }),
      http.delete(`${API}/employees/:id`, async ({ request }) => {
        await record(request);
        return HttpResponse.json({ deleted: true });
      })
    );
    expect((await createEmployee(amine))._id).toBe("new");
    expect((await updateEmployee("e1", { baseSalary: 50000 })).baseSalary).toBe(50000);
    expect(await deleteEmployee("e1")).toEqual({ deleted: true });
    expect(calls).toEqual([
      ["POST", "/employees", amine, "application/json"],
      ["PUT", "/employees/e1", { baseSalary: 50000 }, "application/json"],
      ["DELETE", "/employees/e1", null, "application/json"],
    ]);
  });

  it("throws the server's message", async () => {
    server.use(http.post(`${API}/employees`, () => HttpResponse.json({ message: "Number 101 is taken" }, { status: 409 })));
    await expect(createEmployee(amine)).rejects.toMatchObject({ status: 409, message: "Number 101 is taken" });
  });

  // BUG-012 (same cause as deleteWorktime)
  it("treats an empty 204 delete as success", async () => {
    server.use(http.delete(`${API}/employees/:id`, () => new HttpResponse(null, { status: 204 })));
    await expect(deleteEmployee("e1")).resolves.not.toThrow();
  });
});
