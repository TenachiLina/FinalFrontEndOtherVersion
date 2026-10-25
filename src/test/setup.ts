import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, vi } from "vitest";
import { server } from "./server";
import { navigationMock, resetNavigation } from "./navigation";
import { answerConfirm, dismissToast, getConfirm, getToasts } from "@/lib/notify";

// findBy*/waitFor give up after 1 s by default; screens that load several
// endpoints can take longer when the whole suite runs with coverage
configure({ asyncUtilTimeout: 4000 });

// Started here, before any test file is imported: AuthContext wraps
// window.fetch as soon as it is imported, and must wrap MSW's version.
// Any request without a handler fails the test, so nothing reaches a real backend.
server.listen({ onUnhandledFrame: "error" });

// A test can end while its page is still loading. Those requests would then
// reach the next test's handlers and show up in its request logs (only on
// slow machines, e.g. CI), so each test waits for them before the reset.
let inFlight = 0;
server.events.on("request:start", () => {
  inFlight += 1;
});
server.events.on("request:end", () => {
  inFlight = Math.max(0, inFlight - 1);
});
// Saved now: some tests fake setTimeout, and this wait must not depend on them
const realSetTimeout = globalThis.setTimeout;
const pause = (ms: number) => new Promise((resolve) => realSetTimeout(resolve, ms));

// Counts its own pauses rather than reading Date, which some tests freeze
async function waitForPendingRequests(limitMs = 3000) {
  // Nothing loading: no response can start another request
  if (!inFlight) return;
  // Twice idle in a row: a response often starts the page's next request
  for (let idle = 0, waited = 0; idle < 2 && waited < limitMs; ) {
    const ms = inFlight ? 10 : 20;
    await pause(ms);
    waited += ms;
    idle = inFlight ? 0 : idle + 1;
  }
}

// ── Next.js and heavy browser-only libraries ──────────────────────────────

vi.mock("next/navigation", () => navigationMock);

// Next-only props (fill, priority, prefetch) are dropped so React doesn't warn about them
/* eslint-disable @typescript-eslint/no-unused-vars */
vi.mock("next/image", () => ({
  default: ({ src, alt, fill: _fill, priority: _priority, ...rest }: Record<string, unknown>) =>
    React.createElement("img", { src: typeof src === "string" ? src : "", alt, ...rest }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, prefetch: _prefetch, ...rest }: Record<string, unknown>) =>
    React.createElement("a", { href: typeof href === "string" ? href : String(href), ...rest }, children as React.ReactNode),
}));

/* eslint-enable @typescript-eslint/no-unused-vars */

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

afterEach(async () => {
  cleanup();
  await waitForPendingRequests();
  server.resetHandlers();
  localStorage.clear();
  sessionStorage.clear();
  resetNavigation();
  document.documentElement.className = "";
  // Toasts and confirm dialogs live in module state (src/lib/notify.ts):
  // without this, one test's toast can satisfy the next test's assertion
  getToasts().forEach((t) => dismissToast(t.id));
  for (let c = getConfirm(); c; c = getConfirm()) answerConfirm(c.id, false);
});

afterAll(() => server.close());
