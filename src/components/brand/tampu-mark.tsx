"use client";

/**
 * TAMPU mark — escalonado andino (motivo chacana) en posición ascendente.
 * 3 niveles + remate. Funciona como ícono de app y como detalle de header.
 * El color hereda de `currentColor` para que se adapte a contextos light/dark.
 */
export function TampuMark({
  size = 36,
  className,
  style,
}: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="currentColor"
      role="img"
      aria-label="Tampu"
      className={className}
      style={style}
    >
      {/* Base */}
      <rect x="8"  y="44" width="48" height="10" rx="1.5"/>
      {/* Medio */}
      <rect x="14" y="32" width="36" height="10" rx="1.5"/>
      {/* Superior */}
      <rect x="20" y="20" width="24" height="10" rx="1.5"/>
      {/* Remate */}
      <rect x="28" y="12" width="8"  height="6"  rx="1"/>
    </svg>
  );
}
