import { beforeEach, describe, expect, it, vi } from "vitest";
import { delay, http, HttpResponse } from "msw";
import { API, server } from "@/test/server";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";
import type { ManagedShift } from "@/hooks/ShiftsmanagmentHook";
import ShiftsManagementPage from "./page";

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

function shiftsBackend(active: ManagedShift[] = [morning, evening], archived: ManagedShift[] = [oldShift]) {
  server.use(
    http.get(`${API}/shifts`, ({ request }) =>
      HttpResponse.json(new URL(request.url).searchParams.get("status") === "archived" ? archived : active)
    )
  );
}

async function renderPage() {
  const view = renderWithProviders(<ShiftsManagementPage />, { url: "/ShiftsManagment" });
  await waitFor(() => expect(screen.queryByText("Loading...")).not.toBeInTheDocument());
  return view;
}

const row = (time: string) => screen.getByRole("row", { name: new RegExp(time) });

/** Picks the hour of the start or end time (the minute defaults to 00). */
const pickHour = async (user: ReturnType<typeof renderWithProviders>["user"], field: "Start time" | "End time", hour: string) =>
  user.selectOptions(screen.getByLabelText(field), hour);

beforeEach(() => {
  requests = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  shiftsBackend();
});

describe("Shifts management page", () => {
  it("shows a loading row, then the active shifts in start-time order", async () => {
    renderWithProviders(<ShiftsManagementPage />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    await screen.findByText("08:00");
    const rows = screen.getAllByRole("row");
    expect(rows.slice(1).map((r) => r.textContent)).toEqual([
      expect.stringContaining("08:0016:00"),
      expect.stringContaining("16:0001:00"),
    ]);
    expect(screen.getByRole("heading", { name: "Shifts Management" })).toBeInTheDocument();
    expect(within(row("08:00")).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(within(row("08:00")).getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });

  it("says when there are no shifts", async () => {
    shiftsBackend([], []);
    await renderPage();
    expect(screen.getByText("No shifts found.")).toBeInTheDocument();
  });

  it("shows an error when the shifts can't be loaded", async () => {
    server.use(http.get(`${API}/shifts`, () => new HttpResponse(null, { status: 500 })));
    await renderPage();
    expect(
      await screen.findByText("Couldn't load the shifts. Something went wrong on our side. Please try again in a moment.")
    ).toBeInTheDocument();
  });

  it("switches to the archived shifts, which can be restored or deleted but not added", async () => {
    const { user } = await renderPage();
    await user.click(screen.getByRole("button", { name: "Archived" }));
    await screen.findByText("07:00");
    expect(screen.queryByText("08:00")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Shift" })).not.toBeInTheDocument();
    expect(within(row("07:00")).getByRole("button", { name: "Restore" })).toBeInTheDocument();
    expect(within(row("07:00")).getByRole("button", { name: "Delete" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Active" }));
    await screen.findByText("08:00");
    expect(screen.getByRole("button", { name: "Add Shift" })).toBeInTheDocument();
  });

  // BUG-405: a slow answer for the Active tab replaces the archived list after switching tabs
  it.fails("keeps showing the archived shifts when the active list answers late", async () => {
    server.use(
      http.get(`${API}/shifts`, async ({ request }) => {
        if (new URL(request.url).searchParams.get("status") === "archived") return HttpResponse.json([oldShift]);
        await delay(150);
        return HttpResponse.json([morning, evening]);
      })
    );
    const { user } = renderWithProviders(<ShiftsManagementPage />);
    await user.click(screen.getByRole("button", { name: "Archived" }));
    await screen.findByText("07:00");
    await new Promise((r) => setTimeout(r, 300));
    // Showing active shifts here offers "Delete" (permanent) on shifts that are in use
    expect(screen.queryByText("08:00")).not.toBeInTheDocument();
    expect(screen.getByText("07:00")).toBeInTheDocument();
  });

  describe("adding a shift", () => {
    it("asks for both times", async () => {
      const { user } = await renderPage();
      await user.click(screen.getByRole("button", { name: "Add Shift" }));
      expect(screen.getByRole("heading", { name: "Add Shift" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Save" }));
      expect(screen.getByText("Start time and end time are required.")).toBeInTheDocument();
    });

    it("refuses a shift that starts and ends at the same time", async () => {
      const { user } = await renderPage();
      await user.click(screen.getByRole("button", { name: "Add Shift" }));
      await pickHour(user, "Start time", "09");
      await pickHour(user, "End time", "09");
      await user.click(screen.getByRole("button", { name: "Save" }));
      expect(screen.getByText("Start time and end time can't be the same.")).toBeInTheDocument();
      expect(requests).toEqual([]);
    });

    it("saves an overnight shift and lists it in order", async () => {
      server.use(
        http.post(`${API}/shifts`, async ({ request }) => {
          await remember(request);
          await delay(50);
          return HttpResponse.json(makeShift({ _id: "new", startTime: "12:30", endTime: "02:00" }));
        })
      );
      const { user } = await renderPage();
      await user.click(screen.getByRole("button", { name: "Add Shift" }));
      await pickHour(user, "Start time", "12");
      await user.selectOptions(screen.getAllByLabelText("Minute")[0], "30");
      await pickHour(user, "End time", "02");
      await user.click(screen.getByRole("button", { name: "Save" }));
      expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
      await waitFor(() => expect(screen.queryByRole("heading", { name: "Add Shift" })).not.toBeInTheDocument());
      expect(requests).toEqual([{ method: "POST", url: "/shifts", body: { startTime: "12:30", endTime: "02:00" } }]);
      const rows = screen.getAllByRole("row").slice(1);
      expect(rows.map((r) => r.textContent?.slice(0, 10))).toEqual(["08:0016:00", "12:3002:00", "16:0001:00"]);
    });

    it("shows the backend's reason and keeps the form open when saving fails", async () => {
      server.use(
        http.post(`${API}/shifts`, () => HttpResponse.json({ message: "This shift already exists" }, { status: 409 }))
      );
      const { user } = await renderPage();
      await user.click(screen.getByRole("button", { name: "Add Shift" }));
      await pickHour(user, "Start time", "08");
      await pickHour(user, "End time", "16");
      await user.click(screen.getByRole("button", { name: "Save" }));
      expect(await screen.findByText("Couldn't save this shift. This shift already exists")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Add Shift" })).toBeInTheDocument();
    });

    it("can be cancelled", async () => {
      const { user } = await renderPage();
      await user.click(screen.getByRole("button", { name: "Add Shift" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("heading", { name: "Add Shift" })).not.toBeInTheDocument();
      expect(requests).toEqual([]);
    });
  });

  it("edits a shift with its times filled in", async () => {
    server.use(
      http.put(`${API}/shifts/:id`, async ({ request }) => {
        await remember(request);
        return HttpResponse.json(makeShift({ _id: "s1", startTime: "08:00", endTime: "17:00" }));
      })
    );
    const { user } = await renderPage();
    await user.click(within(row("08:00")).getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Edit Shift" })).toBeInTheDocument();
    expect(screen.getByLabelText("Start time")).toHaveValue("08");
    expect(screen.getByLabelText("End time")).toHaveValue("16");
    await pickHour(user, "End time", "17");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Edit Shift" })).not.toBeInTheDocument());
    expect(requests).toEqual([{ method: "PUT", url: "/shifts/s1", body: { startTime: "08:00", endTime: "17:00" } }]);
    expect(row("08:00")).toHaveTextContent("17:00");
  });

  it("archives a shift", async () => {
    server.use(
      http.patch(`${API}/shifts/:id/archive`, async ({ request }) => {
        await remember(request);
        return HttpResponse.json(makeShift({ isArchived: true }));
      })
    );
    const { user } = await renderPage();
    await user.click(within(row("08:00")).getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(screen.queryByText("08:00")).not.toBeInTheDocument());
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(["PATCH /shifts/s1/archive"]);
  });

  it("shows why archiving failed", async () => {
    server.use(http.patch(`${API}/shifts/:id/archive`, () => new HttpResponse(null, { status: 500 })));
    const { user } = await renderPage();
    await user.click(within(row("08:00")).getByRole("button", { name: "Archive" }));
    expect(await screen.findByText(/^Couldn't archive this shift\./)).toBeInTheDocument();
    expect(screen.getByText("08:00")).toBeInTheDocument();
  });

  describe("archived shifts", () => {
    async function renderArchived() {
      const view = await renderPage();
      await view.user.click(screen.getByRole("button", { name: "Archived" }));
      await screen.findByText("07:00");
      return view;
    }

    it("restores a shift", async () => {
      server.use(
        http.patch(`${API}/shifts/:id/restore`, async ({ request }) => {
          await remember(request);
          return HttpResponse.json(oldShift);
        })
      );
      const { user } = await renderArchived();
      await user.click(screen.getByRole("button", { name: "Restore" }));
      expect(await screen.findByText("No shifts found.")).toBeInTheDocument();
      expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(["PATCH /shifts/s9/restore"]);
    });

    it("deletes a shift for good after confirmation", async () => {
      server.use(
        http.delete(`${API}/shifts/:id`, async ({ request }) => {
          await remember(request);
          return new HttpResponse(null, { status: 204 });
        })
      );
      const { user } = await renderArchived();
      await user.click(screen.getByRole("button", { name: "Delete" }));
      expect(screen.getByRole("heading", { name: "Delete Shift" })).toBeInTheDocument();
      expect(screen.getByText("Are you sure you want to permanently delete this shift?")).toBeInTheDocument();
      expect(requests).toEqual([]);
      const buttons = screen.getAllByRole("button", { name: "Delete" });
      await user.click(buttons[buttons.length - 1]);
      await waitFor(() => expect(screen.queryByRole("heading", { name: "Delete Shift" })).not.toBeInTheDocument());
      expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(["DELETE /shifts/s9"]);
      expect(screen.getByText("No shifts found.")).toBeInTheDocument();
    });

    it("keeps the shift when the delete is cancelled", async () => {
      const { user } = await renderArchived();
      await user.click(screen.getByRole("button", { name: "Delete" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("heading", { name: "Delete Shift" })).not.toBeInTheDocument();
      expect(screen.getByText("07:00")).toBeInTheDocument();
      expect(requests).toEqual([]);
    });

    // BUG-403: String(e) starts with "Error: ", so a 409 is never recognised as "shift in use"
    it.fails("warns that a shift is still planned and deletes it on a second confirmation", async () => {
      server.use(
        http.delete(`${API}/shifts/:id`, async ({ request }) => {
          await remember(request);
          return new URL(request.url).searchParams.get("force")
            ? new HttpResponse(null, { status: 204 })
            : HttpResponse.json({ message: "Shift in use", usageCount: 3 }, { status: 409 });
        })
      );
      const { user } = await renderArchived();
      await user.click(screen.getByRole("button", { name: "Delete" }));
      const confirm = () => screen.getAllByRole("button", { name: "Delete" }).at(-1)!;
      await user.click(confirm());
      expect(await screen.findByText(/This shift is used in 3 planning\s+entries\./)).toBeInTheDocument();
      await user.click(confirm());
      await waitFor(() => expect(screen.queryByRole("heading", { name: "Delete Shift" })).not.toBeInTheDocument());
      expect(requests.map((r) => r.url)).toEqual(["/shifts/s9", "/shifts/s9?force=true"]);
    });

    // BUG-404: a failed delete shows the raw "Error: 500 <body>" text instead of a friendly message
    it.fails("explains a failed delete without technical details", async () => {
      server.use(
        http.delete(`${API}/shifts/:id`, () =>
          HttpResponse.json({ statusCode: 500, message: "Internal server error" }, { status: 500 })
        )
      );
      const { user } = await renderArchived();
      await user.click(screen.getByRole("button", { name: "Delete" }));
      await user.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);
      const message = await screen.findByText(/Could not delete this shift\./);
      expect(message).toHaveTextContent("Something went wrong on our side");
      expect(message).not.toHaveTextContent(/Error: 500|statusCode/);
    });
  });
});
