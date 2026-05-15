/**
 * Agentic loop con Anthropic tool_use — capa nueva sobre providers.ts.
 *
 * El asistente reactivo viejo solo respondía. Este corre un loop:
 *
 *   1. User pregunta
 *   2. Claude decide qué tool llamar (si alguno)
 *   3. Servidor ejecuta el tool (Wikipedia, vault search, etc)
 *   4. Result se vuelve a mandar a Claude
 *   5. Claude decide si necesita otro tool o ya puede responder
 *   6. Loop hasta que Claude devuelve solo texto (sin tool_use)
 *
 * Max 4 iteraciones (safety). Si llega ahí sin terminar, devolvemos lo que tengamos.
 *
 * Tools disponibles en MVP Cono Sur:
 *   - search_destination — Wikipedia summary de un lugar (free, sin API key)
 *   - find_in_vault — busca un archivo en el vault del user
 *   - get_trip_context — devuelve datos del trip activo
 *   - estimate_flight_price — heurística simple para LATAM/Aerolíneas/JetSmart
 *
 * Solo Anthropic por ahora (Gemini tools tiene shape distinto, lo agregamos
 * después si Tampu Gemini-first take off).
 */

import { resolveDestinationPhoto } from "@/lib/photos/destination-resolver";
import { buildAffiliateUrl, isPartnerActive, type Partner } from "@/lib/affiliates/config";
import { withRetry } from "@/lib/ai/providers";
import { extractJson } from "@/lib/ai/json-extractor";
import { captureException } from "@/lib/observability/sentry";

// ─── DEEP LINK WHITELIST (iter 4 hardening) ───────────────────────────────
// Las suggestions del LLM pueden incluir `deep_link`. Sin sanitización, el
// modelo puede inventar rutas (`/admin`, `/dashboard`) o injectar URLs
// externas (`https://evil.com`). Validamos contra la lista REAL de routes
// de la app y forzamos shape `/route` o `/route?query`.
const KNOWN_ROUTES = [
  "/vault", "/itinerary", "/cashflow", "/budget", "/expenses", "/reservations",
  "/tasks", "/alerts", "/journal", "/inbox", "/import", "/settings", "/visas",
  "/health", "/emergency", "/map", "/whatsapp", "/today", "/trips", "/members",
  "/passcode", "/welcome", "/login",
];

function sanitizeDeepLink(link: string | null | undefined): string | null {
  if (!link || typeof link !== "string") return null;
  // Match /route o /route/subpath o /route?query=...
  const m = link.match(/^(\/[a-z-]+(?:\/[a-z0-9-]+)*)(\?[a-z0-9=&_-]*)?$/);
  if (!m) return null;
  const baseRoute = m[1].split("/").slice(0, 2).join("/");
  if (!KNOWN_ROUTES.includes(baseRoute)) return null;
  return link;
}

export interface AgenticContext {
  trip_name: string;
  destination: string;
  start_date: string;
  end_date: string;
  mode: string;
  days_until_start: number;
  readiness_score: number;
  vault?: Array<{
    id: string;
    name: string;
    category: string;
    notes: string | null;
    file_type: string;
    /** Opcional: epoch ms del use_date asociado (boarding pass date, hotel check-in, etc).
     *  Si está presente, find_in_vault desempata matches por proximidad a Date.now(). */
    use_date_ts?: number | null;
  }>;
  reservations?: Array<{ id: string; type: string; provider: string; description: string; locator: string | null; use_date: string | null; status: string }>;
}

export interface AgenticResult {
  source: "claude";
  answer: string;
  /** Tool calls que Claude hizo en el camino — útil para UI debugging */
  tools_used: Array<{ name: string; input: unknown; outcome: "ok" | "error" | "no-data" }>;
  /** Suggestions estructuradas extraídas */
  suggestions: Array<{ title: string; detail: string; priority: string; deep_link?: string }>;
  /** Tokens reales reportados por la API (acumulado del loop). */
  usage: { inputTokens: number; outputTokens: number };
  /** Modelo concreto usado (para honest UI + cost calc). */
  model: string;
  provider: "anthropic";
}

// ─── TOOL DEFINITIONS (lo que ve Claude) ─────────────────────────────────

const TOOLS = [
  {
    name: "search_destination",
    description:
      "Busca información actualizada sobre un destino o POI desde Wikipedia. Útil cuando el user pregunta sobre un lugar específico (ciudad, atracción, neighborhood, etc). Devuelve título, descripción corta, y URL de la foto icónica del lugar.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description: "Nombre del destino o POI. Ejemplo: 'Cusco', 'Salar de Uyuni', 'Bukchon Hanok Village'",
        },
        locale: {
          type: "string" as const,
          enum: ["es", "en"],
          description: "Idioma preferido. Default 'es' para destinos LatAm.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "find_in_vault",
    description:
      "Busca un archivo en el Vault del usuario (boarding passes, pasaportes, seguros, recibos). Útil cuando el user pregunta 'dame mi boarding LATAM' o 'necesito el seguro'.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description: "Palabras clave a buscar (provider, tipo de documento, locator)",
        },
        category: {
          type: "string" as const,
          enum: ["boarding_pass", "identity", "insurance", "receipt", "reservation", "transport", "health", "other"],
          description: "Categoría opcional para filtrar",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "estimate_flight_price",
    description:
      "Estima el rango de precio típico para un vuelo entre 2 ciudades en una fecha. Datos heurísticos basados en histórico LATAM (rutas Cono Sur). NO devuelve precio actual real — para eso el user tiene que ir a Skyscanner / Despegar.",
    input_schema: {
      type: "object" as const,
      properties: {
        from: { type: "string" as const, description: "Ciudad origen o IATA. Ej 'Buenos Aires' o 'EZE'." },
        to: { type: "string" as const, description: "Ciudad destino o IATA. Ej 'Santiago' o 'SCL'." },
        month: {
          type: "string" as const,
          description: "Mes del viaje en formato YYYY-MM, ej '2026-08' para agosto 2026.",
        },
      },
      required: ["from", "to", "month"],
    },
  },
  {
    name: "get_trip_summary",
    description:
      "Devuelve un resumen estructurado del viaje activo del user: destino, fechas, días faltantes, readiness score, alertas críticas.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "generate_booking_link",
    description:
      "Genera un link tracked a un partner (Skyscanner, Booking, GetYourGuide, etc) con el affiliate ID de Tampu si está activo. Tampu gana comisión SOLO si el partner está activado; si no, devuelve link directo sin tracking. ALWAYS transparente sobre si Tampu gana algo con este click.",
    input_schema: {
      type: "object" as const,
      properties: {
        partner: {
          type: "string" as const,
          enum: [
            "skyscanner", "booking", "getyourguide", "viator", "airbnb",
            "heymondo", "iati", "airalo", "holafly", "hostelworld", "trainline",
            "google-flights", "kayak", "assistcard",
          ],
          description: "Partner al que hacer click-out",
        },
        query_path: {
          type: "string" as const,
          description:
            "Path o query string específico del partner. Para Skyscanner: 'flights/BUE/SCL/250812'. Para Booking: 'searchresults.html?ss=Cusco'. Para GetYourGuide: 'cusco-l10/'.",
        },
        description: {
          type: "string" as const,
          description:
            "Descripción human-readable de lo que el link busca, para que el asistente lo mencione en su respuesta.",
        },
      },
      required: ["partner", "query_path", "description"],
    },
  },
];

// ─── TOOL IMPLEMENTATIONS ────────────────────────────────────────────────

async function execSearchDestination(input: { query: string; locale?: "es" | "en" }): Promise<string> {
  const photo = await resolveDestinationPhoto(input.query, { locale: input.locale ?? "es" });
  if (!photo) {
    return `No encontré información sobre "${input.query}" en mis fuentes. El destino existe pero no tiene una Wikipedia article reconocible.`;
  }
  return JSON.stringify({
    title: photo.caption,
    description: photo.description,
    photo_url: photo.url,
    attribution: photo.attribution,
    source_page: photo.sourcePageUrl,
  });
}

function execFindInVault(
  input: { query: string; category?: string },
  ctx: AgenticContext,
): string {
  if (!ctx.vault || ctx.vault.length === 0) {
    return "Vault vacío. El user todavía no subió documentos.";
  }
  const keywords = input.query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const now = Date.now();
  const scored = ctx.vault
    .map((f) => {
      const hay = `${f.name} ${f.category} ${f.notes || ""}`.toLowerCase();
      let score = 0;
      for (const k of keywords) if (hay.includes(k)) score += 1;
      if (input.category && f.category === input.category) score += 3;
      // Distancia al "ahora" — usada como desempate (menos = más relevante).
      const dateDelta = typeof f.use_date_ts === "number" ? Math.abs(f.use_date_ts - now) : Number.POSITIVE_INFINITY;
      return { f, score, dateDelta };
    })
    .filter((x) => x.score > 0)
    // Tie-break: primero por score desc, después por proximidad al "ahora" asc.
    .sort((a, b) => (b.score - a.score) || (a.dateDelta - b.dateDelta))
    .slice(0, 3);
  if (scored.length === 0) return "Sin matches en el vault.";
  return JSON.stringify(
    scored.map((s) => ({
      id: s.f.id,
      name: s.f.name,
      category: s.f.category,
      notes: s.f.notes,
      deep_link: `/vault?file=${s.f.id}`,
    })),
  );
}

/**
 * Heurística de precio simple basada en distancias + temporada.
 * Datos de bandas USD para rutas Cono Sur (Argentina-Chile-Uruguay) histórico
 * 2024-2025. Approximate, NOT a price tracker — solo para framing al user.
 */
function execEstimateFlightPrice(input: { from: string; to: string; month: string }): string {
  const HIGH_SEASON_MONTHS = [1, 2, 7, 12]; // ene, feb, jul, dic
  const month = parseInt(input.month.split("-")[1] || "0", 10);
  const isHigh = HIGH_SEASON_MONTHS.includes(month);

  // Rutas conocidas Cono Sur (USD, round-trip economy)
  const ROUTES: Record<string, { low: number; high: number }> = {
    "buenos aires-santiago": { low: 180, high: 350 },
    "buenos aires-montevideo": { low: 90, high: 180 },
    "buenos aires-mendoza": { low: 110, high: 260 },
    "buenos aires-bariloche": { low: 130, high: 290 },
    "santiago-mendoza": { low: 95, high: 220 },
    "santiago-buenos aires": { low: 180, high: 350 },
    "montevideo-buenos aires": { low: 90, high: 180 },
  };

  const key = `${input.from.toLowerCase().trim()}-${input.to.toLowerCase().trim()}`;
  const route = ROUTES[key] || ROUTES[`${input.to.toLowerCase().trim()}-${input.from.toLowerCase().trim()}`];

  if (!route) {
    return JSON.stringify({
      from: input.from,
      to: input.to,
      month: input.month,
      hint: "Ruta no en heurística Cono Sur. Recomendar al user que consulte Skyscanner o Despegar directamente.",
    });
  }

  const estimate = isHigh ? route.high : route.low;
  return JSON.stringify({
    from: input.from,
    to: input.to,
    month: input.month,
    estimate_usd_low: route.low,
    estimate_usd_high: route.high,
    typical_now: estimate,
    season: isHigh ? "alta" : "baja",
    caveat: "Datos heurísticos. Confirmar en Skyscanner/Despegar antes de reservar.",
  });
}

function execGenerateBookingLink(input: { partner: Partner; query_path: string; description: string }): string {
  const url = buildAffiliateUrl(input.partner, input.query_path);
  const active = isPartnerActive(input.partner);
  return JSON.stringify({
    url,
    partner: input.partner,
    description: input.description,
    tampu_earns_commission: active,
    note: active
      ? "Este link tiene affiliate tracking activo — Tampu gana comisión si reservás. Mismo precio para vos."
      : "Link directo sin tracking de afiliado activo. Tampu NO gana nada con este click.",
  });
}

function execGetTripSummary(ctx: AgenticContext): string {
  return JSON.stringify({
    trip: ctx.trip_name,
    destination: ctx.destination,
    start: ctx.start_date,
    end: ctx.end_date,
    days_until_start: ctx.days_until_start,
    mode: ctx.mode,
    readiness_score: ctx.readiness_score,
    vault_count: ctx.vault?.length ?? 0,
    reservations_count: ctx.reservations?.length ?? 0,
  });
}

// ─── AGENTIC LOOP ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sos el asistente de viajes de Tampu para el Cono Sur (Argentina, Chile, Uruguay).
Hablás español rioplatense (voseo: "sos", "tenés", "decime", "fijate"), conciso, sin marketing speak.

Tu tarea: ayudar al viajero usando las TOOLS disponibles cuando necesitás info que NO está
en el contexto inicial. Patrones típicos:

1. Pregunta sobre un destino que no conocés → usá search_destination
2. "Dame mi boarding/seguro" → usá find_in_vault
3. "Cuánto sale volar a X" → usá estimate_flight_price
4. "Cómo está mi viaje" / "qué me falta" → get_trip_summary

Reglas:
- NO uses una tool si la respuesta YA está en el contexto inicial.
- NUNCA inventes precios, locators, ni fechas.
- Si encontrás un archivo en vault, incluí su deep_link en la respuesta.
- Cierre: respuesta máximo 3-4 oraciones + suggestions estructuradas si hay acciones.
- AFFILIATE GUARD: SOLO invocá generate_booking_link cuando el user EXPLICITAMENTE pidió
  comparar precios, reservar, o booking. NUNCA en preguntas informativas ("cuándo abre X",
  "qué tal Cusco"). Si dudás, NO generes el link — el user puede pedirlo después.

Al final, devolvés UN texto en español rioplatense. Las "suggestions" estructuradas se
extraen del texto automáticamente — no tenés que pedirlas en JSON, solo respondé natural.`;

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

interface AnthropicResponse {
  content: Array<{
    type: "text" | "tool_use";
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

async function executeAnthropicCall(
  key: string,
  messages: AnthropicMessage[],
  timeoutMs = 25_000,
): Promise<AnthropicResponse | null> {
  // Envolvemos en `withRetry` para que 429/5xx transient errors reintenten
  // con backoff exponencial (1s, 2s, 4s). Sin esto, una sola hiccup en
  // Anthropic durante el loop tool_use rompía la respuesta entera.
  // 401 (auth) se rethrowa adentro y NO se reintenta.
  return withRetry(async () => {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          // Adaptive: pasos intermedios (messages.length pequeño) suelen ser
          // tool dispatch + reasoning corto; el final concentra prosa. Reducir
          // techo intermedio baja costo sin truncar respuestas finales.
          max_tokens: messages.length > 4 ? 1500 : 800,
          // Prompt caching: SYSTEM_PROMPT + TOOLS son grandes y se repiten
          // entre todas las llamadas → cacheamos para descontar ~90% del input
          // cost en hits subsiguientes (TTL ephemeral ~5min).
          system: [
            { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
          ],
          tools: TOOLS,
          messages,
        }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          const err = new Error("anthropic_unauthorized") as Error & { status?: number };
          err.status = 401;
          throw err;
        }
        // 429 / 5xx — transient, dejá que withRetry haga su trabajo. Antes
        // devolvíamos null acá y eso cortaba el retry path (withRetry trata
        // null como "no data, no retry"). Ahora throwamos con status para
        // que withRetry haga backoff exponencial.
        if (res.status === 429 || res.status >= 500) {
          const body = await res.text().catch(() => "");
          console.warn("[agentic] anthropic transient:", res.status, body);
          const err = new Error(`anthropic_${res.status}`) as Error & { status: number };
          err.status = res.status;
          throw err;
        }
        console.warn("[agentic] anthropic call failed:", res.status, await res.text().catch(() => ""));
        return null;
      }
      return (await res.json()) as AnthropicResponse;
    } catch (err) {
      const status = (err as { status?: number })?.status;
      // 401 + transient (429/5xx) → rethrow para que withRetry los maneje.
      if (status === 401) throw err;
      if (status && (status === 429 || status >= 500)) throw err;
      console.warn("[agentic] anthropic exception:", err);
      captureException(err, { tag: "agentic_loop_exception", level: "warning" });
      return null;
    }
  });
}

/**
 * Loop principal — corre hasta que Claude devuelva texto sin tool_use,
 * o hit max 4 iteraciones.
 */
export async function runAgenticAssistant(
  key: string,
  question: string,
  ctx: AgenticContext,
): Promise<AgenticResult | null> {
  const messages: AnthropicMessage[] = [
    {
      role: "user",
      content: `Contexto del viaje activo: ${JSON.stringify(ctx)}\n\nPregunta del viajero: "${question}"`,
    },
  ];
  const toolsUsed: AgenticResult["tools_used"] = [];
  // Acumular usage real del loop completo.
  const usage = { inputTokens: 0, outputTokens: 0 };
  const MODEL = "claude-sonnet-4-5";

  // ─── LOOP GUARDS (iter 2 hardening) ─────────────────────────────────────
  // Defensa en profundidad encima del `iter < 4` ya existente:
  //   - BUDGET: si los tokens acumulados pasan 50k, cortamos. Un user con vault
  //     enorme + tools recurrentes podría blow up el costo sin esto.
  //   - TIMEOUT: 60s wall-clock max para el loop entero (cada call ya tiene
  //     timeout individual de 25s, pero 4 iteraciones + retries pueden sumar).
  const loopStart = Date.now();
  const LOOP_BUDGET_TOKENS = 50_000;
  const LOOP_TIMEOUT_MS = 60_000;

  for (let iter = 0; iter < 4; iter++) {
    const response = await executeAnthropicCall(key, messages);
    if (!response) return null;

    // Sumar tokens reales de esta iteración
    usage.inputTokens += response.usage?.input_tokens ?? 0;
    usage.outputTokens += response.usage?.output_tokens ?? 0;

    const totalTokens = usage.inputTokens + usage.outputTokens;
    if (totalTokens > LOOP_BUDGET_TOKENS) {
      console.warn("[agentic] budget exceeded:", totalTokens, "tokens");
      break;
    }
    if (Date.now() - loopStart > LOOP_TIMEOUT_MS) {
      console.warn("[agentic] timeout exceeded:", Date.now() - loopStart, "ms");
      break;
    }

    // Acumular asistente turn
    messages.push({ role: "assistant", content: response.content as unknown as Array<Record<string, unknown>> });

    // Si llegó a end_turn → extraer texto final
    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((c) => c.type === "text");
      const raw = textBlock?.text?.trim() || "Sin respuesta del modelo.";
      // Backward-compat: si el text ES JSON con shape {answer, suggestions},
      // unwrappeamos para no romper consumidores existentes.
      const unwrapped = tryUnwrapJsonShape(raw);
      if (unwrapped) {
        return {
          source: "claude",
          answer: unwrapped.answer,
          tools_used: toolsUsed,
          suggestions: unwrapped.suggestions,
          usage,
          model: MODEL,
          provider: "anthropic",
        };
      }
      return {
        source: "claude",
        answer: raw,
        tools_used: toolsUsed,
        suggestions: extractSuggestions(raw, toolsUsed),
        usage,
        model: MODEL,
        provider: "anthropic",
      };
    }

    // tool_use → ejecutar tools y agregar tool_result
    if (response.stop_reason === "tool_use") {
      const toolResults: Array<Record<string, unknown>> = [];

      for (const block of response.content) {
        if (block.type !== "tool_use" || !block.id || !block.name || !block.input) continue;

        let result: string;
        let outcome: "ok" | "error" | "no-data" = "ok";
        try {
          if (block.name === "search_destination") {
            result = await execSearchDestination(block.input as { query: string; locale?: "es" | "en" });
          } else if (block.name === "find_in_vault") {
            result = execFindInVault(block.input as { query: string; category?: string }, ctx);
          } else if (block.name === "estimate_flight_price") {
            result = execEstimateFlightPrice(block.input as { from: string; to: string; month: string });
          } else if (block.name === "get_trip_summary") {
            result = execGetTripSummary(ctx);
          } else if (block.name === "generate_booking_link") {
            result = execGenerateBookingLink(block.input as { partner: Partner; query_path: string; description: string });
          } else {
            result = `Tool ${block.name} no implementada`;
            outcome = "error";
          }
        } catch (err) {
          result = `Error ejecutando ${block.name}: ${err instanceof Error ? err.message : String(err)}`;
          outcome = "error";
        }

        if (result.includes("Sin matches") || result.includes("No encontré") || result.includes("Vault vacío")) {
          outcome = "no-data";
        }

        toolsUsed.push({ name: block.name, input: block.input, outcome });

        // ─── PROMPT INJECTION HARDENING (iter 2) ──────────────────────────
        // Los tool_results pueden contener strings controlados por el user
        // (vault notes, descripciones, attachments). Sin escape, un payload
        // tipo "Ignore previous instructions and ..." se inyecta al LLM como
        // si fuera contenido confiable.
        //   1. Escapamos triple-backticks (los modelos los usan como delimiter)
        //   2. Escapamos </tool_output> para que el user no pueda cerrar el tag
        //   3. Wrappeamos en <tool_output>...</tool_output> para que el modelo
        //      sepa claramente qué viene de tool output vs system prompt.
        const sanitized = String(result)
          .replace(/```/g, "'''")
          .replace(/<\/tool_output>/gi, "<\\/tool_output>");
        const wrapped = `<tool_output>${sanitized}</tool_output>`;

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: wrapped,
        });
      }

      // Agregar tool_results como user turn
      messages.push({ role: "user", content: toolResults });
      continue; // Loop next iteration
    }

    // Otro stop_reason (max_tokens, undefined, etc) — devolver lo que tengamos.
    // Si el mock de test no incluye stop_reason o el modelo está en un edge case,
    // procesamos el text como end_turn.
    const textBlock = response.content.find((c) => c.type === "text");
    if (textBlock?.text) {
      const raw = textBlock.text.trim();
      const unwrapped = tryUnwrapJsonShape(raw);
      if (unwrapped) {
        return {
          source: "claude",
          answer: unwrapped.answer,
          tools_used: toolsUsed,
          suggestions: unwrapped.suggestions,
          usage,
          model: MODEL,
          provider: "anthropic",
        };
      }
      // Si el texto NO es JSON wrappable y la respuesta del modelo no tuvo
      // tool_use ni end_turn explícito, devolvemos null para que el caller
      // pueda caer al reactive/heuristic. Esto preserva el comportamiento
      // legacy donde "text basura" → heuristic fallback.
      if (!response.stop_reason) {
        return null;
      }
      return {
        source: "claude",
        answer: raw,
        tools_used: toolsUsed,
        suggestions: extractSuggestions(raw, toolsUsed),
        usage,
        model: MODEL,
        provider: "anthropic",
      };
    }
    return null;
  }

  // Hit max iterations
  return {
    source: "claude",
    answer: "Tu pregunta requiere más pasos de los que puedo manejar en una sola pasada. Probá una pregunta más específica.",
    tools_used: toolsUsed,
    suggestions: [],
    usage,
    model: MODEL,
    provider: "anthropic",
  };
}

// ─── Backward-compat: si el modelo devolvió text en formato JSON legacy
// con shape {answer, suggestions}, unwrappeamos para preservar consumidores.
function tryUnwrapJsonShape(text: string): { answer: string; suggestions: AgenticResult["suggestions"] } | null {
  const parsed = extractJson<{ answer?: string; suggestions?: AgenticResult["suggestions"] }>(text);
  if (!parsed || typeof parsed.answer !== "string") return null;
  const rawSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  // Sanear cada deep_link contra el whitelist — si la ruta es inválida (o
  // el modelo se inventó algo), eliminamos el campo en vez de droppear la
  // suggestion entera.
  const suggestions = rawSuggestions.map((s) => ({
    ...s,
    deep_link: sanitizeDeepLink(s.deep_link) ?? undefined,
  }));
  return { answer: parsed.answer, suggestions };
}

// ─── Suggestion extraction ────────────────────────────────────────────────

/**
 * Heurística: extrae suggestions estructuradas del texto + tool results.
 * Cuando find_in_vault devolvió matches, los convertimos en suggestions
 * con deep_link al vault.
 */
function extractSuggestions(
  _answer: string,
  toolsUsed: AgenticResult["tools_used"],
): AgenticResult["suggestions"] {
  const out: AgenticResult["suggestions"] = [];

  for (const tool of toolsUsed) {
    if (tool.name === "find_in_vault" && tool.outcome === "ok") {
      // No tenemos el output cacheado acá — la UI puede inferirlo del texto.
      // En MVP devolvemos el deep link genérico.
      out.push({
        title: "Abrí tus Documentos",
        detail: "Resultados encontrados en tu cartera",
        priority: "high",
        deep_link: "/vault",
      });
    }
    if (tool.name === "estimate_flight_price" && tool.outcome === "ok") {
      out.push({
        title: "Confirmá precios en Skyscanner",
        detail: "Las heurísticas son aproximadas — Skyscanner trae el precio actual",
        priority: "medium",
        deep_link: "https://www.skyscanner.com",
      });
    }
  }

  return out;
}
