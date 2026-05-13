"use client";

import React, { useEffect, useState } from "react";

/**
 * <Confetti /> — burst de partículas pequeñas con la paleta Tampu (terracota,
 * mostaza, cardón, indigo, carmín). NO una lluvia de papelitos — más estilo
 * Apple Things-style micro-celebration. ~14 partículas, duración 1.2s, una sola vez.
 *
 * Uso: render condicional cuando `trigger` se vuelve true. Después de 1.2s
 * el componente se auto-oculta. No bloquea interacción.
 *
 * No DOM particles per se — usamos SVG circles posicionados absolute con
 * keyframe animation custom por partícula (via inline style).
 */

const COLORS = [
  "oklch(0.62 0.18 38)",   // terracota
  "oklch(0.65 0.16 78)",   // mostaza
  "oklch(0.55 0.14 145)",  // cardón
  "oklch(0.58 0.10 240)",  // índigo
  "oklch(0.62 0.20 25)",   // carmín
];

const PARTICLES = 16;

interface Props {
  /** Si cambia a true, dispara el burst. Cambiar de true a true no re-dispara. */
  trigger: boolean;
}

export function Confetti({ trigger }: Props) {
  const [visible, setVisible] = useState(false);
  const [seed, setSeed] = useState(0);

  useEffect(() => {
    if (trigger) {
      setSeed((s) => s + 1);
      setVisible(true);
      const t = window.setTimeout(() => setVisible(false), 1300);
      return () => window.clearTimeout(t);
    }
  }, [trigger]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[150] flex items-center justify-center" aria-hidden>
      <div className="relative w-0 h-0">
        {Array.from({ length: PARTICLES }).map((_, i) => {
          // Pseudo-random pero stable por seed+i (no flicker)
          const angle = (i / PARTICLES) * Math.PI * 2 + ((seed * 13) % 100) / 100;
          const distance = 90 + ((i * 37 + seed * 7) % 70);
          const dx = Math.cos(angle) * distance;
          const dy = Math.sin(angle) * distance;
          const size = 5 + (i % 4);
          const color = COLORS[(i + seed) % COLORS.length];
          const delay = (i % 6) * 18;
          const duration = 900 + ((i * 37) % 400);
          return (
            <span
              key={`${seed}-${i}`}
              className="absolute top-0 left-0 rounded-full"
              style={{
                width: size,
                height: size,
                background: color,
                animation: `tampu-confetti-fly ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms both`,
                // CSS custom props para el keyframe destination
                ["--tampu-dx" as keyof React.CSSProperties]: `${dx}px`,
                ["--tampu-dy" as keyof React.CSSProperties]: `${dy}px`,
              } as React.CSSProperties}
            />
          );
        })}
      </div>
    </div>
  );
}
