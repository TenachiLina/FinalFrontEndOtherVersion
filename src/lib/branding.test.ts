import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { API, server } from "@/test/server";

const searchParams = { value: new URLSearchParams() };
vi.mock("next/navigation", () => ({ useSearchParams: () => searchParams.value }));

type Module = typeof import("./branding");

// Branding responses are cached per page load: use a fresh module per test
let mod: Module;
let calls: string[];

beforeEach(async () => {
  vi.resetModules();
  mod = await import("./branding");
  searchParams.value = new URLSearchParams();
  calls = [];
  server.use(
    http.get(`${API}/branding/:slug`, ({ params }) => {
      calls.push(String(params.slug));
      if (params.slug === "missing") return new HttpResponse(null, { status: 404 });
      if (params.slug === "offline") return HttpResponse.error();
      return HttpResponse.json({ name: "Pizza Roma", slug: params.slug, branding: { color: "#f00" } });
    })
  );
});

describe("remembered company", () => {
  it("stores and reads the slug", () => {
    expect(mod.getRememberedSlug()).toBeNull();
    mod.rememberCompanySlug("roma");
    mod.rememberCompanySlug(null);
    mod.rememberCompanySlug(undefined);
    expect(mod.getRememberedSlug()).toBe("roma");
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => mod.rememberCompanySlug("roma")).not.toThrow();
    expect(mod.getRememberedSlug()).toBeNull();
  });

  it("signInPathFor encodes the slug", () => {
    expect(mod.signInPathFor("a b&c")).toBe("/signin?company=a%20b%26c");
    expect(mod.signInPathFor(null)).toBe("/signin");
  });
});

describe("displayBrand", () => {
  it("uses the product look without a company", () => {
    expect(mod.displayBrand(null)).toEqual({
      name: mod.DEFAULT_BRAND.name,
      logo: mod.DEFAULT_BRAND.logo,
      title: mod.DEFAULT_BRAND.title,
      subtitle: mod.DEFAULT_BRAND.subtitle,
      color: mod.DEFAULT_BRAND.color,
    });
  });

  it("uses the company's values, with sensible fallbacks", () => {
    expect(mod.displayBrand({ name: "Roma", slug: "roma", branding: {} })).toEqual({
      name: "Roma",
      logo: mod.DEFAULT_BRAND.logo,
      title: "Roma",
      subtitle: "",
      color: mod.DEFAULT_BRAND.color,
    });
    expect(
      mod.displayBrand({
        name: "Roma",
        slug: "roma",
        branding: { logo: "/r.png", title: "Roma HQ", subtitle: "Since 1990", color: "#123" },
      })
    ).toEqual({ name: "Roma", logo: "/r.png", title: "Roma HQ", subtitle: "Since 1990", color: "#123" });
  });
});

describe("useSignInBrand", () => {
  it("is ready with no brand when no company is known", async () => {
    const { result } = renderHook(() => mod.useSignInBrand());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.brand).toBeNull();
    expect(calls).toEqual([]);
  });

  it("loads the company from the URL", async () => {
    searchParams.value = new URLSearchParams("company=roma");
    const { result } = renderHook(() => mod.useSignInBrand());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.brand).toMatchObject({ name: "Pizza Roma" });
  });

  it("falls back to the company last used on this browser", async () => {
    mod.rememberCompanySlug("last-one");
    const { result } = renderHook(() => mod.useSignInBrand());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(calls).toEqual(["last-one"]);
  });

  it("asks the server once per company", async () => {
    searchParams.value = new URLSearchParams("company=roma");
    const a = renderHook(() => mod.useSignInBrand());
    const b = renderHook(() => mod.useSignInBrand());
    await waitFor(() => expect(a.result.current.ready && b.result.current.ready).toBe(true));
    expect(calls).toEqual(["roma"]);
  });

  it.each(["missing", "offline"])("shows the default look when the company is %s", async (slug) => {
    searchParams.value = new URLSearchParams(`company=${slug}`);
    const { result } = renderHook(() => mod.useSignInBrand());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.brand).toBeNull();
  });

  // BUG-008: a failed request is cached as "no company" until the page is reloaded
  it("tries again after a network failure", async () => {
    server.use(http.get(`${API}/branding/flaky`, () => HttpResponse.error(), { once: true }));
    searchParams.value = new URLSearchParams("company=flaky");
    const first = renderHook(() => mod.useSignInBrand());
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    const second = renderHook(() => mod.useSignInBrand());
    await waitFor(() => expect(second.result.current.brand).toMatchObject({ name: "Pizza Roma" }));
  });

  it("ignores a response that arrives after unmount", async () => {
    searchParams.value = new URLSearchParams("company=roma");
    const { unmount, result } = renderHook(() => mod.useSignInBrand());
    unmount();
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.ready).toBe(false);
  });
});
