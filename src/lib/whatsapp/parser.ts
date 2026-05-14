// ─── WhatsApp message parser ───
//
// Toma el texto crudo de un mensaje de WhatsApp que el user reenvió a Tampu
// y devuelve una representación estructurada (flight, hotel, reservation,
// transport, note) para autoinsertar en el viaje del user.
//
// Provider: Anthropic Claude Haiku 4.5 (target costo ~USD 0.005 por mensaje,
// budget total target USD 0.01 incluyendo Twilio). Fallback Gemini 2.0 Flash
// si Anthropic falla. Ambos paths usan la TAMPU_ANTHROPIC_KEY / GEMINI_API_KEY
// del server — el costo se carga al budget global vía ai_proxy_usage.
//
// Output shape estable: { type, confidence, data, reasoning? }. El consumer
// (webhook) decide si auto-insertar al trip o solo dejarlo pendiente en
// /whatsapp para revisión manual.

import { captureException } from "@/lib/observability/sentry";
import { estimateCostUsd, recordProxyCall } from "@/lib/ai/rate-limit";

export type WhatsAppItemType =
  | "flight"
  | "hotel"
  | "reservation"
  | "transport"
  | "note"
  | "unknown";

export type Confidence = "high" | "medium" | "low";

export interface ParsedWhatsAppItem {
  type: WhatsAppItemType;
  confidence: Confidence;
  // Shape específico por type. Documentado en el system prompt.
  data: Record<string, unknown>;
  reasoning?: string;
}

export interface ParserResult {
  parsed: ParsedWhatsAppItem | null;
  provider: "anthropic" | "gemini" | null;
  model: string | null;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  error?: string;
}

const SYSTEM_PROMPT = `Sos un parser de mensajes de WhatsApp para una app de viajes llamada Tampu. Un viajero reenvió un mensaje a Tampu (puede venir del host de Airbnb, de una agencia, de la aerolínea, de un transfer, de un tour). Tu trabajo es extraer información del viaje en formato JSON estructurado.

Idiomas que aceptás: español (incluido voseo argentino), portugués brasileño, inglés.

Devolvé EXCLUSIVAMENTE un objeto JSON válido con este shape (sin texto antes ni después, sin comillas markdown):

{
  "type": "flight" | "hotel" | "reservation" | "transport" | "note" | "unknown",
  "confidence": "high" | "medium" | "low",
  "data": { ... shape específico por type ... },
  "reasoning": "1 frase corta explicando por qué"
}

Shapes por type:

FLIGHT — Vuelo confirmado o reservado:
{
  "airline": "LATAM",                 // nombre de la aerolínea
  "flight_number": "LA800",           // código completo
  "from_iata": "EZE",                 // 3 letras si se infiere
  "to_iata": "GRU",                   // 3 letras si se infiere
  "from_city": "Buenos Aires",
  "to_city": "São Paulo",
  "departure_at": "2026-08-15T18:30:00",  // ISO 8601 local time
  "arrival_at": "2026-08-15T22:15:00",
  "locator": "ABC123",                // PNR / record locator
  "seat": "23A",                      // si está
  "amount": 250.00,                   // si está
  "currency": "USD"                   // ISO 4217
}

HOTEL — Reserva de alojamiento (Airbnb, Booking, hotel, hostel):
{
  "provider": "Airbnb",
  "host_name": "María Fernanda",
  "property_name": "Depto Palermo",
  "address": "Honduras 4800, Buenos Aires",
  "city": "Buenos Aires",
  "check_in": "2026-08-15",            // ISO date
  "check_out": "2026-08-18",
  "guests": 2,
  "confirmation_code": "HMRPK2X4",
  "amount": 150.00,
  "currency": "USD",
  "contact_phone": "+5491140404040"
}

RESERVATION — Tour, restaurante, evento, traslado pagado, seguro, etc:
{
  "category": "tour" | "restaurant" | "transfer" | "event" | "insurance" | "other",
  "provider": "Get Your Guide",
  "description": "Tour de día completo a Iguazú",
  "city": "Foz do Iguaçu",
  "start_at": "2026-08-16T07:00:00",
  "end_at": "2026-08-16T19:00:00",
  "locator": "GYG-12345",
  "amount": 75.00,
  "currency": "USD",
  "contact": "guide@whatever.com"
}

TRANSPORT — Bus / tren / ferry / shuttle:
{
  "operator": "Plataforma 10",
  "from_city": "Buenos Aires",
  "to_city": "Mar del Plata",
  "departure_at": "2026-08-20T08:00:00",
  "arrival_at": "2026-08-20T14:00:00",
  "seat": "12",
  "locator": "X9P8Y2",
  "amount": 45.00,
  "currency": "USD"
}

NOTE — El mensaje contiene info útil pero no es una reserva (ej. el host manda el código de WiFi, una recomendación de restaurante, instrucciones de check-in sin fecha):
{
  "title": "Código de WiFi del Airbnb",
  "content": "Red: PalermoLoft  Pass: 12345678",
  "city": "Buenos Aires"
}

UNKNOWN — No se puede extraer info de viaje útil (mensaje promocional, link sin contexto, saludo):
{}

REGLAS:
- Si no estás 90% seguro del valor de un campo, dejalo como null en vez de inventar.
- Fechas SIEMPRE en ISO 8601. Si solo hay día (sin hora), usá formato YYYY-MM-DD.
- Si la moneda no se infiere, asumí USD para montos en "$" sin contexto, ARS si hay "AR$" o "ARS", BRL si "R$" o "BRL".
- "confidence" alta solo si el mensaje es una confirmación clara con fechas + locator/código.
- Devolvé JSON SOLO, sin \`\`\`json fences, sin texto adicional.`;

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/**
 * Llamada directa a Anthropic Claude Haiku 4.5. Devuelve raw text + token
 * usage. Null en caso de error de transporte (NO captura el shape inválido).
 */
async function callAnthropicHaiku(
  key: string,
  userMessage: string,
): Promise<{ text: string; tokensIn: number; tokensOut: number } | null> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!res.ok) return null;
    const json: AnthropicResponse = await res.json();
    const text = json.content?.find(c => c.type === "text")?.text ?? "";
    if (!text) return null;
    return {
      text,
      tokensIn: json.usage?.input_tokens ?? 0,
      tokensOut: json.usage?.output_tokens ?? 0,
    };
  } catch {
    return null;
  }
}

async function callGeminiFlash(
  key: string,
  userMessage: string,
): Promise<{ text: string; tokensIn: number; tokensOut: number } | null> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `[SYSTEM]\n${SYSTEM_PROMPT}\n\n[USER]\n${userMessage}` }] }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.2 },
      }),
    });
    if (!res.ok) return null;
    const json: GeminiResponse = await res.json();
    const text = json.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") ?? "";
    if (!text) return null;
    return {
      text,
      tokensIn: json.usageMetadata?.promptTokenCount ?? 0,
      tokensOut: json.usageMetadata?.candidatesTokenCount ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Limpia el output del LLM y trata de parsearlo como JSON. El system prompt
 * pide JSON puro pero a veces el modelo lo envuelve en ```json``` fences o
 * agrega texto adicional. Hacemos el cleanup acá.
 */
function safeParseJson(raw: string): unknown {
  if (!raw) return null;
  let cleaned = raw.trim();
  // Sacar fences markdown si los hubiera.
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  // Si el modelo agregó texto antes del JSON, tomamos desde el primer "{"
  // hasta el último "}" — best effort.
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first >= 0 && last > first) cleaned = cleaned.slice(first, last + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Valida que el output cumpla el shape mínimo. Si no, devolvemos un
 * `unknown` low-confidence — preferimos ser conservadores y NO inventar
 * que entendimos algo si el modelo nos devolvió basura.
 */
function normalizeParsed(raw: unknown): ParsedWhatsAppItem {
  const VALID_TYPES: WhatsAppItemType[] = ["flight", "hotel", "reservation", "transport", "note", "unknown"];
  const VALID_CONFIDENCE: Confidence[] = ["high", "medium", "low"];

  if (!raw || typeof raw !== "object") {
    return { type: "unknown", confidence: "low", data: {} };
  }
  const obj = raw as Record<string, unknown>;
  const type = VALID_TYPES.includes(obj.type as WhatsAppItemType)
    ? (obj.type as WhatsAppItemType)
    : "unknown";
  const confidence = VALID_CONFIDENCE.includes(obj.confidence as Confidence)
    ? (obj.confidence as Confidence)
    : "low";
  const data = (obj.data && typeof obj.data === "object") ? (obj.data as Record<string, unknown>) : {};
  const reasoning = typeof obj.reasoning === "string" ? obj.reasoning : undefined;
  return { type, confidence, data, reasoning };
}

export interface ParseOpts {
  /** User ID Tampu (para tracking de costo en ai_proxy_usage). */
  userId: string;
  /** Opcional: si ya conocemos el trip activo, pasarlo para que el LLM lo use de contexto. */
  tripContext?: { destination?: string; start_date?: string; end_date?: string };
}

/**
 * Parsea texto de WhatsApp con LLM. Si Anthropic falla, intenta Gemini.
 * Si ambos fallan, devuelve `{ parsed: null, error }`.
 *
 * SIEMPRE registra el costo en ai_proxy_usage (incluso si el shape final
 * fue "unknown" — el LLM igual cobró por los tokens).
 */
export async function parseWhatsAppText(
  body: string,
  opts: ParseOpts,
): Promise<ParserResult> {
  const empty: ParserResult = { parsed: null, provider: null, model: null, costUsd: 0, tokensIn: 0, tokensOut: 0 };
  if (!body?.trim()) return { ...empty, error: "empty_body" };

  // Componemos el user message con el contexto del trip (si lo tenemos)
  const userMessage = opts.tripContext
    ? `[Trip activo del user: destino=${opts.tripContext.destination ?? "desconocido"}, fechas=${opts.tripContext.start_date ?? "?"}→${opts.tripContext.end_date ?? "?"}]\n\nMensaje recibido:\n${body}`
    : `Mensaje recibido:\n${body}`;

  const fpId = `user:${opts.userId}`;

  // 1. Anthropic Haiku (provider primario)
  const anthKey = process.env.TAMPU_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
  if (anthKey) {
    const r = await callAnthropicHaiku(anthKey, userMessage);
    if (r) {
      const parsed = normalizeParsed(safeParseJson(r.text));
      const costUsd = estimateCostUsd(r.tokensIn, r.tokensOut, "haiku");
      // Persistir uso (fire-and-forget, no bloqueamos la respuesta al user)
      void recordProxyCall(fpId, {
        endpoint: "whatsapp-ingestion",
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        costUsd,
      }).catch((e) => captureException(e, { tag: "whatsapp.parser.record", level: "warning" }));
      return {
        parsed,
        provider: "anthropic",
        model: "claude-haiku-4-5",
        costUsd,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
      };
    }
  }

  // 2. Fallback Gemini Flash
  const gemKey = process.env.GEMINI_API_KEY;
  if (gemKey) {
    const r = await callGeminiFlash(gemKey, userMessage);
    if (r) {
      const parsed = normalizeParsed(safeParseJson(r.text));
      // Gemini Flash es ~3x más barato que Haiku; usamos pricing aproximado
      // (USD 0.075 / 1M input, USD 0.30 / 1M output).
      const costUsd = r.tokensIn * 0.000000075 + r.tokensOut * 0.0000003;
      void recordProxyCall(fpId, {
        endpoint: "whatsapp-ingestion",
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        costUsd,
      }).catch((e) => captureException(e, { tag: "whatsapp.parser.record", level: "warning" }));
      return {
        parsed,
        provider: "gemini",
        model: "gemini-2.0-flash",
        costUsd,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
      };
    }
  }

  return { ...empty, error: "no_provider_responded" };
}

/**
 * Devuelve un resumen 1-línea legible del item parseado (para mandar como
 * reply por WhatsApp). En español, voseo.
 */
export function summarizeParsedItem(item: ParsedWhatsAppItem): string {
  const d = item.data as Record<string, string | number | undefined>;
  switch (item.type) {
    case "flight":
      return `vuelo ${d.airline ?? ""} ${d.flight_number ?? ""} ${d.from_iata ?? d.from_city ?? "?"}→${d.to_iata ?? d.to_city ?? "?"}${d.departure_at ? ` (${d.departure_at})` : ""}`.trim();
    case "hotel":
      return `alojamiento en ${d.property_name ?? d.provider ?? "?"} (${d.check_in ?? "?"} → ${d.check_out ?? "?"})`;
    case "reservation":
      return `${d.category ?? "reserva"}: ${d.description ?? d.provider ?? "?"}${d.start_at ? ` (${d.start_at})` : ""}`;
    case "transport":
      return `${d.operator ?? "transporte"} ${d.from_city ?? "?"}→${d.to_city ?? "?"}${d.departure_at ? ` (${d.departure_at})` : ""}`;
    case "note":
      return `nota: ${d.title ?? "info del viaje"}`;
    default:
      return "no pude identificar info de viaje en el mensaje";
  }
}
