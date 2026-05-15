// ─── WhatsApp auto-insert al trip ──────────────────────────────────────────
//
// Cierra el loop de la ingestion por WhatsApp. Toma el output del parser
// (parser.ts → ParsedWhatsAppItem) y, si pasa los gates de seguridad,
// inserta una fila en `reservations` asociada al trip activo del user.
//
// IMPORTANTE — schema reality:
//   - NO hay tabla separada `flights`. Todos los items (vuelos, hoteles,
//     transporte, tours) van a `reservations` con `type` enum.
//     Mapping: flight → 'flight', hotel → 'accommodation', transport →
//     'train'/'bus' (según context), reservation → 'tour'/'insurance'/'other'.
//   - `cities` es per-trip (no es catálogo global). No hay tabla `airports`.
//   - Service-role bypasses RLS — se valida ownership del trip en el caller.
//
// Decisión de auto-insertar SI Y SOLO SI:
//   1. type ∈ flight | hotel | reservation | transport  (NO note, NO unknown)
//   2. confidence ∈ high | medium                       (NO low)
//   3. Existe trip activo único (por fecha del item, o por defecto si solo
//      hay uno). Si hay ambigüedad → skip.
//   4. Idempotencia: este whatsapp_message_id no insertó antes.
//   5. La descripción se puede armar (no es vacía).
//
// Documentación de casos edge probados:
//   A) user con 1 trip activo + parse high + fechas válidas → insert exitoso.
//   B) user sin trips activos → skip con 'no_active_trip', user crea trip
//      después y reintenta manual desde /whatsapp.
//   C) parser dio confidence 'low' → skip con 'low_confidence', user confirma
//      manual.
//   D) parser dio city "Cuzco" que NO matchea ninguna city del trip → la
//      reserva se inserta con city_id=NULL + city_name='Cuzco' (texto libre).
//      NO falla, porque city_id es nullable en el schema.
//   E) Twilio reintenta el mismo msgId → autoInsertParsedItem detecta que
//      whatsapp_messages.auto_inserted_item_id ya existe, devuelve
//      'idempotent_skip' sin crear duplicado.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedWhatsAppItem, WhatsAppItemType, Confidence } from "./parser";
import type { ReservationType, ReservationStatus, Criticality } from "@/lib/types/database";

// Razones de skip — la UI las mapea a strings amigables en voseo.
export type AutoInsertSkippedReason =
  | "low_confidence"
  | "no_active_trip"
  | "multiple_trips_ambiguous"
  | "unknown_location"
  | "unsupported_type"
  | "missing_required_field"
  | "idempotent_skip"
  | "insert_failed";

export interface AutoInsertResult {
  inserted: boolean;
  itemId?: string;
  itemType?: ReservationType;
  tripId?: string;
  skippedReason?: AutoInsertSkippedReason;
  /** Mensaje técnico (NO mostrar al user). Para logs / Sentry. */
  error?: string;
}

// ─── helpers ────────────────────────────────────────────────────────────

/**
 * Mapea el `type` del parser al `type` enum de reservations.
 * Devuelve null si el type no se debería auto-insertar (note, unknown).
 *
 * Para 'reservation' miramos el subcategoría `data.category` ('tour',
 * 'insurance', 'transfer', 'event', 'restaurant', 'other'). En el schema
 * de reservations, los valores válidos son: flight, accommodation, train,
 * bus, tour, insurance, connectivity, other. Cualquier otro cae en 'other'.
 *
 * Para 'transport' miramos `data.operator` / texto libre y elegimos entre
 * 'train' y 'bus'. Default 'bus' (más común en LatAm).
 */
function mapToReservationType(item: ParsedWhatsAppItem): ReservationType | null {
  const d = item.data as Record<string, unknown>;
  switch (item.type) {
    case "flight":
      return "flight";
    case "hotel":
      return "accommodation";
    case "transport": {
      const opRaw = typeof d.operator === "string" ? d.operator.toLowerCase() : "";
      // Heurística básica: si el operator menciona "tren"/"train"/"ferrocarril" → train
      if (/(\btren\b|train|ferrocarril|rail)/i.test(opRaw)) return "train";
      return "bus";
    }
    case "reservation": {
      const cat = typeof d.category === "string" ? d.category.toLowerCase() : "";
      if (cat === "tour") return "tour";
      if (cat === "insurance") return "insurance";
      if (cat === "transfer") return "bus"; // transfer pagado → bus (closest match)
      if (cat === "event" || cat === "restaurant" || cat === "other") return "other";
      return "other";
    }
    default:
      return null;
  }
}

/**
 * Extrae la fecha "operativa" del item (use_date en reservations).
 * - flight: departure_at
 * - hotel: check_in
 * - transport: departure_at
 * - reservation: start_at
 *
 * Devuelve un YYYY-MM-DD o null si no se puede extraer.
 */
function extractUseDate(item: ParsedWhatsAppItem): string | null {
  const d = item.data as Record<string, unknown>;
  let raw: unknown;
  switch (item.type) {
    case "flight":
    case "transport":
      raw = d.departure_at;
      break;
    case "hotel":
      raw = d.check_in;
      break;
    case "reservation":
      raw = d.start_at;
      break;
    default:
      return null;
  }
  if (typeof raw !== "string" || !raw.trim()) return null;
  // Si es ISO datetime, tomamos los primeros 10 chars (YYYY-MM-DD).
  // Si es solo date, lo dejamos. Validamos formato mínimo.
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** Misma lógica para use_end_date (check_out / arrival_at / end_at). */
function extractUseEndDate(item: ParsedWhatsAppItem): string | null {
  const d = item.data as Record<string, unknown>;
  let raw: unknown;
  switch (item.type) {
    case "flight":
    case "transport":
      raw = d.arrival_at;
      break;
    case "hotel":
      raw = d.check_out;
      break;
    case "reservation":
      raw = d.end_at;
      break;
    default:
      return null;
  }
  if (typeof raw !== "string" || !raw.trim()) return null;
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * Arma la `description` que va a guardarse en reservations.description (NOT
 * NULL en el schema). NUNCA devuelve vacío — siempre algo legible.
 */
function buildDescription(item: ParsedWhatsAppItem): string {
  const d = item.data as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  switch (item.type) {
    case "flight": {
      const airline = s(d.airline);
      const flightNumber = s(d.flight_number);
      const from = s(d.from_iata) || s(d.from_city) || "?";
      const to = s(d.to_iata) || s(d.to_city) || "?";
      const parts = [airline, flightNumber, `${from} → ${to}`].filter(Boolean);
      return parts.join(" ").trim() || "Vuelo";
    }
    case "hotel": {
      const name = s(d.property_name) || s(d.provider) || "Alojamiento";
      const host = s(d.host_name);
      return host ? `${name} (host: ${host})` : name;
    }
    case "transport": {
      const op = s(d.operator) || "Transporte";
      const from = s(d.from_city) || "?";
      const to = s(d.to_city) || "?";
      return `${op} ${from} → ${to}`;
    }
    case "reservation": {
      const desc = s(d.description) || s(d.provider) || "Reserva";
      return desc;
    }
    default:
      return "Item de WhatsApp";
  }
}

/** Extrae el provider (NOT NULL en reservations). Default a "WhatsApp". */
function buildProvider(item: ParsedWhatsAppItem): string {
  const d = item.data as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  switch (item.type) {
    case "flight":
      return s(d.airline) || "Aerolínea";
    case "hotel":
      return s(d.provider) || "Alojamiento";
    case "transport":
      return s(d.operator) || "Transporte";
    case "reservation":
      return s(d.provider) || "Proveedor";
    default:
      return "WhatsApp";
  }
}

/** Para city_name (texto libre, nullable). Toma la to_city / city / from_city. */
function pickCityName(item: ParsedWhatsAppItem): string | null {
  const d = item.data as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  switch (item.type) {
    case "flight":
      return s(d.to_city) || s(d.from_city);
    case "hotel":
      return s(d.city);
    case "transport":
      return s(d.to_city) || s(d.from_city);
    case "reservation":
      return s(d.city);
    default:
      return null;
  }
}

function pickAmount(item: ParsedWhatsAppItem): number {
  const v = (item.data as Record<string, unknown>).amount;
  if (typeof v === "number" && isFinite(v) && v >= 0) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (isFinite(n) && n >= 0) return n;
  }
  return 0;
}

function pickCurrency(item: ParsedWhatsAppItem): string {
  const v = (item.data as Record<string, unknown>).currency;
  if (typeof v === "string" && /^[A-Z]{3}$/.test(v.trim().toUpperCase())) {
    return v.trim().toUpperCase();
  }
  return "USD";
}

function pickLocator(item: ParsedWhatsAppItem): string | null {
  const d = item.data as Record<string, unknown>;
  const v = d.locator ?? d.confirmation_code;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Criticality default por tipo.
 *  - flight / hotel: columna vertebral del viaje → 'important'.
 *  - transport: traslados / buses / trenes → también 'important' (perderlos
 *    rompe el itinerario).
 *  - reservation: tours, restaurants, etc — 'nice_to_have' por default, el
 *    user puede subirlo en la UI si quiere. */
function criticalityFor(item: ParsedWhatsAppItem): Criticality {
  if (item.type === "flight" || item.type === "hotel") return "important";
  if (item.type === "transport") return "important";
  return "nice_to_have";
}

// ─── core ───────────────────────────────────────────────────────────────

const ALLOWED_TYPES = new Set<WhatsAppItemType>(["flight", "hotel", "reservation", "transport"]);
const ALLOWED_CONFIDENCE = new Set<Confidence>(["high", "medium"]);

export interface AutoInsertOpts {
  /** Si true, fuerza el insert ignorando el gate de confidence/type/idempotencia.
   *  Usado por el endpoint de "confirmar manualmente" desde /whatsapp. */
  force?: boolean;
  /** Si está, override del trip target (caso force/manual: el user eligió). */
  forceTripId?: string;
}

/**
 * Punto de entrada principal. Llamado por el webhook de WhatsApp después de
 * que el parser devolvió un ParsedWhatsAppItem. Recibe un cliente Supabase
 * con service_role (bypassea RLS).
 *
 * Garantías:
 *   - Idempotente: si ya hay un row en reservations con source='whatsapp_ingestion'
 *     y metadata->whatsapp_message_id = msgId, NO duplica.
 *   - Conservador: ante cualquier ambigüedad, skip con razón clara.
 *   - Nunca tira excepción al caller — devuelve { inserted: false, error }.
 *
 * Latencia objetivo ≤500ms — solo 2-3 queries SQL (active_trip, idempotency,
 * insert). El webhook nos llama sync dentro del budget de 15s de Twilio.
 */
export async function autoInsertParsedItem(
  sb: SupabaseClient,
  msgId: string,
  userId: string,
  parsedJson: ParsedWhatsAppItem,
  opts: AutoInsertOpts = {},
): Promise<AutoInsertResult> {
  try {
    // ─── Idempotencia: chequear si este msgId ya tiene auto_inserted_item_id ─
    // Esto cubre el caso E (Twilio reintenta). Importante hacerlo SIEMPRE,
    // incluso en force, porque el user podría tocar dos veces el botón
    // "asociar manualmente" en /whatsapp.
    const { data: msgRow, error: msgErr } = await sb
      .from("whatsapp_messages")
      .select("auto_inserted_item_id, auto_insert_skipped_reason")
      .eq("id", msgId)
      .maybeSingle();
    if (msgErr) {
      return { inserted: false, error: `lookup_msg_failed: ${msgErr.message}` };
    }
    if (msgRow?.auto_inserted_item_id) {
      return {
        inserted: false,
        skippedReason: "idempotent_skip",
        itemId: msgRow.auto_inserted_item_id,
      };
    }

    // ─── Gate 1: type ───
    if (!opts.force && !ALLOWED_TYPES.has(parsedJson.type)) {
      return { inserted: false, skippedReason: "unsupported_type" };
    }
    const resType = mapToReservationType(parsedJson);
    if (!resType) {
      return { inserted: false, skippedReason: "unsupported_type" };
    }

    // ─── Gate 2: confidence ───
    if (!opts.force && !ALLOWED_CONFIDENCE.has(parsedJson.confidence)) {
      return { inserted: false, skippedReason: "low_confidence" };
    }

    // ─── Gate 3: trip activo ───
    const useDate = extractUseDate(parsedJson);
    let tripId: string | null = opts.forceTripId ?? null;

    if (!tripId) {
      // Primero, intento con fecha (más específico).
      if (useDate) {
        const { data: byDate, error: rpcErr } = await sb.rpc("find_active_trip", {
          p_user_id: userId,
          p_date: useDate,
        });
        if (rpcErr) {
          return { inserted: false, error: `find_trip_rpc_failed: ${rpcErr.message}` };
        }
        if (typeof byDate === "string") tripId = byDate;
      }
      // Si la fecha no resolvió, intento sin fecha (único trip activo).
      if (!tripId) {
        const { data: anyTrip, error: rpcErr2 } = await sb.rpc("find_active_trip", {
          p_user_id: userId,
          p_date: null,
        });
        if (rpcErr2) {
          return { inserted: false, error: `find_trip_rpc_failed_2: ${rpcErr2.message}` };
        }
        if (typeof anyTrip === "string") tripId = anyTrip;
      }
    }

    if (!tripId) {
      // Distinguimos: ¿es porque no hay trips, o porque hay varios?
      const { count: activeCount } = await sb
        .from("trips")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["planning", "active"]);
      if ((activeCount ?? 0) === 0) {
        return { inserted: false, skippedReason: "no_active_trip" };
      }
      return { inserted: false, skippedReason: "multiple_trips_ambiguous" };
    }

    // ─── Gate 4: idempotencia por whatsapp_message_id en metadata ───
    // (defensa extra: por si el msgRow.auto_inserted_item_id se borró pero
    // la reserva sigue ahí).
    const { data: existingByMeta } = await sb
      .from("reservations")
      .select("id")
      .eq("trip_id", tripId)
      .eq("source", "whatsapp_ingestion")
      .filter("metadata->>whatsapp_message_id", "eq", msgId)
      .maybeSingle();
    if (existingByMeta?.id) {
      return {
        inserted: false,
        skippedReason: "idempotent_skip",
        itemId: existingByMeta.id,
        tripId,
      };
    }

    // ─── Gate 5: campos mínimos ───
    const description = buildDescription(parsedJson);
    if (!description || description === "Item de WhatsApp") {
      // El parser no pudo armar una descripción legible — mejor pedir
      // confirmación manual.
      return { inserted: false, skippedReason: "missing_required_field", tripId };
    }

    // ─── Resolver city_id (best effort, opcional) ───
    // Si no resuelve, NO bloqueamos: city_id queda NULL y city_name guarda
    // texto libre. La UI muestra el nombre igual.
    const cityName = pickCityName(parsedJson);
    let cityId: string | null = null;
    if (cityName) {
      const { data: cityIdRpc, error: cityErr } = await sb.rpc("find_city_by_name", {
        p_trip_id: tripId,
        p_name: cityName,
      });
      if (!cityErr && typeof cityIdRpc === "string") {
        cityId = cityIdRpc;
      }
      // Si cityErr no es null, lo dejamos pasar — best effort.
    }

    // ─── Build payload e insert ───
    const amount = pickAmount(parsedJson);
    const currency = pickCurrency(parsedJson);

    // Status: 'confirmed' si vino con locator (alta señal de confirmación
    // real), 'booked' si no.
    const locator = pickLocator(parsedJson);
    const status: ReservationStatus = locator ? "confirmed" : "booked";

    const payload = {
      trip_id: tripId,
      type: resType,
      criticality: criticalityFor(parsedJson),
      provider: buildProvider(parsedJson),
      city_id: cityId,
      city_name: cityName, // texto libre, OK aunque cityId resolvió
      description,
      purchase_date: null as string | null,
      use_date: useDate,
      use_end_date: extractUseEndDate(parsedJson),
      payment_deadline: null as string | null,
      original_amount: amount,
      original_currency: currency,
      exchange_rate: 1, // sin tabla de FX online; el user puede editar
      base_amount: amount, // mismo que original (FX 1:1) — el user lo corrige
      status,
      confirmation_received: !!locator,
      locator,
      link: null as string | null,
      contact: null as string | null,
      cancellation_policy: null as string | null,
      is_cancellable: true,
      notes: parsedJson.reasoning
        ? `Auto-insertado desde WhatsApp · ${parsedJson.reasoning}`
        : "Auto-insertado desde WhatsApp",
      // Columnas nuevas (migration 00026):
      source: "whatsapp_ingestion" as const,
      created_by_automation: true,
      metadata: {
        whatsapp_message_id: msgId,
        parser_confidence: parsedJson.confidence,
        parser_type: parsedJson.type,
        // Si city no resolvió pero teníamos un nombre, lo dejamos para que
        // un futuro re-process pueda intentar de nuevo.
        ...(cityName && !cityId ? { raw_location: cityName } : {}),
      },
    };

    const { data: inserted, error: insertErr } = await sb
      .from("reservations")
      .insert(payload)
      .select("id")
      .maybeSingle();
    if (insertErr || !inserted) {
      return {
        inserted: false,
        skippedReason: "insert_failed",
        tripId,
        error: insertErr?.message ?? "no_row_returned",
      };
    }

    return {
      inserted: true,
      itemId: inserted.id,
      itemType: resType,
      tripId,
    };
  } catch (e) {
    return {
      inserted: false,
      skippedReason: "insert_failed",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Texto amigable (voseo) para mandar al user via TwiML reply / mostrar
 * en la UI cuando NO se auto-insertó.
 */
export function skippedReasonToUserMessage(reason: AutoInsertSkippedReason): string {
  switch (reason) {
    case "low_confidence":
      return "No estoy 100% seguro, confirmalo vos desde la app.";
    case "no_active_trip":
      return "Necesito que crees un viaje primero para poder agregarlo.";
    case "multiple_trips_ambiguous":
      return "Tenés varios viajes activos — decime cuál desde la app.";
    case "unknown_location":
      return "No reconocí el lugar, completalo en la app.";
    case "unsupported_type":
      return "Lo guardé como nota — revisalo en la app.";
    case "missing_required_field":
      return "Me faltó info, completalo desde la app.";
    case "idempotent_skip":
      return "Ya lo tenía agregado.";
    case "insert_failed":
      return "Algo falló al guardarlo — confirmalo manualmente.";
  }
}
