import { vi } from "vitest";

// Controllable stand-in for next/navigation (wired up in setup.ts).
// Tests change the URL with setUrl() and check router calls on `router`.

export const router = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

const state = { pathname: "/", search: new URLSearchParams(), params: {} as Record<string, string> };

/** Sets what usePathname / useSearchParams / useParams return. */
export function setUrl(url: string, params: Record<string, string> = {}) {
  const parsed = new URL(url, "http://localhost");
  state.pathname = parsed.pathname;
  state.search = parsed.searchParams;
  state.params = params;
}

export function resetNavigation() {
  setUrl("/");
  Object.values(router).forEach((fn) => fn.mockReset());
}

export const navigationMock = {
  useRouter: () => router,
  usePathname: () => state.pathname,
  useSearchParams: () => state.search,
  useParams: () => state.params,
  redirect: vi.fn(),
  notFound: vi.fn(),
};
