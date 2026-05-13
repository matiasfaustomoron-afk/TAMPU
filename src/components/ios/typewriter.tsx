"use client";

import React, { useEffect, useState, useRef } from "react";

/**
 * <Typewriter /> — revela texto carácter por carácter con cursor parpadeante.
 *
 * No es un stream real (eso requeriría wiring del SSE de Anthropic), pero
 * visualmente da la sensación de "el assistant está pensando + escribiendo".
 * Velocidad ajustable; el cursor desaparece al terminar.
 *
 * Skip animation si `prefers-reduced-motion` o si el text es muy largo
 * (> 1500 chars — render directo para no hacer esperar 30 segundos).
 */

interface Props {
  text: string;
  /** Caracteres por segundo. Default 70. */
  speedCps?: number;
  /** Si true (default), muestra un cursor parpadeante mientras escribe. */
  showCursor?: boolean;
  className?: string;
  /** Callback al terminar de escribir todo. */
  onComplete?: () => void;
}

export function Typewriter({ text, speedCps = 70, showCursor = true, className, onComplete }: Props) {
  const [shown, setShown] = useState("");
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Reduced motion → render full instantáneo
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(text);
      onComplete?.();
      return;
    }
    // Texto largo → no torturar al user
    if (text.length > 1500) {
      setShown(text);
      onComplete?.();
      return;
    }

    setShown("");
    const start = performance.now();
    const tick = (now: number) => {
      const elapsedMs = now - start;
      const targetChars = Math.min(text.length, Math.floor((elapsedMs / 1000) * speedCps));
      setShown(text.slice(0, targetChars));
      if (targetChars < text.length) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        onComplete?.();
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, speedCps]);

  const done = shown.length === text.length;

  return (
    <span className={className}>
      {shown}
      {showCursor && !done && (
        <span className="inline-block w-[2px] h-[1em] align-text-bottom bg-current ml-0.5 animate-pulse" aria-hidden />
      )}
    </span>
  );
}
