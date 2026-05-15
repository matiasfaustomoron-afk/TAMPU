// ─── Server-side AI provider abstraction ───
// Routes call callLLM(prompt, opts, req) and we pick Anthropic OR Gemini
// based on the headers sent by the client. Both honor the user-provided key.

import type { NextRequest } from "next/server";

export type Provider = "anthropic" | "gemini" | null;

export interface LLMCallOpts {
  system?: string;
  userMessage: string;
  maxTokens?: number;
  /** Image attachments (base64) for vision — only used by classify-document route */
  image?: { dataB64: string; mime: string };
  pdf?: { dataB64: string };
  timeoutMs?: number;
  /**
   * Modelo lógico — el provider lo resuelve al concrete model ID.
   * - 'haiku' (default): claude-haiku-4-5 / gemini-2.0-flash. Para clasificación, parsing single-shot.
   * - 'sonnet': claude-sonnet-4-5. Para reasoning más pesado (agentic, vision).
   * Gemini ignora este flag — siempre usa 2.0 Flash.
   */
  model?: "haiku" | "sonnet";
  /**
   * Temperature 0-1. Default 0.2 JSON-strict, 0.7 prosa. Anthropic respeta esto si se pasa; default 1.0 sino.
   */
  temperature?: number;
}

/**
 * Resultado opcional rich del callLLM — incluye usage real reportado por el
 * provider, el modelo concreto que respondió, y el texto. Los callers existentes
 * pueden seguir consumiendo solo `text` via `callLLM()` legacy.
 */
export interface LLMCallResult {
  text: string;
  /** Token counts reales del provider (input/output). Cero si el provider no los reporta. */
  usage: { inputTokens: number; outputTokens: number };
  /** Modelo concreto usado (ej. 'claude-haiku-4-5' o 'gemini-2.0-flash'). */
  model: string;
  provider: "anthropic" | "gemini";
}

export interface SelectProviderOpts {
  /**
   * Si true, `TAMPU_ANTHROPIC_KEY` (la key server-side que paga Tampu) se usa
   * como fallback cuando no hay BYOK. ATENCIÓN: este path NO está
   * rate-limitado en `selectProvider` mismo — el rate limit vive en
   * `/api/ai-proxy` (ver `src/lib/ai/rate-limit.ts`).
   *
   * Default SEGURO desde el sprint seguridad 05/2026: `false`. Sólo
   * `/api/ai-proxy` puede pasar `true` (porque internamente llama
   * `canCallProxy()` + `checkDailyBudget()` antes del upstream).
   *
   * Endpoints que invocan IA con contexto pesado (vault entero, trip entero,
   * docs PDF de varios MB) NO deben tocar `allowTampuFallback` — el default
   * los protege.
   */
  allowTampuFallback?: boolean;
}

export function selectProvider(
  req: NextRequest,
  opts: SelectProviderOpts = {},
): { provider: Provider; key: string | null; source: "byok" | "tampu" | "env" | "none" } {
  // SECURITY: default safe — sólo opt-in explícito habilita el fallback Tampu.
  const { allowTampuFallback = false } = opts;

  // 1. BYOK del user (header). Tiene prioridad absoluta — preserva privacy
  //    (datos van directo a Anthropic/Gemini sin pasar por nuestra infra).
  const anth = req.headers.get("x-anthropic-key");
  if (anth && anth.startsWith("sk-ant-")) return { provider: "anthropic", key: anth, source: "byok" };
  const gem = req.headers.get("x-gemini-key");
  if (gem && gem.startsWith("AIza")) return { provider: "gemini", key: gem, source: "byok" };

  // 2. Tampu's server-side key (NUEVO — habilita el "out-of-the-box" path
  //    descripto en src/lib/ai/PROXY-DESIGN.md). NOTA: este branch NO chequea
  //    rate limit por sí solo — los endpoints que lo usan deben llamar
  //    primero `canCallProxy()` desde `@/lib/ai/rate-limit`. El endpoint
  //    `/api/ai-proxy` ya lo hace. Endpoints existentes que NO quieran que la
  //    Tampu key cuente como fallback pueden pasar `{ allowTampuFallback: false }`.
  if (allowTampuFallback) {
    const tampu = process.env.TAMPU_ANTHROPIC_KEY;
    if (tampu) return { provider: "anthropic", key: tampu, source: "tampu" };
  }

  // 3. Env legacy (dev local, antes del proxy)
  const envAnth = process.env.ANTHROPIC_API_KEY;
  if (envAnth) return { provider: "anthropic", key: envAnth, source: "env" };
  const envGem = process.env.GEMINI_API_KEY;
  if (envGem) return { provider: "gemini", key: envGem, source: "env" };

  return { provider: null, key: null, source: "none" };
}

/** Call the selected provider and return the raw text response. Null on failure. */
export async function callLLM(provider: Provider, key: string, opts: LLMCallOpts): Promise<string | null> {
  const rich = await callLLMRich(provider, key, opts);
  return rich ? rich.text : null;
}

/**
 * Versión rich de callLLM — devuelve text + usage real + modelo. Preferí usar
 * esta en endpoints nuevos para que rate-limit / cost tracking tengan los
 * números reales del provider en vez del worst-case (MAX_TOKENS hardcoded).
 */
export async function callLLMRich(
  provider: Provider,
  key: string,
  opts: LLMCallOpts,
): Promise<LLMCallResult | null> {
  if (!provider || !key) return null;
  if (provider === "anthropic") {
    const r = await withRetry(() => callAnthropicRich(key, opts));
    return r;
  }
  if (provider === "gemini") {
    const r = await withRetry(() => callGeminiRich(key, opts));
    return r;
  }
  return null;
}

/**
 * Retry exponential backoff para llamadas LLM transient errors.
 * - Reintenta hasta 2 veces (3 attempts total) con backoff 1s, 2s, 4s.
 * - 401 NO se reintenta (es un error de auth, no transient).
 * - Honra `retry-after` header si el upstream lo manda.
 *
 * Exportada para que callers que hacen fetch directo a Anthropic/Gemini
 * (ej. `lib/ai/agentic.ts` con tool_use loop) puedan envolver sus llamadas
 * sin re-implementar la lógica.
 */
export async function withRetry<T>(fn: () => Promise<T | null>, retries = 2): Promise<T | null> {
  let lastErr: unknown = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fn();
      // Si fn devolvió null limpio, NO reintentamos (no es un error, es un "no data")
      // — fn ya distingue internamente entre 401 (no retry) y 429/5xx (retry).
      if (res !== null || i === retries) return res;
    } catch (e: unknown) {
      lastErr = e;
      // 4xx no se reintenta (auth inválida, bad request, etc.) — tirar inmediato.
      const status = (e as { status?: number })?.status;
      if (status && status >= 400 && status < 500) throw e;
      if (i === retries) throw e;
    }
    const waitMs = 1000 * Math.pow(2, i);
    await new Promise(r => setTimeout(r, waitMs));
  }
  if (lastErr) throw lastErr;
  return null;
}

async function callAnthropicRich(key: string, opts: LLMCallOpts): Promise<LLMCallResult | null> {
  try {
    const content: Array<Record<string, unknown>> = [];
    if (opts.image) {
      content.push({ type: "image", source: { type: "base64", media_type: opts.image.mime, data: opts.image.dataB64 } });
    }
    if (opts.pdf) {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: opts.pdf.dataB64 } });
    }
    content.push({ type: "text", text: opts.userMessage });

    const model = opts.model === "sonnet" ? "claude-sonnet-4-5" : "claude-haiku-4-5";

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        // Default 0.2 (JSON-strict friendly) en vez del default 1.0 de Anthropic.
        // La mayoría de los endpoints Tampu (categorize, parse-booking, classify,
        // airport-info, parse-email) son JSON-strict y un temperature alto causa
        // hallucination/formatos rotos. Endpoints que necesitan prosa más natural
        // (assistant, generate-itinerary) overridean explícito con 0.6.
        temperature: opts.temperature ?? 0.2,
        // Prompt caching: el system prompt se cachea con TTL ephemeral (5 min).
        // En las llamadas siguientes con el mismo system, Anthropic descuenta
        // ~90% del cost de input tokens. Estructura: array de blocks con
        // cache_control en el último (o único) block.
        ...(opts.system
          ? { system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }] }
          : {}),
        messages: [{ role: "user", content }],
      }),
    });
    if (!res.ok) {
      // 401 → error de auth, no retryable. Lo señalizamos throwando.
      if (res.status === 401) {
        const err = new Error(`anthropic_unauthorized`) as Error & { status?: number };
        err.status = 401;
        throw err;
      }
      // 429 / 5xx → transient, throwear con status para que `withRetry` haga
      // backoff exponencial. Antes devolvíamos null acá y `withRetry` lo
      // trataba como "no data" y NO reintentaba — significaba que un single
      // hiccup en Anthropic rompía la respuesta entera.
      if (res.status === 429 || res.status >= 500) {
        const err = new Error(`anthropic_${res.status}`) as Error & { status: number };
        err.status = res.status;
        throw err;
      }
      return null;
    }
    const json = await res.json() as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const txt = json.content?.find(c => c.type === "text")?.text;
    if (!txt) return null;
    return {
      text: txt,
      usage: {
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
      },
      model,
      provider: "anthropic",
    };
  } catch (e: unknown) {
    // Re-throw 401 + transient para que withRetry los maneje.
    const status = (e as { status?: number })?.status;
    if (status === 401) throw e;
    if (status && (status === 429 || status >= 500)) throw e;
    return null;
  }
}

async function callGeminiRich(key: string, opts: LLMCallOpts): Promise<LLMCallResult | null> {
  try {
    const parts: Array<Record<string, unknown>> = [];
    if (opts.system) parts.push({ text: `[SYSTEM] ${opts.system}\n\n` });
    if (opts.image) {
      parts.push({ inline_data: { mime_type: opts.image.mime, data: opts.image.dataB64 } });
    }
    if (opts.pdf) {
      parts.push({ inline_data: { mime_type: "application/pdf", data: opts.pdf.dataB64 } });
    }
    parts.push({ text: opts.userMessage });

    const model = "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          maxOutputTokens: opts.maxTokens ?? 1024,
          temperature: opts.temperature ?? 0.2,
        },
      }),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        const err = new Error(`gemini_unauthorized`) as Error & { status?: number };
        err.status = 401;
        throw err;
      }
      // 429 / 5xx → transient, throwear con status para `withRetry`.
      if (res.status === 429 || res.status >= 500) {
        const err = new Error(`gemini_${res.status}`) as Error & { status: number };
        err.status = res.status;
        throw err;
      }
      return null;
    }
    const json = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const txt = json.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("");
    if (!txt) return null;
    return {
      text: txt,
      usage: {
        inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
      },
      model,
      provider: "gemini",
    };
  } catch (e: unknown) {
    const status = (e as { status?: number })?.status;
    if (status === 401) throw e;
    if (status && (status === 429 || status >= 500)) throw e;
    return null;
  }
}
