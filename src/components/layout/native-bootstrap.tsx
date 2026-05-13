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

export function NativeBootstrap() {
  const router = useRouter();

  useEffect(() => {
    let unsubForeground: (() => void) | null = null;
    let unsubLink: (() => void) | null = null;

    (async () => {
      await configureNativeChrome();

      // Migración one-shot del vault IndexedDB → SQLite en nativo. Idempotente.
      // Solo migra blobs que aún no estén en SQLite, y luego no hace nada en
      // arranques siguientes (skipped=N, migrated=0).
      if (Capacitor.isNativePlatform()) {
        migrateIndexedDbToSqlite()
          .then((r) => {
            if (r.migrated > 0) console.info(`[tampu] vault migrated to SQLite: ${r.migrated} files`);
          })
          .catch((err) => console.warn("[tampu] vault migration failed:", err));
      }

      // Auto-backup a iCloud Drive si pasaron >24h desde el último (solo iOS/Android).
      // No bloquea el render: corre en idle. Si está en web, retorna inmediatamente.
      maybeAutoBackup(24).then((r) => {
        if (r.ran) console.info("[tampu] auto-backup OK →", r.reason);
      }).catch(() => { /* silent */ });

      unsubForeground = await onAppForeground(() => {
        // Refresh server-data hooks when the app comes back to foreground
        router.refresh();
        // Re-evaluar auto-backup cuando vuelve a foreground (caso: usuario abre la app
        // después de varios días sin haberla cerrado del todo).
        maybeAutoBackup(24).catch(() => { /* silent */ });
      });
      unsubLink = await onDeepLink(async (url) => {
        // tampu://path → navigate within app
        try {
          const u = new URL(url);
          const path = u.pathname || "/";

          // Caso especial: tampu://import-shared → leer App Group + ir a /import
          if (path === "/import-shared" || u.host === "import-shared") {
            const payload = await consumePendingShare();
            if (payload && payload.text) {
              // Pasar el texto via sessionStorage para que /import lo recoja.
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

      // Si la app abrió en cold-start después del share extension, también
      // hay que consumir el pending share. (En iOS el deep link puede no
      // dispararse si la app estaba completamente cerrada — chequear acá.)
      const cold = await consumePendingShare();
      if (cold && cold.text) {
        try {
          sessionStorage.setItem("tampu-pending-share-text", cold.text);
        } catch { /* ignore */ }
        router.push("/import?from=share");
      }
    })();

    return () => {
      unsubForeground?.();
      unsubLink?.();
    };
  }, [router]);

  return null;
}
