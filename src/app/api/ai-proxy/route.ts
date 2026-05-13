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
import { canCallProxy, recordProxyCall } from "@/lib/ai/rate-limit";

const ALLOWED_ORIGINS = ["capacitor://localhost", "ionic://localhost"];

function withCors(res: NextResponse, origin: string | null): NextResponse {
  const ok =
    !origin ||
    ALLOWED_ORIGINS.includes(origin) ||
    origin.startsWith("http://localhost") ||
    origin.endsWith(".vercel.app");
  if (ok && origin) res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
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
      return withCors(
        NextResponse.json(
          { error: "proxy_disabled", hint: "Configurá tu key en /settings (Anthropic o Gemini)." },
          { status: 503 },
        ),
        origin,
      );
    }
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
          headers: decision.resetIn ? { "Retry-After": String(decision.resetIn) } : undefined,
        },
      ),
      origin,
    );
  }

  // 3. Call Anthropic Haiku (cheapest model adequate for Tampu's classify/parse tasks)
  const key = process.env.TAMPU_ANTHROPIC_KEY;
  if (!key) {
    // Race condition: canCallProxy chequea esto, pero por las dudas
    return withCors(NextResponse.json({ error: "proxy_disabled" }, { status: 503 }), origin);
  }

  const maxTokens = Math.min(body.maxTokens ?? 1024, HARD_CAP_MAX_TOKENS);
  const timeoutMs = Math.min(body.timeoutMs ?? 25_000, HARD_CAP_TIMEOUT_MS);

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
        ...(body.system ? { system: body.system } : {}),
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
  await recordProxyCall(decision.identifier);

  // 5. Return
  return withCors(
    NextResponse.json({
      text,
      source: "proxy",
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
