"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw, HardDrive } from "lucide-react";
import { useSupabase } from "@/lib/context/supabase-provider";
import { computeSyncState, subscribeSyncState, type SyncState } from "@/lib/sync/status";

/**
 * Indicador compacto del estado de sincronización. Se monta en el header de Today
 * o en el chrome de la app. Cuatro estados visuales claros + tooltip.
 */
export function SyncIndicator() {
  const { mode } = useSupabase();
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
        return { icon: <Cloud className="w-3.5 h-3.5" />, label: "Sincronizado", tone: "text-success", pulse: true };
      case "stale":
        return { icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: "1.6s" }} />, label: "Sincronizando…", tone: "text-warning", pulse: false };
      case "offline":
        return { icon: <CloudOff className="w-3.5 h-3.5" />, label: "Sin conexión", tone: "text-muted-foreground", pulse: false };
      case "demo":
      default:
        return { icon: <HardDrive className="w-3.5 h-3.5" />, label: "Local", tone: "text-muted-foreground", pulse: false };
    }
  })();

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-semibold ${tone}`}
      title={
        state === "demo"
          ? "Tus datos viven solo en este dispositivo (modo demo)"
          : state === "online"
          ? "Tus datos están sincronizados con la nube"
          : state === "stale"
          ? "Refrescando datos de la nube"
          : "Sin red — los cambios se guardan local y suben cuando vuelva conexión"
      }
      aria-label={`Estado de sincronización: ${label}`}
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
