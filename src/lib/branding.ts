"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { API_BASE_URL } from "@/lib/config";
import { t } from "@/lib/i18n";

export interface Branding {
  logo?: string;
  title?: string;
  subtitle?: string;
  color?: string;
}

export interface CompanyBrand {
  name: string;
  slug: string | null;
  branding: Branding;
}

// The product's own look, used when no company is known.
export const DEFAULT_BRAND = {
  name: "Nexo InOuty",
  logo: "/images/logo/King.png",
  title: "Nexo InOuty",
  subtitle: "Planning, clock-in and payroll for your team.",
  color: "#161950",
};

const LAST_SLUG_KEY = "last_company_slug";

/** Remembers which company signed in on this browser, so /signin shows its look. */
export function rememberCompanySlug(slug: string | null | undefined) {
  try {
    if (slug) localStorage.setItem(LAST_SLUG_KEY, slug);
  } catch {
    /* storage unavailable */
  }
}

export function getRememberedSlug(): string | null {
  try {
    return localStorage.getItem(LAST_SLUG_KEY);
  } catch {
    return null;
  }
}

export function signInPathFor(slug: string | null | undefined) {
  return slug ? `/signin?company=${encodeURIComponent(slug)}` : "/signin";
}

// One request per slug, shared by the panel and the form.
const cache = new Map<string, Promise<CompanyBrand | null>>();

function fetchBrand(slug: string): Promise<CompanyBrand | null> {
  if (!cache.has(slug)) {
    cache.set(
      slug,
      fetch(`${API_BASE_URL}/branding/${encodeURIComponent(slug)}`)
        .then((res) => (res.ok ? (res.json() as Promise<CompanyBrand>) : null))
        .catch(() => null)
    );
  }
  return cache.get(slug)!;
}

/**
 * The company whose sign-in page this is: ?company=<slug> in the URL, else the
 * company last used on this browser. Null means the default product look.
 * Must be used inside a <Suspense> boundary (it reads the URL).
 */
export function useSignInBrand(): { brand: CompanyBrand | null; ready: boolean } {
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get("company");
  const [state, setState] = useState<{ brand: CompanyBrand | null; ready: boolean }>({
    brand: null,
    ready: false,
  });

  useEffect(() => {
    const slug = fromUrl || getRememberedSlug();
    let cancelled = false;
    (slug ? fetchBrand(slug) : Promise.resolve(null)).then((brand) => {
      if (!cancelled) setState({ brand, ready: true });
    });
    return () => {
      cancelled = true;
    };
  }, [fromUrl]);

  return state;
}

/** Resolved values to display, falling back to the product's own look. */
export function displayBrand(brand: CompanyBrand | null) {
  const b = brand?.branding ?? {};
  return {
    name: brand?.name ?? DEFAULT_BRAND.name,
    logo: b.logo || DEFAULT_BRAND.logo,
    title: b.title || brand?.name || DEFAULT_BRAND.title,
    subtitle: b.subtitle ?? (brand ? "" : t(DEFAULT_BRAND.subtitle)),
    color: b.color || DEFAULT_BRAND.color,
  };
}
