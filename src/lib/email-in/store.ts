// ─── Email-in storage (client-side, demo & online dual mode) ───
//
// La bandeja del trip se persiste en:
//   - online mode: tabla `email_in_entries` en Supabase (definida en una migración nueva)
//   - demo mode / sin supabase: localStorage bajo `tampu.email-in.<trip_id>`
//
// En modo online el webhook ya escribe directo a Supabase con service-role; estos
// helpers son para la UI (lectura + commit/dismiss). En demo, el endpoint del
// webhook directamente no se usa — el user "forwardea" pegando texto manualmente.

import type { EmailInEntry, EmailInStatus } from "./types";

const LS_PREFIX = "tampu.email-in.";

function lsKey(tripId: string): string {
  return `${LS_PREFIX}${tripId}`;
}

export function getLocalInbox(tripId: string): EmailInEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(lsKey(tripId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function appendLocalInbox(tripId: string, entry: EmailInEntry): void {
  if (typeof localStorage === "undefined") return;
  const cur = getLocalInbox(tripId);
  cur.unshift(entry); // newest first
  // Cap at 50 to avoid bloating localStorage
  const capped = cur.slice(0, 50);
  try {
    localStorage.setItem(lsKey(tripId), JSON.stringify(capped));
  } catch { /* quota exceeded */ }
}

export function updateLocalInbox(tripId: string, id: string, patch: Partial<EmailInEntry>): void {
  if (typeof localStorage === "undefined") return;
  const cur = getLocalInbox(tripId);
  const idx = cur.findIndex(e => e.id === id);
  if (idx === -1) return;
  cur[idx] = { ...cur[idx], ...patch };
  try {
    localStorage.setItem(lsKey(tripId), JSON.stringify(cur));
  } catch { /* quota exceeded */ }
}

export function buildEntry(opts: {
  tripId: string;
  shortId: string;
  from: string;
  fromName?: string | null;
  subject?: string | null;
  bookings: import("@/lib/parsing/email-parser").ParsedBooking[];
  carrierHint: string | null;
  languages: string[];
  error?: string | null;
}): EmailInEntry {
  const status: EmailInStatus =
    opts.error ? "failed" :
    opts.bookings.length > 0 ? "parsed" : "failed";
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `eml_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    trip_id: opts.tripId,
    short_id: opts.shortId,
    from_address: opts.from,
    from_name: opts.fromName || null,
    subject: opts.subject || null,
    received_at: new Date().toISOString(),
    status,
    bookings_count: opts.bookings.length,
    carrier_hint: opts.carrierHint,
    languages: opts.languages,
    parsed_bookings: opts.bookings,
    committed_reservation_ids: null,
    error_message: opts.error || null,
  };
}
