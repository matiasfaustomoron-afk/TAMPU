// ─── AI itinerary generator (client-side helper) ───
//
// Llama a /api/generate-itinerary que invoca Claude / Gemini con JSON schema
// y devuelve un DraftItinerary listo para previsualizar. El user lo aprueba
// y los DraftDays se persisten como trip_days + reservas tentativas.
//
// IMPORTANTE: este módulo NO importa el SDK de Anthropic ni hardcodea keys.
// La key del user llega vía headers (withApiKeyHeaders), igual que /import.

import { withApiKeyHeaders } from "./user-key";

// ─── Schema del prompt y output ──────────────────────────────────────────────

export type Pace = "slow" | "medium" | "fast";

export type Interest =
  | "foodie"
  | "adventure"
  | "culture"
  | "relax"
  | "nightlife"
  | "nature"
  | "shopping"
  | "history"
  | "art";

export interface GenerateItineraryPrompt {
  destination: string;          // "Seúl" / "Buenos Aires" / "Tokio"
  startDate: string;            // ISO YYYY-MM-DD
  endDate: string;              // ISO YYYY-MM-DD
  budgetTotal: number;          // en moneda local del destino, 0 = sin límite
  budgetCurrency: string;       // "KRW" / "USD" / "ARS"
  interests: Interest[];
  pace: Pace;
  /** Notas libres del user: "viajo con dos chicos chicos", "alergia al maní" */
  notes?: string;
  /** Idioma del output. Default "es" porque Tampu es LatAm-native. */
  language?: "es" | "en" | "pt";
}

export interface DraftActivity {
  time: string;                 // "09:30" 24h
  title: string;
  description: string;
  /** Categoría aproximada para el icono */
  kind: "food" | "transport" | "sightseeing" | "experience" | "rest";
  estimated_cost: number;       // en moneda local
}

export interface DraftDay {
  day_number: number;
  date: string;                 // YYYY-MM-DD
  city: string;                 // sub-zona / barrio sugerido
  zone: string | null;          // "Hongdae" / "Centro" / "Palermo"
  accommodation_suggestion: string | null;
  main_transport: string | null;
  activities: DraftActivity[];
  total_estimated_cost: number; // suma de activities + buffer
  notes: string | null;
}

export interface DraftItinerary {
  destination: string;
  start_date: string;
  end_date: string;
  total_days: number;
  currency: string;
  total_estimated_cost: number;
  days: DraftDay[];
  /** Highlights generales — tips, scams, must-eat, etc */
  tips: string[];
  /** El modelo que generó esto (para mostrar en UI: "Generado con Claude") */
  generated_by: "anthropic" | "gemini" | "heuristic";
}

// ─── Llamada al endpoint ────────────────────────────────────────────────────

export interface GenerateResult {
  ok: boolean;
  itinerary?: DraftItinerary;
  error?: string;
}

export async function generateItinerary(prompt: GenerateItineraryPrompt): Promise<GenerateResult> {
  try {
    const res = await fetch("/api/generate-itinerary", {
      method: "POST",
      headers: withApiKeyHeaders(),
      body: JSON.stringify(prompt),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text || `HTTP ${res.status}` };
    }
    const json = await res.json();
    if (!json.ok || !json.itinerary) {
      return { ok: false, error: json.error || "No itinerary in response" };
    }
    return { ok: true, itinerary: json.itinerary as DraftItinerary };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network-error" };
  }
}

// ─── Heurística mínima ──────────────────────────────────────────────────────
//
// Cuando no hay LLM key, generamos un placeholder estructurado que respeta los
// días pedidos y reparte intereses entre las jornadas. Sirve para que el flow
// visual completo funcione sin key — el user lo verá y entenderá que con key
// real obtiene mejor calidad.

function inclusiveDateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const ACTIVITY_TEMPLATES: Record<Interest, Array<Omit<DraftActivity, "time">>> = {
  foodie: [
    { title: "Desayuno local", description: "Probar especialidad típica del barrio", kind: "food", estimated_cost: 12 },
    { title: "Mercado gastronómico", description: "Recorrido por puestos + degustación", kind: "experience", estimated_cost: 20 },
    { title: "Cena en restaurante recomendado", description: "Reservar con tiempo", kind: "food", estimated_cost: 35 },
  ],
  adventure: [
    { title: "Caminata por la naturaleza", description: "Llevar agua y calzado cómodo", kind: "experience", estimated_cost: 0 },
    { title: "Actividad outdoor", description: "Kayak / bici / trekking según destino", kind: "experience", estimated_cost: 50 },
  ],
  culture: [
    { title: "Museo principal", description: "Comprar entrada online para evitar fila", kind: "sightseeing", estimated_cost: 15 },
    { title: "Barrio histórico", description: "Caminar sin apuro, fotos al atardecer", kind: "sightseeing", estimated_cost: 0 },
  ],
  relax: [
    { title: "Mañana libre", description: "Café tranquilo, leer, descansar", kind: "rest", estimated_cost: 8 },
    { title: "Spa / parque", description: "Recuperar energía", kind: "rest", estimated_cost: 25 },
  ],
  nightlife: [
    { title: "Rooftop bar", description: "Vistas + cocktail signature del lugar", kind: "experience", estimated_cost: 25 },
    { title: "Salir a bailar", description: "Llevar efectivo chico y un mapa", kind: "experience", estimated_cost: 30 },
  ],
  nature: [
    { title: "Parque urbano", description: "Picnic + paseo", kind: "sightseeing", estimated_cost: 5 },
    { title: "Mirador panorámico", description: "Mejor al atardecer", kind: "sightseeing", estimated_cost: 0 },
  ],
  shopping: [
    { title: "Calle comercial", description: "Comparar precios antes de comprar", kind: "experience", estimated_cost: 50 },
  ],
  history: [
    { title: "Tour guiado histórico", description: "Reservar guía local en español", kind: "sightseeing", estimated_cost: 20 },
  ],
  art: [
    { title: "Galería de arte contemporáneo", description: "Confirmar horario", kind: "sightseeing", estimated_cost: 12 },
  ],
};

export function heuristicItinerary(p: GenerateItineraryPrompt): DraftItinerary {
  const dates = inclusiveDateRange(p.startDate, p.endDate);
  const interests = p.interests.length > 0 ? p.interests : (["culture", "foodie"] as Interest[]);
  const paceMult = p.pace === "slow" ? 2 : p.pace === "fast" ? 4 : 3;

  const days: DraftDay[] = dates.map((date, idx) => {
    const dayInterest = interests[idx % interests.length];
    const templates = ACTIVITY_TEMPLATES[dayInterest];
    const acts: DraftActivity[] = [];
    let cost = 0;
    for (let i = 0; i < paceMult && i < templates.length * 2; i++) {
      const tpl = templates[i % templates.length];
      const hour = 9 + i * 3;
      acts.push({
        ...tpl,
        time: `${String(Math.min(22, hour)).padStart(2, "0")}:00`,
      });
      cost += tpl.estimated_cost;
    }
    return {
      day_number: idx + 1,
      date,
      city: p.destination,
      zone: null,
      accommodation_suggestion: idx === 0 ? `Hotel céntrico en ${p.destination}` : null,
      main_transport: idx === 0 ? "Llegada (transfer aeropuerto)" : "Caminando + transporte público",
      activities: acts,
      total_estimated_cost: cost,
      notes: null,
    };
  });

  return {
    destination: p.destination,
    start_date: p.startDate,
    end_date: p.endDate,
    total_days: dates.length,
    currency: p.budgetCurrency,
    total_estimated_cost: days.reduce((acc, d) => acc + d.total_estimated_cost, 0),
    days,
    tips: [
      `Plan generado sin IA (no había key configurada). En /settings podés conectar Claude o Gemini para resultados mejores.`,
      `${p.destination}: chequeá visado, requisitos sanitarios y voltaje antes de viajar.`,
      `Llevá efectivo en moneda local para los primeros días.`,
    ],
    generated_by: "heuristic",
  };
}
