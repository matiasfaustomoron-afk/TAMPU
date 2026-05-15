"use client";

import { useEffect, useState, useCallback } from "react";
import { Check, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import { useI18n } from "@/i18n/provider";

type ToastKind = "success" | "warn" | "info" | "error";

interface ToastItem {
  id: string;
  message: string;
  kind: ToastKind;
}

// ─── Imperative API — fire-and-forget from anywhere ───
// We use a window event so non-React code can dispatch toasts too.
export function toast(message: string, kind: ToastKind = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("travel-os-toast", { detail: { message, kind } })
  );
}

// ─── Mounted at app root to render the queue ───
export function ToastHost() {
  const { t: dict } = useI18n();
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string; kind: ToastKind }>).detail;
      if (!detail) return;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const item: ToastItem = { id, message: detail.message, kind: detail.kind };
      setItems((prev) => [...prev, item]);
      // auto-dismiss
      const timeout = detail.kind === "error" ? 4500 : 2400;
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, timeout);
    };
    window.addEventListener("travel-os-toast", handler);
    return () => window.removeEventListener("travel-os-toast", handler);
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-0 right-0 z-[110] flex flex-col items-center gap-2 pointer-events-none px-4"
      style={{ bottom: "calc(80px + env(safe-area-inset-bottom))" }}
    >
      {items.map((t) => {
        const Icon = t.kind === "success" ? Check : t.kind === "warn" ? AlertTriangle : t.kind === "error" ? AlertTriangle : Info;
        // Paleta tierra Tampu — éxito=cardón, warn=mostaza, error=carmín, info=tinta tierra.
        const tint =
          t.kind === "success" ? "bg-success/95 text-white" :
          t.kind === "warn"    ? "bg-warning/95 text-white" :
          t.kind === "error"   ? "bg-destructive/95 text-white" :
                                 "bg-foreground/90 text-background";
        return (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto inline-flex items-center gap-2.5 pl-4 pr-2 py-3 rounded-2xl shadow-[0_8px_24px_rgba(48,26,13,0.25),0_2px_4px_rgba(48,26,13,0.12)] backdrop-blur-md max-w-md",
              tint
            )}
            style={{
              animation: "tampu-toast-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            <Icon className="w-4 h-4 shrink-0" strokeWidth={2.5} aria-hidden />
            <span className="text-[13.5px] font-medium leading-snug flex-1">{t.message}</span>
            {/* Dismiss button — iOS HIG mínimo 44x44pt; el icon en sí es chico pero el
                target es 44x44 por padding. */}
            <button
              onClick={() => dismiss(t.id)}
              className="pressable opacity-80 hover:opacity-100 shrink-0 w-11 h-11 -my-2 -mr-1 flex items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              aria-label={dict.common.close}
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
