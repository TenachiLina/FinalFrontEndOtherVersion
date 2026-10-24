import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, vi } from "vitest";
import { server } from "./server";
import { navigationMock, resetNavigation } from "./navigation";

// Started here, before any test file is imported: AuthContext wraps
// window.fetch as soon as it is imported, and must wrap MSW's version.
// Any request without a handler fails the test, so nothing reaches a real backend.
server.listen({ onUnhandledFrame: "error" });

// ── Next.js and heavy browser-only libraries ──────────────────────────────

vi.mock("next/navigation", () => navigationMock);

vi.mock("next/image", () => ({
  default: ({ src, alt, fill: _fill, priority: _priority, ...rest }: Record<string, unknown>) =>
    React.createElement("img", { src: typeof src === "string" ? src : "", alt, ...rest }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, prefetch: _prefetch, ...rest }: Record<string, unknown>) =>
    React.createElement("a", { href: typeof href === "string" ? href : String(href), ...rest }, children as React.ReactNode),
}));

// Loads the component right away (behind Suspense) instead of on demand
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<unknown>) => {
    const Lazy = React.lazy(async () => {
      const mod = (await loader()) as { default?: React.ComponentType } | React.ComponentType;
      return { default: (mod as { default?: React.ComponentType }).default ?? (mod as React.ComponentType) };
    });
    return (props: Record<string, unknown>) =>
      React.createElement(React.Suspense, { fallback: null }, React.createElement(Lazy, props));
  },
}));

vi.mock("next/font/google", () => {
  const font = () => ({ className: "font", variable: "--font", style: {} });
  return { Outfit: font, Cairo: font, Inter: font };
});

// Charts and maps need a real layout engine: render a stub that shows the data
vi.mock("react-apexcharts", () => ({
  default: (props: { type?: string; series?: unknown; options?: unknown }) =>
    React.createElement("div", {
      "data-testid": "chart",
      "data-type": props.type,
      "data-series": JSON.stringify(props.series),
    }),
}));
vi.mock("@react-jvectormap/core", () => ({ VectorMap: () => React.createElement("div", { "data-testid": "map" }) }));
vi.mock("@react-jvectormap/world", () => ({ worldMill: {} }));

// ── Browser APIs jsdom doesn't have ───────────────────────────────────────

Object.defineProperty(window, "matchMedia", {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver ??= NoopObserver as unknown as typeof IntersectionObserver;
window.scrollTo = () => {};
Element.prototype.scrollIntoView ??= () => {};
URL.createObjectURL ??= () => "blob:test";
URL.revokeObjectURL ??= () => {};

// ── Reset between tests ───────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  sessionStorage.clear();
  resetNavigation();
  document.documentElement.className = "";
});

afterAll(() => server.close());
