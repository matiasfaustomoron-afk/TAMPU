// ─── AI Itinerary → Trip merger ───
//
// Toma un `DraftItinerary` generado por el LLM y lo inserta en el trip real,
// reconciliando con los `trip_days` que ya existen y creando reservas tentativas
// para cada actividad con costo.
//
// Modos:
//   - "replace": cualquier trip_day existente en el rango del draft se sobrescribe.
//   - "merge":   preserva trip_days que ya tienen `accommodation` o `status=confirmed`.
//                Sólo sobrescribe los que están "empty" o tienen status=partial sin
//                cama asignada.
//
// La función NO importa hooks de React — recibe las funciones de mutation como
// parámetros (inyección de dependencias), así puede usarse tanto desde la UI
// (useMutations()) como desde una server action / migración futura.

import type { DraftItinerary, DraftDay, DraftActivity } from "./itinerary-generator";
import type { TripDay, Reservation, Trip, DayStatus } from "@/lib/types/database";

export interface MergerDeps {
  /** Trip activo. Se necesita el start_date para calcular day_number. */
  trip: Trip;
  /** Los trip_days actuales del viaje (para el lookup en modo merge). */
  existingDays: TripDay[];
  /** Upsert por (trip_id, date). Reemplaza si existe, crea si no. */
  upsertDay: (row: Omit<TripDay, "id">) => Promise<TripDay | null>;
  /** Inserta una reserva nueva. */
  addReservation: (r: Omit<Reservation, "id" | "created_at" | "updated_at">) => Promise<Reservation | null>;
}

export interface MergeOptions {
  mode: "replace" | "merge";
  /** Si se pasa, solo procesa los DraftDays cuyas dates estén en este Set. */
  selectedDates?: Set<string>;
  /** Default true. Si false, no crea reservas (solo upsertDay). */
  createActivityReservations?: boolean;
}

export interface MergeResult {
  inserted: number;       // trip_days creados
  updated: number;        // trip_days actualizados
  skipped: number;        // trip_days preservados por modo merge
  reservationsCreated: number;
}

/**
 * Devuelve true si el `existingDay` debe preservarse en modo "merge".
 * Heurística: si ya tiene accommodation o el status es confirmed, asumimos
 * que el user lo trabajó manualmente y no queremos sobrescribirlo.
 */
function shouldPreserveInMerge(existing: TripDay): boolean {
  if (existing.status === "confirmed") return true;
  if (existing.accommodation && !existing.accommodation.toLowerCase().startsWith("pending")) return true;
  // accommodation_reservation_id linkeado a una reserva real → preservar
  if (existing.accommodation_reservation_id) return true;
  return false;
}

function dayNumberFor(date: string, tripStartDate: string): number {
  const d = new Date(`${date}T00:00:00`);
  const s = new Date(`${tripStartDate}T00:00:00`);
  return Math.max(1, Math.round((d.getTime() - s.getTime()) / 86_400_000) + 1);
}

/**
 * Mapea un DraftDay a una row de trip_days. Si existía un trip_day previo y
 * estamos mergeando, conservamos algunos campos (accommodation_reservation_id,
 * actual_cost) que el draft no puede saber.
 */
function draftDayToTripDayRow(
  draft: DraftDay,
  draftCurrency: string,
  generatedBy: string,
  trip: Trip,
  existing: TripDay | undefined,
): Omit<TripDay, "id"> {
  const mainAct = draft.activities.find(a => a.kind === "experience" || a.kind === "sightseeing");
  const transportAct = draft.activities.find(a => a.kind === "transport");
  const secondaryAct = draft.activities.filter(a => a !== mainAct).find(a => a.kind !== "transport" && a.kind !== "rest");

  const status: DayStatus = draft.activities.length === 0 ? "empty" : "partial";

  // En modo merge, si había accommodation real previa, no la pisamos.
  const accommodation =
    existing && shouldPreserveInMerge(existing)
      ? existing.accommodation
      : draft.accommodation_suggestion;

  const accommodation_reservation_id = existing?.accommodation_reservation_id ?? null;

  return {
    trip_id: trip.id,
    date: draft.date,
    day_number: dayNumberFor(draft.date, trip.start_date),
    city_id: existing?.city_id ?? null,
    city_name: draft.city,
    zone: draft.zone,
    accommodation,
    accommodation_reservation_id,
    check_in: existing?.check_in ?? false,
    check_out: existing?.check_out ?? false,
    main_activity: mainAct?.title || existing?.main_activity || null,
    secondary_activity: secondaryAct?.title || existing?.secondary_activity || null,
    main_transport: transportAct?.title || draft.main_transport || existing?.main_transport || null,
    estimated_cost: draft.total_estimated_cost,
    actual_cost: existing?.actual_cost ?? 0,
    notes: draft.notes
      ? `${draft.notes} · (IA: ${generatedBy}, ${draftCurrency})`
      : `Generado con IA (${generatedBy})`,
    status,
  };
}

function activityToReservation(
  a: DraftActivity,
  draft: DraftItinerary,
  day: DraftDay,
  tripId: string,
): Omit<Reservation, "id" | "created_at" | "updated_at"> {
  return {
    trip_id: tripId,
    type: "tour",
    criticality: "nice_to_have",
    provider: "AI Plan",
    city_id: null,
    city_name: day.city,
    description: `${a.time} · ${a.title}`,
    purchase_date: null,
    use_date: day.date,
    use_end_date: null,
    payment_deadline: null,
    original_amount: a.estimated_cost,
    original_currency: draft.currency,
    exchange_rate: 1,
    base_amount: a.estimated_cost,
    status: "pending",
    confirmation_received: false,
    locator: null,
    link: null,
    contact: null,
    cancellation_policy: null,
    is_cancellable: true,
    notes: `${a.description} · DRAFT (IA · ${draft.generated_by})`,
  };
}

/**
 * Mergea el draft en el trip. Devuelve estadísticas para mostrar al user.
 *
 * Flow:
 *   1. Para cada draft.day (filtrado opcionalmente por `selectedDates`):
 *      a. Lookup en `existingDays` por fecha.
 *      b. Si existe y modo=merge y `shouldPreserveInMerge(existing)` → skip.
 *      c. Si no, build la row con `draftDayToTripDayRow` y upsertDay.
 *      d. Por cada activity con cost > 0 → addReservation (si `createActivityReservations`).
 *
 * IMPORTANTE: no borra trip_days en modo replace que estén fuera del rango del
 * draft. Si el user generó un plan de 5 días pero ya tenía 8 trip_days, los 3
 * extras NO se tocan. Esto es defensivo — borrar trip_days que el user pudo
 * haber editado es destructivo.
 */
export async function mergeDraftIntoTrip(
  draft: DraftItinerary,
  deps: MergerDeps,
  options: MergeOptions,
): Promise<MergeResult> {
  const { trip, existingDays, upsertDay, addReservation } = deps;
  const { mode, selectedDates, createActivityReservations = true } = options;

  // Index existing by date for O(1) lookup
  const byDate = new Map<string, TripDay>();
  for (const d of existingDays) byDate.set(d.date, d);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let reservationsCreated = 0;

  for (const dDraft of draft.days) {
    if (selectedDates && !selectedDates.has(dDraft.date)) {
      continue; // user no seleccionó este día
    }

    const existing = byDate.get(dDraft.date);

    // Modo merge: respetamos días con cama real / status=confirmed
    if (mode === "merge" && existing && shouldPreserveInMerge(existing)) {
      skipped++;
      continue;
    }

    const row = draftDayToTripDayRow(dDraft, draft.currency, draft.generated_by, trip, existing);
    const result = await upsertDay(row);
    if (result) {
      if (existing) updated++;
      else inserted++;
    }

    if (createActivityReservations) {
      for (const a of dDraft.activities) {
        if (a.estimated_cost <= 0) continue;
        const r = await addReservation(activityToReservation(a, draft, dDraft, trip.id));
        if (r?.id) reservationsCreated++;
      }
    }
  }

  return { inserted, updated, skipped, reservationsCreated };
}

/**
 * Helper: dado los `existingDays` del viaje, decide si la operación califica
 * como "destructiva" (más del 50% de los días tienen plan). El llamador puede
 * usar esto para mostrar un confirm antes de invocar `mergeDraftIntoTrip`.
 *
 * Cuenta como "planeado" cualquier día con status !== "empty" o con
 * accommodation != null.
 */
export function isMostlyPlanned(existingDays: TripDay[]): boolean {
  if (existingDays.length === 0) return false;
  const plannedCount = existingDays.filter(
    d => d.status !== "empty" || !!d.accommodation
  ).length;
  return plannedCount / existingDays.length > 0.5;
}
