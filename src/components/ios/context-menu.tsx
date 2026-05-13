"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { haptic } from "@/lib/native/platform";

/**
 * <ContextMenu /> — long-press context menu estilo iOS.
 *
 * Children: el contenido al que se le hace long press (card, row, etc).
 * actions: array { label, icon, onSelect, destructive }.
 *
 * Touch flow:
 *   1. onTouchStart inicia un timer 500ms
 *   2. Si el user suelta antes → cancel (es un tap normal, deja propagar el click)
 *   3. Si llegan los 500ms → haptic strong + abre menu + prevent default click
 *   4. Menu aparece con spring + backdrop blur + selected item se highlightea
 *   5. Tap fuera o tap acción → cierra menu
 *
 * Para desktop: contextmenu (right click) también abre.
 *
 * Patrón: NO usamos portales — el menu se posiciona absolute en el viewport
 * con coords del touch event. Suficiente para iOS HIG.
 */

export interface ContextAction {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface Props {
  children: React.ReactNode;
  actions: ContextAction[];
  /** Disable el long-press (ej. cuando el item está en modo edición) */
  disabled?: boolean;
  /** Wrapper className */
  className?: string;
}

const LONG_PRESS_MS = 500;

export function ContextMenu({ children, actions, disabled = false, className }: Props) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const timerRef = useRef<number | null>(null);
  const movedRef = useRef(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    movedRef.current = false;
    const t = e.touches[0];
    const x = t.clientX;
    const y = t.clientY;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      haptic("medium").catch(() => {});
      setAnchor({ x, y });
      setOpen(true);
    }, LONG_PRESS_MS);
  }, [disabled]);

  const handleTouchMove = useCallback(() => {
    movedRef.current = true;
    clearTimer();
  }, []);

  const handleTouchEnd = useCallback(() => {
    clearTimer();
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    setAnchor({ x: e.clientX, y: e.clientY });
    setOpen(true);
  }, [disabled]);

  // Close on outside click / escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const menu = document.getElementById("tampu-context-menu");
      if (menu && menu.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("touchstart", onDown);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Cleanup
  useEffect(() => clearTimer, []);

  // Posiciona el menú dentro del viewport (si está cerca del borde lo flippea)
  const menuStyle = ((): React.CSSProperties => {
    if (!anchor) return { display: "none" };
    const menuW = 240;
    const menuH = 56 * actions.length + 16;
    let left = anchor.x;
    let top = anchor.y;
    if (typeof window !== "undefined") {
      if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
      if (top + menuH > window.innerHeight - 8) top = anchor.y - menuH - 8;
      if (left < 8) left = 8;
      if (top < 8) top = 8;
    }
    return { left, top, width: menuW };
  })();

  return (
    <>
      <div
        ref={wrapperRef}
        className={className}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onContextMenu={handleContextMenu}
      >
        {children}
      </div>

      {open && (
        <>
          {/* Backdrop con blur que oscurece levemente — iOS feel */}
          <div
            className="fixed inset-0 z-[200] bg-black/35 backdrop-blur-[2px] animate-fade-in"
            style={{ animationDuration: "180ms" }}
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            id="tampu-context-menu"
            role="menu"
            className="fixed z-[201] ios-material rounded-2xl shadow-[var(--shadow-floating)] py-1.5 overflow-hidden animate-pop-in"
            style={menuStyle}
          >
            {actions.map((a, i) => (
              <button
                key={i}
                role="menuitem"
                disabled={a.disabled}
                onClick={() => {
                  if (a.disabled) return;
                  setOpen(false);
                  haptic("light").catch(() => {});
                  a.onSelect();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left text-[14px] font-medium transition-colors ${
                  a.disabled ? "opacity-40 pointer-events-none" : "active:bg-accent hover:bg-accent/60"
                } ${a.destructive ? "text-destructive" : "text-foreground"}`}
              >
                {a.icon && <span className="w-5 h-5 flex items-center justify-center shrink-0">{a.icon}</span>}
                <span className="flex-1">{a.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
