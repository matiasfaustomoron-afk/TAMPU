"use client";

/**
 * Skeleton variants — un set chico de skeletons que conocen el shape del
 * componente que están reemplazando. Mucho mejor que rectángulos genéricos.
 *
 * Todos comparten el shimmer base de globals.css `.skeleton`.
 * Todos usan los radius tokens canónicos (`--radius`, `--radius-sm`, `--radius-lg`,
 * `--radius-xl`) — nada de `rounded-2xl` / `rounded-3xl` hardcoded.
 *
 * Todos llevan `role="status"` + `aria-busy="true"` + `aria-label` semántico,
 * para que screen readers anuncien "Cargando hoy / itinerario / etc." sin
 * leer el contenido placeholder.
 */

import { cn } from "@/lib/utils/helpers";

// ─── Primitive ────────────────────────────────────────────────────────────
//
// Bloque shimmer reutilizable. La mayoría de skeletons en este file lo usan.
// Acepta className para shape custom; el radius default es --radius-sm para
// que el shimmer tenga corners suaves consistentes con chips/pills.
function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("rounded-[var(--radius-sm)] skeleton", className)} />;
}

// ─── HERO (Today / Itinerary) ─────────────────────────────────────────────
/** Skeleton para hero card grande */
export function HeroSkeleton() {
  return (
    <section className="px-4 pt-4" role="status" aria-busy="true" aria-label="Cargando">
      <div className="ios-card-feature p-7 sm:p-8 min-h-[260px] relative overflow-hidden">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3 flex-1 min-w-0">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="h-10 w-3/4" />
            <SkeletonBlock className="h-3.5 w-44" />
          </div>
          <SkeletonBlock className="w-20 h-20 rounded-full" />
        </div>
        <SkeletonBlock className="mt-6 h-12 w-32" />
      </div>
    </section>
  );
}

// ─── WALLET CARD (Vault) ──────────────────────────────────────────────────
/** Skeleton para wallet card */
export function WalletCardSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando documentos"
      className="rounded-[var(--radius)] p-6 min-h-[192px] skeleton"
    />
  );
}

// ─── LIST ROW (iOS-style) ─────────────────────────────────────────────────
/** Skeleton para list rows (iOS-style cells) */
export function ListRowSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="ios-list" role="status" aria-busy="true" aria-label="Cargando lista">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <SkeletonBlock className="w-8 h-8 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <SkeletonBlock className="h-3.5 w-2/3" />
            <SkeletonBlock className="h-2.5 w-1/2 opacity-60" />
          </div>
          <SkeletonBlock className="w-12 h-4" />
        </div>
      ))}
    </div>
  );
}

// ─── CHART (donut) ────────────────────────────────────────────────────────
/** Skeleton para chart donut */
export function ChartSkeleton() {
  return (
    <div className="ios-card p-6 flex items-center justify-center" role="status" aria-busy="true" aria-label="Cargando chart">
      <div className="relative">
        <div className="w-40 h-40 rounded-full skeleton" />
        <div className="absolute inset-8 rounded-full bg-card" />
      </div>
    </div>
  );
}

// ─── CARD GRID ────────────────────────────────────────────────────────────
/** Skeleton para grid de cards (Trips list, Reservations) */
export function CardGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="px-4 space-y-3" role="status" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="ios-card p-4 flex items-start gap-3">
          <SkeletonBlock className="w-11 h-11 rounded-[var(--radius-lg)] shrink-0" />
          <div className="flex-1 space-y-1.5">
            <SkeletonBlock className="h-4 w-1/2" />
            <SkeletonBlock className="h-3 w-3/4 opacity-70" />
            <SkeletonBlock className="h-3 w-1/3 opacity-50" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── PHOTO GRID ───────────────────────────────────────────────────────────
/** Skeleton para photo journal */
export function PhotoGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="px-4 grid grid-cols-3 gap-2" role="status" aria-busy="true" aria-label="Cargando fotos">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBlock key={i} className="aspect-square" />
      ))}
    </div>
  );
}

// ─── PAGE SKELETONS ───────────────────────────────────────────────────────
//
// Skeletons completos por pantalla. Cada uno reproduce la silueta real:
// hero arriba, secciones intermedias del mismo tamaño que las reales.
// Esto reduce el CLS y le da al usuario una expectativa correcta.

/** Today — hero + NBA + operational + quick-chip grid */
export function TodaySkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando hoy" className="animate-fade-in pb-16">
      <section className="px-4 pt-4">
        <SkeletonBlock className="h-[280px] rounded-[var(--radius-xl)]" />
      </section>
      <section className="px-4 mt-3 space-y-3">
        {/* NBA + operational + alert blocks */}
        <SkeletonBlock className="h-20 rounded-[var(--radius)]" />
        <SkeletonBlock className="h-16 rounded-[var(--radius)]" />
      </section>
      <section className="px-4 mt-4">
        {/* QuickChip grid (4 chips) */}
        <SkeletonBlock className="h-3 w-24 mb-2" />
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} className="h-20 rounded-[var(--radius)]" />
          ))}
        </div>
      </section>
    </div>
  );
}

/** Itinerary — hero progress + accordions + day rail */
export function ItinerarySkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando itinerario" className="animate-fade-in">
      <div className="px-5 pt-4 pb-5">
        <SkeletonBlock className="h-3 w-32 mb-2" />
        <SkeletonBlock className="h-10 w-48" />
      </div>
      <div className="px-4">
        <SkeletonBlock className="h-36 rounded-[var(--radius-xl)]" />
      </div>
      {/* Vuelos + Hoteles accordion headers */}
      <div className="px-4 mt-4 space-y-3">
        <SkeletonBlock className="h-16 rounded-[var(--radius)]" />
        <SkeletonBlock className="h-16 rounded-[var(--radius)]" />
      </div>
      {/* Day rail */}
      <div className="px-4 mt-6 space-y-4">
        {[0, 1, 2].map((i) => (
          <SkeletonBlock key={i} className="h-28 rounded-[var(--radius)]" />
        ))}
      </div>
    </div>
  );
}

/** Vault — wallet card stack */
export function VaultSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando cartera" className="animate-fade-in">
      <div className="px-5 pt-4 pb-5">
        <SkeletonBlock className="h-3 w-32 mb-2" />
        <SkeletonBlock className="h-10 w-44" />
      </div>
      <div className="px-4 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBlock key={i} className="h-[192px] rounded-[var(--radius)]" />
        ))}
      </div>
    </div>
  );
}

/** Journal — timeline vertical, cards grandes con foto + caption */
export function JournalSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando diario" className="animate-fade-in">
      <div className="px-5 pt-4 pb-5">
        <SkeletonBlock className="h-3 w-32 mb-2" />
        <SkeletonBlock className="h-10 w-40" />
      </div>
      <div className="px-4 space-y-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="ios-card overflow-hidden">
            <SkeletonBlock className="h-64 w-full rounded-none" />
            <div className="p-4 space-y-2">
              <SkeletonBlock className="h-4 w-2/3" />
              <SkeletonBlock className="h-3 w-1/2 opacity-70" />
              <SkeletonBlock className="h-3 w-1/3 opacity-50" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Expenses — hero KPI + filtros + donut + lista */
export function ExpensesSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando gastos" className="animate-fade-in">
      <div className="px-5 pt-4 pb-5">
        <SkeletonBlock className="h-3 w-32 mb-2" />
        <SkeletonBlock className="h-10 w-48" />
      </div>
      <div className="px-4">
        <SkeletonBlock className="h-32 rounded-[var(--radius-xl)]" />
      </div>
      <div className="px-4 mt-4">
        <SkeletonBlock className="h-44 rounded-[var(--radius)]" />
      </div>
      <div className="px-4 mt-4 space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <SkeletonBlock key={i} className="h-14 rounded-[var(--radius)]" />
        ))}
      </div>
    </div>
  );
}

/** Alerts — densa lista de filas, severity-coded */
export function AlertsSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando alertas" className="animate-fade-in">
      <div className="px-5 pt-4 pb-5">
        <SkeletonBlock className="h-3 w-32 mb-2" />
        <SkeletonBlock className="h-10 w-40" />
      </div>
      <div className="px-4 space-y-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <SkeletonBlock key={i} className="h-14 rounded-[var(--radius)]" />
        ))}
      </div>
    </div>
  );
}

/** Settings — grouped lists con eyebrows */
export function SettingsSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando ajustes" className="animate-fade-in">
      <div className="px-5 pt-4 pb-5">
        <SkeletonBlock className="h-3 w-32 mb-2" />
        <SkeletonBlock className="h-10 w-32" />
      </div>
      {[0, 1].map((g) => (
        <div key={g} className="px-4 mb-6">
          <SkeletonBlock className="h-3 w-24 mb-2" />
          <div className="space-y-px ios-list p-0">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <SkeletonBlock className="w-8 h-8 shrink-0" />
                <SkeletonBlock className="h-3.5 flex-1" />
                <SkeletonBlock className="w-4 h-4 opacity-60" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
