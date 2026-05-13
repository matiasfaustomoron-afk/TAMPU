import type { Trip, Reservation, Document, TripDay, City } from "@/lib/types/database";

export interface EmergencyContact {
  kind: "insurance" | "consulate" | "host" | "tour_operator" | "airline" | "embassy" | "other";
  label: string;
  detail: string | null;
  phone: string | null;
  source: "document" | "reservation" | "static";
  ready: boolean;
  notes: string | null;
}

export interface CountryEmergency {
  country: string;
  iso2: string;
  emergency_number: string;
  police: string | null;
  ambulance: string | null;
  notes: string | null;
}

// Static fallback per-country emergency numbers (public info).
const COUNTRY_EMERGENCY: Record<string, CountryEmergency> = {
  AR: { country: "Argentina", iso2: "AR", emergency_number: "911", police: "911", ambulance: "107", notes: null },
  BR: { country: "Brasil", iso2: "BR", emergency_number: "190 (policía) / 192 (SAMU)", police: "190", ambulance: "192", notes: null },
  AE: { country: "Emiratos Árabes Unidos", iso2: "AE", emergency_number: "999", police: "999", ambulance: "998", notes: "Tourist police: 901" },
  PH: { country: "Filipinas", iso2: "PH", emergency_number: "911", police: "117", ambulance: "143", notes: null },
  PG: { country: "Papúa Nueva Guinea", iso2: "PG", emergency_number: "112 / 000", police: "112", ambulance: "111", notes: "Cobertura limitada fuera de Port Moresby. Llamar al operador del tour primero." },
  KR: { country: "Corea del Sur", iso2: "KR", emergency_number: "112 / 119", police: "112", ambulance: "119", notes: "1330 turismo (multilingüe 24h)" },
  GB: { country: "Reino Unido", iso2: "GB", emergency_number: "999 / 112", police: "999", ambulance: "999", notes: null },
  US: { country: "EEUU", iso2: "US", emergency_number: "911", police: "911", ambulance: "911", notes: null },
  JP: { country: "Japón", iso2: "JP", emergency_number: "110 / 119", police: "110", ambulance: "119", notes: null },
  FR: { country: "Francia", iso2: "FR", emergency_number: "112", police: "17", ambulance: "15", notes: null },
};

// Best-effort static consulate registry — supplement with documents of type "emergency_contact".
const ARGENTINE_CONSULATES: Record<string, { city: string; phone: string | null; notes: string | null }> = {
  PG: { city: "Embajada Argentina en Australia atiende PNG (Canberra)", phone: "+61 2 6273-9111", notes: "PNG no tiene embajada argentina dedicada. Contacto vía Canberra." },
  PH: { city: "Embajada Argentina en Manila", phone: "+63 2 8836-9921", notes: null },
  KR: { city: "Embajada Argentina en Seúl", phone: "+82 2 793-4062", notes: null },
  AE: { city: "Embajada Argentina en Abu Dhabi", phone: "+971 2 443-1100", notes: null },
  BR: { city: "Consulado Argentino en São Paulo", phone: "+55 11 3897-9522", notes: null },
};

export function buildEmergencyKit(
  trip: Trip,
  reservations: Reservation[],
  documents: Document[],
  tripDays: TripDay[],
  cities: City[],
): {
  contacts: EmergencyContact[];
  countries: CountryEmergency[];
  consulates: { country: string; iso2: string; city: string; phone: string | null; notes: string | null }[];
  insurance_kit: { provider: string; locator: string | null; contact: string | null; notes: string | null; gop_note: string } | null;
  current_country: string | null;
} {
  const contacts: EmergencyContact[] = [];

  // ─── INSURANCE ───
  const insRes = reservations.find(r => r.type === "insurance");
  let insurance_kit: ReturnType<typeof buildEmergencyKit>["insurance_kit"] = null;
  if (insRes) {
    insurance_kit = {
      provider: insRes.provider,
      locator: insRes.locator,
      contact: insRes.contact,
      notes: insRes.notes,
      gop_note: "Confirmar GOP (Guarantee of Payment) por escrito antes del viaje para PNG/zonas remotas. El operador necesita pre-autorización de la aseguradora para evacuar.",
    };
    contacts.push({
      kind: "insurance",
      label: `Seguro · ${insRes.provider}`,
      detail: insRes.locator,
      phone: insRes.contact,
      source: "reservation",
      ready: insRes.status === "confirmed" || insRes.status === "paid",
      notes: insRes.notes,
    });
  }

  // ─── TOUR OPERATOR ───
  const tour = reservations.find(r => r.type === "tour");
  if (tour && tour.contact) {
    contacts.push({
      kind: "tour_operator",
      label: `Operador tour · ${tour.provider}`,
      detail: tour.locator,
      phone: tour.contact,
      source: "reservation",
      ready: tour.status === "confirmed" || tour.status === "paid",
      notes: tour.cancellation_policy,
    });
  }

  // ─── ACCOMMODATION HOST ───
  const accommodations = reservations.filter(r => r.type === "accommodation" && r.contact);
  for (const a of accommodations) {
    contacts.push({
      kind: "host",
      label: `Host · ${a.city_name || a.provider}`,
      detail: a.locator,
      phone: a.contact,
      source: "reservation",
      ready: true,
      notes: a.notes,
    });
  }

  // ─── AIRLINES ───
  const flights = reservations.filter(r => r.type === "flight" && r.locator);
  for (const f of flights.slice(0, 4)) {
    contacts.push({
      kind: "airline",
      label: `Aerolínea · ${f.provider}`,
      detail: f.locator,
      phone: f.contact,
      source: "reservation",
      ready: f.status === "confirmed" || f.status === "paid",
      notes: f.notes,
    });
  }

  // ─── DOCUMENTS (emergency_contact type) ───
  const docContacts = documents.filter(d => d.type === "emergency_contact");
  for (const d of docContacts) {
    contacts.push({
      kind: "other",
      label: d.name,
      detail: null,
      phone: null,
      source: "document",
      ready: d.status === "ready",
      notes: d.notes,
    });
  }

  // ─── COUNTRIES + CONSULATES ───
  const isoSet = new Set<string>();
  for (const c of cities) {
    if (c.country.toLowerCase().includes("argentina")) isoSet.add("AR");
    else if (c.country.toLowerCase().includes("brazil")) isoSet.add("BR");
    else if (c.country.toLowerCase().includes("uae") || c.country.toLowerCase().includes("emirat")) isoSet.add("AE");
    else if (c.country.toLowerCase().includes("philippin")) isoSet.add("PH");
    else if (c.country.toLowerCase().includes("papua") || c.country.toLowerCase().includes("guinea")) isoSet.add("PG");
    else if (c.country.toLowerCase().includes("korea")) isoSet.add("KR");
    else if (c.country.toLowerCase().includes("kingdom")) isoSet.add("GB");
    else if (c.country.toLowerCase().includes("japan")) isoSet.add("JP");
    else if (c.country.toLowerCase().includes("france")) isoSet.add("FR");
    else if (c.country.toLowerCase().includes("usa") || c.country.toLowerCase().includes("united states")) isoSet.add("US");
  }
  const countries = Array.from(isoSet).map(iso => COUNTRY_EMERGENCY[iso]).filter(Boolean);
  const consulates = Array.from(isoSet)
    .filter(iso => iso !== "AR" && ARGENTINE_CONSULATES[iso])
    .map(iso => ({ country: COUNTRY_EMERGENCY[iso]?.country || iso, iso2: iso, ...ARGENTINE_CONSULATES[iso] }));

  // ─── CURRENT COUNTRY ───
  const today = new Date().toISOString().split("T")[0];
  const todayDay = tripDays.find(d => d.date === today);
  let current_country: string | null = null;
  if (todayDay?.city_name) {
    const city = cities.find(c => c.name === todayDay.city_name);
    current_country = city?.country || null;
  }

  return { contacts, countries, consulates, insurance_kit, current_country };
}
