"use client";

/**
 * Tampu — Sync status tracking.
 *
 * Mantiene un estado global del último sync exitoso vs ahora. Tres niveles:
 *  - 'online'   → Supabase OK, último sync hace < 60s
 *  - 'stale'    → Supabase OK pero último sync hace > 60s (pendiente refresh)
 *  - 'offline'  → sin Supabase config o sin red
 *  - 'demo'     → modo demo standalone, no aplica
 *
 * Eventos:
 *  - `tampu-sync-ok`  ← dispatcheado cuando una mutation Supabase fue exitosa
 *  - `tampu-sync-error` ← cuando algo falló
 *
 * UI consumidora: `<SyncIndicator />` y `<DataStatusCard />`.
 */

const LAST_SYNC_KEY = "tampu-last-sync-at";

export type SyncState = "online" | "stale" | "offline" | "demo";

export function recordSyncSuccess(): void {
  if (typeof window === "undefined") return;
  const now = new Date().toISOString();
  try {
    localStorage.setItem(LAST_SYNC_KEY, now);
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("tampu-sync-ok", { detail: { at: now } }));
}

export function recordSyncError(err: unknown): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("tampu-sync-error", {
      detail: { at: new Date().toISOString(), message: err instanceof Error ? err.message : String(err) },
    })
  );
}

export function getLastSyncISO(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

/**
 * Compute current sync state based on:
 *  - mode ('demo' | 'online' | 'offline')
 *  - online navegador (`navigator.onLine`)
 *  - last sync timestamp
 */
export function computeSyncState(mode: "demo" | "online" | "offline"): SyncState {
  if (mode === "demo") return "demo";
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
  if (mode === "offline") return "offline";

  const last = getLastSyncISO();
  if (!last) return "stale";
  const elapsed = Date.now() - Date.parse(last);
  return elapsed < 60_000 ? "online" : "stale";
}

/**
 * Subscribe a cambios de sync. Devuelve un unsubscribe.
 */
export function subscribeSyncState(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener("tampu-sync-ok", handler);
  window.addEventListener("tampu-sync-error", handler);
  window.addEventListener("online", handler);
  window.addEventListener("offline", handler);
  return () => {
    window.removeEventListener("tampu-sync-ok", handler);
    window.removeEventListener("tampu-sync-error", handler);
    window.removeEventListener("online", handler);
    window.removeEventListener("offline", handler);
  };
}
