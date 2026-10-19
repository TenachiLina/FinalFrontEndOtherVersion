"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { API_BASE_URL } from "@/lib/config";
import {
  AuthUser,
  CompanyInfo,
  clearSession,
  getStoredCompany,
  getStoredUser,
  getToken,
  installAuthFetch,
  saveIdentity,
  saveSession,
  setActingCompanyId,
} from "@/lib/auth";
import { applyCompanySettings } from "@/lib/payrollConfig";
import { applyDefaultLang } from "@/lib/i18n";
import { getRememberedSlug, rememberCompanySlug, signInPathFor } from "@/lib/branding";

// Install before any component fetches data.
installAuthFetch();

interface AuthContextValue {
  user: AuthUser | null;
  // The company being worked in (null for a super admin who hasn't picked one)
  company: CompanyInfo | null;
  // true until the stored session has been checked with the backend
  loading: boolean;
  login: (
    email: string,
    password: string
  ) => Promise<{ user: AuthUser; company: CompanyInfo | null }>;
  logout: () => void;
  /** Super admin: start or stop working inside a company. Reloads the app. */
  switchCompany: (companyId: string | null) => void;
  /** Re-reads the company after its settings changed. */
  refreshCompany: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body?.message) return String(body.message);
  } catch {
    /* not JSON */
  }
  return fallback;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [company, setCompanyState] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const setIdentity = useCallback(
    (u: AuthUser | null, c: CompanyInfo | null) => {
      if (u) saveIdentity(u, c);
      if (c) applyCompanySettings(c.settings);
      if (c) applyDefaultLang(c.settings.language);
      // A super admin opening companies shouldn't change this browser's sign-in look.
      if (c && u?.role !== "superadmin") rememberCompanySlug(c.slug);
      setUser(u);
      setCompanyState(c);
    },
    []
  );

  const loadMe = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/auth/me`);
    if (res.ok) {
      const me = (await res.json()) as {
        user: AuthUser;
        company: CompanyInfo | null;
      };
      setIdentity(me.user, me.company);
    } else if (res.status === 401) {
      clearSession();
      setIdentity(null, null);
    } else if (res.status === 403) {
      // e.g. the company a super admin was working in no longer exists
      setActingCompanyId(null);
    }
  }, [setIdentity]);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    // Show the cached identity right away, then confirm it with the backend.
    const cachedUser = getStoredUser();
    setIdentity(cachedUser, cachedUser ? getStoredCompany() : null);
    loadMe()
      .catch(() => {
        /* backend unreachable: keep the cached identity, requests will retry */
      })
      .finally(() => setLoading(false));
  }, [loadMe, setIdentity]);

  const login = useCallback(
    async (email: string, password: string) => {
      setActingCompanyId(null);
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        throw new Error(await readError(res, "Could not sign in"));
      }
      const data = (await res.json()) as {
        accessToken: string;
        user: AuthUser;
        company: CompanyInfo | null;
      };
      saveSession(data.accessToken, data.user, data.company);
      setIdentity(data.user, data.company);
      return { user: data.user, company: data.company };
    },
    [setIdentity]
  );

  const logout = useCallback(() => {
    clearSession();
    setIdentity(null, null);
    window.location.href = signInPathFor(getRememberedSlug());
  }, [setIdentity]);

  const switchCompany = useCallback((companyId: string | null) => {
    setActingCompanyId(companyId);
    // A full reload makes every page refetch its data for the new company.
    window.location.href = companyId ? "/" : "/companies";
  }, []);

  const refreshCompany = useCallback(async () => {
    await loadMe();
  }, [loadMe]);

  return (
    <AuthContext.Provider
      value={{
        user,
        company,
        loading,
        login,
        logout,
        switchCompany,
        refreshCompany,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
