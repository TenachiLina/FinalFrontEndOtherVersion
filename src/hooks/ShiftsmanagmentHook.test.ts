import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { API, server } from "@/test/server";
import { useShiftsManagement, type ManagedShift } from "./ShiftsmanagmentHook";

const makeShift = (o: Partial<ManagedShift> = {}): ManagedShift => ({
  _id: "s1",
  startTime: "08:00",
  endTime: "16:00",
  isArchived: false,
  ...o,
});

const morning = makeShift();
const evening = makeShift({ _id: "s2", startTime: "16:00", endTime: "01:00" });
const oldShift = makeShift({ _id: "s9", startTime: "07:00", endTime: "15:00", isArchived: true });

let requests: { method: string; url: string; body: unknown }[];

const remember = async (request: Request) => {
  const text = await request.text();
  requests.push({ method: request.method, url: request.url.replace(API, ""), body: text ? JSON.parse(text) : undefined });
};

beforeEach(() => {
  requests = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  server.use(
    http.get(`${API}/shifts`, ({ request }) =>
      HttpResponse.json(new URL(request.url).searchParams.get("status") === "archived" ? [oldShift] : [evening, morning])
    )
  );
});

async function renderReady() {
  const hook = renderHook(() => useShiftsManagement());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe("listing", () => {
  it("loads the active shifts sorted by start time", async () => {
    const { result } = await renderReady();
    expect(result.current.view).toBe("active");
    expect(result.current.shifts.map((s) => s._id)).toEqual(["s1", "s2"]);
    expect(result.current.error).toBeNull();
  });

  it("sorts shifts with the same start by end time", async () => {
    server.use(
      http.get(`${API}/shifts`, () =>
        HttpResponse.json([makeShift({ _id: "b", endTime: "18:00" }), makeShift({ _id: "a", endTime: "12:00" })])
      )
    );
    const { result } = await renderReady();
    expect(result.current.shifts.map((s) => s._id)).toEqual(["a", "b"]);
  });

  it("loads the archived shifts when switching view", async () => {
    const { result } = await renderReady();
    act(() => result.current.switchView("archived"));
    await waitFor(() => expect(result.current.shifts).toEqual([oldShift]));
    expect(result.current.view).toBe("archived");
  });

  it("reports a friendly error when the list can't be loaded", async () => {
    server.use(http.get(`${API}/shifts`, () => new HttpResponse("down", { status: 503 })));
    const { result } = await renderReady();
    expect(result.current.error).toBe(
      "Couldn't load the shifts. Something went wrong on our side. Please try again in a moment."
    );
  });
});

describe("add and edit", () => {
  it("opens an empty add form", async () => {
    const { result } = await renderReady();
    act(() => result.current.openAddModal());
    expect(result.current.isOpen).toBe(true);
    expect(result.current.modalMode).toBe("add");
    expect(result.current.form).toEqual({ startTime: "", endTime: "" });
  });

  it("opens the edit form filled with the shift", async () => {
    const { result } = await renderReady();
    act(() => result.current.openEditModal(evening));
    expect(result.current.modalMode).toBe("edit");
    expect(result.current.editingShift).toEqual(evening);
    expect(result.current.form).toEqual({ startTime: "16:00", endTime: "01:00" });
  });

  it("requires both times", async () => {
    const { result } = await renderReady();
    act(() => result.current.openAddModal());
    act(() => result.current.updateForm("startTime", "09:00"));
    await act(() => result.current.handleSubmit());
    expect(result.current.formError).toBe("Start time and end time are required.");
    expect(requests).toEqual([]);
  });

  it("refuses the same start and end time", async () => {
    const { result } = await renderReady();
    act(() => result.current.openAddModal());
    act(() => {
      result.current.updateForm("startTime", "09:00");
      result.current.updateForm("endTime", "09:00");
    });
    await act(() => result.current.handleSubmit());
    expect(result.current.formError).toBe("Start time and end time can't be the same.");
  });

  it("creates an overnight shift and adds it in order", async () => {
    server.use(
      http.post(`${API}/shifts`, async ({ request }) => {
        await remember(request);
        return HttpResponse.json(makeShift({ _id: "new", startTime: "12:00", endTime: "02:00" }));
      })
    );
    const { result } = await renderReady();
    act(() => result.current.openAddModal());
    act(() => {
      result.current.updateForm("startTime", "12:00");
      result.current.updateForm("endTime", "02:00");
    });
    await act(() => result.current.handleSubmit());
    expect(requests).toEqual([{ method: "POST", url: "/shifts", body: { startTime: "12:00", endTime: "02:00" } }]);
    expect(result.current.shifts.map((s) => s._id)).toEqual(["s1", "new", "s2"]);
    expect(result.current.isOpen).toBe(false);
    expect(result.current.saving).toBe(false);
  });

  it("doesn't add a created shift to the archived list", async () => {
    server.use(http.post(`${API}/shifts`, () => HttpResponse.json(makeShift({ _id: "new" }))));
    const { result } = await renderReady();
    act(() => result.current.switchView("archived"));
    await waitFor(() => expect(result.current.shifts).toEqual([oldShift]));
    act(() => result.current.openAddModal());
    act(() => {
      result.current.updateForm("startTime", "10:00");
      result.current.updateForm("endTime", "11:00");
    });
    await act(() => result.current.handleSubmit());
    expect(result.current.shifts).toEqual([oldShift]);
  });

  it("updates an edited shift and re-sorts the list", async () => {
    server.use(
      http.put(`${API}/shifts/:id`, async ({ request }) => {
        await remember(request);
        return HttpResponse.json(makeShift({ _id: "s1", startTime: "18:00", endTime: "23:00" }));
      })
    );
    const { result } = await renderReady();
    act(() => result.current.openEditModal(morning));
    act(() => result.current.updateForm("startTime", "18:00"));
    act(() => result.current.updateForm("endTime", "23:00"));
    await act(() => result.current.handleSubmit());
    expect(requests).toEqual([{ method: "PUT", url: "/shifts/s1", body: { startTime: "18:00", endTime: "23:00" } }]);
    expect(result.current.shifts.map((s) => `${s.startTime}-${s.endTime}`)).toEqual(["16:00-01:00", "18:00-23:00"]);
    expect(result.current.editingShift).toBeNull();
  });

  it("keeps the form open with the backend's message when saving fails", async () => {
    server.use(
      http.post(`${API}/shifts`, () => HttpResponse.json({ message: "This shift already exists" }, { status: 409 }))
    );
    const { result } = await renderReady();
    act(() => result.current.openAddModal());
    act(() => {
      result.current.updateForm("startTime", "08:00");
      result.current.updateForm("endTime", "16:00");
    });
    await act(() => result.current.handleSubmit());
    expect(result.current.formError).toBe("Couldn't save this shift. This shift already exists");
    expect(result.current.isOpen).toBe(true);
  });

  it("closes and resets the form", async () => {
    const { result } = await renderReady();
    act(() => result.current.openEditModal(morning));
    act(() => result.current.closeShiftModal());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.form).toEqual({ startTime: "", endTime: "" });
  });
});

describe("archive and restore", () => {
  it("archives a shift and removes it from the active list", async () => {
    server.use(
      http.patch(`${API}/shifts/:id/archive`, async ({ request }) => {
        await remember(request);
        return new HttpResponse(null, { status: 204 });
      })
    );
    const { result } = await renderReady();
    await act(() => result.current.archiveShift(morning));
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(["PATCH /shifts/s1/archive"]);
    expect(result.current.shifts.map((s) => s._id)).toEqual(["s2"]);
  });

  it("reports a failed archive and keeps the shift", async () => {
    server.use(http.patch(`${API}/shifts/:id/archive`, () => new HttpResponse(null, { status: 500 })));
    const { result } = await renderReady();
    await act(() => result.current.archiveShift(morning));
    expect(result.current.error).toMatch(/^Couldn't archive this shift\./);
    expect(result.current.shifts).toHaveLength(2);
  });

  it("restores a shift and removes it from the archived list", async () => {
    server.use(http.patch(`${API}/shifts/:id/restore`, () => HttpResponse.json(makeShift({ _id: "s9" }))));
    const { result } = await renderReady();
    act(() => result.current.switchView("archived"));
    await waitFor(() => expect(result.current.shifts).toEqual([oldShift]));
    await act(() => result.current.restoreShift(oldShift));
    expect(result.current.shifts).toEqual([]);
  });

  it("reports a failed restore", async () => {
    server.use(http.patch(`${API}/shifts/:id/restore`, () => new HttpResponse(null, { status: 404 })));
    const { result } = await renderReady();
    await act(() => result.current.restoreShift(oldShift));
    expect(result.current.error).toBe("Couldn't restore this shift. We couldn't find that. It may have been deleted.");
  });
});

describe("permanent delete", () => {
  it("does nothing without a shift to delete", async () => {
    const { result } = await renderReady();
    await act(() => result.current.confirmDelete());
    expect(requests).toEqual([]);
  });

  it("asks, then deletes the shift", async () => {
    server.use(
      http.delete(`${API}/shifts/:id`, async ({ request }) => {
        await remember(request);
        return new HttpResponse(null, { status: 204 });
      })
    );
    const { result } = await renderReady();
    act(() => result.current.requestDelete(morning));
    expect(result.current.pendingDelete).toEqual({ shift: morning });
    await act(() => result.current.confirmDelete());
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(["DELETE /shifts/s1"]);
    expect(result.current.pendingDelete).toBeNull();
    expect(result.current.shifts.map((s) => s._id)).toEqual(["s2"]);
    expect(result.current.deleting).toBe(false);
  });

  it("can be cancelled", async () => {
    const { result } = await renderReady();
    act(() => result.current.requestDelete(morning));
    act(() => result.current.cancelDelete());
    expect(result.current.pendingDelete).toBeNull();
  });

  // BUG-403: String(e) starts with "Error: ", so a 409 is never recognised as "shift in use"
  it.fails("shows how often a shift in use is planned, then forces the delete", async () => {
    server.use(
      http.delete(`${API}/shifts/:id`, async ({ request }) => {
        await remember(request);
        return new URL(request.url).searchParams.get("force")
          ? new HttpResponse(null, { status: 204 })
          : HttpResponse.json({ message: "in use", usageCount: 7 }, { status: 409 });
      })
    );
    const { result } = await renderReady();
    act(() => result.current.requestDelete(morning));
    await act(() => result.current.confirmDelete());
    expect(result.current.pendingDelete).toEqual({ shift: morning, usageCount: 7 });
    await act(() => result.current.confirmDelete(true));
    expect(requests.map((r) => r.url)).toEqual(["/shifts/s1", "/shifts/s1?force=true"]);
    expect(result.current.pendingDelete).toBeNull();
  });

  // BUG-403: String(e) starts with "Error: ", so a 409 is never recognised as "shift in use"
  it.fails("counts 0 uses when a conflict gives no count", async () => {
    server.use(http.delete(`${API}/shifts/:id`, () => new HttpResponse("conflict", { status: 409 })));
    const { result } = await renderReady();
    act(() => result.current.requestDelete(morning));
    await act(() => result.current.confirmDelete());
    expect(result.current.pendingDelete?.usageCount).toBe(0);
  });
});
