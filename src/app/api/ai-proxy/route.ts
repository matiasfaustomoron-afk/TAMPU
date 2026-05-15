// ─── POST /api/ai-proxy ───
//
// Endpoint que usa la key server-side de Tampu (`TAMPU_ANTHROPIC_KEY`) para
// hacer llamadas IA "out of the box" — el user no necesita configurar nada.
// Protegido por rate-limit (ver src/lib/ai/rate-limit.ts y PROXY-DESIGN.md).
//
// Body:
//   { system?: string, userMessage: string, maxTokens?: number, timeoutMs?: number }
//
// Response 200:
//   { text: string, source: "proxy", tokensUsed: { input: number, output: number },
//     usage: { monthly: { used, cap }, daily: { used, cap } } }
//
// Response 429 (rate limited):
//   { error: "rate_limited", reason: "daily_cap"|"monthly_cap"|"disabled",
//     retryAfterSeconds: number, upgradeUrl: "/settings?tab=ai",
//     usage: { monthly, daily } }
//
// Response 503: { error: "proxy_disabled" } cuando TAMPU_ANTHROPIC_KEY no está.

import { NextResponse, type NextRequest } from "next/server";
import { canCallProxy, recordProxyCall, estimateCostUsd } from "@/lib/ai/rate-limit";
import { captureException } from "@/lib/observability/sentry";

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
    "Content-Type, x-anthropic-key, x-gemini-key, x-device-fingerprint",
  );
  res.headers.set("Access-Control-Allow-Credentials", "true");
  res.headers.set("Vary", "Origin");
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return withCors(new NextResponse(null, { status: 204 }), req.headers.get("origin"));
}

interface ProxyBody {
  system?: string;
  userMessage: string;
  maxTokens?: number;
  timeoutMs?: number;
  /** Override del default 0.2 server-side (clamped 0..1). */
  temperature?: number;
}

// Hard caps server-side — no confiamos en lo que pida el client.
const HARD_CAP_INPUT_CHARS = 12_000;  // ~3k tokens — suficiente para los prompts Tampu
const HARD_CAP_MAX_TOKENS = 2_048;
const HARD_CAP_TIMEOUT_MS = 30_000;

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");

  // 1. Parse body
  let body: ProxyBody;
  try {
    body = (await req.json()) as ProxyBody;
  } catch {
    return withCors(NextResponse.json({ error: "invalid_json" }, { status: 400 }), origin);
  }
  if (!body.userMessage || typeof body.userMessage !== "string") {
    return withCors(NextResponse.json({ error: "userMessage_required" }, { status: 400 }), origin);
  }

  // Input size cap (anti-abuse: alguien tratando de mandar trip entero)
  const totalLen = body.userMessage.length + (body.system?.length ?? 0);
  if (totalLen > HARD_CAP_INPUT_CHARS) {
    return withCors(
      NextResponse.json(
        {
          error: "input_too_large",
          limit_chars: HARD_CAP_INPUT_CHARS,
          got_chars: totalLen,
          hint: "Reducí el contexto o usá BYOK (sin límite) en /settings.",
        },
        { status: 413 },
      ),
      origin,
    );
  }

  // 2. Rate limit check
  const decision = await canCallProxy(req);
  if (!decision.ok) {
    if (decision.reason === "disabled") {
      // 503 disabled: el proxy NO existe (TAMPU key no configurada). Hint al
      // client de reintentar en 1h por si el operator lo habilita; en la
      // práctica el client debería caer a BYOK / heurístico inmediatamente.
      return withCors(
        NextResponse.json(
          { error: "proxy_disabled", hint: "Configurá tu key en /settings (Anthropic o Gemini)." },
          { status: 503, headers: { "Retry-After": "3600" } },
        ),
        origin,
      );
    }
    // 429 rate_limited: SIEMPRE garantizar el header Retry-After (spec RFC
    // 6585). Si por algún motivo no tenemos resetIn (fallback defensivo),
    // mandamos 60s. Antes, cuando resetIn era 0 / undefined, el header se
    // omitía y los clients HTTP-conformantes no podían backoff automático.
    const retryAfter = String(decision.resetIn ?? 60);
    return withCors(
      NextResponse.json(
        {
          error: "rate_limited",
          reason: decision.reason,
          retryAfterSeconds: decision.resetIn,
          upgradeUrl: "/settings?tab=ai",
          usage: { monthly: decision.monthly, daily: decision.daily },
        },
        {
          status: 429,
          headers: { "Retry-After": retryAfter },
        },
      ),
      origin,
    );
  }

  // 3. Call Anthropic Haiku (cheapest model adequate for Tampu's classify/parse tasks)
  const key = process.env.TAMPU_ANTHROPIC_KEY;
  if (!key) {
    // Race condition: canCallProxy chequea esto, pero por las dudas
    return withCors(
      NextResponse.json(
        { error: "proxy_disabled" },
        { status: 503, headers: { "Retry-After": "3600" } },
      ),
      origin,
    );
  }

  const maxTokens = Math.min(body.maxTokens ?? 1024, HARD_CAP_MAX_TOKENS);
  const timeoutMs = Math.min(body.timeoutMs ?? 25_000, HARD_CAP_TIMEOUT_MS);
  // Default 0.2 server-side — el proxy es usado para clasificación/parsing
  // JSON-strict por defecto. Si el client quiere prosa, manda body.temperature
  // explícito (clamped 0..1 para no caer en valores inválidos).
  const temperature = Math.max(0, Math.min(1, body.temperature ?? 0.2));

  let json: AnthropicResponse;
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
        // Haiku 4.5 = balance costo/calidad ideal para tareas de clasificación,
        // extracción, single-shot Q&A. Si querés bumpear a Sonnet, cambiá acá
        // (y ajustá el costo en PROXY-DESIGN.md).
        model: "claude-haiku-4-5",
        max_tokens: maxTokens,
        temperature,
        // Prompt caching ephemeral — ahorra ~90% del input cost en hits
        // cacheados (system prompts repetidos entre llamadas del mismo
        // endpoint en la ventana de 5 min).
        ...(body.system
          ? { system: [{ type: "text", text: body.system, cache_control: { type: "ephemeral" } }] }
          : {}),
        messages: [{ role: "user", content: body.userMessage }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return withCors(
        NextResponse.json(
          { error: "upstream_failed", status: res.status, hint: errText.slice(0, 200) },
          { status: 502 },
        ),
        origin,
      );
    }
    json = (await res.json()) as AnthropicResponse;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return withCors(
      NextResponse.json({ error: "upstream_error", detail: msg }, { status: 502 }),
      origin,
    );
  }

  const text = json.content?.find(c => c.type === "text")?.text ?? "";
  if (!text) {
    return withCors(NextResponse.json({ error: "empty_response" }, { status: 502 }), origin);
  }

  // 4. Record el uso (fire-and-forget — no esperamos persistencia Supabase)
  // Tokens REALES del provider. Fallback a estimación solo si la API no devolvió usage.
  const tokensIn = json.usage?.input_tokens ?? Math.ceil((body.userMessage.length + (body.system?.length ?? 0)) / 4);
  const tokensOut = json.usage?.output_tokens ?? 0;
  const PROXY_MODEL = "claude-haiku-4-5";
  void recordProxyCall(decision.identifier, {
    endpoint: decision.endpoint,
    tokensIn,
    tokensOut,
    costUsd: estimateCostUsd(tokensIn, tokensOut, PROXY_MODEL),
    provider: "tampu",
    model: PROXY_MODEL,
  }).catch((e) => captureException(e, { tag: "ai-proxy.record" }));

  // 5. Return — incluímos `provider` + `model` para UI honesta sobre qué modelo respondió.
  return withCors(
    NextResponse.json({
      text,
      source: "proxy",
      provider: "tampu",
      model: PROXY_MODEL,
      tokensUsed: {
        input: json.usage?.input_tokens ?? 0,
        output: json.usage?.output_tokens ?? 0,
      },
      usage: {
        monthly: { used: decision.monthly.used + 1, cap: decision.monthly.cap },
        daily: { used: decision.daily.used + 1, cap: decision.daily.cap },
      },
    }),
    origin,
  );
}

// ─── GET /api/ai-proxy ───
// Exponé el uso actual al client (para que /settings pueda mostrar "12/50").
// Sin side-effects, sin contar contra el rate limit.
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const { getCurrentUsage } = await import("@/lib/ai/rate-limit");
  const usage = await getCurrentUsage(req);
  return withCors(NextResponse.json(usage), origin);
}
