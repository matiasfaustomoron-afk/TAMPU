import { NextRequest, NextResponse } from "next/server";
import { selectProvider, callLLMRich } from "@/lib/ai/providers";
import { recordProxyCall, estimateCostUsd } from "@/lib/ai/rate-limit";
import { getProxyIdentifier } from "@/lib/ai/proxy-identifier";
import { captureException } from "@/lib/observability/sentry";
import { extractJson } from "@/lib/ai/json-extractor";

// ─── Dynamic airport info via Claude ───
// Receives an IATA code, returns rich info (terminals, food, currency exchange,
// transport to city, tips). Cached client-side by the caller. Means Travel OS
// works for ANY airport worldwide, not only the 5 we curated.

const ALLOWED_ORIGINS = ["capacitor://localhost", "ionic://localhost"];

function withCors(res: NextResponse, origin: string | null): NextResponse {
  const ok = !origin || ALLOWED_ORIGINS.includes(origin) || origin.startsWith("http://localhost") || origin.endsWith(".vercel.app");
  if (ok && origin) res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, x-anthropic-key, x-gemini-key");
  res.headers.set("Vary", "Origin");
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return withCors(new NextResponse(null, { status: 204 }), req.headers.get("origin"));
}

interface AirportInfoResult {
  iata: string;
  generated: boolean;
  source: "claude" | "fallback";
  terminals: { id: string; airlines: string[]; notes?: string }[];
  food: { name: string; terminal?: string; airside: boolean; note: string }[];
  currency_exchange: { name: string; terminal?: string; note: string }[];
  lounges: { name: string; terminal: string; access: string }[];
  transport_to_city: { mode: string; cost_usd: string; duration_min: number; note: string }[];
  tips: string[];
}

const SYSTEM = `Eres un experto en aeropuertos del mundo. Recibís un código IATA + nombre de aeropuerto + ciudad/país.

Devolvé información PRÁCTICA y VERIFICABLE en JSON estricto (sin markdown):

{
  "terminals": [{ "id": "T1", "airlines": ["..."], "notes": "..." }],
  "food": [{ "name": "...", "terminal": "T1", "airside": true|false, "note": "..." }],
  "currency_exchange": [{ "name": "...", "terminal": "T1", "note": "consejos sobre tasa" }],
  "lounges": [{ "name": "...", "terminal": "T1", "access": "Priority Pass / Business / pago" }],
  "transport_to_city": [{ "mode": "...", "cost_usd": "USD X-Y", "duration_min": 30, "note": "..." }],
  "tips": ["consejo 1", "consejo 2", "..."]
}

Reglas:
- Máximo 4 items por sección (priorizá los más usados).
- Si no estás seguro de algo, NO lo incluyas (mejor menos info que info falsa).
- Tips: WiFi, layover length útil, seguridad, lounges públicos, peculiaridades locales.
- Respondé en español rioplatense.
- Costos en USD aproximado. Duraciones en minutos.
- NUNCA inventes nombres de restaurants/lounges si no existen. Solo categorías genéricas si es desconocido.`;

interface AirportInfoLLMResult {
  result: AirportInfoResult | null;
  provider: "anthropic" | "gemini";
  model: string;
  inputTokens: number;
  outputTokens: number;
  source: "byok" | "tampu" | "env" | "none";
}

async function llmAirportInfo(
  req: NextRequest,
  iata: string,
  name: string,
  city: string,
  country: string,
): Promise<AirportInfoLLMResult | null> {
  // SECURITY: `allowTampuFallback: false` — el endpoint puede ser invocado
  // para cualquier IATA del mundo. Cargar al budget de Tampu sin BYOK
  // permitiría que un atacante mande mil IATAs y queme la key del server.
  const { provider, key, source } = selectProvider(req, { allowTampuFallback: false });
  if (!provider || !key) return null;
  const userMessage = `Aeropuerto: ${name} (${iata})\nCiudad: ${city}\nPaís: ${country}\n\nDevolvé info práctica para un viajero.`;
  // `callLLMRich` para tener usage real (input/output tokens + model) y
  // poder loggear vía `recordProxyCall`.
  const rich = await callLLMRich(provider, key, {
    system: SYSTEM,
    userMessage,
    maxTokens: 2048,
    timeoutMs: 25_000,
    model: "haiku",
  });
  if (!rich) return null;
  const parsed = extractJson<Omit<AirportInfoResult, "iata" | "generated" | "source">>(rich.text);
  if (!parsed) {
    return {
      result: null,
      provider: rich.provider,
      model: rich.model,
      inputTokens: rich.usage.inputTokens,
      outputTokens: rich.usage.outputTokens,
      source,
    };
  }
  return {
    result: { iata, generated: true, source: "claude", ...parsed },
    provider: rich.provider,
    model: rich.model,
    inputTokens: rich.usage.inputTokens,
    outputTokens: rich.usage.outputTokens,
    source,
  };
}

function fallback(iata: string): AirportInfoResult {
  return {
    iata, generated: false, source: "fallback",
    terminals: [{ id: "Main", airlines: ["—"], notes: "No tengo info detallada de este aeropuerto cargada." }],
    food: [], currency_exchange: [], lounges: [],
    transport_to_city: [{ mode: "Taxi", cost_usd: "—", duration_min: 0, note: "Consultá Google Maps al llegar." }],
    tips: [
      "Verificá horarios de embarque con la aerolínea — esta info es genérica.",
      "Llegá 2-3 horas antes de un vuelo internacional como buffer estándar.",
      "WiFi gratuito está disponible en casi todos los aeropuertos comerciales.",
    ],
  };
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const body = await req.json() as { iata: string; name?: string; city?: string; country?: string };
  if (!body?.iata) {
    return withCors(NextResponse.json({ error: "Missing iata" }, { status: 400 }), origin);
  }
  // SECURITY: cap inputs (anti-abuse). Un atacante podría mandar `name` con
  // 50kB de basura para inflar el input cost del LLM. 200 chars alcanza para
  // cualquier nombre de aeropuerto / ciudad / país real.
  const iata = body.iata.slice(0, 16);
  const name = (body.name || body.iata).slice(0, 200);
  const city = (body.city || "").slice(0, 200);
  const country = (body.country || "").slice(0, 200);
  const envelope = await llmAirportInfo(req, iata, name, city, country);
  if (envelope) {
    // Record usage real para budget / circuit breaker. Identifier per-user.
    const identifier = await getProxyIdentifier(
      "airport-info",
      envelope.source === "byok" ? "byok" : "fallback",
    );
    const costUsd = estimateCostUsd(envelope.inputTokens, envelope.outputTokens, envelope.model);
    void recordProxyCall(identifier, {
      endpoint: "/api/airport-info",
      tokensIn: envelope.inputTokens,
      tokensOut: envelope.outputTokens,
      costUsd,
      provider: envelope.provider,
      model: envelope.model,
    }).catch((e) => captureException(e, { tag: "airport-info.record" }));
    if (envelope.result) return withCors(NextResponse.json(envelope.result), origin);
  }
  return withCors(NextResponse.json(fallback(iata)), origin);
}
