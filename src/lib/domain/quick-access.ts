import type { Trip, Reservation, Document, TripDay } from "@/lib/types/database";

export interface QuickAccessSnapshot {
  passport: { name: string; status: string; ready: boolean; offline: boolean } | null;
  insurance: { provider: string; status: string; locator: string | null; contact: string | null } | null;
  next_flight: { description: string; provider: string; date: string; locator: string | null } | null;
  current_bed: { city: string | null; address: string | null; date: string; check_in: boolean; check_out: boolean } | null;
  emergency_contacts: { name: string; notes: string | null }[];
  offline_ready_count: number;
  offline_total_count: number;
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

export function buildQuickAccess(
  trip: Trip,
  reservations: Reservation[],
  documents: Document[],
  tripDays: TripDay[],
): QuickAccessSnapshot {
  const passport = documents.find(d => d.type === "passport");
  const insuranceDoc = documents.find(d => d.type === "insurance");
  const insuranceRes = reservations.find(r => r.type === "insurance");

  const insurance = insuranceRes
    ? {
        provider: insuranceRes.provider,
        status: insuranceRes.status,
        locator: insuranceRes.locator,
        contact: insuranceRes.contact,
      }
    : insuranceDoc
    ? {
        provider: insuranceDoc.name,
        status: insuranceDoc.status,
        locator: null,
        contact: null,
      }
    : null;

  const today = todayIso();
  const flights = reservations
    .filter(r => r.type === "flight" && r.use_date && r.status !== "cancelled" && r.status !== "expired")
    .sort((a, b) => (a.use_date || "").localeCompare(b.use_date || ""));
  const next_flight_res = flights.find(r => (r.use_date || "") >= today) || flights[0] || null;
  const next_flight = next_flight_res
    ? {
        description: next_flight_res.description.substring(0, 80),
        provider: next_flight_res.provider,
        date: next_flight_res.use_date as string,
        locator: next_flight_res.locator,
      }
    : null;

  // Current bed: today's TripDay if in trip, else next assigned TripDay
  const todayDay = tripDays.find(d => d.date === today);
  const nextWithBed = tripDays.find(d => d.date >= today && !!d.accommodation && !d.accommodation.toLowerCase().startsWith("pending"));
  const bedDay = todayDay && todayDay.accommodation && !todayDay.accommodation.toLowerCase().startsWith("pending") ? todayDay : nextWithBed;
  const current_bed = bedDay
    ? {
        city: bedDay.city_name,
        address: bedDay.accommodation,
        date: bedDay.date,
        check_in: bedDay.check_in,
        check_out: bedDay.check_out,
      }
    : null;

  const emergency_contacts = documents
    .filter(d => d.type === "emergency_contact")
    .map(d => ({ name: d.name, notes: d.notes }));

  const offline_total_count = documents.filter(d => d.criticality === "blocker" || d.criticality === "essential").length;
  const offline_ready_count = documents.filter(d => (d.criticality === "blocker" || d.criticality === "essential") && d.has_offline_copy).length;

  return {
    passport: passport
      ? { name: passport.name, status: passport.status, ready: passport.status === "ready", offline: passport.has_offline_copy }
      : null,
    insurance,
    next_flight,
    current_bed,
    emergency_contacts,
    offline_ready_count,
    offline_total_count,
  };
}
