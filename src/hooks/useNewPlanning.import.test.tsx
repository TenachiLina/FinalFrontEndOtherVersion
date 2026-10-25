import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import * as XLSX from "xlsx";
import { toast } from "@/lib/notify";
import type { Cell } from "@/components/calendar/types";
import { useShiftGrid } from "./useNewPlanning";
import {
  ALICE,
  BOB,
  EVENING,
  MORNING,
  fixTheClock,
  makeRecord,
  makeShift,
  mockPlanningApi,
  renderPlanningHook,
} from "./useNewPlanning.fixtures";

// pdf.js needs a worker and a canvas: replace it with a document whose pages
// hold the text items set in `pdf.pages` (one string per text item).
const pdf = vi.hoisted(() => ({ pages: [] as string[][], workerSrc: "" }));
vi.mock("pdfjs-dist", () => ({
  version: "9.9.9",
  GlobalWorkerOptions: {
    set workerSrc(value: string) {
      pdf.workerSrc = value;
    },
  },
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: pdf.pages.length,
      getPage: async (n: number) => ({
        getTextContent: async () => ({ items: pdf.pages[n - 1].map((str) => ({ str })) }),
      }),
    }),
  }),
}));

fixTheClock();

function excelFile(rows: string[][], name = "planning.xlsx"): File {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Planning");
  return new File([XLSX.write(book, { type: "array", bookType: "xlsx" })], name);
}

function pdfFile(...pages: string[][]): File {
  pdf.pages = pages;
  return new File(["%PDF-1.7"], "planning.PDF");
}

/** What a file <input> hands to onChange. */
function fileChange(file?: File | { name: string; arrayBuffer: () => Promise<ArrayBuffer> }) {
  const target = { files: file ? [file] : [], value: "C:\\fakepath\\file" };
  return { target, event: { target } as unknown as React.ChangeEvent<HTMLInputElement> };
}

async function setup(options: Parameters<typeof mockPlanningApi>[0] = {}) {
  const api = mockPlanningApi({ plannings: { "2026-10-24": [makeRecord(BOB, { shiftId: EVENING._id })] }, ...options });
  return renderPlanningHook(api);
}

const names = (cells: Cell[]) => cells.map((c) => c.title);

describe("import menu", () => {
  it("opens and closes the menu, and each choice opens its file picker", async () => {
    const { result } = await setup();
    const excelPicker = document.createElement("input");
    const pdfPicker = document.createElement("input");
    const excelClick = vi.spyOn(excelPicker, "click");
    const pdfClick = vi.spyOn(pdfPicker, "click");
    result.current.excelInputRef.current = excelPicker;
    result.current.pdfInputRef.current = pdfPicker;

    act(() => result.current.handleImportClick());
    expect(result.current.showImportMenu).toBe(true);
    act(() => result.current.handleExcelImportClick());
    expect(excelClick).toHaveBeenCalled();
    expect(result.current.showImportMenu).toBe(false);

    act(() => result.current.handleImportClick());
    act(() => result.current.handlePdfImportClick());
    expect(pdfClick).toHaveBeenCalled();
    expect(result.current.showImportMenu).toBe(false);

    act(() => result.current.setShowImportMenu(true));
    act(() => result.current.handleImportClick());
    expect(result.current.showImportMenu).toBe(false);
  });
});

describe("importing an Excel planning", () => {
  it("puts each employee in the shift of his hour, on the first post, replacing the grid", async () => {
    const { result } = await setup();
    const { event, target } = fileChange(
      excelFile([
        ["Hour", "Employees"],
        ["06H", "Alice Martin\nBackup: Bob Brown\nBackup: Carl Cohen\nDina Diaz\nBackup: No backup"],
        ["16H", "  bob   BROWN "],
      ])
    );

    await act(() => result.current.handleImportFile(event));

    expect(result.current.grid[1][MORNING._id]).toEqual([
      {
        id: "e1",
        title: "Alice Martin",
        backups: [
          { id: "e2", title: "Bob Brown" },
          { id: "e3", title: "Carl Cohen" },
        ],
      },
      { id: "e4", title: "Dina Diaz", backups: [] },
    ]);
    expect(names(result.current.grid[1][EVENING._id])).toEqual(["Bob Brown"]);
    expect(result.current.grid[2][EVENING._id]).toEqual([]);
    expect(target.value).toBe("");
  });

  it("accepts .xls files and hours written without the H", async () => {
    const { result } = await setup();
    const { event } = fileChange(excelFile([["hour"], ["6", "Alice Martin"]], "old.XLS"));

    await act(() => result.current.handleImportFile(event));

    expect(names(result.current.grid[1][MORNING._id])).toEqual(["Alice Martin"]);
  });

  it("ignores empty rows, unknown hours, and backups without a main employee", async () => {
    const warn = vi.spyOn(console, "warn");
    const { result } = await setup();
    const { event } = fileChange(
      excelFile([
        ["Hour", "Employees"],
        ["", "Alice Martin"],
        ["06H", ""],
        ["10H", "Bob Brown"],
        ["06H", "Backup: Bob Brown\nCarl Cohen"],
      ])
    );

    await act(() => result.current.handleImportFile(event));

    expect(result.current.grid[1][MORNING._id]).toEqual([{ id: "e3", title: "Carl Cohen", backups: [] }]);
    expect(result.current.grid[1][EVENING._id]).toEqual([]);
    expect(warn).toHaveBeenCalledWith("No shift found for 10H");
  });

  it("adds a backup once, and never the employee as his own backup", async () => {
    const { result } = await setup();
    const { event } = fileChange(
      excelFile([["Hour"], ["06H", "Alice Martin\nBackup: Alice Martin\nBackup: Bob Brown\nBackup: bob brown\nBackup:"]])
    );

    await act(() => result.current.handleImportFile(event));

    expect(result.current.grid[1][MORNING._id][0].backups).toEqual([{ id: "e2", title: "Bob Brown" }]);
  });

  it("imports the others and lists, once each, the names it couldn't find", async () => {
    const warning = vi.spyOn(toast, "warning");
    const { result } = await setup();
    const { event } = fileChange(
      excelFile([
        ["Hour"],
        ["06H", "Zoe Ghost\nBackup: Bob Brown\nAlice Martin\nBackup: Max Nobody"],
        ["16H", "Zoe Ghost"],
      ])
    );

    await act(() => result.current.handleImportFile(event));

    expect(result.current.grid[1][MORNING._id]).toEqual([{ id: "e1", title: "Alice Martin", backups: [] }]);
    expect(warning).toHaveBeenCalledWith(
      "Imported, but these employees weren't found and were skipped: Zoe Ghost, Max Nobody"
    );
  });

  it("refuses a sheet whose first column isn't 'Hour'", async () => {
    const error = vi.spyOn(toast, "error");
    const { result } = await setup();
    const { event } = fileChange(excelFile([["Name", "Shift"], ["Alice Martin", "06H"]]));

    await act(() => result.current.handleImportFile(event));

    expect(error).toHaveBeenCalledWith("This isn't a planning file: the first column must be called 'Hour'.");
    expect(names(result.current.grid[1][EVENING._id])).toEqual(["Bob Brown"]);
  });

  it("refuses an empty sheet", async () => {
    const error = vi.spyOn(toast, "error");
    const { result } = await setup();
    const { event, target } = fileChange(excelFile([["Hour"]]));

    await act(() => result.current.handleImportFile(event));

    expect(error).toHaveBeenCalledWith("This Excel file is empty or can't be read.");
    expect(target.value).toBe("");
  });

  it("explains a file that can't be read", async () => {
    const error = vi.spyOn(toast, "error");
    const { result } = await setup();
    const { event } = fileChange({ name: "broken.xlsx", arrayBuffer: () => Promise.reject(new Error("The file is locked")) });

    await act(() => result.current.handleImportFile(event));

    expect(error).toHaveBeenCalledWith("Couldn't import the planning file. The file is locked");
  });

  // BUG-305: an employee listed twice under the same hour is imported twice into the same cell (and saved twice)
  it("imports an employee listed twice under the same hour only once", async () => {
    const { result } = await setup();
    const { event } = fileChange(
      excelFile([
        ["Hour"],
        ["06H", "Alice Martin"],
        ["06H", "Alice Martin\nBackup: Bob Brown"],
      ])
    );

    await act(() => result.current.handleImportFile(event));

    expect(names(result.current.grid[1][MORNING._id])).toEqual(["Alice Martin"]);
  });
});

describe("importing a PDF planning", () => {
  it("reads every page, follows the hour rows and loads the pdf.js worker from the CDN", async () => {
    const { result } = await setup();
    const { event, target } = fileChange(
      pdfFile(
        ["Daily planning — 24/10/2026", "Hour", "Employees", "06H", "Alice Martin", "Backup: Bob Brown", " "],
        ["16h", "Bob   Brown", "Backup: No backup", "Backup:", "Backup: Alice Martin"]
      )
    );

    await act(() => result.current.handleImportFile(event));

    expect(result.current.grid[1][MORNING._id]).toEqual([
      { id: "e1", title: "Alice Martin", backups: [{ id: "e2", title: "Bob Brown" }] },
    ]);
    expect(result.current.grid[1][EVENING._id]).toEqual([
      { id: "e2", title: "Bob Brown", backups: [{ id: "e1", title: "Alice Martin" }] },
    ]);
    expect(pdf.workerSrc).toBe("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/9.9.9/pdf.worker.min.mjs");
    expect(target.value).toBe("");
  });

  it("ignores text before the first hour and under an hour that has no shift", async () => {
    const warn = vi.spyOn(console, "warn");
    const { result } = await setup();
    const { event } = fileChange(
      pdfFile(["Alice Martin", "10H", "Bob Brown", "06H", "Backup: Bob Brown", "Carl Cohen"])
    );

    await act(() => result.current.handleImportFile(event));

    expect(result.current.grid[1][MORNING._id]).toEqual([{ id: "e3", title: "Carl Cohen", backups: [] }]);
    expect(result.current.grid[1][EVENING._id]).toEqual([]);
    expect(warn).toHaveBeenCalledWith("No existing shift found for 10H");
  });

  it("skips unknown names, and the backups under them", async () => {
    const warning = vi.spyOn(toast, "warning");
    const { result } = await setup();
    const { event } = fileChange(
      pdfFile(["06H", "Zoe Ghost", "Backup: Alice Martin", "Alice Martin", "Backup: Max Nobody"])
    );

    await act(() => result.current.handleImportFile(event));

    expect(result.current.grid[1][MORNING._id]).toEqual([{ id: "e1", title: "Alice Martin", backups: [] }]);
    expect(warning).toHaveBeenCalledWith(
      "Imported, but these employees weren't found and were skipped: Zoe Ghost, Max Nobody"
    );
  });

  // BUG-306: PDF import only knows the hours 06H–12H and 14H–16H; employees of any other hour land in the previous hour's shift
  it("puts the employees of an 18:00 shift in the 18:00 shift", async () => {
    const api = mockPlanningApi({ shifts: [MORNING, makeShift("s-late", "18:00", "23:00")] });
    const { result } = await renderPlanningHook(api);
    const { event } = fileChange(pdfFile(["06H", "Alice Martin", "18H", "Bob Brown"]));

    await act(() => result.current.handleImportFile(event));

    expect(names(result.current.grid[1][MORNING._id])).toEqual(["Alice Martin"]);
    expect(names(result.current.grid[1]["s-late"])).toEqual(["Bob Brown"]);
  });

  // BUG-305: an employee listed twice under the same hour is imported twice into the same cell (and saved twice)
  it("imports an employee listed twice under the same hour only once", async () => {
    const { result } = await setup();
    const { event } = fileChange(pdfFile(["06H", "Alice Martin"], ["06H", "Alice Martin"]));

    await act(() => result.current.handleImportFile(event));

    expect(names(result.current.grid[1][MORNING._id])).toEqual(["Alice Martin"]);
  });
});

describe("files that can't be imported", () => {
  it("does nothing when no file was chosen", async () => {
    const { result } = await setup();
    const before = result.current.grid;
    const { event, target } = fileChange();

    await act(() => result.current.handleImportFile(event));

    expect(result.current.grid).toBe(before);
    expect(target.value).toBe("C:\\fakepath\\file");
  });

  it("refuses other file types", async () => {
    const error = vi.spyOn(toast, "error");
    const { result } = await setup();
    const { event } = fileChange(new File(["a,b"], "planning.csv"));

    await act(() => result.current.handleImportFile(event));

    expect(error).toHaveBeenCalledWith("Choose an Excel (.xlsx, .xls) or PDF (.pdf) file.");
    expect(names(result.current.grid[1][EVENING._id])).toEqual(["Bob Brown"]);
  });

  it("asks for a post first when there is none", async () => {
    const warning = vi.spyOn(toast, "warning");
    mockPlanningApi({ tasks: [] });
    const { result } = renderHook(() => useShiftGrid());
    await waitFor(() => expect(result.current.loadingMeta).toBe(false));

    await act(() => result.current.handleImportFile(fileChange(excelFile([["Hour"], ["06H", "Alice Martin"]])).event));

    expect(warning).toHaveBeenCalledWith("Add at least one post before importing a planning.");
  });

  it("asks for a shift first when there is none", async () => {
    const warning = vi.spyOn(toast, "warning");
    mockPlanningApi({ shifts: [] });
    const { result } = renderHook(() => useShiftGrid());
    await waitFor(() => expect(result.current.posts).toHaveLength(2));

    await act(() => result.current.handleImportFile(fileChange(excelFile([["Hour"], ["06H", "Alice Martin"]])).event));

    expect(warning).toHaveBeenCalledWith("Add at least one shift before importing a planning.");
  });
});

it("keeps imported employees when the day is saved", async () => {
  const api = mockPlanningApi();
  const { result } = await renderPlanningHook(api);
  await act(() => result.current.handleImportFile(fileChange(excelFile([["Hour"], ["06H", "Alice Martin"]])).event));

  await act(() => result.current.handleSavePlanning());

  expect(api.saves[0].entries.map((e) => [e.empId, e.shiftId])).toEqual([[ALICE._id, MORNING._id]]);
});
