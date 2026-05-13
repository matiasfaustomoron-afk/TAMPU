"use client";

import { useEffect, useState, useRef } from "react";

/**
 * useCountUp — anima un valor numérico desde 0 (o `from`) hasta `target`.
 *
 * Easing: cubic-out (start fast, slow at end — feel premium).
 * Duración default: 900ms. Para porcentajes 0-100 está calibrado para
 * "se siente vivo pero no lento".
 *
 * Respeta `prefers-reduced-motion`: si el user lo tiene activado, devuelve
 * `target` instantáneo.
 *
 * Re-anima cuando `target` cambia. Si target === valor actual, no reanima.
 */
export function useCountUp(
  target: number,
  opts?: { from?: number; durationMs?: number; decimals?: number; enabled?: boolean },
): number {
  const duration = opts?.durationMs ?? 900;
  const from = opts?.from ?? 0;
  const decimals = opts?.decimals ?? 0;
  const enabled = opts?.enabled ?? true;
  const [value, setValue] = useState<number>(enabled ? from : target);
  const rafRef = useRef<number | null>(null);
  const lastTargetRef = useRef<number>(target);

  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }
    // Reduced motion → instant
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }

    // Skip if already at target
    if (Math.abs(target - lastTargetRef.current) < Math.pow(10, -decimals - 2) && value === target) {
      return;
    }
    lastTargetRef.current = target;

    const startVal = value;
    const startTs = performance.now();
    const delta = target - startVal;

    const tick = (now: number) => {
      const elapsed = now - startTs;
      const t = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = startVal + delta * eased;
      const factor = Math.pow(10, decimals);
      setValue(Math.round(cur * factor) / factor);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, decimals, enabled]);

  return value;
}
