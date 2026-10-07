"use client";

import { useCallback, useEffect, useState } from "react";
import { applyTheme, isTheme, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : "system";
  } catch {
    return "system"; // storage blocked
  }
}

/** Current theme preference plus a setter that persists it. Defaults to following the OS. */
export function useTheme() {
  // Safe to read storage during init: no markup depends on `theme` (icons are CSS-driven),
  // so server and client HTML cannot disagree.
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  // While following the OS, react to OS theme changes.
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // storage blocked: the choice still applies for this page view
    }
  }, []);

  return { theme, setTheme };
}
