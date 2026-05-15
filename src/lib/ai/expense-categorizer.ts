"use client";

// ─── Expense LLM categorizer (client wrapper) ───
//
// Llama a `/api/categorize-expense` con la API key del user en headers.
// Si NO hay key BYOK configurada, intenta el proxy Tampu (`/api/ai-proxy`)
// que usa la key server-side (sujeto a rate-limit). Si ambos fallan,
// devuelve null (la UI cae al select manual). El endpoint server-side
// valida la categoría contra BUDGET_CATEGORIES, así que el caller puede
// confiar en el return.

import { getUserApiKey, detectProvider } from "@/lib/ai/user-key";
import { extractJson } from "@/lib/ai/json-extractor";

export interface ExpenseInput {
  description: string;
  amount?: number;
  currency?: string;
  date?: string;
  destination?: string;
}

export interface CategorizationResult {
  category: string;
  confidence: "high" | "medium" | "low";
  reasoning?: string;
}

// Prompt mínimo para el proxy fallback — el endpoint server-side
// /api/categorize-expense tiene el prompt completo + validation. Acá
// duplicamos lo justo para que el proxy (genérico) sepa qué pedirle al LLM.
const PROXY_SYSTEM_HINT =
  `Sos un clasificador de gastos de viaje. Devolvé EXCLUSIVAMENTE JSON ` +
  `con shape {"category":"<value>","confidence":"high|medium|low","reasoning":"<frase>"}. ` +
  `No uses fences markdown. No agregues texto antes ni después.`;

function buildUserMessage(input: ExpenseInput): string {
  return [
    `Gasto: "${input.description.trim()}"`,
    input.amount ? `Monto: ${input.amount} ${input.currency || "USD"}` : null,
    input.date ? `Fecha: ${input.date}` : null,
    input.destination ? `Destino: ${input.destination}` : null,
  ].filter(Boolean).join("\n");
}

/**
 * Clasifica una descripción de gasto en una BUDGET_CATEGORY. Devuelve null
 * si todos los paths (BYOK + proxy Tampu) fallan — el caller debe tener
 * fallback a manual select.
 */
export async function categorizeExpense(
  input: ExpenseInput,
  signal?: AbortSignal
): Promise<CategorizationResult | null> {
  const key = getUserApiKey();

  // ─── Path 1: BYOK ───
  if (key) {
    const provider = detectProvider(key);
    if (provider === "anthropic" || provider === "gemini") {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (provider === "anthropic") headers["x-anthropic-key"] = key;
      else headers["x-gemini-key"] = key;
      try {
        const res = await fetch("/api/categorize-expense", {
          method: "POST",
          headers,
          signal,
          body: JSON.stringify(input),
        });
        if (res.ok) {
          const data = await res.json() as CategorizationResult | { error: string };
          if (!("error" in data)) return data;
        }
        // BYOK falló (key inválida, rate-limit del provider, etc) → caemos
        // al proxy abajo en vez de devolver null directo.
      } catch {
        // network error con BYOK → seguimos al proxy.
      }
    }
  }

  // ─── Path 2: Proxy Tampu (key server-side) ───
  // El proxy usa la key global de Tampu y aplica rate-limit. Si está
  // disabled (TAMPU_ANTHROPIC_KEY no seteada) o el user pasó la cuota
  // diaria/mensual, el endpoint devuelve 503/429.
  try {
    const proxyRes = await fetch("/api/ai-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        system: PROXY_SYSTEM_HINT,
        userMessage: buildUserMessage(input),
        maxTokens: 200,
        timeoutMs: 10_000,
      }),
    });
    if (!proxyRes.ok) return null;
    const proxyData = await proxyRes.json() as { text?: string } | { error: string };
    if ("error" in proxyData) return null;
    if (!proxyData.text) return null;
    // El proxy devuelve `text` crudo del LLM — extraemos el JSON con la
    // misma rutina compartida que usa el endpoint server-side.
    const parsed = extractJson<CategorizationResult>(proxyData.text);
    if (!parsed || !parsed.category) return null;
    return parsed;
  } catch {
    return null;
  }
}
