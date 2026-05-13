"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { DestinationPhoto } from "@/components/brand/destination-photo";
import { ChevronLeft, ChevronRight, Bed, Bus, Activity, AlertTriangle } from "lucide-react";
import { haptic } from "@/lib/native/platform";
import type { TripDay } from "@/lib/types/database";

/**
 * <DaySwiper /> — vista horizontal swipeable de los días del viaje.
 *
 * El antídoto al "feel botonera" del grid de TripCalendar. Cada día ocupa
 * pantalla completa con:
 *   - Foto del POI/ciudad (full-bleed top 50%)
 *   - Día N · Fecha · Ciudad (overlay sobre foto)
 *   - Stratigraphy bar
 *   - Contenido scrolleable abajo (alojamiento, traslados, actividades)
 *
 * Navegación:
 *   - Swipe horizontal touchstart/move/end (umbral 80px o velocity > 0.4)
 *   - Botones ‹ › sticky para desktop
 *   - Dots indicator abajo
 *   - Haptic light en cada cambio de día
 *
 * Snap: CSS scroll-snap-x mandatory para que cada día snappee al centro.
 * Native momentum scroll = el feel "smooth" de Wanderlog.
 */

interface DaySwiperProps {
  days: TripDay[];
  initialDayId?: string;
  formatDate: (d: string, style?: "short" | "long" | "iso") => string;
  onDayChange?: (dayId: string) => void;
}

export function DaySwiper({ days, initialDayId, formatDate, onDayChange }: DaySwiperProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(() => {
    if (initialDayId) {
      const i = days.findIndex((d) => d.id === initialDayId);
      return i >= 0 ? i : 0;
    }
    return 0;
  });

  // Scroll a un day index
  const goTo = useCallback(
    (idx: number, smooth = true) => {
      const node = scrollRef.current;
      if (!node) return;
      const clamped = Math.max(0, Math.min(days.length - 1, idx));
      const cardWidth = node.clientWidth;
      node.scrollTo({
        left: cardWidth * clamped,
        behavior: smooth ? "smooth" : "auto",
      });
    },
    [days.length],
  );

  // Set initial scroll position
  useEffect(() => {
    goTo(activeIdx, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detect active day on scroll
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const cardWidth = node.clientWidth;
        const idx = Math.round(node.scrollLeft / cardWidth);
        if (idx !== activeIdx) {
          setActiveIdx(idx);
          haptic("light").catch(() => {});
          if (days[idx]?.id) onDayChange?.(days[idx].id);
        }
      });
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      node.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [activeIdx, days, onDayChange]);

  if (days.length === 0) return null;

  return (
    <div className="relative">
      {/* Swiper scroll container — native momentum + scroll-snap */}
      <div
        ref={scrollRef}
        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
        style={{
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          scrollBehavior: "smooth",
        }}
      >
        {days.map((day, idx) => {
          // Lazy load: solo montamos la foto si el día está a ±2 del activo.
          // Antes: días lejanos del activo fetcheaban N fotos in-flight innecesarias.
          // Ahora: solo 5 fotos máx en vuelo, el resto se monta on-demand cuando
          // el usuario scrollea cerca. El IntersectionObserver es secundario, cubre
          // edge case de deep links donde activeIdx no captura el card visible
          // antes del primer scroll event.
          const distance = Math.abs(idx - activeIdx);
          const eagerLoad = distance <= 2;
          return (
            <DayCard
              key={day.id}
              day={day}
              idx={idx}
              total={days.length}
              formatDate={formatDate}
              eagerLoad={eagerLoad}
            />
          );
        })}
      </div>

      {/* Nav buttons (desktop) */}
      {activeIdx > 0 && (
        <button
          onClick={() => goTo(activeIdx - 1)}
          className="hidden sm:flex absolute left-2 top-1/3 -translate-y-1/2 w-9 h-9 rounded-full bg-card/95 backdrop-blur-md shadow-[var(--shadow-floating)] items-center justify-center pressable z-20"
          aria-label="Día anterior"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      {activeIdx < days.length - 1 && (
        <button
          onClick={() => goTo(activeIdx + 1)}
          className="hidden sm:flex absolute right-2 top-1/3 -translate-y-1/2 w-9 h-9 rounded-full bg-card/95 backdrop-blur-md shadow-[var(--shadow-floating)] items-center justify-center pressable z-20"
          aria-label="Día siguiente"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      {/* Dots indicator */}
      <div className="flex items-center justify-center gap-1.5 mt-3 px-4 flex-wrap">
        {days.map((_, idx) => (
          <button
            key={idx}
            onClick={() => goTo(idx)}
            className={`h-1.5 rounded-full transition-all ${
              idx === activeIdx ? "w-8 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
            }`}
            aria-label={`Ir a día ${idx + 1}`}
            aria-current={idx === activeIdx ? "true" : undefined}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Day card ─────────────────────────────────────────────────────────────

function DayCard({
  day,
  idx,
  total,
  formatDate,
  eagerLoad,
}: {
  day: TripDay;
  idx: number;
  total: number;
  formatDate: (d: string, style?: "short" | "long" | "iso") => string;
  eagerLoad: boolean;
}) {
  const cityName = day.city_name;
  const cardRef = useRef<HTMLElement>(null);
  // Una vez que decidimos mostrar la foto, NO la quitamos al salir del viewport
  // (sería bizarro: el user scroll back y la foto re-fetches). One-way switch.
  const [shouldRenderPhoto, setShouldRenderPhoto] = useState(eagerLoad);

  useEffect(() => {
    if (shouldRenderPhoto) return;
    if (eagerLoad) {
      setShouldRenderPhoto(true);
      return;
    }
    const node = cardRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShouldRenderPhoto(true);
            obs.disconnect();
            break;
          }
        }
      },
      // rootMargin: prefetch un viewport antes — la foto está lista cuando
      // el user llega al card.
      { rootMargin: "100% 0px", threshold: 0.01 },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [eagerLoad, shouldRenderPhoto]);

  const isToday = (() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return day.date === t.toISOString().slice(0, 10);
  })();
  const gap = !day.accommodation || day.accommodation.toLowerCase().startsWith("pending");

  return (
    <article
      ref={cardRef}
      className={`shrink-0 w-full snap-center px-4 ${eagerLoad ? "" : "cv-auto"}`}
      style={{ scrollSnapAlign: "center" }}
    >
      <div className="rounded-2xl overflow-hidden shadow-[var(--shadow-floating)] bg-card">
        {/* Hero foto del POI/ciudad */}
        <div className="relative aspect-[16/10]">
          {cityName && shouldRenderPhoto ? (
            <DestinationPhoto destination={cityName} aspect="16/10" priority={idx <= 1} />
          ) : (
            // Placeholder ligero hasta que el card esté cerca del viewport.
            // Mismo tonal range que DestinationPhoto para evitar flash al swap.
            <div className="absolute inset-0 bg-gradient-to-br from-muted to-accent" />
          )}
          {/* Scrim suave bottom para legibilidad del overlay text */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.00) 30%, rgba(0,0,0,0.65) 100%)" }}
          />
          <div className="absolute bottom-3 left-4 right-4 text-white">
            <p className="text-[10px] font-bold tracking-[0.20em] uppercase opacity-85 text-shadow-soft">
              Día {day.day_number ?? idx + 1} de {total} {isToday && "· HOY"}
            </p>
            <h2 className="font-serif text-2xl leading-tight text-shadow-strong">{cityName || "Sin asignar"}</h2>
            <p className="text-[12px] opacity-90 mt-0.5 text-shadow-soft">{formatDate(day.date, "long")}</p>
          </div>
        </div>

        {/* Stratigraphy bar */}
        <div className="tampu-stratigraphy-bar h-1" aria-hidden />

        {/* Contenido del día */}
        <div className="p-4 space-y-3">
          {/* Estado */}
          <DayRow
            icon={<Bed className="w-4 h-4" />}
            label="Dormís en"
            value={day.accommodation || "Sin alojamiento"}
            tone={gap ? "alert" : "ok"}
          />
          {day.main_transport && (
            <DayRow icon={<Bus className="w-4 h-4" />} label="Traslado" value={day.main_transport} tone="neutral" />
          )}
          {day.main_activity && (
            <DayRow icon={<Activity className="w-4 h-4" />} label="Plan" value={day.main_activity} tone="neutral" />
          )}
          {gap && (
            <div className="flex items-center gap-2 text-destructive text-[12px] font-medium">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Sin alojamiento confirmado</span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function DayRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "ok" | "neutral" | "alert";
}) {
  const tint =
    tone === "alert" ? "text-destructive" : "text-foreground";
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-muted-foreground shrink-0 mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`text-[14px] font-semibold leading-tight mt-0.5 ${tint}`}>{value}</p>
      </div>
    </div>
  );
}
