"use client";

import { useMemo } from "react";

/**
 * <AndeanBackdrop /> — fondo cinematográfico andino.
 *
 * Una imagen full-bleed elegida por `tone` o por hash del destino, con:
 *  - Ken Burns (pan + zoom lento, 20s loop)
 *  - Doble gradient overlay (top tint suave + bottom dark scrim) para legibilidad
 *  - Glow andino lateral (terracota / mostaza / cardón según tono)
 *  - Film grain sutil
 *  - Fallback OKLCH si la foto no carga
 *
 * Las fotos viven en `public/photos/andean/` (offline-ready, no CDN externo).
 * Licencia: Unsplash License (uso comercial libre, sin attribution required).
 *
 * Uso típico:
 *   <AndeanBackdrop tone="dawn" />                   // Today hero
 *   <AndeanBackdrop destination={trip.destination} /> // selección automática
 *   <AndeanBackdrop photo="machu-picchu" />          // override manual
 *
 * Tonos disponibles:
 *   "dawn"      → Machu Picchu amanecer · cálido naranja-rosado
 *   "epic"      → Machu Picchu wide · paisaje icónico
 *   "cordillera"→ Cordillera blanca · grises azulados
 *   "salar"     → Salar de Uyuni · espejo de sal
 *   "altiplano" → Meseta andina · ocres
 *   "peak"      → Picos andinos · gris/blanco
 *   "auto"      → Hash del destino elige
 */

export type AndeanTone =
  | "dawn"
  | "epic"
  | "cordillera"
  | "salar"
  | "altiplano"
  | "peak"
  | "auto";

interface PhotoSpec {
  file: string;       // basename in /public/photos/andean/
  alt: string;
  /** Tint que se mezcla sobre la foto (OKLCH para mantener paleta Andina cohesiva) */
  glowHue: number;    // 0-360 hue
  /** Position adjustment para que el sujeto principal quede visible al recortar */
  focal: string;      // CSS background-position
}

const PHOTOS: Record<Exclude<AndeanTone, "auto">, PhotoSpec> = {
  dawn:       { file: "machu-picchu.jpg",      alt: "Machu Picchu al amanecer entre niebla, Perú",  glowHue: 38, focal: "center 35%" },
  epic:       { file: "machu-picchu-wide.jpg", alt: "Vista panorámica de Machu Picchu, Perú",       glowHue: 55, focal: "center 40%" },
  cordillera: { file: "cordillera.jpg",        alt: "Cordillera de los Andes nevada",              glowHue: 230, focal: "center 45%" },
  salar:      { file: "salar-uyuni.jpg",       alt: "Salar de Uyuni, espejo de sal, Bolivia",      glowHue: 78, focal: "center center" },
  altiplano:  { file: "altiplano.jpg",         alt: "Altiplano andino",                            glowHue: 60, focal: "center 50%" },
  peak:       { file: "andes-peak.jpg",        alt: "Picos andinos con cielo azul",                glowHue: 230, focal: "center 35%" },
};

const ALL_TONES: AndeanTone[] = ["dawn", "epic", "cordillera", "salar", "altiplano", "peak"];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function toneForDestination(dest: string | undefined | null): Exclude<AndeanTone, "auto"> {
  if (!dest) return "dawn";
  const lower = dest.toLowerCase();
  // Reglas semánticas — destinos conocidos van a su foto natural
  if (/peru|cusco|machu|sacred|aguas calientes|ollanta/.test(lower)) return "dawn";
  if (/bolivia|uyuni|la paz|potosi/.test(lower)) return "salar";
  if (/chile|atacama|santiago|patagonia chilena/.test(lower)) return "altiplano";
  if (/argentina|jujuy|salta|tilcara|humahuaca|noa/.test(lower)) return "epic";
  if (/ecuador|quito|cotopaxi|otavalo/.test(lower)) return "peak";
  if (/colombia|bogota|cartagena|medellin/.test(lower)) return "cordillera";
  // Fallback determinístico por hash — mismo destino → siempre la misma foto
  return ALL_TONES.filter((t) => t !== "auto")[hashString(lower) % 6] as Exclude<AndeanTone, "auto">;
}

interface Props {
  tone?: AndeanTone;
  destination?: string | null;
  photo?: keyof typeof PHOTOS;   // override manual
  /** Intensidad del scrim oscuro de abajo (0-1). Default 0.55. Subí para más legibilidad. */
  scrim?: number;
  /** Encender Ken Burns. Default true. Apagar si está dentro de un card que ya se mueve. */
  kenBurns?: boolean;
  /** Mostrar credit micro-footer "Foto: Unsplash". Default true en pantallas grandes (welcome). */
  showCredit?: boolean;
  className?: string;
}

export function AndeanBackdrop({
  tone = "auto",
  destination,
  photo,
  scrim = 0.55,
  kenBurns = true,
  showCredit = false,
  className = "",
}: Props) {
  const spec = useMemo<PhotoSpec>(() => {
    if (photo) return PHOTOS[photo];
    if (tone !== "auto") return PHOTOS[tone];
    return PHOTOS[toneForDestination(destination)];
  }, [tone, destination, photo]);

  const tint = `linear-gradient(180deg, oklch(0.18 0.04 30 / ${scrim * 0.55}) 0%, oklch(0.22 0.05 30 / ${scrim * 0.35}) 38%, oklch(0.18 0.04 30 / ${Math.min(0.92, scrim + 0.3)}) 100%), linear-gradient(135deg, oklch(0.58 0.18 ${spec.glowHue} / 0.28) 0%, transparent 55%)`;

  return (
    <div className={`absolute inset-0 -z-10 overflow-hidden ${className}`} aria-hidden>
      {/* Fallback de color por si la foto no carga */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 90% 90% at 50% 50%, oklch(0.32 0.08 ${spec.glowHue}), oklch(0.18 0.04 30))`,
        }}
      />
      {/* Foto andina */}
      <div
        className={`absolute inset-0 ${kenBurns ? "ken-burns" : ""}`}
        style={{
          backgroundImage: `url('/photos/andean/${spec.file}')`,
          backgroundSize: "cover",
          backgroundPosition: spec.focal,
        }}
        role="img"
        aria-label={spec.alt}
      />
      {/* Dual tint overlay */}
      <div
        className="absolute inset-0 transition-[background] duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ background: tint }}
      />
      {/* Grano cinema sutil */}
      <div
        className="absolute inset-0 opacity-[0.035] pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      {showCredit && (
        <p className="absolute bottom-2 left-3 text-[9px] text-white/35 tracking-wider z-20 pointer-events-none">
          Foto: Unsplash · licencia comercial libre
        </p>
      )}
    </div>
  );
}
