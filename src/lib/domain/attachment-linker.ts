import type { Reservation, Attachment } from "@/lib/types/database";

// ─── Match an attachment to a reservation ───
// Given an extracted set of fields (from classify-document), find the best
// reservation match. Used after a Vault upload to auto-link the boarding pass
// to the corresponding Reservation so it appears under it.

export interface ExtractedFields {
  provider?: string | null;
  locator?: string | null;
  flight_route?: string | null;
  departure_date?: string | null;
  arrival_date?: string | null;
}

export interface MatchResult {
  reservation: Reservation;
  score: number;
  reasons: string[];
}

const STOP = /(emirates|airlines?|air|airways|airport|booking|flight|hotel|reservation|tour)/gi;

function normaliseProvider(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(STOP, "").trim();
}

export function findBestReservationMatch(
  extracted: ExtractedFields,
  reservations: Reservation[],
): MatchResult | null {
  if (reservations.length === 0) return null;

  const candidates: MatchResult[] = [];
  const xLocator = (extracted.locator || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const xProvider = normaliseProvider(extracted.provider);
  const xRoute = (extracted.flight_route || "").toUpperCase().replace(/\s+/g, "");
  const xDeparture = extracted.departure_date;

  for (const r of reservations) {
    let score = 0;
    const reasons: string[] = [];

    // ─── Locator match (strongest signal) ───
    if (xLocator && r.locator) {
      const rLoc = r.locator.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (rLoc === xLocator) { score += 100; reasons.push(`Locator exacto ${rLoc}`); }
      else if (rLoc.length >= 5 && xLocator.includes(rLoc)) { score += 60; reasons.push(`Locator parcial`); }
      else if (rLoc.length >= 5 && rLoc.includes(xLocator)) { score += 60; reasons.push(`Locator parcial`); }
    }

    // ─── Provider name match ───
    const rProvider = normaliseProvider(r.provider);
    if (xProvider && rProvider && xProvider.length >= 3) {
      if (rProvider.includes(xProvider) || xProvider.includes(rProvider)) {
        score += 40; reasons.push(`Proveedor: ${r.provider}`);
      }
    }

    // ─── Route match (IATA codes in description) ───
    if (xRoute && r.description) {
      const rRoute = r.description.toUpperCase().replace(/\s+/g, "");
      const codes = (xRoute.match(/[A-Z]{3}/g) || []);
      const matched = codes.filter(c => rRoute.includes(c)).length;
      if (matched >= 2) { score += 30 * matched; reasons.push(`Ruta: ${codes.join("→")}`); }
    }

    // ─── Date match (use_date == departure_date) ───
    if (xDeparture && r.use_date) {
      if (r.use_date === xDeparture) { score += 50; reasons.push(`Fecha ${xDeparture}`); }
      else {
        // Within ±1 day
        const d1 = new Date(xDeparture + "T00:00:00Z").getTime();
        const d2 = new Date(r.use_date + "T00:00:00Z").getTime();
        const diff = Math.abs(d1 - d2) / (1000 * 60 * 60 * 24);
        if (diff <= 1) { score += 20; reasons.push(`Fecha cercana`); }
      }
    }

    if (score > 0) candidates.push({ reservation: r, score, reasons });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  // Only return if confident (score >= 40 = at least one strong signal)
  return candidates[0].score >= 40 ? candidates[0] : null;
}

/** Update attachment to link it to a reservation. */
export function linkAttachmentToReservation(
  attachment: Attachment,
  reservation: Reservation,
): Attachment {
  return {
    ...attachment,
    entity_type: "reservation",
    entity_id: reservation.id,
    updated_at: new Date().toISOString(),
  };
}

/** Get all attachments for a reservation. */
export function attachmentsForReservation(
  reservationId: string,
  attachments: Attachment[],
): Attachment[] {
  return attachments.filter(a => a.entity_type === "reservation" && a.entity_id === reservationId);
}
