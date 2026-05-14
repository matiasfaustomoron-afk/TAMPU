import { NextRequest, NextResponse } from "next/server";
import { selectProvider, callLLMRich } from "@/lib/ai/providers";
import { maskPII } from "@/lib/ai/pii-filter";
import { recordProxyCall, estimateCostUsd } from "@/lib/ai/rate-limit";
import { captureException } from "@/lib/observability/sentry";

// ─── Booking parser ───
// Receives raw text from a confirmation email/SMS, extracts a Reservation candidate.
// Uses Claude if ANTHROPIC_API_KEY is set; falls back to a regex-based heuristic.
// Counterpart to TripIt Pro's plans@tripit.com auto-import, but paste-driven.

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

interface ParsedBooking {
  type: "flight" | "accommodation" | "train" | "bus" | "tour" | "insurance" | "connectivity" | "other";
  provider: string;
  city_name: string | null;
  description: string;
  use_date: string | null;
  use_end_date: string | null;
  payment_deadline: string | null;
  original_amount: number;
  original_currency: string;
  status: "pending" | "booked" | "confirmed" | "paid";
  locator: string | null;
  contact: string | null;
  is_cancellable: boolean | null;
  cancellation_policy: string | null;
  notes: string;
  confidence: "high" | "medium" | "low";
}

const SYSTEM = `Sos un parser argentino de emails de confirmación de viajes. Recibís texto (puede venir pegado de un email, SMS o app) y extraés UN SOLO booking en formato JSON estricto.

Reglas:
- type: flight | accommodation | train | bus | tour | insurance | connectivity | other
- Fechas en formato ISO yyyy-mm-dd. Si no podés inferir, devolvé null.
- original_amount: número (no string). Si hay moneda local + USD, preferí la local.
- original_currency: ISO 4217 (USD/EUR/ARS/BRL/KRW/PGK/PHP/AED/GBP/JPY).
- status: pending si no se completó el pago; confirmed si dice "confirmado"; paid si dice "pagado/charged".
- locator: PNR/booking ref si está. null si no.
- description: una línea con el corazón del booking (ruta o título).
- confidence: high si todos los campos clave están, low si tuviste que adivinar muchos.

Salida ESTRICTAMENTE JSON sin markdown:
{"type":"flight","provider":"...","city_name":"...","description":"...","use_date":"YYYY-MM-DD","use_end_date":null,"payment_deadline":null,"original_amount":1234,"original_currency":"USD","status":"confirmed","locator":"ABC123","contact":null,"is_cancellable":null,"cancellation_policy":null,"notes":"","confidence":"high"}`;

function heuristicParse(text: string): ParsedBooking {
  const lower = text.toLowerCase();
  const type: ParsedBooking["type"] =
    /\bflight|vuelo|airline|airport|gate|boarding\b/i.test(lower) ? "flight"
    : /\bhotel|airbnb|booking\.com|hostel|alojamiento|check[-\s]?in\b/i.test(lower) ? "accommodation"
    : /\btour|excursion|safari\b/i.test(lower) ? "tour"
    : /\binsurance|seguro\b/i.test(lower) ? "insurance"
    : /\btrain|tren|amtrak|renfe\b/i.test(lower) ? "train"
    : /\besim|sim|airalo|holafly\b/i.test(lower) ? "connectivity"
    : "other";

  const locator = (text.match(/(?:booking|pnr|locator|locator|c[oó]digo|reference|ref[: #]+)[: \-#]*([A-Z0-9]{5,10})\b/i)?.[1] || null);
  const date = text.match(/(\d{4}[-/]\d{2}[-/]\d{2})|(\d{2}[-/]\d{2}[-/]\d{4})/)?.[0] || null;
  const amountMatch = text.match(/(?:total|monto|price|importe|amount)[:\s]*([A-Z]{3})?[\s$€£]*([\d,.]+)/i);
  const currency = (amountMatch?.[1] || (text.match(/\b(USD|EUR|ARS|BRL|KRW|PGK|PHP|AED|GBP|JPY)\b/)?.[0]) || "USD");
  const amount = amountMatch ? parseFloat(amountMatch[2].replace(/,/g, "")) || 0 : 0;
  const provider = (text.match(/^([A-Z][A-Za-z0-9 &]+)$/m)?.[1] || text.split("\n")[0] || "Unknown").slice(0, 50);

  return {
    type,
    provider,
    city_name: null,
    description: text.split("\n").find(l => l.trim().length > 10)?.trim().slice(0, 100) || "Imported booking",
    use_date: date ? date.replace(/\//g, "-").split("T")[0] : null,
    use_end_date: null,
    payment_deadline: null,
    original_amount: amount,
    original_currency: currency,
    status: /\b(confirmed|confirmad|booked|reservad)/i.test(lower) ? "confirmed" : "pending",
    locator,
    contact: null,
    is_cancellable: null,
    cancellation_policy: null,
    notes: "Parsed via heuristic (no AI key set).",
    confidence: "low",
  };
}

interface LlmParseOk {
  parsed: ParsedBooking;
  provider: "anthropic" | "gemini";
  model: string;
  inputTokens: number;
  outputTokens: number;
}

interface LlmParseErr {
  parsed: null;
  degraded: true;
  reason: "json_parse_failed";
  provider: "anthropic" | "gemini";
  model: string;
  inputTokens: number;
  outputTokens: number;
}

async function llmParse(
  req: NextRequest,
  text: string,
): Promise<LlmParseOk | LlmParseErr | null> {
  // SECURITY: el endpoint recibe texto crudo de emails; aplicamos `maskPII`
  // ANTES de mandar al provider para no exfiltrar tarjetas/DNI/CUIT.
  const masked = maskPII(text);
  const { provider, key } = selectProvider(req);
  if (!provider || !key) return null;
  const rich = await callLLMRich(provider, key, {
    system: SYSTEM,
    userMessage: masked.slice(0, 12_000),
    maxTokens: 1024,
    timeoutMs: 25_000,
    model: "haiku",
  });
  if (!rich) return null;
  try {
    const clean = rich.text.replace(/^```(json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(clean) as ParsedBooking;
    return {
      parsed,
      provider: rich.provider,
      model: rich.model,
      inputTokens: rich.usage.inputTokens,
      outputTokens: rich.usage.outputTokens,
    };
  } catch {
    return {
      parsed: null,
      degraded: true,
      reason: "json_parse_failed",
      provider: rich.provider,
      model: rich.model,
      inputTokens: rich.usage.inputTokens,
      outputTokens: rich.usage.outputTokens,
    };
  }
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const body = await req.json() as { text?: string };
  if (!body?.text || body.text.length < 20) {
    return withCors(NextResponse.json({ error: "Texto muy corto" }, { status: 400 }), origin);
  }
  // Truncamos ANTES de maskPII para no procesar texto que no vamos a usar.
  const text = body.text.slice(0, 16_000);
  const { key, source } = selectProvider(req);
  let parsed: ParsedBooking | null = null;
  let degraded: { reason: string } | null = null;
  let respProvider: string | null = null;
  let respModel: string | null = null;

  if (key) {
    const r = await llmParse(req, text);
    if (r && r.parsed) {
      parsed = r.parsed;
      respProvider = r.provider;
      respModel = r.model;
      // Record real usage + model
      const costUsd = estimateCostUsd(r.inputTokens, r.outputTokens, r.model);
      void recordProxyCall(source === "byok" ? "byok:parse-booking" : "fallback:parse-booking", {
        endpoint: "/api/parse-booking",
        tokensIn: r.inputTokens,
        tokensOut: r.outputTokens,
        costUsd,
        provider: r.provider,
        model: r.model,
      }).catch((e) => captureException(e, { tag: "parse-booking.record" }));
    } else if (r && r.parsed === null) {
      // LLM respondió pero no pudimos parsear el JSON — flag degraded.
      degraded = { reason: r.reason };
      respProvider = r.provider;
      respModel = r.model;
      const costUsd = estimateCostUsd(r.inputTokens, r.outputTokens, r.model);
      void recordProxyCall(source === "byok" ? "byok:parse-booking" : "fallback:parse-booking", {
        endpoint: "/api/parse-booking",
        tokensIn: r.inputTokens,
        tokensOut: r.outputTokens,
        costUsd,
        provider: r.provider,
        model: r.model,
      }).catch((e) => captureException(e, { tag: "parse-booking.record" }));
    }
  }
  if (!parsed) parsed = heuristicParse(text);

  const responseBody: Record<string, unknown> = {
    parsed,
    source: degraded ? "heuristic" : (key && parsed.confidence !== "low" ? "claude" : "heuristic"),
    provider: respProvider,
    model: respModel,
  };
  if (degraded) {
    responseBody.degraded = true;
    responseBody.reason = degraded.reason;
  }
  return withCors(NextResponse.json(responseBody), origin);
}
