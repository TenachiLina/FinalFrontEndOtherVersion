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
  clearSession,
  getStoredUser,
  getToken,
  installAuthFetch,
  saveSession,
  saveUser,
} from "@/lib/auth";

// Install before any component fetches data.
installAuthFetch();

interface AuthContextValue {
  user: AuthUser | null;
  // true until the stored session has been checked with the backend
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    // Show the cached user right away, then confirm the token is still valid.
    setUser(getStoredUser());
    fetch(`${API_BASE_URL}/auth/me`)
      .then(async (res) => {
        if (res.ok) {
          const me = (await res.json()) as AuthUser;
          saveUser(me);
          setUser(me);
        } else if (res.status === 401) {
          clearSession();
          setUser(null);
        }
      })
      .catch(() => {
        /* backend unreachable: keep the cached user, requests will retry */
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      throw new Error(await readError(res, "Could not sign in"));
    }
    const data = (await res.json()) as { accessToken: string; user: AuthUser };
    saveSession(data.accessToken, data.user);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    window.location.href = "/signin";
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
