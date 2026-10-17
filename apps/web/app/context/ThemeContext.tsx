"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = "nexus-theme";

const defaultContext: ThemeContextType = {
  theme: "dark",
  resolvedTheme: "dark",
  toggleTheme: () => {},
  setTheme: () => {},
};

const ThemeContext = createContext<ThemeContextType>(defaultContext);

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "dark";
}

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.setAttribute("data-theme", resolved);
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");
  // Tracks whether the stored preference has been adopted. Until it has, the
  // apply/write effect must stay inert, otherwise its mount run would persist the
  // hard-coded initial "dark" over the user's saved choice.
  const [adopted, setAdopted] = useState(false);

  // Adopt the value the pre-paint script already applied to avoid a flash.
  //
  // Both effects below read client-only sources (localStorage and the OS
  // colour-scheme preference). Neither can move into render without breaking
  // SSR: the server has neither, so initialising from them would desynchronise
  // the server HTML and the first client render.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = readStoredTheme();
    setThemeState(stored);
    setResolvedTheme(stored === "system" ? systemTheme() : stored);
    setAdopted(true);
  }, []);

  useEffect(() => {
    if (!adopted) return;
    const resolved: ResolvedTheme = theme === "system" ? systemTheme() : theme;
    setResolvedTheme(resolved);
    applyTheme(resolved);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme, adopted]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Track OS changes while "system" is active.
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setResolvedTheme(systemTheme());
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const toggleTheme = () => {
    setThemeState((prev) => {
      const current = prev === "system" ? systemTheme() : prev;
      return current === "dark" ? "light" : "dark";
    });
  };

  const setTheme = (newTheme: Theme) => setThemeState(newTheme);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
