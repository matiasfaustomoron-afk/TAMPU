"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import { GlyphViaje } from "@/components/brand/glyphs";

/**
 * <DestinationPhoto /> — el reemplazo de <AndeanBackdrop>.
 *
 * Llama a `/api/destination-photo?q={destination}` y muestra la foto resuelta.
 * Mientras carga / si falla → muestra un PLACEHOLDER editorial:
 *   - gradient sutil mineral (NO Hornocal saturado)
 *   - glyph viaje
 *   - destination name en serif
 *
 * Filosofía: la foto es BONUS. El placeholder ya se ve digno.
 *
 * Props:
 *   destination — string como "Buenos Aires" o "Papúa Nueva Guinea"
 *   className   — wrapper
 *   aspect      — "16/10" | "4/5" | "21/9" | "square" — default "16/10"
 *   priority    — eager load (para heroes). Default false.
 *   showCredit  — mostrar atribución Wikipedia/Unsplash en esquina. Default false.
 */

interface ResolvedPhoto {
  url: string;
  width: number;
  height: number;
  attribution: string | null;
  sourcePageUrl: string | null;
  caption: string | null;
  description: string | null;
  tier: string;
}

interface Props {
  destination: string | null | undefined;
  className?: string;
  aspect?: "16/10" | "16/9" | "4/5" | "21/9" | "square";
  priority?: boolean;
  showCredit?: boolean;
  /** Si la usás como background full-bleed (sin frame) */
  fullBleed?: boolean;
  /** Locale del user — para preferencia de idioma en Wikipedia */
  locale?: "es" | "en";
  /**
   * Resource Hints API — fetchpriority="high" hace que el browser priorice
   * esta foto sobre otras requests en flight (LCP del hero de Today).
   * Default "auto" deja al browser decidir.
   */
  fetchPriority?: "high" | "low" | "auto";
}

const ASPECT_CLASS: Record<NonNullable<Props["aspect"]>, string> = {
  "16/10": "aspect-[16/10]",
  "16/9":  "aspect-[16/9]",
  "4/5":   "aspect-[4/5]",
  "21/9":  "aspect-[21/9]",
  "square": "aspect-square",
};

export function DestinationPhoto({
  destination,
  className = "",
  aspect = "16/10",
  priority = false,
  showCredit = false,
  fullBleed = false,
  locale = "es",
  fetchPriority,
}: Props) {
  const [photo, setPhoto] = useState<ResolvedPhoto | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!destination) return;
    setLoaded(false);
    setPhoto(null);

    // AbortController cancela el fetch si el destino cambia antes de resolver.
    // Antes: race condition — destinos cambiados rápido (ej. day-swiper)
    // dejaban N requests in-flight, el último que llegaba pisaba el state.
    // Ahora: stale requests se abortan al cleanup → 0 stale state updates.
    const controller = new AbortController();
    const params = new URLSearchParams({ q: destination, locale });
    fetch(`/api/destination-photo?${params.toString()}`, { signal: controller.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (controller.signal.aborted || !data?.photo) return;
        setPhoto(data.photo as ResolvedPhoto);
      })
      .catch((err: unknown) => {
        // AbortError es esperado en cleanup — no es un error real.
        if (err instanceof DOMException && err.name === "AbortError") return;
        /* placeholder shows */
      });

    return () => { controller.abort(); };
  }, [destination, locale]);

  // Determinístico para que dos destinos vecinos no se mezclen en placeholder
  const placeholderHue = useMemo(() => {
    const s = destination ?? "default";
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return 15 + (h % 80); // dentro de familia tierra Tampu
  }, [destination]);

  const aspectClass = fullBleed ? "" : ASPECT_CLASS[aspect];
  const positionClass = fullBleed ? "absolute inset-0" : "relative w-full";

  return (
    <div className={`${positionClass} ${aspectClass} overflow-hidden ${className}`}>
      {/* Placeholder — siempre visible debajo, editorial sin saturar */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, oklch(0.55 0.10 ${placeholderHue}) 0%, oklch(0.32 0.08 ${placeholderHue}) 100%)`,
        }}
        aria-hidden={!!photo}
      />
      {!photo && destination && (
        <div className="absolute inset-0 flex items-center justify-center text-white/40" aria-hidden>
          <GlyphViaje size={64} />
        </div>
      )}

      {/* Foto real cuando carga — next/image optimization (AVIF/WebP serving + lazy + sizes) */}
      {photo && (
        <Image
          src={photo.url}
          alt={photo.caption ?? destination ?? ""}
          fill
          priority={priority}
          fetchPriority={fetchPriority ?? "auto"}
          sizes={fullBleed ? "100vw" : "(max-width: 640px) 100vw, 720px"}
          onLoad={() => setLoaded(true)}
          className={`object-cover transition-opacity duration-[700ms] ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}

      {/* Credit micro-footer — atribución Wikipedia / Unsplash */}
      {showCredit && photo?.attribution && (
        <p className="absolute bottom-1.5 right-2 text-[9px] text-white/60 tracking-wide z-10 pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
          {photo.attribution}
        </p>
      )}
    </div>
  );
}
