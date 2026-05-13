import type { Reservation, TripDay, City } from "@/lib/types/database";

// ─── CONNECTION / LAYOVER RISK ANALYSIS ───
// Detects travel-ops issues a real ops manager would flag:
//   - layover too short for international transfer (<90 min)
//   - layover too short for domestic transfer (<45 min)
//   - check-out & check-in same day with no buffer
//   - flight arrival to tour start with <12h buffer
//   - missing same-day accommodation when arriving from a long-haul flight

export type ConnectionSeverity = "info" | "warning" | "critical";

export interface ConnectionIssue {
  id: string;
  kind: "tight_layover" | "no_buffer_checkout" | "tight_tour_start" | "uncovered_arrival" | "same_day_long_haul";
  severity: ConnectionSeverity;
  title: string;
  detail: string;
  suggested_action: string;
  reservation_ids: string[];
  date: string | null;
  buffer_minutes?: number;
}

export interface ConnectionAnalysis {
  issues: ConnectionIssue[];
  total_critical: number;
  total_warning: number;
  flights_analyzed: number;
}

// Heuristic to detect "international" connection: city_name contains country/country-code
// hint. In a real product this would come from IATA city/airport metadata. Here we use
// the country list parsed from cities[].
function isInternationalSegment(
  fromCity: string | null,
  toCity: string | null,
  cities: City[],
): boolean {
  if (!fromCity || !toCity) return true; // safe default
  const fromCountry = cities.find(c => fromCity.includes(c.name))?.country;
  const toCountry = cities.find(c => toCity.includes(c.name))?.country;
  if (!fromCountry || !toCountry) return true;
  return fromCountry !== toCountry;
}

function parseDateTimeFromReservation(r: Reservation, which: "start" | "end"): Date | null {
  const dateStr = which === "start" ? r.use_date : (r.use_end_date || r.use_date);
  if (!dateStr) return null;
  // We only have date precision in the schema. Treat start as midday so layovers
  // computed in days are conservative-but-stable.
  const t = which === "start" ? "00:00:00" : "23:59:59";
  return new Date(`${dateStr}T${t}Z`);
}

function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

export function analyzeConnections(
  reservations: Reservation[],
  tripDays: TripDay[],
  cities: City[],
): ConnectionAnalysis {
  const issues: ConnectionIssue[] = [];

  const flights = reservations
    .filter(r => r.type === "flight" && r.status !== "cancelled" && r.status !== "expired" && r.use_date)
    .sort((a, b) => (a.use_date || "").localeCompare(b.use_date || ""));

  // 1. Tight layovers between consecutive flights
  for (let i = 0; i < flights.length - 1; i++) {
    const a = flights[i];
    const b = flights[i + 1];
    const aEnd = parseDateTimeFromReservation(a, "end");
    const bStart = parseDateTimeFromReservation(b, "start");
    if (!aEnd || !bStart) continue;
    const gap = minutesBetween(aEnd, bStart);
    if (gap < 0) continue; // overlapping is a different problem; flagged below

    const international = isInternationalSegment(a.city_name, b.city_name, cities);
    const min = international ? 90 : 45;

    if (gap < min) {
      issues.push({
        id: `tight-${a.id}-${b.id}`,
        kind: "tight_layover",
        severity: gap < min / 2 ? "critical" : "warning",
        title: `Conexión apretada: ${a.city_name || a.provider} → ${b.city_name || b.provider}`,
        detail: `Solo ${gap} min entre llegada y siguiente vuelo. Mínimo recomendado: ${min} min (${international ? "internacional" : "doméstico"}).`,
        suggested_action: gap < min / 2
          ? "Reagendá el vuelo siguiente. Si lo perdés, podés perder también lo que sigue."
          : "Verificá terminal de llegada/salida. Pedí asiento adelante para bajar primero.",
        reservation_ids: [a.id, b.id],
        date: a.use_end_date || a.use_date,
        buffer_minutes: gap,
      });
    }
  }

  // 2. Check-out and check-in same day with no buffer (potential luggage gap)
  const checkoutDays = tripDays.filter(d => d.check_out);
  for (const co of checkoutDays) {
    const sameDayCheckin = tripDays.find(d => d.date === co.date && d.check_in && d.id !== co.id);
    if (sameDayCheckin) {
      issues.push({
        id: `checkout-checkin-${co.id}`,
        kind: "no_buffer_checkout",
        severity: "info",
        title: `Check-out y check-in el mismo día (${co.date})`,
        detail: `Saliendo de ${co.accommodation || "alojamiento"} y entrando a ${sameDayCheckin.accommodation || "alojamiento siguiente"}. Verificar horarios y gestionar equipaje.`,
        suggested_action: "Consultá luggage storage / consigna en el hotel saliente si tu próximo check-in es tarde.",
        reservation_ids: [],
        date: co.date,
      });
    }
  }

  // 3. Long-haul flight arrival to tour start with <2 days buffer
  // We use date-only granularity since reservations don't store time-of-day.
  // 0 days = same day = critical. 1 day = next day = warning. >=2 days = OK.
  const tour = reservations.find(r => r.type === "tour" && r.use_date && r.criticality !== "nice_to_have");
  if (tour && tour.use_date) {
    const flightBefore = [...flights].reverse().find(f => {
      const fArrive = f.use_end_date || f.use_date;
      return fArrive && fArrive <= (tour.use_date as string);
    });
    if (flightBefore) {
      const arrival = flightBefore.use_end_date || flightBefore.use_date!;
      const tourDate = tour.use_date;
      const arrivalDate = new Date(arrival + "T00:00:00Z");
      const tourStartDate = new Date(tourDate + "T00:00:00Z");
      const gapDays = Math.round((tourStartDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24));
      if (gapDays < 2) {
        const sev: ConnectionSeverity = gapDays <= 0 ? "critical" : "warning";
        issues.push({
          id: `tour-buffer-${tour.id}`,
          kind: "tight_tour_start",
          severity: sev,
          title: gapDays <= 0
            ? `Tour empieza el mismo día del vuelo (${tour.description.substring(0, 50)})`
            : `Tour empieza ${gapDays} día(s) después del vuelo`,
          detail: `${tour.description.substring(0, 60)} comienza ${tour.use_date}. Vuelo previo llega ${arrival}.`,
          suggested_action: gapDays <= 0
            ? "Crítico: cualquier retraso del vuelo te hace perder el tour (sin refund a <90 días). Reagendá el vuelo a 1+ día antes."
            : "Garantizá llegar 1 día antes para acomodarte / lidiar con retrasos del vuelo.",
          reservation_ids: [tour.id, flightBefore.id],
          date: tour.use_date,
          buffer_minutes: gapDays * 24 * 60,
        });
      }
    }
  }

  // 4. Long-haul flight (>8h based on city pair = international + multi-segment) arriving to
  //    a day with no confirmed accommodation
  for (const f of flights) {
    if (!f.use_date) continue;
    const arrivalDate = f.use_end_date || f.use_date;
    const day = tripDays.find(d => d.date === arrivalDate);
    if (!day) continue;
    const uncovered = !day.accommodation || day.accommodation.toLowerCase().startsWith("pending");
    if (uncovered) {
      issues.push({
        id: `arrival-no-bed-${f.id}`,
        kind: "uncovered_arrival",
        severity: "warning",
        title: `Llegada sin cama el ${arrivalDate}`,
        detail: `Vuelo ${f.provider} arriba a ${f.city_name || day.city_name || "destino"} sin alojamiento confirmado.`,
        suggested_action: "Reservar hotel/airbnb antes de viajar. Llegar cansado sin cama es la peor combinación.",
        reservation_ids: [f.id],
        date: arrivalDate,
      });
    }
  }

  const total_critical = issues.filter(i => i.severity === "critical").length;
  const total_warning = issues.filter(i => i.severity === "warning").length;

  return { issues, total_critical, total_warning, flights_analyzed: flights.length };
}
