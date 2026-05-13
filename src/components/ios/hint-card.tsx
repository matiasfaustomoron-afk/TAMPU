"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Lightbulb, Sparkles, AlertTriangle, ArrowRight } from "lucide-react";
import { HINTS, isDismissed, dismiss } from "@/lib/hints/registry";

/**
 * <HintCard /> — Card de consejo contextual estilo Wanderlog.
 *
 * Aparece en empty states o en discovery moments. El user puede:
 *  - Tocar el CTA → navega y disuelve el hint con animación
 *  - Tocar X → marca dismissed para siempre (no aparece más)
 *
 * Estilo:
 *  - Slide-up entry con stagger según `delay`.
 *  - Fade-out smooth al dismiss.
 *  - Card sin fricción visual — terracota muy suave + amarillo cálido (no
 *    el azul SaaS de Wanderlog/Linear).
 */
export function HintCard({
  hintId,
  delay = 0,
  className = "",
}: {
  hintId: string;
  delay?: number;
  className?: string;
}) {
  const hint = HINTS[hintId];
  const [dismissed, setDismissedState] = useState<boolean | null>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    setDismissedState(isDismissed(hintId));
    const onChange = () => setDismissedState(isDismissed(hintId));
    window.addEventListener("tampu-hints-change", onChange);
    return () => window.removeEventListener("tampu-hints-change", onChange);
  }, [hintId]);

  if (!hint || dismissed === null || dismissed) return null;

  const handleDismiss = () => {
    setExiting(true);
    // Wait for exit anim then commit dismissal.
    setTimeout(() => dismiss(hintId), 280);
  };

  const Icon = hint.tone === "warn" ? AlertTriangle : hint.tone === "feature" ? Sparkles : Lightbulb;
  const accent =
    hint.tone === "warn" ? "tampu-icon tampu-icon-carmin" :
    hint.tone === "feature" ? "tampu-icon tampu-icon-mostaza" :
    "tampu-icon tampu-icon-cardon";

  return (
    <div
      className={`tampu-hint-card ${exiting ? "tampu-hint-exit" : "tampu-hint-enter"} ${className}`}
      style={{ animationDelay: `${delay}ms` }}
      role="status"
      aria-label={hint.title}
    >
      <div className="ios-card p-4 relative overflow-hidden">
        {/* Decorative gradient corner */}
        <span
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-8 w-28 h-28 rounded-full opacity-40"
          style={{
            background:
              hint.tone === "feature"
                ? "radial-gradient(circle, oklch(0.78 0.13 78 / 0.55), transparent 70%)"
                : "radial-gradient(circle, oklch(0.72 0.14 38 / 0.45), transparent 70%)",
          }}
        />

        <div className="relative flex items-start gap-3">
          <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
            <Icon className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {hint.tone === "feature" ? "Consejo · feature" : hint.tone === "warn" ? "Atención" : "Consejo"}
            </p>
            <p className="text-[15px] font-semibold leading-tight mt-1">{hint.title}</p>
            <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{hint.body}</p>
            {hint.cta && (
              <Link
                href={hint.cta.href}
                onClick={() => dismiss(hintId)}
                className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary pressable"
              >
                {hint.cta.label}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="shrink-0 -mr-1 -mt-1 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-all pressable"
            aria-label="Descartar consejo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
