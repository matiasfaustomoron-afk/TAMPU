"use client";
import { useSyncExternalStore, useCallback } from "react";

export type Theme = "light" | "dark" | "system";
const STORAGE_KEY = "tampu-theme";
const LEGACY_KEY = "travel-os-theme";
const CHANGE_EVENT = "tampu-theme-change";

// One-time migration: si quedan datos del key legacy (travel-os-theme) y el
// nuevo (tampu-theme) no existe todavía, copiá el valor y borrá el legacy.
// El boot script en layout.tsx ya lee ambos para evitar FOUC durante la
// transición, así que esta migración cierra el círculo client-side.
function migrateLegacyKey(): void {
  if (typeof localStorage === "undefined") return;
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy && !current) localStorage.setItem(STORAGE_KEY, legacy);
    if (legacy) localStorage.removeItem(LEGACY_KEY);
  } catch { /* ignore */ }
}

function getServerSnapshot(): Theme {
  return "dark";
}

function getSnapshot(): Theme {
  try {
    migrateLegacyKey();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch { /* ignore */ }
  return "dark";
}

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => { if (e.key === STORAGE_KEY || e.key === LEGACY_KEY) cb(); };
  window.addEventListener("storage", handler);
  window.addEventListener(CHANGE_EVENT, cb);
  // Mantener listener al evento legacy por si algún sitio externo aún lo dispara.
  window.addEventListener("travel-os-theme-change", cb);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(CHANGE_EVENT, cb);
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
    try {
      localStorage.setItem(STORAGE_KEY, t);
      // Limpiar legacy si quedó pegado.
      localStorage.removeItem(LEGACY_KEY);
    } catch { /* ignore */ }
    applyTheme(t);
    // Notify same-tab listeners (storage event only fires for OTHER tabs)
    if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { theme, setTheme };
}
