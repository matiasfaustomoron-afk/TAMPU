"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/helpers";
import { haptic } from "@/lib/native/platform";

/**
 * <EmptyState /> — versión con CTA expuesto vía props.
 *
 * Wrapper canónico para todas las listas vacías. Hornocal palette (terracota
 * primary, halo glow, card on warm bg). Renderiza ícono centrado + título +
 * descripción + opcionalmente un botón CTA (`ctaLabel` + `onCtaClick` o
 * `ctaHref`).
 *
 * Coexiste con el legacy `EmptyState` exportado desde `@/components/shared` —
 * ése usa el slot `action` (cualquier ReactNode). Este expone una API
 * declarativa para los casos comunes (CTA simple "abrí modal" o "navegá a /x").
 *
 * Uso:
 *   <EmptyState
 *     icon={<Wallet className="w-8 h-8" />}
 *     title="No hay gastos aún"
 *     description="Agregá el primero y empezamos a tracking."
 *     ctaLabel="Agregar primer gasto"
 *     onCtaClick={() => setExpenseFabOpen(true)}
 *   />
 *
 * TODO: i18n — strings provisionales hardcoded en los call sites; Agent 3 los
 * mueve al dict.
 */
export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  ctaLabel?: string;
  /** Si se pasa, el CTA renderiza como botón con onClick. Mutuamente exclusivo con `ctaHref`. */
  onCtaClick?: () => void;
  /** Si se pasa, el CTA renderiza como `<Link>` interno. Mutuamente exclusivo con `onCtaClick`. */
  ctaHref?: string;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  ctaLabel,
  onCtaClick,
  ctaHref,
  className,
}: EmptyStateProps) {
  const cta = ctaLabel && (ctaHref || onCtaClick) ? (
    ctaHref ? (
      <Button
        asChild
        size="lg"
        onClick={() => haptic("light")}
      >
        <Link href={ctaHref}>{ctaLabel}</Link>
      </Button>
    ) : (
      <Button
        size="lg"
        onClick={() => {
          haptic("light");
          onCtaClick?.();
        }}
      >
        {ctaLabel}
      </Button>
    )
  ) : null;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-6 text-center",
        className,
      )}
    >
      {icon && (
        <div className="relative mb-5" aria-hidden="true">
          {/* Halo terracota — usa primary token para ligarse al brick rojo Hornocal. */}
          <div className="absolute inset-0 blur-2xl bg-primary/20 rounded-full" />
          <div className="relative w-16 h-16 rounded-[var(--radius)] bg-card ring-1 ring-border flex items-center justify-center text-muted-foreground">
            {icon}
          </div>
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground tracking-tight">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-2 max-w-md leading-relaxed">
          {description}
        </p>
      )}
      {cta && <div className="mt-5">{cta}</div>}
    </div>
  );
}
