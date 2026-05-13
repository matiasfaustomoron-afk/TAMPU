"use client";

import { useEffect, useState } from "react";
import { getPinnedViews, togglePinnedView, PINNABLE, type PinnableKey } from "@/lib/pinned-views";
import { Pin, PinOff } from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import { haptic } from "@/lib/native/platform";

export function PinnedViewsManager() {
  const [pinned, setPinned] = useState<PinnableKey[]>([]);

  useEffect(() => {
    const sync = () => setPinned(getPinnedViews());
    sync();
    window.addEventListener("travel-os-pinned-change", sync);
    return () => window.removeEventListener("travel-os-pinned-change", sync);
  }, []);

  const toggle = (key: PinnableKey) => {
    haptic("light");
    togglePinnedView(key);
  };

  return (
    <div className="ios-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border/60">
        <p className="text-[13px] font-semibold">Tus vistas principales</p>
        <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
          Elegí qué módulos aparecen directo en Hoy. Tocá para fijar / soltar.
        </p>
      </div>
      <div>
        {PINNABLE.map(m => {
          const isPinned = pinned.includes(m.key);
          return (
            <button
              key={m.key}
              onClick={() => toggle(m.key)}
              className="pressable w-full ios-list-row text-left"
            >
              <span className={cn(
                "w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0",
                isPinned ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                {isPinned ? <Pin className="w-4 h-4" /> : <PinOff className="w-4 h-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-medium leading-tight">{m.label}</p>
                <p className="text-[12px] text-muted-foreground leading-tight mt-0.5">{m.description}</p>
              </div>
              <span className={cn(
                "text-[11px] font-semibold uppercase tracking-wider",
                isPinned ? "text-primary" : "text-muted-foreground/60"
              )}>
                {isPinned ? "Fijado" : "Soltar"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
