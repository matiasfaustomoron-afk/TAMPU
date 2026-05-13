// ─── Email-in inbox store (high-level API) ───
//
// Wrapper sobre `store.ts` que expone la API solicitada en la especificación:
//   - addInboxItem(item)
//   - listInboxItems(tripId)
//   - markAsImported(itemId, reservationId)
//   - deleteInboxItem(itemId)
//
// Persistencia:
//   - Si Supabase está conectado (online mode) → tabla `email_in_entries`
//     (schema definido en una migración aparte; ver README de la app).
//   - Si no → localStorage bajo `tampu-inbox-<tripId>` (con migración del legacy
//     key `tampu.email-in.<tripId>` que usaba el store de bajo nivel).
//
// Notas:
//   - La firma del `item` acepta el shape de la spec (`from, subject, snippet,
//     parsed_result, status`) y lo proyecta a `EmailInEntry` para compatibilidad
//     con el resto del código que ya usa esa interfaz (page.tsx, route.ts, etc).
//   - Es un módulo "client+server-safe": no usa el browser-only `crypto.randomUUID`
//     sin checks, ni asume `localStorage`.

"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailInEntry, EmailInStatus } from "./types";
import type { ParsedBooking } from "@/lib/parsing/email-parser";

const LS_PREFIX = "tampu-inbox-";
const LEGACY_LS_PREFIX = "tampu.email-in.";   // del store.ts viejo

function lsKey(tripId: string): string {
  return `${LS_PREFIX}${tripId}`;
}

function legacyLsKey(tripId: string): string {
  return `${LEGACY_LS_PREFIX}${tripId}`;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `eml_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Shape "amistoso" que acepta `addInboxItem` (subset minimal). */
export interface NewInboxItem {
  tripId: string;
  from: string;
  fromName?: string | null;
  subject?: string | null;
  /** Resumen corto del cuerpo, ~140 chars. Útil para la UI cuando no hay bookings. */
  snippet?: string | null;
  /** Resultado del parser IA. `bookings.length === 0` → status=failed. */
  parsedResult?: {
    bookings: ParsedBooking[];
    carrierHint?: string | null;
    languages?: string[];
  } | null;
  /** Override del status. Si no se pasa: parsed si hay bookings, failed si no. */
  status?: EmailInStatus;
  errorMessage?: string | null;
}

// ─── localStorage (fallback) ──────────────────────────────────────────────

function readLocal(tripId: string): EmailInEntry[] {
  if (typeof localStorage === "undefined") return [];
  // Migración: si está la key legacy y no la nueva, copiar.
  try {
    const legacy = localStorage.getItem(legacyLsKey(tripId));
    const current = localStorage.getItem(lsKey(tripId));
    if (legacy && !current) {
      localStorage.setItem(lsKey(tripId), legacy);
    }
  } catch { /* ignore */ }

  try {
    const raw = localStorage.getItem(lsKey(tripId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as EmailInEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(tripId: string, entries: EmailInEntry[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    // cap at 50 to keep storage sane
    localStorage.setItem(lsKey(tripId), JSON.stringify(entries.slice(0, 50)));
  } catch { /* quota exceeded */ }
}

// ─── Entry construction ───────────────────────────────────────────────────

function buildEntryFromItem(item: NewInboxItem): EmailInEntry {
  const bookings = item.parsedResult?.bookings ?? [];
  const explicitStatus = item.status;
  const inferredStatus: EmailInStatus =
    item.errorMessage ? "failed" :
    bookings.length > 0 ? "parsed" : "failed";
  const status: EmailInStatus = explicitStatus ?? inferredStatus;

  // short_id derivado del tripId (8 hex chars sin guiones)
  const shortId = item.tripId.replace(/-/g, "").slice(0, 8).toLowerCase();

  return {
    id: randomId(),
    trip_id: item.tripId,
    short_id: shortId,
    from_address: item.from,
    from_name: item.fromName ?? null,
    subject: item.subject ?? null,
    received_at: new Date().toISOString(),
    status,
    bookings_count: bookings.length,
    carrier_hint: item.parsedResult?.carrierHint ?? null,
    languages: item.parsedResult?.languages ?? [],
    parsed_bookings: bookings,
    committed_reservation_ids: null,
    error_message: item.errorMessage ?? (bookings.length === 0 && status === "failed" ? "No bookings detected" : null),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Inserta un item en la bandeja del trip. Devuelve la entry creada.
 *
 * Si `supabase` está disponible y modo "online", escribe en `email_in_entries`.
 * Si no, persiste en localStorage.
 */
export async function addInboxItem(
  item: NewInboxItem,
  opts?: { supabase?: SupabaseClient | null; userId?: string | null },
): Promise<EmailInEntry> {
  const entry = buildEntryFromItem(item);
  const supa = opts?.supabase || null;

  if (supa) {
    const { data, error } = await supa.from("email_in_entries").insert({
      trip_id: entry.trip_id,
      user_id: opts?.userId || null,
      short_id: entry.short_id,
      from_address: entry.from_address,
      from_name: entry.from_name,
      subject: entry.subject,
      provider: "email-direct",
      status: entry.status,
      bookings_count: entry.bookings_count,
      carrier_hint: entry.carrier_hint,
      languages: entry.languages,
      parsed_bookings: entry.parsed_bookings,
      error_message: entry.error_message,
    }).select().maybeSingle();
    if (!error && data?.id) {
      return { ...entry, id: data.id };
    }
    // Si falla Supabase, caemos a local como red de seguridad.
  }

  const cur = readLocal(item.tripId);
  cur.unshift(entry);
  writeLocal(item.tripId, cur);
  return entry;
}

/** Lista los últimos N items del trip (default 30). Newest first. */
export async function listInboxItems(
  tripId: string,
  opts?: { supabase?: SupabaseClient | null; limit?: number },
): Promise<EmailInEntry[]> {
  const limit = opts?.limit ?? 30;
  const supa = opts?.supabase || null;

  if (supa) {
    const { data, error } = await supa
      .from("email_in_entries")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!error && Array.isArray(data)) {
      return data as EmailInEntry[];
    }
  }

  return readLocal(tripId).slice(0, limit);
}

/**
 * Marca un item como importado al trip, opcionalmente guardando los IDs de las
 * reservas creadas para auditoría / deshacer.
 */
export async function markAsImported(
  itemId: string,
  reservationIds: string | string[],
  opts?: { tripId?: string; supabase?: SupabaseClient | null },
): Promise<void> {
  const ids = Array.isArray(reservationIds) ? reservationIds : [reservationIds];
  const supa = opts?.supabase || null;

  if (supa) {
    const { error } = await supa.from("email_in_entries").update({
      status: "committed",
      committed_reservation_ids: ids,
      committed_at: new Date().toISOString(),
    }).eq("id", itemId);
    if (!error) return;
  }

  // Local fallback — necesitamos saber el trip para localizar la lista.
  if (!opts?.tripId) return;
  const cur = readLocal(opts.tripId);
  const idx = cur.findIndex(e => e.id === itemId);
  if (idx >= 0) {
    cur[idx] = { ...cur[idx], status: "committed", committed_reservation_ids: ids };
    writeLocal(opts.tripId, cur);
  }
}

/**
 * Elimina (o marca como dismissed) un item. Si online → hard delete; si local → splice.
 */
export async function deleteInboxItem(
  itemId: string,
  opts?: { tripId?: string; supabase?: SupabaseClient | null },
): Promise<void> {
  const supa = opts?.supabase || null;

  if (supa) {
    // Soft-delete: marcar como dismissed. Más seguro para audit log.
    const { error } = await supa.from("email_in_entries")
      .update({ status: "dismissed" })
      .eq("id", itemId);
    if (!error) return;
  }

  if (!opts?.tripId) return;
  const cur = readLocal(opts.tripId);
  const next = cur.filter(e => e.id !== itemId);
  writeLocal(opts.tripId, next);
}
