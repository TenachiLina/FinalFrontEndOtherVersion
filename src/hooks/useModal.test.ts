import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useModal } from "./useModal";

describe("useModal", () => {
  it("starts closed by default", () => {
    const { result } = renderHook(() => useModal());
    expect(result.current.isOpen).toBe(false);
  });

  it("can start open", () => {
    const { result } = renderHook(() => useModal(true));
    expect(result.current.isOpen).toBe(true);
  });

  it("opens, closes and toggles", () => {
    const { result } = renderHook(() => useModal());
    act(() => result.current.openModal());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.openModal());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.closeModal());
    expect(result.current.isOpen).toBe(false);
    act(() => result.current.toggleModal());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.toggleModal());
    expect(result.current.isOpen).toBe(false);
  });

  it("keeps the same handlers between renders", () => {
    const { result, rerender } = renderHook(() => useModal());
    const first = result.current;
    act(() => result.current.toggleModal());
    rerender();
    expect(result.current.openModal).toBe(first.openModal);
    expect(result.current.closeModal).toBe(first.closeModal);
    expect(result.current.toggleModal).toBe(first.toggleModal);
  });
});
