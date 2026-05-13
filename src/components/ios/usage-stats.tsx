"use client";

import { useState } from "react";
import { summarize, clearEvents } from "@/lib/analytics";
import { Activity, X } from "lucide-react";

export function UsageStats() {
  // Lazy initializer — computed once on mount, no effect, no setState in effect
  const [stats, setStats] = useState(() => summarize());

  if (stats.length === 0) {
    return (
      <div className="ios-card p-4">
        <p className="text-[13px] text-muted-foreground flex items-center gap-2">
          <Activity className="w-4 h-4" /> Todavía no hay actividad. Cargá un gasto o creá un viaje y volvé.
        </p>
        <p className="text-[10px] text-muted-foreground/70 mt-2">
          Local-only · solo este dispositivo, sin telemetría externa.
        </p>
      </div>
    );
  }

  const total = stats.reduce((s, e) => s + e.count, 0);

  return (
    <div className="ios-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" /> Mi uso
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {total} acciones · local, sin telemetría
          </p>
        </div>
        <button
          onClick={() => { clearEvents(); setStats([]); }}
          className="pressable text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1"
        >
          <X className="w-3 h-3" /> Limpiar
        </button>
      </div>
      <div className="px-1 py-1 max-h-80 overflow-y-auto">
        {stats.slice(0, 20).map(s => (
          <div key={s.name} className="px-3 py-2 flex items-center gap-3">
            <span className="text-[13px] font-medium flex-1 truncate">{s.name}</span>
            <span className="text-[11px] text-muted-foreground">
              {new Date(s.lastTs).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
            </span>
            <span className="text-[14px] font-bold tabular-nums w-8 text-right">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
