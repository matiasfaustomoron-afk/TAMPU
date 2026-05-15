import { NextRequest, NextResponse } from "next/server";
import { selectProvider, callLLMRich } from "@/lib/ai/providers";
import { runAgenticAssistant, type AgenticContext } from "@/lib/ai/agentic";
import { recordProxyCall, estimateCostUsd } from "@/lib/ai/rate-limit";
import { captureException } from "@/lib/observability/sentry";
import { getProxyIdentifier } from "@/lib/ai/proxy-identifier";
import { extractJson } from "@/lib/ai/json-extractor";

// `getProxyIdentifier` ahora vive en `src/lib/ai/proxy-identifier.ts` y es
// compartido entre todos los endpoints AI (categorize-expense, parse-booking,
// parse-email-confirmation, generate-itinerary, classify-document, email-in,
// airport-info, assistant). El sufijo distingue endpoint en el bucket; el
// `user.id` distingue request por usuario.

// ─── SECURITY (sprint 05/2026) ──────────────────────────────────────────
// Hard cap server-side. El cliente NO puede pedir más.
const MAX_TOKENS_HARD = 1024;

// CORS: allow same-origin (web) + Capacitor (native iOS/Android).
// In production we ALSO whitelist app:// and capacitor://localhost.
const ALLOWED_ORIGINS = ["capacitor://localhost", "ionic://localhost", "http://localhost"];

function withCors(res: NextResponse, origin: string | null): NextResponse {
  const ok = !origin || ALLOWED_ORIGINS.includes(origin) || origin.startsWith("http://localhost") || origin.endsWith(".vercel.app");
  if (ok && origin) res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, x-anthropic-key, x-gemini-key, x-device-fingerprint");
  res.headers.set("Vary", "Origin");
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return withCors(new NextResponse(null, { status: 204 }), req.headers.get("origin"));
}

// ─── Claude API endpoint for trip assistance ───
// Set ANTHROPIC_API_KEY in .env.local. Falls back to a rule-based heuristic if not set.

interface AssistantContext {
  trip_name: string;
  destination: string;
  start_date: string;
  end_date: string;
  mode: string;
  days_until_start: number;
  readiness_score: number;
  open_critical_tasks: { title: string; due_date: string | null; next_action: string | null }[];
  pending_critical_reservations: { description: string; provider: string; payment_deadline: string | null }[];
  uncovered_nights: number;
  budget_used_pct: number;
  forecast_status: string;
  upcoming_payments: { title: string; days_until: number; amount: number; currency: string }[];
  open_alerts: { title: string; severity: string }[];
  // ─── Iter.8: vault + location + airport knowledge ───
  vault?: { id: string; name: string; category: string; notes: string | null; file_type: string }[];
  reservations?: { id: string; type: string; provider: string; description: string; locator: string | null; use_date: string | null; status: string }[];
  current_location?: { lat: number; lng: number; nearest_airport?: { iata: string; name: string; distance_km: number } } | null;
  airports_in_trip?: { iata: string; name: string; city: string; terminals: { id: string; airlines: string[] }[]; food: { name: string; note: string }[]; currency_exchange: { name: string; note: string }[]; transport_to_city: { mode: string; cost_usd: string; duration_min: number; note: string }[]; tips: string[] }[];
}

interface AssistantRequest {
  question: string;
  context: AssistantContext;
}

interface Suggestion {
  title: string;
  detail: string;
  priority: "critical" | "high" | "medium" | "low";
  deep_link?: string;
}

interface AssistantResponse {
  source: "claude" | "heuristic";
  answer: string;
  suggestions: Suggestion[];
}

const SYSTEM_PROMPT = `Sos un asistente argentino experto en logística de viajes complejos. Recibís:
- Estado del viaje (fechas, readiness, tareas críticas, reservas, alertas, pagos)
- VAULT: lista de archivos del usuario (boarding passes, pasaporte, seguro, recibos)
- RESERVATIONS: reservas con locator + provider + fecha (para matchear con vault)
- CURRENT_LOCATION: GPS actual + aeropuerto más cercano (si está habilitado)
- AIRPORTS_IN_TRIP: info de cada aeropuerto del viaje (terminales, food, currency, transport, tips)

Tu tarea: responder UNA pregunta del viajero. Tipos típicos:

A) ACCIÓN URGENTE: "qué tengo que hacer ya", "qué me falta"
   → Listá lo crítico, ordenado por urgencia.

B) BUSCAR EN EL VAULT: "dame mi boarding Emirates", "necesito el seguro"
   → Buscá en vault[] por nombre/provider/notes. Devolvé sugerencia con deep_link "/vault?file={id}".
   → Si encontrás varios, devolvé el más relevante según fecha/contexto.
   → Si no hay match, decilo claro y sugerí cargar el archivo.

C) AEROPUERTO / LOGÍSTICA: "qué terminal sale Emirates", "dónde como en MNL", "dónde cambio plata", "cómo llego al centro"
   → Usá AIRPORTS_IN_TRIP. Si hay CURRENT_LOCATION cerca de un aeropuerto, ese tiene prioridad.
   → Devolvé datos concretos: terminal, nombre del lugar, cuánto cuesta, cuántos minutos.

D) STATUS GENERAL: "estoy bien de plata", "está todo listo"
   → Usá readiness, budget, alertas.

Formato de salida ESTRICTAMENTE JSON (sin markdown):
{
  "answer": "respuesta directa máx 3 oraciones, en español rioplatense",
  "suggestions": [
    { "title": "...", "detail": "...", "priority": "critical|high|medium|low", "deep_link": "/route|/vault?file=ID|null" }
  ]
}

Reglas:
- Sé conciso. No repitas contexto ya conocido.
- Si la pregunta pide un archivo, el primer suggestion DEBE tener deep_link "/vault?file={ID}".
- Si la pregunta es sobre un aeropuerto y no hay info, decilo: "No tengo info de XXX cargada".
- NUNCA inventes locators o fechas.`;

function buildHeuristic(ctx: AssistantContext, question = ""): AssistantResponse {
  const q = question.toLowerCase();
  const sug: Suggestion[] = [];

  // ─── B) Vault search ───
  // "dame mi boarding Emirates", "necesito el pasaporte", "buscame el seguro"
  if (/(dame|busca|encontra|necesito|donde está|donde esta|mostrame)/i.test(q) && ctx.vault?.length) {
    const keywords = q.split(/\s+/).filter(w => w.length > 3);
    const scored = ctx.vault.map(f => {
      const hay = `${f.name} ${f.category} ${f.notes || ""}`.toLowerCase();
      let score = 0;
      for (const k of keywords) if (hay.includes(k)) score += 1;
      // Bonus for matching category keyword
      if (/boarding|embarq|board/.test(q) && f.category === "boarding_pass") score += 3;
      if (/pasaport|passport/.test(q) && f.category === "identity") score += 3;
      if (/seguro|insur/.test(q) && f.category === "insurance") score += 3;
      if (/recib|receipt|factur/.test(q) && f.category === "receipt") score += 2;
      return { f, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      const top = scored.slice(0, 3);
      return {
        source: "heuristic",
        answer: `Encontré ${top.length} archivo${top.length > 1 ? "s" : ""} en tus Documentos. Abrí el primero o probá los otros.`,
        suggestions: top.map(s => ({
          title: s.f.name,
          detail: `${s.f.category}${s.f.notes ? ` · ${s.f.notes}` : ""}`,
          priority: "high",
          deep_link: `/vault?file=${s.f.id}`,
        })),
      };
    }
    if (keywords.length > 0) {
      return {
        source: "heuristic",
        answer: `No encontré nada en tus Documentos con esas palabras. Si todavía no lo subiste, andá a /vault y subí el archivo.`,
        suggestions: [{ title: "Subir a Documentos", detail: "Boarding, pasaporte, seguro, recibos", priority: "medium", deep_link: "/vault" }],
      };
    }
  }

  // ─── C) Airport / logistics ───
  if ((ctx.airports_in_trip?.length || 0) > 0) {
    // Detect IATA codes mentioned in the question (uppercase 3-letter)
    const iataInQ: string[] = question.toUpperCase().match(/\b([A-Z]{3})\b/g) || [];
    // Try to find which airport the user is asking about — by IATA, by city name (case-insensitive)
    let ap = ctx.airports_in_trip!.find(a => iataInQ.includes(a.iata)) ||
             ctx.airports_in_trip!.find(a => q.includes(a.city.toLowerCase())) ||
             (ctx.current_location?.nearest_airport && ctx.airports_in_trip!.find(a => a.iata === ctx.current_location!.nearest_airport!.iata));
    // Last resort: if only one airport is in context, use it
    if (!ap && ctx.airports_in_trip!.length === 1) ap = ctx.airports_in_trip![0];

    if (ap) {
      if (/terminal|embarq|gate|check[- ]?in/.test(q)) {
        return {
          source: "heuristic",
          answer: `${ap.iata} tiene ${ap.terminals.length} terminales. Tu aerolínea dice cuál usar — chequeá el boarding.`,
          suggestions: ap.terminals.map(t => ({
            title: `Terminal ${t.id}`,
            detail: t.airlines.join(", "),
            priority: "high" as const,
            deep_link: `/vault?category=boarding_pass`,
          })),
        };
      }
      if (/com(er|ida)|food|eat|hambre|restaurant/.test(q)) {
        return {
          source: "heuristic",
          answer: `Opciones de comida en ${ap.iata}:`,
          suggestions: ap.food.slice(0, 5).map(f => ({
            title: f.name, detail: f.note, priority: "low" as const,
          })),
        };
      }
      if (/cambi(o|ar)|dinero|cash|currency|moneda|atm/.test(q)) {
        return {
          source: "heuristic",
          answer: `Cambio de moneda en ${ap.iata}:`,
          suggestions: ap.currency_exchange.slice(0, 5).map(c => ({
            title: c.name, detail: c.note, priority: "low" as const,
          })),
        };
      }
      if (/llegar|centro|city|metro|taxi|uber|transport/.test(q)) {
        return {
          source: "heuristic",
          answer: `Cómo llegar de ${ap.iata} a ${ap.city}:`,
          suggestions: ap.transport_to_city.slice(0, 5).map(t => ({
            title: `${t.mode} · ${t.cost_usd}`,
            detail: `${t.duration_min} min · ${t.note}`,
            priority: "low" as const,
          })),
        };
      }
      // Generic: pregunta sobre un aeropuerto pero no entendimos la intención puntual.
      // Devolvemos tips + breve overview.
      if (ap.tips.length > 0 || ap.terminals.length > 0) {
        return {
          source: "heuristic",
          answer: `${ap.iata} — ${ap.name}, ${ap.city}. Te dejo lo más útil:`,
          suggestions: [
            ...ap.terminals.slice(0, 1).map(() => ({
              title: `Terminales (${ap.terminals.length})`,
              detail: ap.terminals.map(x => `${x.id}: ${x.airlines.join(", ")}`).join(" · "),
              priority: "medium" as const,
            })),
            ...ap.tips.slice(0, 3).map(tip => ({
              title: "Tip",
              detail: tip,
              priority: "low" as const,
            })),
          ],
        };
      }
    }
    // Ningún aeropuerto del context matcheó. Devuelve un mensaje claro.
    if (iataInQ.length > 0 || /aeropuerto|airport|terminal|comer|com[ie]da|cambio|dinero/.test(q)) {
      return {
        source: "heuristic",
        answer: `No tengo info detallada cargada para ese aeropuerto todavía. Si está en el dataset global, la primera consulta puede tardar 5-10 segundos mientras genero los datos.`,
        suggestions: [{
          title: "Reintentá en 5 segundos",
          detail: "La info se va a cachear automáticamente para futuras consultas",
          priority: "low",
        }],
      };
    }
  }

  // Critical reservations
  for (const r of ctx.pending_critical_reservations.slice(0, 3)) {
    sug.push({
      title: `Cerrar reserva pendiente: ${r.description.substring(0, 60)}`,
      detail: r.payment_deadline ? `${r.provider} — deadline ${r.payment_deadline}` : r.provider,
      priority: "critical",
      deep_link: "/reservations",
    });
  }
  // Critical tasks
  for (const t of ctx.open_critical_tasks.slice(0, 3)) {
    sug.push({
      title: t.title,
      detail: t.next_action || (t.due_date ? `Vence ${t.due_date}` : "Acción crítica abierta"),
      priority: "critical",
      deep_link: "/tasks",
    });
  }
  // Uncovered nights
  if (ctx.uncovered_nights > 0) {
    sug.push({
      title: `Cubrir ${ctx.uncovered_nights} noches sin alojamiento`,
      detail: "Reservas faltantes en el itinerario",
      priority: ctx.days_until_start <= 14 ? "critical" : "high",
      deep_link: "/itinerary",
    });
  }
  // Money in flight
  for (const p of ctx.upcoming_payments.slice(0, 2)) {
    if (p.days_until <= 7) {
      sug.push({
        title: `Pago próximo: ${p.title.substring(0, 50)}`,
        detail: `${p.amount} ${p.currency} en ${p.days_until} días`,
        priority: "high",
        deep_link: "/cashflow",
      });
    }
  }
  // Budget
  if (ctx.forecast_status === "red" || ctx.budget_used_pct > 100) {
    sug.push({
      title: "Presupuesto en rojo",
      detail: `${ctx.budget_used_pct}% usado y forecast crítico`,
      priority: "high",
      deep_link: "/budget",
    });
  }

  if (sug.length === 0) {
    sug.push({
      title: `Seguir preparando el viaje`,
      detail: `Preparación ${ctx.readiness_score}% — revisá Hoy para los próximos pasos.`,
      priority: "medium",
      deep_link: "/today",
    });
  }

  const summary = sug.filter(s => s.priority === "critical").length > 0
    ? `Hay ${sug.filter(s => s.priority === "critical").length} acciones críticas abiertas. Empezá por esas antes de cualquier otra cosa.`
    : `El viaje a ${ctx.destination} está en modo ${ctx.mode} con readiness ${ctx.readiness_score}%. Acciones más impactantes abajo.`;

  return { source: "heuristic", answer: summary, suggestions: sug.slice(0, 5) };
}

interface ReactiveAssistantResult {
  response: AssistantResponse;
  provider: "anthropic" | "gemini";
  model: string;
}

async function callLLMAssistant(req: NextRequest, ctx: AssistantContext, question: string): Promise<ReactiveAssistantResult | null> {
  // SECURITY: allowTampuFallback default-false desde sprint 05/2026
  const { provider, key, source } = selectProvider(req, { allowTampuFallback: false });
  if (!provider || !key) return null;
  const userMessage = `Pregunta del viajero: "${question}"\n\nEstado actual:\n${JSON.stringify(ctx, null, 2)}`;
  // withRetry en providers.ts puede throw si Anthropic devuelve 401/5xx persistente.
  // Wrappeamos para devolver null (que activa el fallback heurístico) en vez de propagar.
  let rich;
  try {
    rich = await callLLMRich(provider, key, {
      system: SYSTEM_PROMPT,
      userMessage,
      maxTokens: MAX_TOKENS_HARD,
      timeoutMs: 25_000,
      // Sonnet por default — el asistente reactive maneja contexto pesado
      // (trip entero, vault, airports). Si en el futuro queremos bajar costo,
      // baja a haiku acá.
      model: "sonnet",
      // Prosa natural rioplatense. El default global del provider ahora es 0.2
      // (JSON-strict), pero el assistant devuelve `answer` en lenguaje natural
      // y un valor más alto da respuestas menos robóticas.
      temperature: 0.6,
    });
  } catch (e) {
    console.warn("[assistant] callLLMRich threw, falling back to heuristic:", e);
    return null;
  }
  if (!rich) return null;

  // Log usage REAL del provider (no worst-case)
  const tokensIn = rich.usage.inputTokens;
  const tokensOut = rich.usage.outputTokens;
  const identifier = await getProxyIdentifier("assistant", source === "byok" ? "byok" : "fallback");
  void recordProxyCall(identifier, {
    endpoint: "/api/assistant",
    tokensIn,
    tokensOut,
    costUsd: estimateCostUsd(tokensIn, tokensOut, rich.model),
    provider: rich.provider,
    model: rich.model,
  }).catch((e) => captureException(e, { tag: "assistant.record" }));

  const parsed = extractJson<{ answer: string; suggestions: Suggestion[] }>(rich.text);
  if (!parsed) {
    // JSON parse falló → caller decide qué hacer (cae a heuristic).
    return null;
  }
  return {
    response: { source: "claude", answer: parsed.answer, suggestions: parsed.suggestions || [] },
    provider: rich.provider,
    model: rich.model,
  };
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const body = await req.json() as AssistantRequest;
  if (!body?.question || !body?.context) {
    return withCors(NextResponse.json({ error: "Missing question or context" }, { status: 400 }), origin);
  }

  // ─── Tier 1: AGENTIC con tool_use (Anthropic) ───
  // Solo cuando hay key Anthropic — Claude decide qué tools llamar
  // (search_destination, find_in_vault, estimate_flight_price, get_trip_summary).
  // Loop hasta end_turn o max 4 iteraciones.
  // SECURITY: allowTampuFallback default-false desde sprint 05/2026
  const { provider, key, source: keySource } = selectProvider(req, { allowTampuFallback: false });
  if (provider === "anthropic" && key) {
    const agenticCtx: AgenticContext = {
      trip_name: body.context.trip_name,
      destination: body.context.destination,
      start_date: body.context.start_date,
      end_date: body.context.end_date,
      mode: body.context.mode,
      days_until_start: body.context.days_until_start,
      readiness_score: body.context.readiness_score,
      vault: body.context.vault,
      reservations: body.context.reservations,
    };
    // withRetry agora rethrowea 401 (Anthropic key inválida). El agentic loop
    // puede tirar — wrappeamos para devolver null y caer al heurístico.
    let agentic;
    try {
      agentic = await runAgenticAssistant(key, body.question, agenticCtx);
    } catch (e) {
      console.warn("[assistant] runAgenticAssistant threw, falling back to heuristic:", e);
      agentic = null;
    }
    if (agentic) {
      // Record usage REAL del agentic loop (multi-turn).
      const tokensIn = agentic.usage.inputTokens;
      const tokensOut = agentic.usage.outputTokens;
      const identifier = await getProxyIdentifier("assistant", keySource === "byok" ? "byok" : "fallback");
      void recordProxyCall(identifier, {
        endpoint: "/api/assistant",
        tokensIn,
        tokensOut,
        costUsd: estimateCostUsd(tokensIn, tokensOut, agentic.model),
        provider: agentic.provider,
        model: agentic.model,
      }).catch((e) => captureException(e, { tag: "assistant.agentic.record" }));

      return withCors(
        NextResponse.json({
          source: "claude",
          answer: agentic.answer,
          suggestions: agentic.suggestions,
          tools_used: agentic.tools_used,
          provider: agentic.provider,
          model: agentic.model,
        }),
        origin,
      );
    }
    // Si agentic falla, cae al reactive Anthropic abajo
  }

  // ─── Tier 2: REACTIVO single-shot (Anthropic O Gemini) ───
  // Fallback cuando agentic timeout/error, o user usa Gemini key.
  const llm = await callLLMAssistant(req, body.context, body.question);
  if (llm) {
    return withCors(NextResponse.json({
      ...llm.response,
      provider: llm.provider,
      model: llm.model,
    }), origin);
  }

  // ─── Tier 3: HEURÍSTICO local ───
  // Si no hay key configurada, respondemos con reglas locales.
  return withCors(NextResponse.json(buildHeuristic(body.context, body.question)), origin);
}
