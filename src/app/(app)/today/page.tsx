"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bed, Bus, AlertTriangle, Compass, Plus, Inbox } from "lucide-react";
import {
  useCommandCenter,
  useAllTrips,
  useReservations,
  useDocuments,
} from "@/lib/hooks/use-trip-data";
import { useI18n } from "@/i18n/provider";
import { plural } from "@/lib/i18n/plural";
import { IOSFeatureCard, ProgressRing } from "@/components/ios";
import { SyncIndicator } from "@/components/ios/sync-indicator";
import { HeroParallax } from "@/components/ios/hero-parallax";
import { DestinationPhoto } from "@/components/brand/destination-photo";
import { GlyphCartera, GlyphDinero, GlyphEmergencia } from "@/components/brand/glyphs";
import { QuickStatsCard } from "@/components/dashboard/QuickStatsCard";
import { RecapShareButton } from "@/components/share/RecapShareButton";
import { scheduleDailyBrief } from "@/lib/daily-brief";
import { pushWidgetFromCommandCenter } from "@/lib/native/widget-bridge";
import { useCountUp } from "@/lib/hooks/use-count-up";

/**
 * HOY — feed contextual, no dashboard.
 *
 * Decisión de producto (mayo 2026): la pantalla Hoy se reduce de 11 bloques a un máximo
 * de 5, en orden estricto:
 *
 *   1) Hero contextual    (countdown o "estás en X")
 *   2) Next Best Action   (UNA acción priorizada)
 *   3) Bloque operativo   (vuelo / traslado / alojamiento)
 *   4) Riesgo crítico     (CONDICIONAL — solo si severity = critical)
 *   5) Accesos rápidos    (4 chips: Documentos, Importar, Gasto, SOS)
 *
 * Todo lo que estaba antes — weather, pinned, guía, booking links, stats grid,
 * tasks today, alerts today, next 2 days, today_card expandido — se movió a otras
 * tabs (Viaje, Más) o se eliminó como ruido. El brief debe leerse en 5 segundos.
 */

// Hue + chroma contenidos en familia tierra Tampu, pero con variación REAL entre
// destinos. Antes: dos destinos con hash similar daban hue casi idéntico → invisibles
// al ojo. Ahora retornamos { hue, chroma } para que destinos cercanos en hash igual
// se separen visualmente vía chroma (mayor saturación → más vívido vs apagado).
function destStyle(s: string): { hue: number; chroma: number } {
  let h = 0, c = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
    c = (c * 17 + s.charCodeAt(i) * 7) >>> 0;
  }
  return {
    hue: 15 + (h % 80),       // 15..95: terracota → mostaza
    chroma: 0.13 + ((c % 80) / 800), // 0.13..0.23: apagado → saturado
  };
}

type NBA = {
  kind: "alert" | "transport" | "lodging" | "countdown" | "checkin" | "preparation";
  title: string;
  subtitle: string;
  href: string;
  ctaLabel?: string;
};

export default function TodayPage() {
  const { data: cc, loading } = useCommandCenter();
  const { data: trips, loading: loadingTrips } = useAllTrips();
  const { formatDate, t, locale } = useI18n();
  const router = useRouter();

  // Count-up animation para el countdown — debe llamarse antes de los early returns
  // para no romper el order de hooks.
  const daysUntilStart = useCountUp(cc?.mode_info.days_until_start ?? 0, {
    durationMs: 1100, enabled: !!cc,
  });

  // Entity reads para QuickStatsCard. cc.dashboard NO expone las listas completas
  // de reservations/documents — solo summaries — así que pegamos a los entity hooks
  // (mismo cache que cc, sin red extra). Llamados SIEMPRE para preservar hook order.
  const tripId = cc?.trip.id;
  const { data: reservations } = useReservations(tripId);
  const { data: documents } = useDocuments(tripId);

  const stats = useMemo(() => {
    if (!cc) return null;
    const now = new Date();
    const flightsRemaining = (reservations || []).filter(
      (r) => r.type === "flight" && r.use_date && new Date(r.use_date) > now,
    ).length;
    // El shape real de Document.status no tiene "expiring_soon"; lo derivamos
    // a partir de expiry_date dentro de 30 días.
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const documentsNeedingAction = (documents || []).filter((d) => {
      if (d.status === "pending") return true;
      if (d.status === "ready" && d.expiry_date) {
        const exp = new Date(d.expiry_date).getTime();
        return exp - now.getTime() < thirtyDaysMs && exp >= now.getTime();
      }
      return false;
    }).length;
    return {
      daysUntilStart: cc.mode_info.days_until_start ?? null,
      flightsRemaining,
      documentsNeedingAction,
      budgetUsedPct: cc.dashboard.budget.percent_used ?? 0,
    };
  }, [cc, reservations, documents]);

  // Sin viajes → onboarding
  useEffect(() => {
    if (!loadingTrips && (!trips || trips.length === 0)) {
      router.replace("/welcome");
    }
  }, [trips, loadingTrips, router]);

  // Daily brief idempotente + push widget snapshot (native only)
  useEffect(() => {
    if (!cc) return;
    const today = cc.next_7_days[0];
    const todayEvents = today
      ? (today.task_count || 0) + (today.alert_count || 0) + (today.next_transport ? 1 : 0)
      : 0;
    scheduleDailyBrief({
      destination: cc.trip.destination,
      daysUntilTrip: cc.mode_info.days_until_start,
      todayEvents,
      nextThing: cc.today_card?.next_transport || cc.today_card?.accommodation || undefined,
      criticalAlerts: cc.dashboard.alerts.filter((a) => a.severity === "critical").length,
    });
    pushWidgetFromCommandCenter(cc);
  }, [cc]);

  if (loading || loadingTrips) return <TodaySkeleton />;
  if (!cc) return <NoTripEmpty />;

  const { trip, mode_info, today_card, dashboard } = cc;
  const criticalAlerts = dashboard.alerts.filter((a) => a.severity === "critical");
  const inTrip = mode_info.mode === "in_trip";
  const { hue, chroma } = destStyle(trip.destination || trip.name);
  // Gradient con chroma variable — destinos diferentes se ven CLARAMENTE distintos
  // aunque su hue sea cercano (porque la chroma cambia).
  const heroGradient = `linear-gradient(135deg, oklch(0.62 ${chroma.toFixed(3)} ${hue}), oklch(0.45 ${(chroma * 0.9).toFixed(3)} ${Math.max(15, hue - 20)}))`;

  // ─── Compute the SINGLE Next Best Action ───
  // Order of priority: critical alert → today_card transport → today_card lodging →
  // pre-trip preparation gap → countdown reminder
  const nba: NBA | null = (() => {
    if (criticalAlerts.length > 0) {
      const a = criticalAlerts[0];
      return {
        kind: "alert",
        title: a.title,
        subtitle: a.description,
        href: "/alerts",
        ctaLabel: "Resolver",
      };
    }
    if (inTrip && today_card?.next_transport) {
      return {
        kind: "transport",
        title: today_card.next_transport,
        subtitle: today_card.city || "Tu próximo movimiento",
        href: "/reservations",
        ctaLabel: "Ver detalle",
      };
    }
    if (inTrip && today_card?.accommodation) {
      return {
        kind: "lodging",
        title: today_card.accommodation,
        subtitle: today_card.city || "Dónde dormís hoy",
        href: "/reservations",
        ctaLabel: "Ver reserva",
      };
    }
    if (!inTrip && dashboard.readiness.overall_score < 70 && mode_info.days_until_start > 0) {
      const missing =
        dashboard.readiness.critical_tasks_total - dashboard.readiness.critical_tasks_done;
      if (missing > 0) {
        return {
          kind: "preparation",
          title: `Te faltan ${missing} ${plural(locale, missing, t.today.thingsLeft)} para estar listo`,
          subtitle: "Tareas críticas pendientes",
          href: "/tasks",
          ctaLabel: "Ver pendientes",
        };
      }
    }
    if (mode_info.days_until_start > 0) {
      return {
        kind: "countdown",
        title: `Faltan ${mode_info.days_until_start} ${plural(locale, mode_info.days_until_start, t.today.daysLeft)}`,
        subtitle: `${trip.destination} te espera`,
        href: "/itinerary",
        ctaLabel: "Ver itinerario",
      };
    }
    return null;
  })();

  // ─── Compute the operational next block (distinct from NBA when both exist) ───
  // If NBA already shows the next transport/lodging, skip this. Otherwise surface it.
  const nextOperational = (() => {
    if (!today_card) return null;
    if (nba?.kind === "transport" && today_card.next_transport === nba.title) return null;
    if (nba?.kind === "lodging" && today_card.accommodation === nba.title) return null;
    if (today_card.next_transport) {
      return {
        icon: <Bus className="w-5 h-5" />,
        label: t.today.eyebrows.nextTransfer,
        title: today_card.next_transport,
        subtitle: today_card.city || undefined,
      };
    }
    if (today_card.accommodation) {
      return {
        icon: <Bed className="w-5 h-5" />,
        label: t.today.eyebrows.whereSleep,
        title: today_card.accommodation,
        subtitle: today_card.city || undefined,
      };
    }
    return null;
  })();

  // Secondary critical alert (if more than one exists and NBA already used the first)
  const secondaryCritical =
    criticalAlerts.length > 1 || (criticalAlerts.length === 1 && nba?.kind !== "alert")
      ? criticalAlerts[nba?.kind === "alert" ? 1 : 0]
      : null;

  return (
    <div className="animate-fade-in pb-16" role="region" aria-label="Resumen de hoy">
      {/* ─── 1. HERO contextual (con parallax al scroll + foto andina + Hornocal) ─── */}
      <HeroParallax>
        <section className="px-4 pt-4" aria-labelledby="today-hero-title">
          <IOSFeatureCard className="text-white relative overflow-hidden min-h-[280px]" padding="xl">
            {/* Foto del destino REAL del viaje activo — resolver Wikipedia */}
            <DestinationPhoto destination={trip.destination} fullBleed priority fetchPriority="high" />
            {/* Scrim suave para legibilidad del texto sobre la foto */}
            <div className="absolute inset-0 -z-[5]" style={{
              background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.65) 100%)"
            }} aria-hidden />
            {/* Decorative orbiting glyph — sutil layer Andina */}
            <span
              aria-hidden
              className="absolute -right-8 -bottom-6 text-white/[0.12] glyph-drift-1 pointer-events-none"
            >
              <GlyphCartera size={180} />
            </span>
            <div className="relative flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold tracking-[0.20em] uppercase text-white mb-2 text-shadow-strong">
                  {inTrip ? "Hoy estás en" : trip.destination}
                </p>
                <h1 id="today-hero-title" className="font-serif text-[44px] leading-[1.02] truncate hero-title-enter text-white text-shadow-strong">
                  {inTrip ? today_card?.city || trip.destination : trip.name}
                </h1>
                <p className="text-[13px] text-white mt-2 tabular-nums text-shadow-soft" style={{ opacity: 0.92 }}>
                  {formatDate(trip.start_date, "long")}{" "}
                  <span className="opacity-60">→</span> {formatDate(trip.end_date, "long")}
                </p>
              </div>
              <div className="shrink-0 text-white flex flex-col items-end gap-2">
                <div className="opacity-95"><SyncIndicator /></div>
                <ProgressRing
                  value={dashboard.readiness.overall_score}
                  size={80}
                  accent="rgba(255,255,255,0.95)"
                />
              </div>
            </div>
            {mode_info.days_until_start > 0 && (
              <div className="relative mt-5 flex items-end gap-3">
                <span
                  className="tampu-display text-white tabular-nums text-shadow-strong"
                  style={{ fontSize: "60px" }}
                >
                  {daysUntilStart}
                </span>
                <span className="text-sm text-white mb-2 text-shadow-soft" style={{ opacity: 0.92 }}>{plural(locale, mode_info.days_until_start, t.today.daysLeft)} para salir</span>
              </div>
            )}
          </IOSFeatureCard>
        </section>
      </HeroParallax>

      {/* ─── 1.5. QUICK STATS — 4 stats arriba del fold ─── */}
      {stats && (
        <section className="px-4 mt-3" aria-label="Estadísticas rápidas del viaje">
          <QuickStatsCard stats={stats} />
        </section>
      )}

      {/* ─── 1.6. SHARE RECAP — botón compartir og:image del viaje ─── */}
      {trip?.id && (
        <section className="px-4 mt-3" aria-label="Compartir recap del viaje">
          <RecapShareButton tripId={trip.id} tripName={trip.name || trip.destination || "Mi viaje"} />
        </section>
      )}

      {/* ─── 2. NEXT BEST ACTION ─── */}
      {nba && (
        <section className="px-4 mt-3" aria-label="Próxima acción recomendada">
          <p className="ios-eyebrow">{t.today.eyebrows.focus}</p>
          <Link href={nba.href} className="block">
            <div className="ios-card p-5 pressable">
              <div className="flex items-start gap-4">
                <span
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                    nba.kind === "alert"
                      ? "tampu-icon tampu-icon-carmin"
                      : nba.kind === "transport"
                      ? "tampu-icon tampu-icon-cobre"
                      : nba.kind === "lodging"
                      ? "tampu-icon tampu-icon-cardon"
                      : nba.kind === "preparation"
                      ? "tampu-icon tampu-icon-mostaza"
                      : "tampu-icon tampu-icon-terracota"
                  }`}
                >
                  {nba.kind === "alert" ? (
                    <AlertTriangle className="w-5 h-5" />
                  ) : nba.kind === "transport" ? (
                    <Bus className="w-5 h-5" />
                  ) : nba.kind === "lodging" ? (
                    <Bed className="w-5 h-5" />
                  ) : nba.kind === "preparation" ? (
                    <GlyphEmergencia size={20} />
                  ) : (
                    <Compass className="w-5 h-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[17px] font-semibold leading-tight">{nba.title}</p>
                  <p className="text-[13px] text-muted-foreground mt-1 leading-snug">
                    {nba.subtitle}
                  </p>
                </div>
                <span
                  className="text-[12px] font-semibold text-primary shrink-0 self-center"
                  aria-hidden
                >
                  {nba.ctaLabel} →
                </span>
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* ─── 3. PRÓXIMO BLOQUE OPERATIVO (solo si NBA no lo cubre) ─── */}
      {nextOperational && (
        <section className="px-4 mt-3">
          <p className="ios-eyebrow">{nextOperational.label}</p>
          <Link href="/reservations" className="block">
            <div className="ios-card p-4 pressable">
              <div className="flex items-center gap-3.5">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 tampu-icon tampu-icon-piedra">
                  {nextOperational.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-tight truncate">
                    {nextOperational.title}
                  </p>
                  {nextOperational.subtitle && (
                    <p className="text-[12.5px] text-muted-foreground mt-0.5">
                      {nextOperational.subtitle}
                    </p>
                  )}
                </div>
                <span className="chevron-right" aria-hidden />
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* ─── 4. RIESGO CRÍTICO secundario (condicional, solo si existe otro tras el NBA) ─── */}
      {secondaryCritical && (
        <section className="px-4 mt-3">
          <p className="ios-eyebrow">{t.today.eyebrows.attention}</p>
          <Link href="/alerts" className="block">
            <div className="ios-card p-4 pressable border-l-4 border-destructive">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-tight">
                    {secondaryCritical.title}
                  </p>
                  <p className="text-[12.5px] text-muted-foreground mt-1 leading-snug">
                    {secondaryCritical.description}
                  </p>
                </div>
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* ─── 5. ACCESOS RÁPIDOS — 4 glyphs Tampu, sin lucide ─── */}
      <section className="px-4 mt-3" aria-label="Accesos rápidos">
        <p className="ios-eyebrow">{t.today.eyebrows.quickAccess}</p>
        <div className="grid grid-cols-4 gap-2">
          <QuickChip href="/vault"     icon={<GlyphCartera   size={22} />}    label={t.today.quickChips.documents} accent="tampu-icon-terracota" />
          <QuickChip href="/import"    icon={<Inbox className="w-5 h-5" />}   label={t.today.quickChips.import}    accent="tampu-icon-indigo"    />
          <QuickChip href="/expenses"  icon={<GlyphDinero    size={22} />}    label={t.today.quickChips.expense}   accent="tampu-icon-cobre"     />
          <QuickChip href="/emergency" icon={<GlyphEmergencia size={22} />}   label={t.today.quickChips.sos}       accent="tampu-icon-carmin"    />
        </div>
      </section>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function QuickChip({
  href,
  icon,
  label,
  accent,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className="ios-card p-3 pressable flex flex-col items-center gap-1.5 text-center"
      aria-label={label}
    >
      <span className={`w-11 h-11 rounded-2xl flex items-center justify-center tampu-icon ${accent}`}>
        {icon}
      </span>
      <span className="text-[11px] font-semibold leading-tight">{label}</span>
    </Link>
  );
}

function TodaySkeleton() {
  return (
    <div className="animate-fade-in">
      <div className="px-4 pt-4">
        <div className="h-44 rounded-[var(--radius-xl)] skeleton" />
      </div>
      <div className="px-4 mt-6 space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-20 rounded-[var(--radius)] skeleton" />
        ))}
        <div className="grid grid-cols-4 gap-2 mt-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-[var(--radius)] skeleton" />
          ))}
        </div>
      </div>
    </div>
  );
}

function NoTripEmpty() {
  const { t } = useI18n();
  return (
    <div className="px-6 py-24 text-center animate-fade-in">
      <div className="relative inline-block mb-6">
        <div className="absolute inset-0 blur-3xl bg-primary/30 rounded-full" aria-hidden />
        <div className="relative w-24 h-24 rounded-3xl tampu-gradient-warm flex items-center justify-center shadow-[var(--shadow-floating)]">
          <Compass className="w-10 h-10 text-white" />
        </div>
      </div>
      <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground mb-2">
        {t.today.empty.eyebrow}
      </p>
      <h2 className="font-serif text-5xl leading-tight">{t.today.empty.title}</h2>
      <p className="text-base text-muted-foreground mt-4 max-w-sm mx-auto">
        {t.today.empty.description}
      </p>
      <Link
        href="/trips"
        className="mt-8 inline-flex items-center justify-center px-6 py-3 rounded-2xl text-sm font-semibold text-white shadow-md tampu-gradient-warm hover:brightness-110 hover:-translate-y-px transition-all pressable"
      >
        {t.today.empty.cta}
      </Link>
    </div>
  );
}
