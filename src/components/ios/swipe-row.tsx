"use client";

import React, { useRef, useState } from "react";
import { haptic } from "@/lib/native/platform";

/**
 * <SwipeRow /> — fila estilo Mail.app que revela acciones al swipear.
 *
 * leftActions: aparecen swipeando hacia la derecha (típico: archivar / pin).
 * rightActions: aparecen swipeando hacia la izquierda (típico: eliminar).
 *
 * Mecánica:
 *  - onTouchMove tracketea dx, anchoring el row a offset = dx
 *  - Cuando dx > 60 → revela primera acción
 *  - Cuando dx > 140 → full-swipe automático (dispara la acción al soltar)
 *  - touchend: si no full-swipe → snap a la action más cercana (0 o 80px), sino dispara
 *
 * iOS HIG: la acción "destructive" (rojo) va siempre al final (más alejada del centro).
 */

export interface SwipeAction {
  label: string;
  icon?: React.ReactNode;
  color: "destructive" | "primary" | "success" | "warning" | "neutral";
  onSelect: () => void;
}

interface Props {
  children: React.ReactNode;
  leftActions?: SwipeAction[];
  rightActions?: SwipeAction[];
  className?: string;
}

const REVEAL_PER_ACTION = 76;
const FULL_SWIPE_THRESHOLD = 160;

function colorClass(c: SwipeAction["color"]): string {
  switch (c) {
    case "destructive": return "bg-destructive text-destructive-foreground";
    case "primary":     return "tampu-gradient-warm text-white";
    case "success":     return "tampu-gradient-cardon text-white";
    case "warning":     return "tampu-gradient-sol text-white";
    case "neutral":     return "bg-muted text-foreground";
  }
}

export function SwipeRow({ children, leftActions = [], rightActions = [], className = "" }: Props) {
  const [dx, setDx] = useState(0);
  const stateRef = useRef<{ startX: number; startY: number; dragging: boolean; vert: boolean }>({
    startX: 0, startY: 0, dragging: false, vert: false,
  });

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    stateRef.current = { startX: t.clientX, startY: t.clientY, dragging: true, vert: false };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!stateRef.current.dragging) return;
    const t = e.touches[0];
    const ddx = t.clientX - stateRef.current.startX;
    const ddy = t.clientY - stateRef.current.startY;
    // Lock to vertical if movement is mostly vertical (deja scrollear)
    if (!stateRef.current.vert && Math.abs(ddy) > Math.abs(ddx) * 1.5) {
      stateRef.current.vert = true;
    }
    if (stateRef.current.vert) return;
    // Clamp por dirección con rubber-band cuando no hay acciones
    let clamped = ddx;
    if (ddx > 0) {
      const max = leftActions.length * REVEAL_PER_ACTION + 40;
      clamped = leftActions.length === 0 ? Math.min(20, ddx * 0.3) : Math.min(max, ddx);
    } else {
      const max = rightActions.length * REVEAL_PER_ACTION + 40;
      clamped = rightActions.length === 0 ? Math.max(-20, ddx * 0.3) : Math.max(-max, ddx);
    }
    setDx(clamped);
  };
  const onTouchEnd = () => {
    if (!stateRef.current.dragging) return;
    stateRef.current.dragging = false;

    // Full swipe (dispara primera acción)
    if (dx <= -FULL_SWIPE_THRESHOLD && rightActions.length > 0) {
      haptic("medium").catch(() => {});
      rightActions[rightActions.length - 1].onSelect();
      setDx(0);
      return;
    }
    if (dx >= FULL_SWIPE_THRESHOLD && leftActions.length > 0) {
      haptic("medium").catch(() => {});
      leftActions[leftActions.length - 1].onSelect();
      setDx(0);
      return;
    }
    // Snap a posición de actions reveladas o a 0
    if (dx > REVEAL_PER_ACTION / 2 && leftActions.length > 0) {
      const snap = Math.min(dx, leftActions.length * REVEAL_PER_ACTION);
      const buckets = Math.round(snap / REVEAL_PER_ACTION);
      setDx(buckets * REVEAL_PER_ACTION);
      haptic("light").catch(() => {});
    } else if (dx < -REVEAL_PER_ACTION / 2 && rightActions.length > 0) {
      const snap = Math.max(dx, -rightActions.length * REVEAL_PER_ACTION);
      const buckets = Math.round(Math.abs(snap) / REVEAL_PER_ACTION);
      setDx(-buckets * REVEAL_PER_ACTION);
      haptic("light").catch(() => {});
    } else {
      setDx(0);
    }
  };

  const reset = () => setDx(0);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Right actions (revealed when swiping LEFT) */}
      {rightActions.length > 0 && (
        <div className="absolute inset-y-0 right-0 flex items-stretch">
          {rightActions.map((a, i) => (
            <button
              key={i}
              onClick={() => { a.onSelect(); reset(); }}
              className={`flex flex-col items-center justify-center w-[76px] gap-0.5 text-[11px] font-semibold ${colorClass(a.color)}`}
              aria-label={a.label}
            >
              {a.icon && <span className="w-5 h-5">{a.icon}</span>}
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      )}
      {/* Left actions */}
      {leftActions.length > 0 && (
        <div className="absolute inset-y-0 left-0 flex items-stretch">
          {leftActions.map((a, i) => (
            <button
              key={i}
              onClick={() => { a.onSelect(); reset(); }}
              className={`flex flex-col items-center justify-center w-[76px] gap-0.5 text-[11px] font-semibold ${colorClass(a.color)}`}
              aria-label={a.label}
            >
              {a.icon && <span className="w-5 h-5">{a.icon}</span>}
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      )}
      {/* Foreground row — translateX según drag */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="relative bg-card"
        style={{
          transform: `translateX(${dx}px)`,
          transition: stateRef.current.dragging ? "none" : "transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)",
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}
