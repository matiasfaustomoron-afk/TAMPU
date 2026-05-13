"use client";

import React, { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/native/platform";
import { GlyphCartera } from "@/components/brand/glyphs";

/**
 * <PullToRefresh /> — gesto iOS estándar.
 *
 * El user arrastra hacia abajo desde el top del scroll, ve un indicador
 * elástico con el glyph de Tampu girando, y al soltar (cuando supera el
 * umbral) dispara `onRefresh`.
 *
 * Implementación:
 *  - Solo activa cuando window.scrollY === 0 (estás en el top)
 *  - touchstart → captura startY
 *  - touchmove → calcula pullY = (touch.clientY - startY) * 0.55 (rubber band)
 *  - Si pullY > 70 → haptic light, pre-armed
 *  - touchend → si pre-armed → dispara onRefresh, sino spring back
 *
 * El indicator es un círculo con el glyph Tampu que rota proporcional al pull.
 */

const THRESHOLD = 70;
const MAX_PULL = 140;

interface Props {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
}

export function PullToRefresh({ onRefresh, children }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pullY, setPullY] = useState(0);
  const [armed, setArmed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const stateRef = useRef<{ startY: number; dragging: boolean; armed: boolean }>({
    startY: 0, dragging: false, armed: false,
  });

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || refreshing) return;
      stateRef.current.startY = e.touches[0].clientY;
      stateRef.current.dragging = true;
      stateRef.current.armed = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!stateRef.current.dragging) return;
      const dy = e.touches[0].clientY - stateRef.current.startY;
      if (dy <= 0) {
        setPullY(0);
        return;
      }
      // Rubber band: el pull se reduce a 55% para sensación elástica
      const eased = Math.min(MAX_PULL, dy * 0.55);
      setPullY(eased);
      // Trigger haptic + armed quando crossa el threshold
      if (eased > THRESHOLD && !stateRef.current.armed) {
        stateRef.current.armed = true;
        setArmed(true);
        haptic("light").catch(() => {});
      } else if (eased <= THRESHOLD && stateRef.current.armed) {
        stateRef.current.armed = false;
        setArmed(false);
      }
    };
    const onTouchEnd = async () => {
      if (!stateRef.current.dragging) return;
      stateRef.current.dragging = false;
      if (stateRef.current.armed) {
        setRefreshing(true);
        setArmed(false);
        haptic("medium").catch(() => {});
        try {
          await onRefresh();
        } finally {
          // Spring back
          setRefreshing(false);
          setPullY(0);
        }
      } else {
        setPullY(0);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [onRefresh, refreshing]);

  const indicatorTranslate = refreshing ? 60 : pullY * 0.7;
  const indicatorOpacity = Math.min(1, pullY / THRESHOLD);
  const glyphRotation = pullY * 3.6; // 360° at ~100px

  return (
    <div ref={containerRef} className="relative">
      {/* Indicator absolute at top, slides down based on pull */}
      <div
        aria-hidden
        className="fixed top-0 left-1/2 -translate-x-1/2 z-[60] pointer-events-none"
        style={{
          transform: `translate(-50%, ${indicatorTranslate}px)`,
          opacity: indicatorOpacity,
          transition: stateRef.current.dragging ? "none" : "transform 0.42s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease",
        }}
      >
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center shadow-[var(--shadow-floating)] ${
            armed || refreshing ? "tampu-gradient-warm text-white" : "ios-material text-foreground"
          }`}
          style={{
            transform: `rotate(${refreshing ? "var(--spin-rotation)" : `${glyphRotation}deg`})`,
            animation: refreshing ? "tampu-pull-spin 0.9s linear infinite" : undefined,
          }}
        >
          <GlyphCartera size={22} />
        </div>
      </div>

      {/* Children — el contenido se desplaza un poquito hacia abajo proporcional al pull */}
      <div
        style={{
          transform: `translateY(${pullY * 0.4}px)`,
          transition: stateRef.current.dragging ? "none" : "transform 0.42s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
