import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  answerConfirm,
  confirmDialog,
  dismissToast,
  getConfirm,
  getToasts,
  subscribe,
  toast,
} from "./notify";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  getToasts().forEach((t) => dismissToast(t.id));
  vi.useRealTimers();
});

describe("toast", () => {
  it.each(["success", "error", "info", "warning"] as const)("shows a %s toast", (kind) => {
    toast[kind]("Saved", "Done");
    expect(getToasts()).toEqual([expect.objectContaining({ kind, message: "Saved", title: "Done" })]);
  });

  it("doesn't stack the same message twice", () => {
    toast.error("Failed");
    toast.error("Failed");
    toast.warning("Failed");
    expect(getToasts().map((t) => t.kind)).toEqual(["error", "warning"]);
  });

  it("keeps at most 4 toasts, dropping the oldest", () => {
    ["1", "2", "3", "4", "5"].forEach((m) => toast.info(m));
    expect(getToasts().map((t) => t.message)).toEqual(["2", "3", "4", "5"]);
  });

  it.each([
    ["success", 3500],
    ["info", 4500],
    ["warning", 6000],
    ["error", 7000],
  ] as const)("hides a %s toast after %i ms", (kind, ms) => {
    toast[kind]("Bye");
    vi.advanceTimersByTime(ms - 1);
    expect(getToasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(getToasts()).toHaveLength(0);
  });

  it("notifies subscribers until they unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    toast.success("A");
    unsubscribe();
    toast.success("B");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("confirmDialog", () => {
  it("resolves with the user's answer, one dialog at a time", async () => {
    const first = confirmDialog({ title: "Delete?", danger: true });
    const second = confirmDialog({ title: "Really?" });
    expect(getConfirm()).toMatchObject({ title: "Delete?", danger: true });

    answerConfirm(getConfirm()!.id, true);
    expect(getConfirm()).toMatchObject({ title: "Really?" });
    answerConfirm(getConfirm()!.id, false);

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(false);
    expect(getConfirm()).toBeNull();
  });

  it("ignores an unknown id", () => {
    expect(() => answerConfirm(-1, true)).not.toThrow();
  });
});
