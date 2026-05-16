"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { configureNativeChrome, onAppForeground, onDeepLink } from "@/lib/native/platform";
import { maybeAutoBackup } from "@/lib/backup-icloud";
import { consumePendingShare } from "@/lib/native/share-extension";
import { migrateIndexedDbToSqlite } from "@/lib/vault/sqlite-backend";
import { Capacitor } from "@capacitor/core";

// Bootstraps native APIs (status bar, splash hide, deep links) on app mount.
// Safe on web: no-ops when running outside Capacitor.
//
// Perf (mayo 2026): el trabajo se separa en dos fases para no atrasar TTI:
//   1) Crítico/inmediato: status bar + splash hide + listeners (foreground / deep link).
//      El usuario debe poder ver e interactuar con la primera vista YA.
//   2) Diferido a idle: cold-share check, migración SQLite, auto-backup.
//      Son one-shot/idempotentes — pueden esperar 200-500ms sin que el user
//      lo note. Antes corrían todos en el await chain inicial.

// requestIdleCallback con fallback. iOS Safari/WKWebView puede no soportarlo
// en versiones viejas → caemos a setTimeout (50ms = "yield al menos 1 frame").
function runIdle(cb: () => void): void {
  if (typeof window === "undefined") return;
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (typeof ric === "function") {
    ric(cb, { timeout: 2000 });
  } else {
    setTimeout(cb, 50);
  }
}

export function NativeBootstrap() {
  const router = useRouter();

  useEffect(() => {
    let unsubForeground: (() => void) | null = null;
    let unsubLink: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      // ─── Fase 1: crítico. Status bar + splash hide + listeners. ──────────
      await configureNativeChrome();
      if (cancelled) return;

      unsubForeground = await onAppForeground(() => {
        router.refresh();
        // Re-evaluar auto-backup cuando vuelve a foreground.
        runIdle(() => {
          maybeAutoBackup(24).catch(() => { /* silent */ });
        });
      });
      unsubLink = await onDeepLink(async (url) => {
        try {
          const u = new URL(url);
          const path = u.pathname || "/";

          // Caso especial: tampu://import-shared → leer App Group + ir a /import
          if (path === "/import-shared" || u.host === "import-shared") {
            const payload = await consumePendingShare();
            if (payload && payload.text) {
              try {
                sessionStorage.setItem("tampu-pending-share-text", payload.text);
              } catch { /* ignore */ }
            }
            router.push("/import?from=share");
            return;
          }

          router.push(path);
        } catch { /* ignore malformed */ }
      });

      if (cancelled) return;

      // ─── Fase 2: diferido a idle. Migration + backup + cold-share check. ─
      runIdle(() => {
        if (cancelled) return;

        // Migración one-shot vault IndexedDB → SQLite (idempotente).
        if (Capacitor.isNativePlatform()) {
          migrateIndexedDbToSqlite()
            .then((r) => {
              if (r.migrated > 0) console.info(`[tampu] vault migrated to SQLite: ${r.migrated} files`);
            })
            .catch((err) => console.warn("[tampu] vault migration failed:", err));
        }

        // Auto-backup a iCloud Drive si pasaron >24h.
        maybeAutoBackup(24).then((r) => {
          if (r.ran) console.info("[tampu] auto-backup OK →", r.reason);
        }).catch(() => { /* silent */ });

        // Cold-start share extension consumption — para el caso en que la app
        // se abrió desde share con la app completamente cerrada (no hay deep
        // link event). Mover esto a idle es seguro: si hay pending share el
        // navigate sucede en <500ms del paint, imperceptible.
        consumePendingShare().then((cold) => {
          if (cancelled) return;
          if (cold && cold.text) {
            try {
              sessionStorage.setItem("tampu-pending-share-text", cold.text);
            } catch { /* ignore */ }
            router.push("/import?from=share");
          }
        }).catch(() => { /* silent */ });
      });
    })();

    return () => {
      cancelled = true;
      unsubForeground?.();
      unsubLink?.();
    };
  }, [router]);

  return null;
}
