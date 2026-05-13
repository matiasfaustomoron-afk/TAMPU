import { NextRequest, NextResponse } from "next/server";
import { selectProvider, callLLM } from "@/lib/ai/providers";

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

async function llmAirportInfo(req: NextRequest, iata: string, name: string, city: string, country: string): Promise<AirportInfoResult | null> {
  const { provider, key } = selectProvider(req);
  if (!provider || !key) return null;
  const userMessage = `Aeropuerto: ${name} (${iata})\nCiudad: ${city}\nPaís: ${country}\n\nDevolvé info práctica para un viajero.`;
  const raw = await callLLM(provider, key, { system: SYSTEM, userMessage, maxTokens: 2048, timeoutMs: 25_000 });
  if (!raw) return null;
  try {
    const clean = raw.replace(/^```(json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(clean) as Omit<AirportInfoResult, "iata" | "generated" | "source">;
    return { iata, generated: true, source: "claude", ...parsed };
  } catch { return null; }
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
  const result = await llmAirportInfo(req, body.iata, body.name || body.iata, body.city || "", body.country || "");
  if (result) return withCors(NextResponse.json(result), origin);
  return withCors(NextResponse.json(fallback(body.iata)), origin);
}
