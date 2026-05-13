import type { City } from "@/lib/types/database";

// ─── VISA REQUIREMENTS BY (passport, destination) ───
// Data verified May 2026 via Wikipedia "Visa requirements for Argentine citizens" and
// Passport Index 2026. Source for PNG eTA: ica.gov.pg. K-ETA: Korea Tourism Org.
// Always verify with the official embassy/consulate before traveling.

export type RequirementType =
  | "visa_free"           // no requirement; just arrive
  | "transit"             // transit visa or stay only in international zone
  | "eta"                 // electronic travel authorization (e.g. K-ETA)
  | "evisa"               // electronic visa (apply online before)
  | "visa_on_arrival"     // pay & get at airport
  | "embassy_visa"        // appointment at embassy before traveling
  | "unknown";

export interface VisaRequirement {
  destination_iso2: string;
  destination_label: string;
  passport_iso2: string;
  type: RequirementType;
  max_stay_days: number | null;
  cost_usd: number | null;
  apply_lead_days: number | null; // recommended lead time before travel
  apply_url: string | null;
  notes: string;
  last_verified: string; // ISO date
}

// Default passport for the seed user (Argentine).
export const DEFAULT_PASSPORT_ISO2 = "AR";

const AR_REQUIREMENTS: Record<string, Omit<VisaRequirement, "passport_iso2" | "destination_iso2" | "destination_label">> = {
  // Source: Wikipedia "Visa requirements for Argentine citizens" + ica.gov.pg
  PG: {
    type: "evisa", max_stay_days: 60, cost_usd: 50, apply_lead_days: 14,
    apply_url: "https://evisa.ica.gov.pg/",
    notes: "eVisa requerida. Tramitar online antes del viaje. Imprimí la confirmación.",
    last_verified: "2026-05-11",
  },
  // Source: K-ETA program (apply.k-eta.go.kr), Argentina included since 2023
  KR: {
    type: "eta", max_stay_days: 90, cost_usd: 10, apply_lead_days: 3,
    apply_url: "https://www.k-eta.go.kr/",
    notes: "K-ETA requerido. Aprobación típica 24-72h. Válido 3 años o hasta vencimiento de pasaporte.",
    last_verified: "2026-05-11",
  },
  // Philippines: visa-free 30 days for Argentine citizens
  PH: {
    type: "visa_free", max_stay_days: 30, cost_usd: 0, apply_lead_days: 0,
    apply_url: null,
    notes: "Visa-free 30 días. Llevar pasaje de salida y comprobante de fondos por si lo piden en migraciones.",
    last_verified: "2026-05-11",
  },
  // UAE: visa-free 90 days for Argentine citizens (since 2022)
  AE: {
    type: "visa_free", max_stay_days: 90, cost_usd: 0, apply_lead_days: 0,
    apply_url: null,
    notes: "Visa-free 90 días. Para tránsito en DXB sin salir del aeropuerto NO se requiere visa.",
    last_verified: "2026-05-11",
  },
  // Brazil: Mercosur — visa-free with DNI
  BR: {
    type: "visa_free", max_stay_days: 90, cost_usd: 0, apply_lead_days: 0,
    apply_url: null,
    notes: "Mercosur — ingreso con DNI o pasaporte. Sin requisitos.",
    last_verified: "2026-05-11",
  },
  // UK: visa-free 6 months
  GB: {
    type: "visa_free", max_stay_days: 180, cost_usd: 0, apply_lead_days: 0,
    apply_url: "https://www.gov.uk/check-uk-visa",
    notes: "Visa-free 6 meses. Desde 2025 requiere ETA UK para ciudadanos exentos de visa.",
    last_verified: "2026-05-11",
  },
  // USA: requires B1/B2 visa (no Visa Waiver for Argentina)
  US: {
    type: "embassy_visa", max_stay_days: 180, cost_usd: 185, apply_lead_days: 90,
    apply_url: "https://ar.usembassy.gov/visas/",
    notes: "Visa B1/B2 requerida. Entrevista en embajada. Esperar 2-3 meses por turno.",
    last_verified: "2026-05-11",
  },
  // Schengen (EU): visa-free 90 days in any 180-day rolling window
  FR: {
    type: "visa_free", max_stay_days: 90, cost_usd: 0, apply_lead_days: 0,
    apply_url: null,
    notes: "Schengen — 90 días en cualquier ventana de 180. Desde 2025 ETIAS requerido.",
    last_verified: "2026-05-11",
  },
  // Japan: visa-free 90 days
  JP: {
    type: "visa_free", max_stay_days: 90, cost_usd: 0, apply_lead_days: 0,
    apply_url: null,
    notes: "Visa-free 90 días. Llevar pasaje de salida.",
    last_verified: "2026-05-11",
  },
};

const COUNTRY_LABELS: Record<string, string> = {
  PG: "Papúa Nueva Guinea", KR: "Corea del Sur", PH: "Filipinas",
  AE: "Emiratos Árabes Unidos", BR: "Brasil", GB: "Reino Unido",
  US: "Estados Unidos", FR: "Francia (Schengen)", JP: "Japón", AR: "Argentina",
};

function countryToIso2(country: string): string | null {
  const lower = country.toLowerCase();
  if (lower.includes("papua") || lower.includes("guinea")) return "PG";
  if (lower.includes("korea")) return "KR";
  if (lower.includes("philippin")) return "PH";
  if (lower.includes("uae") || lower.includes("emirat")) return "AE";
  if (lower.includes("brazil") || lower.includes("brasil")) return "BR";
  if (lower.includes("united kingdom") || lower.includes("uk")) return "GB";
  if (lower.includes("usa") || lower.includes("united states")) return "US";
  if (lower.includes("france") || lower.includes("francia")) return "FR";
  if (lower.includes("japan") || lower.includes("japón")) return "JP";
  if (lower.includes("argentina")) return "AR";
  return null;
}

export function lookupVisaRequirement(passportIso: string, destinationIso: string): VisaRequirement | null {
  if (passportIso === destinationIso) return null;
  if (passportIso !== "AR") {
    return {
      destination_iso2: destinationIso, destination_label: COUNTRY_LABELS[destinationIso] || destinationIso,
      passport_iso2: passportIso, type: "unknown", max_stay_days: null, cost_usd: null,
      apply_lead_days: null, apply_url: null,
      notes: `Datos solo cargados para pasaporte AR. Verificar requerimientos para pasaporte ${passportIso}.`,
      last_verified: "2026-05-11",
    };
  }
  const r = AR_REQUIREMENTS[destinationIso];
  if (!r) return null;
  return { destination_iso2: destinationIso, destination_label: COUNTRY_LABELS[destinationIso] || destinationIso, passport_iso2: "AR", ...r };
}

export interface TripVisaSummary {
  requirements: VisaRequirement[];
  total_cost_usd: number;
  total_lead_days: number;
  open_count: number; // not yet handled (no document marked ready for that visa)
  countries_needing_action: string[];
}

/**
 * For a trip, derive unique destination countries from its cities and compute
 * the visa requirements list + summary.
 */
export function buildTripVisaSummary(cities: City[], passportIso: string = DEFAULT_PASSPORT_ISO2): TripVisaSummary {
  const isoSet = new Set<string>();
  for (const c of cities) {
    const iso = countryToIso2(c.country);
    if (iso) isoSet.add(iso);
  }
  const requirements: VisaRequirement[] = [];
  for (const iso of isoSet) {
    const r = lookupVisaRequirement(passportIso, iso);
    if (r) requirements.push(r);
  }
  // Sort: requires-action first (embassy/evisa/eta), then visa-free, then transit
  const order: Record<RequirementType, number> = {
    embassy_visa: 0, evisa: 1, eta: 2, visa_on_arrival: 3, transit: 4, visa_free: 5, unknown: 6,
  };
  requirements.sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9));
  const total_cost_usd = requirements.reduce((s, r) => s + (r.cost_usd || 0), 0);
  const total_lead_days = requirements.reduce((m, r) => Math.max(m, r.apply_lead_days || 0), 0);
  const needsAction = requirements.filter(r => r.type !== "visa_free" && r.type !== "transit");
  return {
    requirements,
    total_cost_usd,
    total_lead_days,
    open_count: needsAction.length,
    countries_needing_action: needsAction.map(r => r.destination_label),
  };
}

export const VISA_TYPE_LABELS: Record<RequirementType, string> = {
  visa_free: "Sin visa",
  transit: "Tránsito",
  eta: "Autorización electrónica (eTA)",
  evisa: "eVisa online",
  visa_on_arrival: "Visa al arribo",
  embassy_visa: "Visa en embajada",
  unknown: "Verificar",
};
