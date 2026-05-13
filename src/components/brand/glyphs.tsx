"use client";

/**
 * Tampu glyphs — sistema de íconos propios para los 6 conceptos clave.
 *
 * Diseño: geometría escalonada inspirada en la chacana andina, stroke uniforme,
 * esquinas con `stroke-linejoin: round` para tono cálido sin perder geometría.
 * Cero similitud con lucide — son la marca, no íconos genéricos.
 *
 * Uso: reemplazan lucide en los headers críticos (Hero Today, Hero Cartera,
 * Hero Welcome, NBA Today). Lucide queda como set neutro para sub-vistas
 * donde no aporta carácter de marca.
 *
 *  Props:
 *  - `size`: lado del SVG (default 28)
 *  - `strokeWidth`: 1.6 default (más sutil que lucide 2.0)
 *  - color hereda de currentColor
 */

interface GlyphProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
  "aria-label"?: string;
}

const BASE = {
  width: 28,
  height: 28,
  viewBox: "0 0 32 32",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Hoy — sol naciente sobre montaña escalonada andina. */
export function GlyphHoy({ size = 28, strokeWidth = 1.6, className, style, "aria-label": ariaLabel }: GlyphProps) {
  return (
    <svg
      {...BASE}
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      className={className}
      style={style}
      role="img"
      aria-label={ariaLabel ?? "Hoy"}
    >
      {/* Sol */}
      <circle cx="16" cy="11" r="3.5" />
      {/* Rayos cortos */}
      <path d="M16 4.5v1.5M16 16.5v1M22.5 11h1.5M8 11H6.5M21 6l-1 1M11 16l1-1M21 16l-1-1M11 6l1 1" />
      {/* Montaña escalonada (chacana) */}
      <path d="M3 27 L9 27 L9 22 L14 22 L14 17 L18 17 L18 22 L23 22 L23 27 L29 27" />
    </svg>
  );
}

/** Viaje — avión estilizado con trazo de ruta hacia chacana. */
export function GlyphViaje({ size = 28, strokeWidth = 1.6, className, style, "aria-label": ariaLabel }: GlyphProps) {
  return (
    <svg
      {...BASE}
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      className={className}
      style={style}
      role="img"
      aria-label={ariaLabel ?? "Viaje"}
    >
      {/* Trazo de ruta — curva ascendente */}
      <path d="M5 24 Q14 24 18 18 T28 8" strokeDasharray="2 2.5" opacity="0.55" />
      {/* Avión silueta geométrica (no lucide) */}
      <path d="M22.5 8.5 L26.5 11 L25 14 L19.5 13 L17 18 L15 17.5 L15.5 13 L11 13.5 L10 11.5 L13.5 9.5 L15.5 9.5 L15.5 6 L17.5 6 Z" />
    </svg>
  );
}

/** Cartera — chacana plegada (la marca aplicada como contenedor). */
export function GlyphCartera({ size = 28, strokeWidth = 1.6, className, style, "aria-label": ariaLabel }: GlyphProps) {
  return (
    <svg
      {...BASE}
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      className={className}
      style={style}
      role="img"
      aria-label={ariaLabel ?? "Cartera"}
    >
      {/* Solapa superior */}
      <path d="M7 11 L16 5 L25 11" />
      {/* Cuerpo de la cartera con esquinas escalonadas (motivo andino) */}
      <path d="M5 11 L5 25 L7 27 L11 27 L11 25 L13 25 L13 27 L19 27 L19 25 L21 25 L21 27 L25 27 L27 25 L27 11" />
      {/* Línea de cierre — sutil */}
      <path d="M5 15 L27 15" opacity="0.45" />
    </svg>
  );
}

/** Dinero — círculo monetario sobre chacana ascendente. */
export function GlyphDinero({ size = 28, strokeWidth = 1.6, className, style, "aria-label": ariaLabel }: GlyphProps) {
  return (
    <svg
      {...BASE}
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      className={className}
      style={style}
      role="img"
      aria-label={ariaLabel ?? "Dinero"}
    >
      {/* Círculo monetario */}
      <circle cx="16" cy="12" r="6" />
      {/* "S" simplificada al centro — sin letra explícita, dos arcos invertidos */}
      <path d="M13.5 9.5 Q16 8 18 10 Q14 14 14.5 14.5 Q18.5 16 16 15" opacity="0.7" />
      {/* Base escalonada (chacana — connecta a la identidad) */}
      <path d="M5 27 L11 27 L11 23 L15 23 L15 21 L17 21 L17 23 L21 23 L21 27 L27 27" />
    </svg>
  );
}

/** Boarding pass — pase con muesca derecha (típico de aerolínea). */
export function GlyphBoarding({ size = 28, strokeWidth = 1.6, className, style, "aria-label": ariaLabel }: GlyphProps) {
  return (
    <svg
      {...BASE}
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      className={className}
      style={style}
      role="img"
      aria-label={ariaLabel ?? "Boarding pass"}
    >
      {/* Outline del pase con muesca derecha (típica perforación) */}
      <path d="M4 8 L23 8 L23 12 Q24.5 12 24.5 14 Q24.5 16 23 16 L23 24 L4 24 Z" />
      {/* Línea separadora del talón */}
      <path d="M23 8 L23 24" strokeDasharray="1.5 1.5" opacity="0.55" />
      {/* Detalles internos — línea de ruta + 2 líneas de texto stub */}
      <path d="M7 12 L13 12" />
      <path d="M7 15 L17 15" opacity="0.55" />
      <path d="M7 18 L13 18" opacity="0.4" />
    </svg>
  );
}

/** Emergencia — escudo con cruz andina escalonada (no la cruz médica universal). */
export function GlyphEmergencia({ size = 28, strokeWidth = 1.6, className, style, "aria-label": ariaLabel }: GlyphProps) {
  return (
    <svg
      {...BASE}
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      className={className}
      style={style}
      role="img"
      aria-label={ariaLabel ?? "Emergencia"}
    >
      {/* Escudo */}
      <path d="M16 4 L26 7 L26 16 Q26 22 16 28 Q6 22 6 16 L6 7 Z" />
      {/* Chacana al centro — cruz escalonada andina */}
      <path d="M16 11 L16 17 M13 14 L19 14 M14.5 12.5 L14.5 15.5 L17.5 15.5 L17.5 12.5 Z" opacity="0.85" />
    </svg>
  );
}

/**
 * Mapping desde nombres semánticos del producto a glyphs.
 * Permite usarlos via `<TampuGlyph name="hoy" />` sin imports manuales.
 */
const GLYPHS = {
  hoy: GlyphHoy,
  viaje: GlyphViaje,
  cartera: GlyphCartera,
  dinero: GlyphDinero,
  boarding: GlyphBoarding,
  emergencia: GlyphEmergencia,
} as const;

export type TampuGlyphName = keyof typeof GLYPHS;

export function TampuGlyph({
  name,
  ...rest
}: GlyphProps & { name: TampuGlyphName }) {
  const Component = GLYPHS[name];
  return <Component {...rest} />;
}
