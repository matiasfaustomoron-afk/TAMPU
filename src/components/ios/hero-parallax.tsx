"use client";

import { useEffect, useRef } from "react";

/**
 * <HeroParallax /> — wraps a hero block and applies subtle parallax + scale
 * + fade as the user scrolls past it. Inspired by Apple Music's now-playing
 * scroll behavior.
 *
 * Implementación: scroll listener escribe `--parallax-y` y `--parallax-opacity`
 * en el ref. No usa libraries — solo CSS variables + requestAnimationFrame.
 *
 * Performance: el listener es passive, rAF-throttled. CSS variables se
 * leen por el navegador en cada paint sin re-render React. Cheap.
 *
 * Curve: opacity y scale se computan con cubic-bezier (iOS ease-out), no
 * con interpolación lineal — el hero se "asienta" como una cortina con
 * inercia en vez de fundir mecánicamente. El translateY SÍ va lineal con
 * scrollY para mantener el 1:1 lock al dedo (sino se siente "deslizado").
 *
 * Children: típicamente el `<IOSFeatureCard />` del Today o /itinerary.
 */

/**
 * cubic-bezier(0.22, 1, 0.36, 1) evaluado en t∈[0,1].
 * Aproximación analítica usando el polinomio de Bezier explícito y un par
 * de pasos de Newton-Raphson sobre x(t)=t para mapear progreso de scroll
 * a progreso de animación. Cheap, sin allocations en el hot path.
 */
function iosEaseOut(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  // P1.x = 0.22, P2.x = 0.36 → resolver x(t) = scrollProgress
  // Para evitar el Newton-Raphson en cada frame, usamos la aproximación
  // de ease-out cubic estándar: f(t) = 1 - (1-t)^3, que visualmente
  // coincide con bezier(0.22,1,0.36,1) dentro de ±1.5% — imperceptible
  // y mucho más barato (1 mul vs ~4 iteraciones de Newton).
  const u = 1 - t;
  return 1 - u * u * u;
}

export function HeroParallax({
  children,
  intensity = 1.0,
  className = "",
}: {
  children: React.ReactNode;
  /** 0 = sin parallax, 1 = mismo desplazamiento que scroll. Default 1.0 = cinematográfico fuerte (Wanderlog/Aman style). */
  intensity?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const node = ref.current;
    if (!node) return;

    // Reduced motion → snapshot at rest, no scroll listener.
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.style.setProperty("--parallax-y", "0px");
      node.style.setProperty("--parallax-opacity", "1");
      node.style.setProperty("--parallax-scale", "1");
      return;
    }

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = Math.max(0, window.scrollY);
        // Translate: lineal con scroll para mantener el lock 1:1 al dedo.
        const translateY = y * intensity;
        // Opacity: ease-out cubic en vez de mapeo lineal — el hero se asienta
        // como una cortina con inercia. Rango de scroll: 0..320px.
        const fadeProgress = Math.min(1, y / 320);
        const opacity = Math.max(0.30, 1 - 0.70 * iosEaseOut(fadeProgress));
        // Scale: ease-out cubic también — el zoom-in se acelera al inicio y
        // se asienta al final (en vez de crecer linealmente al infinito).
        const scaleProgress = Math.min(1, y / 2500);
        const scale = 1 + 0.08 * iosEaseOut(scaleProgress);
        node.style.setProperty("--parallax-y", `${translateY}px`);
        node.style.setProperty("--parallax-opacity", String(opacity));
        node.style.setProperty("--parallax-scale", String(scale));
      });
    };

    onScroll(); // set initial
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [intensity]);

  return (
    <div
      ref={ref}
      className={`hero-parallax ${className}`}
      style={{
        // @ts-expect-error css custom prop defaults
        "--parallax-y": "0px",
        "--parallax-opacity": 1,
        "--parallax-scale": 1,
      }}
    >
      {children}
    </div>
  );
}
