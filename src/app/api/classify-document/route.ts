import { NextRequest, NextResponse } from "next/server";
import { selectProvider, callLLMRich } from "@/lib/ai/providers";
import { maskPII } from "@/lib/ai/pii-filter";
import { recordProxyCall, estimateCostUsd } from "@/lib/ai/rate-limit";
import { getProxyIdentifier } from "@/lib/ai/proxy-identifier";
import { captureException } from "@/lib/observability/sentry";

// ─── Document classifier + OCR ───
// Receives a base64-encoded image OR PDF, asks Claude (vision) to classify it
// into one of the Vault categories and extract structured metadata.
//
// Auto-classification target categories (must match Attachment.category):
//   insurance, boarding_pass, identity, reservation, transport, health, receipt, other

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

interface ClassifyRequest {
  data_base64: string; // base64 without prefix
  mime: string;        // image/jpeg | image/png | application/pdf | etc.
  file_name?: string;
}

interface ClassifyResult {
  category: "insurance" | "boarding_pass" | "identity" | "reservation" | "transport" | "health" | "receipt" | "other";
  confidence: "high" | "medium" | "low";
  suggested_name: string;
  extracted: {
    provider?: string;
    locator?: string;
    flight_route?: string;     // "GRU → DXB → MNL"
    departure_date?: string;   // ISO yyyy-mm-dd
    arrival_date?: string;
    seat?: string;
    document_number?: string;  // passport / visa number (masked if requested)
    expiry_date?: string;
    person_name?: string;
    total_amount?: number;
    currency?: string;
    notes?: string;
  };
  is_critical: boolean;
  source: "claude" | "heuristic-filename";
}

const SYSTEM = `Sos un clasificador argentino de documentos de viaje. Recibís UNA imagen o PDF (probablemente foto de un boarding pass, pasaporte, póliza de seguro, recibo, reserva de hotel, certificado de vacuna, ticket de tren).

Devolvé JSON estricto con:
{
  "category": "boarding_pass" | "insurance" | "identity" | "reservation" | "transport" | "health" | "receipt" | "other",
  "confidence": "high" | "medium" | "low",
  "suggested_name": "Nombre corto y útil del archivo (ej. 'Boarding Emirates GRU→DXB Aug 10')",
  "extracted": {
    "provider": "...",          // aerolínea/hotel/aseguradora; null si no aplica
    "locator": "...",           // PNR / booking reference / policy number
    "flight_route": "...",      // "GRU → DXB → MNL" si es vuelo, null si no
    "departure_date": "YYYY-MM-DD",
    "arrival_date": "YYYY-MM-DD",
    "seat": "12A",              // solo si es boarding pass
    "document_number": "...",   // pasaporte/visa/policy número
    "expiry_date": "YYYY-MM-DD",
    "person_name": "...",       // titular del documento
    "total_amount": 1234.56,    // si es recibo o póliza
    "currency": "USD",
    "notes": ""
  },
  "is_critical": true | false   // true para boarding_pass, identity, insurance
}

Reglas:
- Si NO podés leer un campo, ponelo null (no inventes datos).
- Si la imagen NO parece un documento de viaje, devolvé category: "other", confidence: "low".
- Boarding pass / passport / insurance / visa SIEMPRE son is_critical: true.
- Fechas en ISO yyyy-mm-dd. Si la fecha está en formato local (15/AUG/2026), conviértela.
- NUNCA devuelvas markdown. Solo el JSON, sin code fences.`;

function heuristicFallback(fileName: string | undefined): ClassifyResult {
  const lower = (fileName || "").toLowerCase();
  let category: ClassifyResult["category"] = "other";
  if (/board(ing)?|boarding-?pass|bp[-_]/i.test(lower)) category = "boarding_pass";
  else if (/passport|pasaporte/i.test(lower)) category = "identity";
  else if (/visa|k-?eta|evisa/i.test(lower)) category = "identity";
  else if (/insur|seguro|polic/i.test(lower)) category = "insurance";
  else if (/receipt|recibo|invoice|factur/i.test(lower)) category = "receipt";
  else if (/hotel|airbnb|booking|reserv/i.test(lower)) category = "reservation";
  else if (/vaccin|vacuna|certific|health|salud/i.test(lower)) category = "health";
  else if (/train|tren|ticket|metro/i.test(lower)) category = "transport";
  return {
    category,
    confidence: category === "other" ? "low" : "medium",
    suggested_name: fileName?.replace(/\.[^.]+$/, "") || "Documento",
    extracted: {},
    is_critical: ["boarding_pass", "identity", "insurance"].includes(category),
    source: "heuristic-filename",
  };
}

interface ClassifyLLMResponse {
  result: ClassifyResult | null;
  degraded?: { reason: "json_parse_failed" };
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  source: "byok" | "tampu" | "env" | "none";
}

async function llmClassify(req: NextRequest, body: ClassifyRequest): Promise<ClassifyLLMResponse | null> {
  // P1.12 — classify-document es el único endpoint server-side que usa visión
  // y typically corre sin BYOK (el user no quiere configurar key sólo para
  // clasificar un boarding). Habilitamos fallback al proxy de Tampu acá.
  const { provider, key, source } = selectProvider(req, { allowTampuFallback: true });
  if (!provider || !key) return null;
  try {
    const isPdf = body.mime === "application/pdf";
    // PII mask en el filename hint (puede traer DNI/CUIT en el nombre del archivo).
    const safeFilename = maskPII(body.file_name || "desconocido");
    const rich = await callLLMRich(provider, key, {
      system: SYSTEM,
      userMessage: `Clasificá este documento. Filename: ${safeFilename}`,
      image: isPdf ? undefined : { dataB64: body.data_base64, mime: body.mime || "image/jpeg" },
      pdf: isPdf ? { dataB64: body.data_base64 } : undefined,
      maxTokens: 1024,
      timeoutMs: 40_000,
      // Sonnet para vision — Haiku no soporta vision multimodal igual de bien.
      model: "sonnet",
    });
    if (!rich) return null;
    try {
      const clean = rich.text.replace(/^```(json)?\s*/i, "").replace(/```\s*$/, "").trim();
      const parsed = JSON.parse(clean) as Omit<ClassifyResult, "source">;
      return {
        result: { ...parsed, source: "claude" },
        provider: rich.provider,
        model: rich.model,
        inputTokens: rich.usage.inputTokens,
        outputTokens: rich.usage.outputTokens,
        source,
      };
    } catch {
      return {
        result: null,
        degraded: { reason: "json_parse_failed" },
        provider: rich.provider,
        model: rich.model,
        inputTokens: rich.usage.inputTokens,
        outputTokens: rich.usage.outputTokens,
        source,
      };
    }
  } catch (e) {
    console.error("[classify] LLM failed:", e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const body = await req.json() as ClassifyRequest;
  if (!body?.data_base64 || !body?.mime) {
    return withCors(NextResponse.json({ error: "Missing data_base64 or mime" }, { status: 400 }), origin);
  }
  if (body.data_base64.length > 8_000_000) {
    return withCors(NextResponse.json({ error: "File too large for IA classification (max ~6 MB)." }, { status: 413 }), origin);
  }
  const envelope = await llmClassify(req, body);
  if (envelope) {
    // Record real usage para budget / circuit breaker, ya sea hit o degraded.
    // Identifier per-user (`byok:user:<uuid>:classify-document` o
    // `fallback:user:<uuid>:classify-document`) para rate-limit individual.
    // Caso tampu cae bajo `fallback` ya que comparte el budget de Tampu.
    const identifier = await getProxyIdentifier(
      "classify-document",
      envelope.source === "byok" ? "byok" : "fallback",
    );
    const costUsd = estimateCostUsd(envelope.inputTokens, envelope.outputTokens, envelope.model);
    void recordProxyCall(identifier, {
      endpoint: "/api/classify-document",
      tokensIn: envelope.inputTokens,
      tokensOut: envelope.outputTokens,
      costUsd,
      provider: envelope.provider === "anthropic" || envelope.provider === "gemini" ? envelope.provider : "tampu",
      model: envelope.model,
    }).catch((e) => captureException(e, { tag: "classify-document.record" }));

    if (envelope.result) {
      return withCors(
        NextResponse.json({
          ...envelope.result,
          provider: envelope.provider,
          model: envelope.model,
        }),
        origin,
      );
    }
    // JSON parse falló → degraded flag + heuristic fallback
    const fb = heuristicFallback(body.file_name);
    return withCors(
      NextResponse.json({
        ...fb,
        degraded: true,
        reason: envelope.degraded?.reason ?? "json_parse_failed",
        provider: envelope.provider,
        model: envelope.model,
      }),
      origin,
    );
  }
  return withCors(NextResponse.json(heuristicFallback(body.file_name)), origin);
}
