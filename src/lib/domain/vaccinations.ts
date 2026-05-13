import type { City, Task, Document } from "@/lib/types/database";

// ─── VACCINATION & HEALTH REQUIREMENTS BY COUNTRY ───
// Data sourced May 2026 from CDC Travelers' Health (wwwnc.cdc.gov/travel).
// This is a planning aid — ALWAYS consult a travel medicine clinic for current
// guidance for your destinations + dates + medical history.

export type VaccineLevel =
  | "required"        // entry mandates proof (e.g. yellow fever cert)
  | "strongly_recommended" // strong CDC recommendation
  | "recommended"     // CDC suggests for most travelers
  | "consider";       // depends on activities/length

export interface VaccineEntry {
  id: string;            // canonical id used for cross-country dedup
  name: string;
  level: VaccineLevel;
  reason: string;
  lead_weeks: number;    // recommended weeks before departure
}

export interface HealthRisk {
  id: string;
  label: string;
  level: "critical" | "warning" | "info";
  detail: string;
}

export interface CountryHealthProfile {
  iso2: string;
  country: string;
  vaccines: VaccineEntry[];
  malaria: { present: boolean; areas?: string; prophylaxis_options?: string[]; notes?: string };
  risks: HealthRisk[];
  source_url: string;
}

const PG: CountryHealthProfile = {
  iso2: "PG", country: "Papúa Nueva Guinea",
  vaccines: [
    { id: "routine", name: "Vacunas de rutina al día", level: "strongly_recommended", reason: "MMR, polio, DTP, varicela, gripe", lead_weeks: 0 },
    { id: "hep_a", name: "Hepatitis A", level: "strongly_recommended", reason: "Transmisión por alimentos/agua", lead_weeks: 4 },
    { id: "hep_b", name: "Hepatitis B", level: "recommended", reason: "Riesgo por sangre/fluidos", lead_weeks: 4 },
    { id: "polio_booster", name: "Polio booster", level: "strongly_recommended", reason: "Circulación viral confirmada en PNG", lead_weeks: 4 },
    { id: "typhoid", name: "Fiebre tifoidea", level: "recommended", reason: "Pueblos pequeños / zonas rurales", lead_weeks: 2 },
    { id: "japanese_encephalitis", name: "Encefalitis japonesa", level: "consider", reason: "Si estadía >1 mes o actividades rurales", lead_weeks: 6 },
    { id: "rabies", name: "Rabia (pre-exposición)", level: "consider", reason: "Si tendrá contacto con animales/zonas remotas", lead_weeks: 4 },
  ],
  malaria: {
    present: true,
    areas: "Todas las áreas <2,000 m. Highlands central tienen menor riesgo pero NO cero.",
    prophylaxis_options: ["Atovaquone-proguanil", "Doxiciclina", "Mefloquina", "Tafenoquina"],
    notes: "Iniciar antes de viajar (lead varía por droga: doxi 1-2 días antes, mefloquina 2-3 semanas antes).",
  },
  risks: [
    { id: "med_evac", label: "Evacuación médica costosa", level: "critical", detail: "Helicóptero medevac highlands cuesta USD 20k+. Confirmar GOP con la aseguradora ANTES de viajar." },
    { id: "yellow_fever_cert", label: "Yellow fever cert si venís de país endémico", level: "warning", detail: "PNG puede pedir certificado de vacuna de fiebre amarilla si entrás desde país con riesgo (Sudamérica selva, África subsahariana). Como AR Buenos Aires NO es zona endémica, en general no aplica — pero si pasaste por Misiones/Brasil amazónico, sí." },
    { id: "dengue", label: "Dengue presente", level: "warning", detail: "Sin vacuna profiláctica de campo. Evitar mosquitos con DEET + ropa larga." },
    { id: "water", label: "Agua no potable", level: "warning", detail: "Pastillas/filtro o agua embotellada. Lavá vegetales con agua segura." },
    { id: "altitude", label: "Altura moderada en highlands", level: "info", detail: "Goroka ~1,500 m. Aclimatación leve recomendada." },
  ],
  source_url: "https://wwwnc.cdc.gov/travel/destinations/traveler/none/papua-new-guinea",
};

const KR: CountryHealthProfile = {
  iso2: "KR", country: "Corea del Sur",
  vaccines: [
    { id: "routine", name: "Vacunas de rutina al día", level: "strongly_recommended", reason: "MMR, polio, DTP, varicela, gripe", lead_weeks: 0 },
    { id: "hep_a", name: "Hepatitis A", level: "recommended", reason: "Recomendada para no-vacunados desde 1 año", lead_weeks: 4 },
    { id: "hep_b", name: "Hepatitis B", level: "recommended", reason: "Recomendada para <60 años no vacunados", lead_weeks: 4 },
    { id: "typhoid", name: "Fiebre tifoidea", level: "consider", reason: "Si visitás zonas rurales o casa de locales", lead_weeks: 2 },
    { id: "japanese_encephalitis", name: "Encefalitis japonesa", level: "consider", reason: "Si actividades de riesgo en zonas rurales", lead_weeks: 6 },
  ],
  malaria: {
    present: true,
    areas: "Limitada: DMZ y norte de Incheon/Gangwon, marzo-diciembre. P. vivax. Centro Seoul = sin riesgo.",
    prophylaxis_options: ["Atovaquone-proguanil", "Doxiciclina"],
    notes: "Si tu itinerario es solo Seúl ciudad, no se necesita profilaxis.",
  },
  risks: [
    { id: "tb", label: "Tuberculosis", level: "info", detail: "Mayor prevalencia que en Argentina. Riesgo bajo para turistas." },
    { id: "ticks", label: "Garrapatas (zonas rurales)", level: "info", detail: "Repelente + ropa larga en hiking." },
    { id: "air_quality", label: "Calidad del aire (primavera)", level: "info", detail: "Polvo amarillo de Mongolia. Llevar barbijo si sos sensible." },
  ],
  source_url: "https://wwwnc.cdc.gov/travel/destinations/traveler/none/south-korea",
};

const PH: CountryHealthProfile = {
  iso2: "PH", country: "Filipinas",
  vaccines: [
    { id: "routine", name: "Vacunas de rutina al día", level: "strongly_recommended", reason: "MMR, polio, DTP, varicela, gripe", lead_weeks: 0 },
    { id: "hep_a", name: "Hepatitis A", level: "strongly_recommended", reason: "Alimentos/agua", lead_weeks: 4 },
    { id: "hep_b", name: "Hepatitis B", level: "recommended", reason: "Sangre/fluidos", lead_weeks: 4 },
    { id: "typhoid", name: "Fiebre tifoidea", level: "recommended", reason: "Comida callejera", lead_weeks: 2 },
    { id: "japanese_encephalitis", name: "Encefalitis japonesa", level: "consider", reason: "Estadías largas zona rural", lead_weeks: 6 },
  ],
  malaria: { present: true, areas: "Áreas rurales <600 m fuera de Manila. Manila ciudad = sin riesgo.", prophylaxis_options: ["Atovaquone-proguanil", "Doxiciclina"], notes: "Tránsito en MNL no requiere profilaxis." },
  risks: [
    { id: "dengue", label: "Dengue presente todo el año", level: "warning", detail: "DEET + ropa larga." },
    { id: "rabies", label: "Riesgo de rabia (perros)", level: "info", detail: "Evitá contacto con animales callejeros." },
  ],
  source_url: "https://wwwnc.cdc.gov/travel/destinations/traveler/none/philippines",
};

const AE: CountryHealthProfile = {
  iso2: "AE", country: "Emiratos Árabes Unidos",
  vaccines: [
    { id: "routine", name: "Vacunas de rutina al día", level: "strongly_recommended", reason: "MMR, polio, DTP, gripe", lead_weeks: 0 },
    { id: "hep_a", name: "Hepatitis A", level: "recommended", reason: "Comida/agua", lead_weeks: 4 },
    { id: "hep_b", name: "Hepatitis B", level: "recommended", reason: "Sangre/fluidos", lead_weeks: 4 },
  ],
  malaria: { present: false },
  risks: [
    { id: "heat", label: "Calor extremo (junio-septiembre)", level: "warning", detail: "Hidratación constante. Evitar exposición prolongada mediodía." },
    { id: "mers", label: "MERS (riesgo bajo)", level: "info", detail: "Evitá contacto con camellos." },
  ],
  source_url: "https://wwwnc.cdc.gov/travel/destinations/traveler/none/united-arab-emirates",
};

const BR: CountryHealthProfile = {
  iso2: "BR", country: "Brasil",
  vaccines: [
    { id: "routine", name: "Vacunas de rutina al día", level: "strongly_recommended", reason: "MMR, polio, DTP, varicela, gripe", lead_weeks: 0 },
    { id: "yellow_fever", name: "Fiebre amarilla", level: "strongly_recommended", reason: "Endémica en zonas selváticas; San Pablo en transición. Cert válido de por vida.", lead_weeks: 2 },
    { id: "hep_a", name: "Hepatitis A", level: "recommended", reason: "Alimentos/agua", lead_weeks: 4 },
    { id: "hep_b", name: "Hepatitis B", level: "recommended", reason: "Sangre/fluidos", lead_weeks: 4 },
    { id: "typhoid", name: "Fiebre tifoidea", level: "consider", reason: "Zonas rurales", lead_weeks: 2 },
  ],
  malaria: { present: true, areas: "Cuenca amazónica. San Pablo y sur = sin riesgo.", prophylaxis_options: ["Atovaquone-proguanil", "Doxiciclina", "Mefloquina"], notes: "Tránsito en GRU sin salir = sin riesgo." },
  risks: [
    { id: "dengue", label: "Dengue + zika", level: "warning", detail: "DEET. Importante para mujeres embarazadas." },
  ],
  source_url: "https://wwwnc.cdc.gov/travel/destinations/traveler/none/brazil",
};

const PROFILES: Record<string, CountryHealthProfile> = { PG, KR, PH, AE, BR };

function countryToIso2(country: string): string | null {
  const lower = country.toLowerCase();
  if (lower.includes("papua") || lower.includes("guinea")) return "PG";
  if (lower.includes("korea")) return "KR";
  if (lower.includes("philippin")) return "PH";
  if (lower.includes("uae") || lower.includes("emirat")) return "AE";
  if (lower.includes("brazil") || lower.includes("brasil")) return "BR";
  return null;
}

export interface VaccineNeeded {
  vaccine: VaccineEntry;
  countries: string[]; // labels
  user_status: "ready" | "in_progress" | "pending";
}

export interface TripHealthPlan {
  countries: CountryHealthProfile[];
  vaccines_needed: VaccineNeeded[];
  malaria_required: boolean;
  malaria_countries: string[];
  total_lead_weeks: number; // max of lead_weeks across vaccines
  open_count: number; // vaccines not yet ready
}

function vaccineUserStatus(v: VaccineEntry, tasks: Task[], documents: Document[]): "ready" | "in_progress" | "pending" {
  // Heuristic: if there's a medical document with status "ready" that mentions this vaccine,
  // or a health task with status "done", consider ready.
  const vname = v.name.toLowerCase();
  const docReady = documents.some(d =>
    d.type === "medical" &&
    d.status === "ready" &&
    (d.name.toLowerCase().includes(vname) || vname.includes(d.name.toLowerCase()))
  );
  if (docReady) return "ready";
  const taskDone = tasks.some(t =>
    t.category === "health" && t.status === "done" &&
    (t.title.toLowerCase().includes(vname) || vname.includes(t.title.toLowerCase()))
  );
  if (taskDone) return "ready";
  const taskInProgress = tasks.some(t =>
    t.category === "health" && t.status === "in_progress" &&
    (t.title.toLowerCase().includes(vname) || vname.includes(t.title.toLowerCase()))
  );
  if (taskInProgress) return "in_progress";
  return "pending";
}

export function buildTripHealthPlan(cities: City[], tasks: Task[], documents: Document[]): TripHealthPlan {
  const isoSet = new Set<string>();
  for (const c of cities) {
    const iso = countryToIso2(c.country);
    if (iso) isoSet.add(iso);
  }
  const countries: CountryHealthProfile[] = [];
  for (const iso of isoSet) {
    if (PROFILES[iso]) countries.push(PROFILES[iso]);
  }

  // Dedup vaccines across countries, keep highest level + union of country labels.
  const levelRank: Record<VaccineLevel, number> = { required: 4, strongly_recommended: 3, recommended: 2, consider: 1 };
  const vaxMap = new Map<string, VaccineNeeded>();
  for (const c of countries) {
    for (const v of c.vaccines) {
      const ex = vaxMap.get(v.id);
      if (!ex) {
        vaxMap.set(v.id, { vaccine: v, countries: [c.country], user_status: vaccineUserStatus(v, tasks, documents) });
      } else {
        if (levelRank[v.level] > levelRank[ex.vaccine.level]) {
          ex.vaccine = v;
        }
        if (!ex.countries.includes(c.country)) ex.countries.push(c.country);
      }
    }
  }
  const vaccines_needed = Array.from(vaxMap.values()).sort((a, b) => levelRank[b.vaccine.level] - levelRank[a.vaccine.level]);

  const malaria_countries = countries.filter(c => c.malaria.present).map(c => c.country);
  const malaria_required = malaria_countries.length > 0;

  const total_lead_weeks = vaccines_needed.reduce((m, v) => Math.max(m, v.vaccine.lead_weeks), 0);
  const open_count = vaccines_needed.filter(v => v.user_status !== "ready" && (v.vaccine.level === "required" || v.vaccine.level === "strongly_recommended")).length;

  return { countries, vaccines_needed, malaria_required, malaria_countries, total_lead_weeks, open_count };
}
