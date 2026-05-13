"use client";

import { useEffect, useRef } from "react";

/**
 * useParallaxTilt — añade tilt 3D sutil al hover en desktop.
 *
 * No-op en touch devices (`hover: none` media query). El hook escucha mousemove
 * sobre el elemento y aplica `transform: perspective(800px) rotateX rotateY`
 * proporcional a la posición del mouse desde el centro.
 *
 * Max tilt = 6° (suficiente para sentir profundidad sin sentirse mareado).
 *
 * Uso:
 *   const ref = useParallaxTilt<HTMLDivElement>();
 *   <div ref={ref} className="parallax-tilt"> ... </div>
 */
export function useParallaxTilt<T extends HTMLElement>(maxTiltDeg = 6) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Skip si touch device — `hover: none` lo confirma
    if (typeof window !== "undefined" && window.matchMedia("(hover: none)").matches) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // rAF throttle estricto: 1 frame en vuelo máximo, NUNCA disparamos >60fps.
    // Antes: cada mousemove llamaba a getBoundingClientRect() ANTES de schedule
    // → forced layout en cada move (puede dispararse 250+ veces/seg con mouse
    // rápido), penalizando CPU/jank en panels con muchos parallax-tilt.
    // Ahora: getBoundingClientRect() corre DENTRO del rAF, lo cual lo coloca
    // en el read phase del frame y deja que el browser batche layout. El
    // listener solo guarda clientX/Y y schedulea si no hay frame pending.
    let raf = 0;
    let lastX = 0;
    let lastY = 0;
    const onMove = (e: MouseEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = (lastX - cx) / (rect.width / 2);
        const dy = (lastY - cy) / (rect.height / 2);
        const rx = -dy * maxTiltDeg;
        const ry = dx * maxTiltDeg;
        el.style.transform = `perspective(800px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(0)`;
      });
    };
    const onLeave = () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      el.style.transform = "perspective(800px) rotateX(0) rotateY(0)";
    };

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [maxTiltDeg]);

  return ref;
}
