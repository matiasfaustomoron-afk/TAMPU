// ─── POST /api/categorize-expense ───
//
// Single-shot LLM classifier que toma la descripción de un gasto y devuelve
// la mejor categoría del set BUDGET_CATEGORIES. Costo ~USD 0.0005/expense
// con Claude Haiku 4.5 o Gemini 2.0 Flash.
//
// Privacy: la key del user va por header (mismo patrón que /api/generate-itinerary).
// Si no hay key → 503 (cliente cae a manual select).

import { NextResponse, type NextRequest } from "next/server";
import { selectProvider, callLLM } from "@/lib/ai/providers";
import { BUDGET_CATEGORIES } from "@/lib/config/constants";

interface RequestBody {
  description: string;
  amount?: number;
  currency?: string;
  date?: string;
  destination?: string;
}

interface CategorizationResult {
  category: string;
  confidence: "high" | "medium" | "low";
  reasoning?: string;
}

const CATEGORY_VALUES: string[] = BUDGET_CATEGORIES.map(c => c.value);
const CATEGORY_LIST = BUDGET_CATEGORIES.map(c => `- ${c.value}: ${c.label}`).join("\n");

const SYSTEM_PROMPT = `Sos un clasificador de gastos de viaje. Recibís la descripción de un gasto y devolvés UNA categoría exacta de la siguiente lista:

${CATEGORY_LIST}

Reglas:
- Respondé SOLO con JSON válido: {"category": "<value>", "confidence": "high|medium|low", "reasoning": "<una frase corta>"}
- "category" debe ser uno de los values exactos de arriba (snake_case, no traduzcas).
- "confidence" = high si la descripción es inequívoca (ej. "Vuelo BUE-EZE"), medium si hay ambigüedad razonable, low si es un guess.
- NO inventes categorías nuevas.
- Si genuinamente no encaja, devolvé "other".`;

export async function POST(req: NextRequest) {
  const { provider, key } = selectProvider(req);
  if (!provider || !key) {
    return NextResponse.json({ error: "no_llm_key" }, { status: 503 });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.description || body.description.trim().length < 2) {
    return NextResponse.json({ error: "description_required" }, { status: 400 });
  }

  const userMessage = [
    `Gasto: "${body.description.trim()}"`,
    body.amount ? `Monto: ${body.amount} ${body.currency || "USD"}` : null,
    body.date ? `Fecha: ${body.date}` : null,
    body.destination ? `Destino: ${body.destination}` : null,
    "",
    "Devolvé el JSON con la categoría:",
  ].filter(Boolean).join("\n");

  const raw = await callLLM(provider, key, {
    system: SYSTEM_PROMPT,
    userMessage,
    maxTokens: 200,
    timeoutMs: 10_000,
  });

  if (!raw) {
    return NextResponse.json({ error: "llm_failed" }, { status: 502 });
  }

  // Extract JSON (modelo puede envolver en markdown ```json ... ```)
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    return NextResponse.json({ error: "no_json_in_response", raw }, { status: 502 });
  }

  let parsed: CategorizationResult;
  try {
    parsed = JSON.parse(match[0]) as CategorizationResult;
  } catch {
    return NextResponse.json({ error: "json_parse_failed", raw: match[0] }, { status: 502 });
  }

  // Validate category against whitelist (modelo a veces inventa)
  if (!CATEGORY_VALUES.includes(parsed.category)) {
    return NextResponse.json(
      { category: "other", confidence: "low", reasoning: "Categoría no reconocida; fallback a 'other'." },
      { status: 200 }
    );
  }

  return NextResponse.json({
    category: parsed.category,
    confidence: parsed.confidence || "medium",
    reasoning: parsed.reasoning,
  }, { status: 200 });
}
