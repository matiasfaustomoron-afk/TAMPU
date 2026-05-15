import { NextRequest, NextResponse } from "next/server";
import { selectProvider, callLLMRich } from "@/lib/ai/providers";
import { heuristicItinerary, type GenerateItineraryPrompt, type DraftItinerary } from "@/lib/ai/itinerary-generator";
import { recordProxyCall, estimateCostUsd } from "@/lib/ai/rate-limit";
import { getProxyIdentifier } from "@/lib/ai/proxy-identifier";
import { captureException } from "@/lib/observability/sentry";

// ─── SECURITY (sprint 05/2026) ──────────────────────────────────────────
// Hard cap server-side. NO confiamos en lo que mande el client — un atacante
// podría enviar maxTokens: 200000 con un prompt repetitivo y quemar la key
// Tampu. Si necesitás más tokens, abrí una task separada y subí el cap
// explícitamente acá, no por header.
const MAX_TOKENS_HARD = 2048;

/**
 * POST /api/generate-itinerary — genera un itinerario from-scratch con IA.
 *
 * Input: GenerateItineraryPrompt (destination, dates, budget, interests, pace).
 * Output: { ok: true, itinerary: DraftItinerary } o { ok: false, error: string }.
 *
 * Flow:
 *  1. selectProvider() lee header `x-anthropic-key` / `x-gemini-key` del client
 *     (provista en /settings) o cae a ANTHROPIC_API_KEY env.
 *  2. callLLM con un prompt estructurado que pide JSON puro.
 *  3. Parseamos. Si falla el JSON o no hay key → heurística local.
 *
 * Filo competitivo: TripIt no genera itinerarios, solo organiza los que ya
 * recibió por email. Wanderlog tiene una feature similar pero no es nativa de
 * mobile y no soporta LatAm. Layla hace generación pero es solo destinos
 * gringos. Acá generamos en español, contemplando LatAm, con currency local.
 */

const ALLOWED_ORIGINS = ["capacitor://localhost", "ionic://localhost"];

function withCors(res: NextResponse, origin: string | null): NextResponse {
  const ok =
    !origin ||
    ALLOWED_ORIGINS.includes(origin) ||
    origin.startsWith("http://localhost") ||
    origin.endsWith(".vercel.app");
  if (ok && origin) res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, x-anthropic-key, x-gemini-key, x-device-fingerprint"
  );
  res.headers.set("Vary", "Origin");
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return withCors(new NextResponse(null, { status: 204 }), req.headers.get("origin"));
}

function buildPrompt(p: GenerateItineraryPrompt): string {
  const lang = p.language || "es";
  const dayCount = (() => {
    const s = new Date(`${p.startDate}T00:00:00`);
    const e = new Date(`${p.endDate}T00:00:00`);
    return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1);
  })();

  const interestsText = p.interests.length > 0 ? p.interests.join(", ") : "general";
  const paceText = p.pace === "slow" ? "tranquilo (3-4 actividades/día)"
                  : p.pace === "fast" ? "intenso (6+ actividades/día)"
                  : "balanceado (4-5 actividades/día)";

  return `Generá un itinerario de viaje para ${p.destination} de ${dayCount} días (${p.startDate} a ${p.endDate}).

Contexto del viajero:
- Intereses: ${interestsText}
- Ritmo: ${paceText}
- Presupuesto total: ${p.budgetTotal > 0 ? `${p.budgetTotal} ${p.budgetCurrency}` : "sin límite"}
- Idioma de la respuesta: ${lang}
${p.notes ? `- Notas extra del viajero: ${p.notes}` : ""}

DEVOLVÉ EXCLUSIVAMENTE UN JSON con este shape exacto, sin texto previo ni comentarios:
{
  "destination": "${p.destination}",
  "start_date": "${p.startDate}",
  "end_date": "${p.endDate}",
  "total_days": ${dayCount},
  "currency": "${p.budgetCurrency}",
  "total_estimated_cost": <number>,
  "days": [
    {
      "day_number": 1,
      "date": "${p.startDate}",
      "city": "<ciudad o zona del día>",
      "zone": "<barrio sugerido o null>",
      "accommodation_suggestion": "<sugerencia de hotel/airbnb o null>",
      "main_transport": "<transporte intra-día sugerido>",
      "activities": [
        {
          "time": "HH:MM",
          "title": "<título corto>",
          "description": "<1-2 oraciones>",
          "kind": "<food|transport|sightseeing|experience|rest>",
          "estimated_cost": <number en ${p.budgetCurrency}>
        }
      ],
      "total_estimated_cost": <suma del día>,
      "notes": "<consejos del día o null>"
    }
  ],
  "tips": ["<tip 1>", "<tip 2>", "<tip 3>"],
  "generated_by": "anthropic"
}

REGLAS:
- ${dayCount} días exactos en el array. Day_number 1..${dayCount}.
- Dates secuenciales desde ${p.startDate}.
- Cada día: 3-6 actividades.
- Costos en ${p.budgetCurrency}. Conservadores y realistas.
- Mencioná comidas (desayuno/almuerzo/cena) y traslados.
- Si el destino es LatAm, mencioná scams típicos en tips si corresponde.
- Tips: 3-5, accionables, no genéricos.
- NO incluyas markdown, NO incluyas explicaciones fuera del JSON.`;
}

// Helper: formato YYYY-MM-DD (UTC noon-safe).
function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Helper: suma N días a una fecha YYYY-MM-DD y devuelve el resultado en mismo formato.
function addDays(startDate: string, offsetDays: number): string {
  const d = new Date(`${startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return formatDate(d);
}

function safeParseItinerary(raw: string, p: GenerateItineraryPrompt): DraftItinerary | null {
  try {
    // El modelo a veces envuelve en ```json ... ```. Limpiamos.
    let txt = raw.trim();
    const fence = txt.match(/```(?:json)?\s*([\s\S]+?)```/);
    if (fence) txt = fence[1].trim();
    // O a veces antepone texto. Buscamos el primer { hasta el último }.
    const first = txt.indexOf("{");
    const last = txt.lastIndexOf("}");
    if (first >= 0 && last > first) txt = txt.slice(first, last + 1);
    const parsed = JSON.parse(txt) as DraftItinerary;
    // Validación mínima
    if (!Array.isArray(parsed.days) || parsed.days.length === 0) return null;
    if (!parsed.destination) parsed.destination = p.destination;
    if (!parsed.currency) parsed.currency = p.budgetCurrency;
    if (typeof parsed.total_days !== "number") parsed.total_days = parsed.days.length;
    if (!Array.isArray(parsed.tips)) parsed.tips = [];

    // ─── Day count + date sanity (Iter 6) ──────────────────────────────
    // El modelo a veces devuelve más/menos días que el rango pedido, o con
    // day_number desordenados, o fechas fuera de [start..end]. Re-clampeamos
    // para que el draft no muestre días imaginarios al user.
    const dayCount = (() => {
      const s = new Date(`${p.startDate}T00:00:00Z`);
      const e = new Date(`${p.endDate}T00:00:00Z`);
      return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1);
    })();

    if (parsed.days.length !== dayCount) {
      console.warn(`[generate-itinerary] day count mismatch: got ${parsed.days.length}, expected ${dayCount} — truncating/padding`);
      if (parsed.days.length > dayCount) {
        parsed.days = parsed.days.slice(0, dayCount);
      } else {
        // Pad con días vacíos hasta llegar a dayCount.
        while (parsed.days.length < dayCount) {
          const i = parsed.days.length;
          parsed.days.push({
            day_number: i + 1,
            date: addDays(p.startDate, i),
            city: parsed.destination,
            zone: null,
            accommodation_suggestion: null,
            main_transport: null,
            activities: [],
            total_estimated_cost: 0,
            notes: null,
          });
        }
      }
      parsed.total_days = dayCount;
    }

    // Reasignar day_number 1..N consecutivos (defensivo: el modelo a veces
    // los manda fuera de orden o con saltos).
    parsed.days.forEach((d, i) => { d.day_number = i + 1; });

    // Validar/reasignar dates en [startDate..endDate]. Si la date que vino del
    // modelo está fuera del rango (o no es parseable), seteamos secuencial
    // desde startDate. NO inventamos — si no se puede, queda null.
    const startMs = new Date(`${p.startDate}T00:00:00Z`).getTime();
    const endMs = new Date(`${p.endDate}T00:00:00Z`).getTime();
    parsed.days.forEach((d, i) => {
      if (!d.date) {
        d.date = addDays(p.startDate, i);
        return;
      }
      const dMs = new Date(`${d.date}T00:00:00Z`).getTime();
      if (Number.isNaN(dMs) || dMs < startMs || dMs > endMs) {
        console.warn(`[generate-itinerary] day ${i + 1} date out of range: "${d.date}" — reassigning`);
        d.date = addDays(p.startDate, i);
      }
    });

    // Default kind si el modelo se olvidó
    parsed.days.forEach(d => {
      if (!Array.isArray(d.activities)) d.activities = [];
      d.activities.forEach(a => {
        if (!a.kind) a.kind = "experience";
        if (typeof a.estimated_cost !== "number") a.estimated_cost = 0;
      });
      if (typeof d.total_estimated_cost !== "number") {
        d.total_estimated_cost = d.activities.reduce((acc, a) => acc + (a.estimated_cost || 0), 0);
      }
    });
    return parsed;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  let body: GenerateItineraryPrompt;
  try {
    body = (await req.json()) as GenerateItineraryPrompt;
  } catch {
    return withCors(NextResponse.json({ ok: false, error: "invalid-json" }, { status: 400 }), origin);
  }
  if (!body.destination || !body.startDate || !body.endDate) {
    return withCors(
      NextResponse.json({ ok: false, error: "destination, startDate, endDate required" }, { status: 400 }),
      origin
    );
  }

  // SECURITY: allowTampuFallback default-false. Si el user no trajo BYOK,
  // este endpoint NO usa la key de Tampu (sólo /api/ai-proxy puede).
  const { provider, key, source } = selectProvider(req, { allowTampuFallback: false });
  if (!provider || !key) {
    // No LLM disponible → fallback heurístico
    const fallback = heuristicItinerary(body);
    return withCors(NextResponse.json({ ok: true, itinerary: fallback, fallback: true }), origin);
  }

  const userPrompt = buildPrompt(body);
  const rich = await callLLMRich(provider, key, {
    system: "Sos un planificador de viajes argentino experto. Devolvés JSON puro, sin markdown ni texto extra.",
    userMessage: userPrompt,
    maxTokens: MAX_TOKENS_HARD,
    timeoutMs: 55_000,
    // Sonnet para itinerary — requiere planning capacity. Haiku no llega.
    model: "sonnet",
    // Prosa más natural en descripciones / tips. Default global ahora es 0.2,
    // pero itinerary necesita variedad en sugerencias de actividades.
    temperature: 0.6,
  });

  // Log usage REAL del provider — ya no worst-case. Identifier per-user
  // (`byok:user:<uuid>:generate-itinerary`) para rate-limit individual.
  if (rich) {
    const tokensIn = rich.usage.inputTokens;
    const tokensOut = rich.usage.outputTokens;
    const costUsd = estimateCostUsd(tokensIn, tokensOut, rich.model);
    const identifier = await getProxyIdentifier(
      "generate-itinerary",
      source === "byok" ? "byok" : "fallback",
    );
    void recordProxyCall(identifier, {
      endpoint: "/api/generate-itinerary",
      tokensIn,
      tokensOut,
      costUsd,
      provider: rich.provider,
      model: rich.model,
    }).catch((e) => captureException(e, { tag: "generate-itinerary.record" }));
  }

  if (!rich) {
    const fallback = heuristicItinerary(body);
    return withCors(NextResponse.json({ ok: true, itinerary: fallback, fallback: true, reason: "llm-failed" }), origin);
  }

  const itin = safeParseItinerary(rich.text, body);
  if (!itin) {
    const fallback = heuristicItinerary(body);
    return withCors(NextResponse.json({
      ok: true,
      itinerary: fallback,
      fallback: true,
      reason: "parse-failed",
      degraded: true,
      provider: rich.provider,
      model: rich.model,
    }), origin);
  }

  itin.generated_by = provider;
  return withCors(NextResponse.json({
    ok: true,
    itinerary: itin,
    provider: rich.provider,
    model: rich.model,
  }), origin);
}
