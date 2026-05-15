"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw, HardDrive } from "lucide-react";
import { useSupabase } from "@/lib/context/supabase-provider";
import { useI18n } from "@/i18n/provider";
import { computeSyncState, subscribeSyncState, type SyncState } from "@/lib/sync/status";

/**
 * Indicador compacto del estado de sincronización. Se monta en el header de Today
 * o en el chrome de la app. Cuatro estados visuales claros + tooltip.
 */
export function SyncIndicator() {
  const { mode } = useSupabase();
  const { t } = useI18n();
  const [state, setState] = useState<SyncState>("demo");

  useEffect(() => {
    const update = () => setState(computeSyncState(mode as "demo" | "online" | "offline"));
    update();
    const unsub = subscribeSyncState(update);
    // Re-check cada 30s para que "online" → "stale" se actualice
    const interval = setInterval(update, 30_000);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [mode]);

  const { icon, label, tone, pulse } = (() => {
    switch (state) {
      case "online":
        return { icon: <Cloud className="w-3.5 h-3.5" />, label: t.sync.synced, tone: "text-success", pulse: true };
      case "stale":
        return { icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: "1.6s" }} />, label: t.sync.syncing, tone: "text-warning", pulse: false };
      case "offline":
        return { icon: <CloudOff className="w-3.5 h-3.5" />, label: t.sync.offline, tone: "text-muted-foreground", pulse: false };
      case "demo":
      default:
        return { icon: <HardDrive className="w-3.5 h-3.5" />, label: t.sync.local, tone: "text-muted-foreground", pulse: false };
    }
  })();

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-semibold ${tone}`}
      title={
        state === "demo"
          ? t.sync.tooltips.local
          : state === "online"
          ? t.sync.tooltips.synced
          : state === "stale"
          ? t.sync.tooltips.syncing
          : t.sync.tooltips.offline
      }
      aria-label={`${t.sync.ariaLabel}: ${label}`}
      role="status"
    >
      {pulse ? (
        <span className="pulse-dot w-1.5 h-1.5 rounded-full bg-current text-success" aria-hidden />
      ) : (
        icon
      )}
      <span>{label}</span>
    </span>
  );
}
