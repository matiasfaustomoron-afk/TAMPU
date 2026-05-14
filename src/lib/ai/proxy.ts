"use client";

// ─── Client-side AI proxy wrapper ───
//
// Decide entre BYOK (key del user) y el proxy server-side de Tampu.
// Es el punto de entrada que las features IA deberían usar de ahora en más
// cuando hagan llamadas single-shot (clasificar gasto, generar tip, parsear
// boarding pass corto). Los endpoints que ya pasan contexto complejo
// (`/api/assistant`, `/api/generate-itinerary`) siguen usando su propio flow
// con `withApiKeyHeaders()` porque tienen prompts especializados — para esos,
// el fallback al proxy ocurre **server-side** en `selectProvider()`.
//
// Uso typical:
//   const out = await callAI({
//     system: "Sos un clasificador de gastos...",
//     userMessage: "Vuelo BUE-EZE",
//     maxTokens: 200,
//   });
//   if (!out) { /* fallback heurístico local */ }
//
// El consumer NO necesita preocuparse de cuál provider/key se usó — la firma
// es opaca por diseño.

import { hasUserApiKey, withApiKeyHeaders } from "@/lib/ai/user-key";
import { withDeviceFingerprint } from "@/lib/security/device-fingerprint";

// In Capacitor / mobile builds, the static export has no /api routes — point
// at the deployed web via NEXT_PUBLIC_API_BASE_URL. Empty string = same origin.
function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL || "";
}

export interface CallAIOpts {
  system?: string;
  userMessage: string;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface CallAIResult {
  text: string;
  /** De dónde salió la respuesta — útil para telemetría y debugging. */
  source: "byok-anthropic" | "byok-gemini" | "proxy";
  /** Provider real que respondió (server-side). */
  provider?: string;
  /** Modelo concreto (ej. "claude-haiku-4-5"). Para UI honesta. */
  model?: string;
  /** Solo presente cuando source === "proxy". */
  usage?: { monthly: { used: number; cap: number }; daily: { used: number; cap: number } };
}

export interface CallAIError {
  text: null;
  source: "none";
  /** Motivo legible para mostrar al user (es-AR). */
  reason: string;
  /** Código machine-readable para que la UI decida (rate_limit, bad_key, unavailable, etc). */
  code?: "rate_limit" | "bad_key" | "unavailable" | "network" | "upstream" | "empty" | "monthly_cap";
  /** Si fue 429, en cuántos segundos puede reintentar. */
  retryAfterSeconds?: number;
  /** Si fue 429, ofertamos upgrade a Pro. */
  upgradeUrl?: string;
  /** Si fue rate limit, info de uso para UI. */
  usage?: { monthly: { used: number; cap: number }; daily: { used: number; cap: number } };
}

/**
 * Main entry point. Devuelve `text` con la respuesta, o un error tipado.
 *
 * Flow:
 *  1. Si el user tiene BYOK key → llama a un endpoint Tampu pasando la key
 *     por header. (Reusamos la infra de `selectProvider` server-side. Acá
 *     elegimos /api/ai-proxy también, que **server-side** detecta la key del
 *     header y la usa en lugar de la de Tampu — ver `providers.ts`.)
 *  2. Si no tiene key → llama a /api/ai-proxy "anónimo", que cae al rate-limited
 *     free tier de Tampu.
 *  3. Si 429 → devuelve error con `reason` legible y `upgradeUrl`.
 */
export async function callAI(opts: CallAIOpts): Promise<CallAIResult | CallAIError> {
  const base = apiBase();
  const url = `${base}/api/ai-proxy`;

  // Si el user trae key BYOK, la mandamos por header — el endpoint la prefiere
  // sobre la de Tampu (ver `providers.ts` y `/api/ai-proxy/route.ts`).
  // El rate limit no aplica porque el server detecta BYOK y bypassea.
  //
  // Device fingerprint: si no hay user logueado, mandamos un fingerprint
  // estable para que el rate-limit anónimo no caiga al tier strict (10/día).
  const baseHeaders = withApiKeyHeaders({ "Content-Type": "application/json" }) as Record<string, string>;
  const headers = await withDeviceFingerprint(baseHeaders);
  const usingByok = hasUserApiKey();

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      credentials: "include", // cookies Supabase para identificar user logueado
      headers,
      body: JSON.stringify(opts),
    });
  } catch (e) {
    return {
      text: null,
      source: "none",
      code: "network",
      reason: `No pudimos contactar Tampu (${(e as Error).message || "red caída"}).`,
    };
  }

  if (res.status === 429) {
    type RL = { reason?: string; retryAfterSeconds?: number; upgradeUrl?: string; usage?: CallAIError["usage"] };
    const json = (await res.json().catch(() => ({}))) as RL;
    const isMonthly = json.reason === "monthly_cap";
    return {
      text: null,
      source: "none",
      code: isMonthly ? "monthly_cap" : "rate_limit",
      reason: isMonthly
        ? "Ya usaste tu cuota IA del mes. Podés sumar tu key gratis de Gemini en Settings, esperar al mes que viene, o sumarte al plan Pro."
        : "Demasiadas consultas. Esperá 1 minuto o sumá tu key en Settings.",
      retryAfterSeconds: json.retryAfterSeconds,
      upgradeUrl: json.upgradeUrl || "/settings?tab=ai",
      usage: json.usage,
    };
  }

  if (res.status === 401) {
    return {
      text: null,
      source: "none",
      code: "bad_key",
      reason: "Tu key parece inválida. Revisala en Ajustes.",
    };
  }

  if (res.status === 503) {
    return {
      text: null,
      source: "none",
      code: "unavailable",
      reason: usingByok
        ? "Servicio sin capacidad. Reintentá en un rato."
        : "El proxy IA de Tampu no está disponible. Sumá tu key gratis de Gemini en Settings para usar el Asistente.",
    };
  }

  if (!res.ok) {
    return {
      text: null,
      source: "none",
      code: "upstream",
      reason: `Error del proveedor IA (${res.status}). Intentá de nuevo.`,
    };
  }

  type Ok = {
    text: string;
    source?: "proxy";
    provider?: string;
    model?: string;
    usage?: CallAIResult["usage"];
  };
  const json = (await res.json().catch(() => null)) as Ok | null;
  if (!json || !json.text) {
    return { text: null, source: "none", code: "empty", reason: "Respuesta vacía del proveedor IA." };
  }

  return {
    text: json.text,
    source: usingByok ? (headers as Record<string, string>)["x-anthropic-key"] ? "byok-anthropic" : "byok-gemini" : "proxy",
    provider: json.provider,
    model: json.model,
    usage: json.usage,
  };
}

/**
 * Lee el uso actual del proxy desde el server (sin contar contra el límite).
 * Usado por /settings para mostrar "12/50 calls este mes".
 */
export async function fetchProxyUsage(): Promise<{
  tier: "anonymous" | "auth" | "byok" | "pro";
  enabled: boolean;
  monthly: { used: number; cap: number };
  daily: { used: number; cap: number };
} | null> {
  try {
    const headers = await withDeviceFingerprint({});
    const res = await fetch(`${apiBase()}/api/ai-proxy`, {
      method: "GET",
      credentials: "include",
      headers,
    });
    if (!res.ok) return null;
    return (await res.json()) as Awaited<ReturnType<typeof fetchProxyUsage>>;
  } catch {
    return null;
  }
}
