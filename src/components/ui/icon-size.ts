/**
 * Icon size tokens — single source of truth para tamaños de icono en la app.
 *
 * Antes había drift: tab bar 22px, FABs 24px, skeletons 32/44px, badges 14px,
 * lucide w-4/w-5/w-6 mezclados ad-hoc. Esto rompe rhythm visual y hace que
 * iconos del mismo nivel jerárquico se vean inconsistentes entre pantallas.
 *
 * Cinco tamaños canónicos:
 *   xs (14px) → badges, status dots, micro-affordances
 *   sm (18px) → chips inline, list-row sub-icons
 *   md (22px) → tab bar, list rows, default lucide en cards
 *   lg (24px) → FABs, primary CTAs, action buttons
 *   xl (32px) → empty states, hero icons, onboarding
 *
 * Uso preferido:
 *   import { ICON_SIZE } from "@/components/ui/icon-size";
 *   <Plane size={ICON_SIZE.md} />
 *   <Plane className={`w-[${ICON_SIZE.md}px] h-[${ICON_SIZE.md}px]`} />
 *
 * Para lucide-react (que usa prop `size` numérico) basta con ICON_SIZE.md.
 * Para inline SVG / custom glyphs, usar las CSS vars en globals.css:
 *   --icon-xs, --icon-sm, --icon-md, --icon-lg, --icon-xl
 */

export const ICON_SIZE = {
  xs: 14,
  sm: 18,
  md: 22,
  lg: 24,
  xl: 32,
} as const;

export type IconSizeKey = keyof typeof ICON_SIZE;

/** Devuelve el px numérico para un token de icono. */
export function iconPx(size: IconSizeKey): number {
  return ICON_SIZE[size];
}

/** Helper para className tailwind con var() — útil cuando no podemos pasar size prop. */
export function iconClass(size: IconSizeKey): string {
  return `w-[var(--icon-${size})] h-[var(--icon-${size})]`;
}
