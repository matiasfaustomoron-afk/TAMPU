import type { ParsedBooking } from "@/lib/parsing/email-parser";

/**
 * Una entrada en la bandeja de un trip. Cada email forwardeado a la address
 * del trip se persiste como una de estas.
 *
 * Estado típico:
 *  - "parsed"  → el parser encontró ≥1 booking, esperando que el user las apruebe
 *  - "failed"  → el parser no encontró nada, o el LLM falló — el user puede revisar
 *  - "pending" → recibido pero todavía no procesado (raro)
 *  - "committed" → ya commiteado al trip, marcado para auditoría
 *  - "partial" → algunas reservas se importaron, otras fallaron (iter 4)
 *  - "dismissed" → el user lo descartó
 */
export type EmailInStatus = "pending" | "parsed" | "failed" | "committed" | "partial" | "dismissed";

export interface EmailInEntry {
  id: string;
  trip_id: string;
  short_id: string;          // tampu+SHORTID@in.tampu.app — para auditoría
  from_address: string;
  from_name: string | null;
  subject: string | null;
  received_at: string;
  status: EmailInStatus;
  bookings_count: number;
  carrier_hint: string | null;
  languages: string[];
  parsed_bookings: ParsedBooking[];
  /** ID de las reservas creadas si status=committed (para deshacer) */
  committed_reservation_ids: string[] | null;
  error_message: string | null;
}
