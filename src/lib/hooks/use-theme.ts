"use client";
import { useSyncExternalStore, useCallback } from "react";

export type Theme = "light" | "dark" | "system";
const STORAGE_KEY = "travel-os-theme";

function getServerSnapshot(): Theme {
  return "dark";
}

function getSnapshot(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch { /* ignore */ }
  return "dark";
}

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => { if (e.key === STORAGE_KEY) cb(); };
  window.addEventListener("storage", handler);
  window.addEventListener("travel-os-theme-change", cb);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("travel-os-theme-change", cb);
  };
}

function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isDark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((t: Theme) => {
    try { localStorage.setItem(STORAGE_KEY, t); } catch { /* ignore */ }
    applyTheme(t);
    // Notify same-tab listeners (storage event only fires for OTHER tabs)
    if (typeof window !== "undefined") window.dispatchEvent(new Event("travel-os-theme-change"));
  }, []);

  return { theme, setTheme };
}
