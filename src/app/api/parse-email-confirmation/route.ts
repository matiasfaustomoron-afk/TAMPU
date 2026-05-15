import { NextRequest, NextResponse } from "next/server";
import { selectProvider, callLLMRich } from "@/lib/ai/providers";
import { heuristicMultiParse, type ParsedBooking } from "@/lib/parsing/email-parser";
import { maskPII } from "@/lib/ai/pii-filter";
import { recordProxyCall, estimateCostUsd } from "@/lib/ai/rate-limit";
import { captureException } from "@/lib/observability/sentry";

/**
 * Email confirmation parser — v2 multibooking + multilingüe.
 *
 * Diferencias vs /api/parse-booking (v1):
 *  - Devuelve un ARRAY de bookings (un email de Despegar trae vuelo + vuelo + seguro = 3 items)
 *  - SYSTEM prompt declara explícitamente carriers LatAm + idiomas ES/PT/EN/FR/IT
 *  - Detecta lenguaje y carrier antes de parsear, lo expone en `meta` para telemetría
 *  - Fallback heurístico vive en lib/parsing/email-parser (testeable sin LLM)
 *
 * Filo 10x: TripIt no parsea LATAM/Aerolineas/Gol/Despegar; no soporta portugués; no maneja
 * emails con múltiples reservas. Este endpoint cubre los tres.
 *
 * Privacidad: el texto se envía a Anthropic vía la key del usuario (header `x-anthropic-key`).
 * Si no hay key, se cae a heurística local. NUNCA se persiste el email en server.
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
    "Content-Type, x-anthropic-key, x-gemini-key"
  );
  res.headers.set("Vary", "Origin");
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return withCors(new NextResponse(null, { status: 204 }), req.headers.get("origin"));
}

interface ParseResult {
  bookings: ParsedBooking[];
  source: "claude" | "heuristic" | "mixed";
  languages_detected: string[];
  /** Carrier libre (string), max 50 chars. NUNCA un enum cerrado — los OTAs
   *  rotan nombres y agregamos nuevos cada mes. */
  carrier_hint: string | null;
  warnings: string[];
  provider?: string | null;
  model?: string | null;
  degraded?: boolean;
  reason?: string;
}

// ─── System prompt — multilingüe + LatAm-aware ───
const SYSTEM = `Sos un parser de emails de confirmación de viaje. Recibís texto crudo (puede ser pegado de email, SMS, screenshot OCR, o WhatsApp) y devolvés UN ARRAY DE BOOKINGS en JSON estricto.

REGLAS DURAS:
- Devolvé { "bookings": [ ... ], "language": "es"|"pt"|"en"|"fr"|"it", "carrier_hint": string libre con el nombre del carrier (ej "LATAM", "Aerolineas Argentinas", "Gol", "Despegar", "Airbnb", "Booking.com") o null si no se identifica. Máx 50 caracteres — usá el nombre real, no inventes uno nuevo. }
- Un email puede tener VARIOS bookings: ida + vuelta = 2 bookings; vuelo + traslado + hotel = 3 bookings; vuelo + seguro = 2 bookings. Separá cada uno como item del array.
- Si NO podés extraer al menos un type+provider+algo más, devolvé bookings: [].

Cada booking del array es:
{
  "type": "flight" | "accommodation" | "train" | "bus" | "tour" | "insurance" | "connectivity" | "transfer" | "other",
  "provider": "LATAM Airlines" | "Despegar" | "Airbnb" | etc.,
  "city_name": "Buenos Aires" | null,
  "description": "BUE→SCL · 12 ago 2026" | "Hotel Pulitzer Buenos Aires" (UNA LÍNEA con el corazón del booking),
  "use_date": "YYYY-MM-DD" o null,
  "use_end_date": "YYYY-MM-DD" o null,
  "payment_deadline": "YYYY-MM-DD" o null,
  "original_amount": número (no string),
  "original_currency": ISO 4217 (USD/EUR/ARS/BRL/CLP/COP/MXN/PEN/UYU/PYG/KRW/PGK/PHP/AED/GBP/JPY/CHF),
  "status": "pending" | "booked" | "confirmed" | "paid",
  "locator": "PNR/booking ref" o null,
  "contact": "email o tel del vendor" o null,
  "is_cancellable": true | false | null,
  "cancellation_policy": "texto corto" o null,
  "notes": "observaciones cortas",
  "confidence": "high" | "medium" | "low"
}

CARRIERS LATAM frecuentes:
- LATAM Airlines (BUE/EZE, SCL, LIM, BOG, GRU, GIG, MAD)
- Aerolineas Argentinas (AR/ARG)
- Gol Linhas Aéreas (G3) – emails en pt-BR
- Azul (AD) – emails en pt-BR
- Avianca (AV)
- Copa Airlines (CM)
- JetSmart, Sky Airline
- Despegar.com / Decolar.com / Almundo – son OTAs, suelen agrupar varios bookings (vuelo + hotel + seguro) en UN mail. PARSEÁ cada item por separado.

IDIOMAS soportados — detectalo automáticamente:
- es-AR (voseo: "saliste", "tu vuelo"), es-MX, es-CL, es-CO, es-PE — todos español.
- pt-BR ("voo", "embarque", "código de reserva"). NUNCA confundir pt-BR con español aunque se parezcan.
- en, fr, it.

FECHAS:
- ISO yyyy-mm-dd siempre.
- Si la fecha llega "15/AGO/2026" o "August 15, 2026" o "15 ago" — convertí.
- Si solo hay día+mes sin año, asumí el próximo año futuro.
- Para vuelos, use_date = fecha de salida. use_end_date = null (salvo que sea un trip multi-segmento agrupado, ahí use_end_date = fecha del último segmento).
- Para hoteles, use_date = check-in. use_end_date = check-out.

CONFIDENCE:
- high: todos los campos clave extraídos textualmente.
- medium: tuviste que inferir 1-2.
- low: inferiste mucho o el texto es ambiguo.

NO DEVUELVAS MARKDOWN. SOLO JSON. SIN code fences.`;

interface LLMResponse {
  bookings: ParsedBooking[];
  language: string;
  carrier_hint: string | null;
}

interface LLMParseEnvelope {
  data: LLMResponse | null;
  degraded?: { reason: "json_parse_failed" };
  provider: "anthropic" | "gemini";
  model: string;
  inputTokens: number;
  outputTokens: number;
}

async function llmParse(req: NextRequest, text: string): Promise<LLMParseEnvelope | null> {
  // SECURITY: explicit opt-out — emails crudos pueden ser muy grandes, no
  // queremos que carguen al budget global de Tampu sin pasar por /api/ai-proxy.
  const { provider, key } = selectProvider(req, { allowTampuFallback: false });
  if (!provider || !key) return null;

  // SECURITY: email crudo puede traer tarjetas/IDs — `maskPII` antes de salir.
  const masked = maskPII(text);

  const rich = await callLLMRich(provider, key, {
    system: SYSTEM,
    userMessage: masked.slice(0, 16_000),
    maxTokens: 2048,
    timeoutMs: 30_000,
    model: "haiku",
  });
  if (!rich) return null;

  try {
    const clean = rich.text
      .replace(/^```(json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    const parsed = JSON.parse(clean) as LLMResponse;
    // Defensive: garantizar shape
    if (!Array.isArray(parsed.bookings)) {
      return {
        data: null,
        degraded: { reason: "json_parse_failed" },
        provider: rich.provider,
        model: rich.model,
        inputTokens: rich.usage.inputTokens,
        outputTokens: rich.usage.outputTokens,
      };
    }
    return {
      data: {
        bookings: parsed.bookings,
        language: parsed.language || "unknown",
        carrier_hint: parsed.carrier_hint || null,
      },
      provider: rich.provider,
      model: rich.model,
      inputTokens: rich.usage.inputTokens,
      outputTokens: rich.usage.outputTokens,
    };
  } catch (err) {
    console.warn("[parse-email-confirmation] LLM JSON parse failed:", err);
    return {
      data: null,
      degraded: { reason: "json_parse_failed" },
      provider: rich.provider,
      model: rich.model,
      inputTokens: rich.usage.inputTokens,
      outputTokens: rich.usage.outputTokens,
    };
  }
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");

  let body: { text?: string };
  try {
    body = (await req.json()) as { text?: string };
  } catch {
    return withCors(NextResponse.json({ error: "JSON inválido" }, { status: 400 }), origin);
  }

  if (!body?.text || body.text.length < 20) {
    return withCors(
      NextResponse.json({ error: "Texto muy corto (mínimo 20 caracteres)" }, { status: 400 }),
      origin
    );
  }

  if (body.text.length > 30_000) {
    return withCors(
      NextResponse.json({ error: "Texto muy largo (máximo 30k caracteres)" }, { status: 413 }),
      origin
    );
  }

  const text = body.text;
  const { key, source: keySource } = selectProvider(req, { allowTampuFallback: false });
  const warnings: string[] = [];

  // 1) Intentar LLM
  let envelope: LLMParseEnvelope | null = null;
  if (key) {
    envelope = await llmParse(req, text);
    if (!envelope) {
      warnings.push("LLM falló (no response); cayó a heurística.");
    } else if (envelope.data === null) {
      warnings.push("LLM devolvió JSON inválido; cayó a heurística.");
    }
    // Record usage real para budget / circuit breaker
    if (envelope) {
      const costUsd = estimateCostUsd(envelope.inputTokens, envelope.outputTokens, envelope.model);
      void recordProxyCall(keySource === "byok" ? "byok:parse-email" : "fallback:parse-email", {
        endpoint: "/api/parse-email-confirmation",
        tokensIn: envelope.inputTokens,
        tokensOut: envelope.outputTokens,
        costUsd,
        provider: envelope.provider,
        model: envelope.model,
      }).catch((e) => captureException(e, { tag: "parse-email.record" }));
    }
  } else {
    warnings.push("Sin key conectada — usando heurística local (menos preciso).");
  }

  // 2) Heurística (siempre corre, sirve de doble-validación o fallback)
  const heuristic = heuristicMultiParse(text);

  // 3) Decidir output: si el LLM devolvió ≥1 booking de high/medium, usamos LLM.
  //    Si no, fallback heurístico (flagged degraded si el LLM respondió pero falló parse).
  const result: ParseResult = (() => {
    const llmData = envelope?.data;
    if (llmData && llmData.bookings.length > 0) {
      const goodEnough = llmData.bookings.filter((b) => b.confidence !== "low");
      if (goodEnough.length > 0) {
        return {
          bookings: llmData.bookings,
          source: "claude" as const,
          languages_detected: [llmData.language],
          carrier_hint: llmData.carrier_hint,
          warnings,
          provider: envelope?.provider ?? null,
          model: envelope?.model ?? null,
        };
      }
    }
    const fallback: ParseResult = {
      bookings: heuristic.bookings,
      source: "heuristic" as const,
      languages_detected: heuristic.languages,
      carrier_hint: heuristic.carrier_hint,
      warnings,
      provider: envelope?.provider ?? null,
      model: envelope?.model ?? null,
    };
    if (envelope?.degraded) {
      fallback.degraded = true;
      fallback.reason = envelope.degraded.reason;
    }
    return fallback;
  })();

  return withCors(NextResponse.json(result), origin);
}
