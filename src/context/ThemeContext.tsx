"use client";

import type React from "react";
import { createContext, useState, useContext, useEffect } from "react";

type Theme = "light" | "dark";

type ThemeContextType = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const FALLBACK_MS = 400;

/**
 * Runs `apply` (which flips the dark class) with a smooth transition:
 * - browsers with the View Transitions API cross-fade the whole page
 *   (timing in globals.css, ::view-transition-*)
 * - others fade colours via the temporary .theme-transition class
 * - people who ask for reduced motion get the instant switch
 */
function switchThemeSmoothly(apply: () => void) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    apply();
    return;
  }
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => unknown;
  };
  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(apply);
    return;
  }
  const root = document.documentElement;
  root.classList.add("theme-transition");
  apply();
  window.setTimeout(() => root.classList.remove("theme-transition"), FALLBACK_MS);
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [theme, setTheme] = useState<Theme>("light");
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // This code will only run on the client side
    const savedTheme = localStorage.getItem("theme") as Theme | null;
    const initialTheme = savedTheme || "light"; // Default to light theme

    setTheme(initialTheme);
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem("theme", theme);
      if (theme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, [theme, isInitialized]);

  const toggleTheme = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    const apply = () => {
      document.documentElement.classList.toggle("dark", next === "dark");
      setTheme(next);
    };
    switchThemeSmoothly(apply);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
