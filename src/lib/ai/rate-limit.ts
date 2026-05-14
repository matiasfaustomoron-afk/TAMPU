// ─── Rate limiter para el proxy IA de Tampu ───
//
// Rewrite Sprint Seguridad 05/2026: la fuente de verdad ahora es Supabase
// (`ai_proxy_usage` — migration 00022). El LRU in-memory se mantiene como
// **L1 cache** (5s TTL) para evitar pegarle a Supabase en cada request.
//
// Por qué Supabase y no Upstash/Redis:
//   - Ya tenemos Supabase (no agregamos otro proveedor de infra).
//   - Postgres tiene precisión transaccional para los counters (no UB).
//   - Las queries son baratas (count + sum por device_fingerprint/user_id).
//
// Caps duros:
//   - Anonymous (sólo device fingerprint): 20/día y 100/mes
//   - Anonymous sin fingerprint (header faltante): 10/día (más estricto)
//   - Auth (Supabase session): 50/mes en proxy mode
//   - BYOK: bypass total (no pasa por proxy)
//
// Circuit breaker global:
//   - Si SUM(cost_usd) del día actual > AI_DAILY_BUDGET_USD (default 50),
//     devolvemos `daily_budget_reached` y logueamos a Sentry severity=error.
//   - Esto protege la key TAMPU_ANTHROPIC_KEY de un attack scattered (muchos
//     fingerprints distintos cada uno bajo el cap individual).
//
// Decisión de policy: ver PROXY-DESIGN.md sección "Rate limit policy".

import type { NextRequest } from "next/server";
import { createHash } from "crypto";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseService } from "@/lib/supabase/service";
import { captureException, captureMessage } from "@/lib/observability/sentry";

// ─── Tipos ───────────────────────────────────────────────────────────

export type RateLimitTier = "anonymous" | "anonymous_strict" | "auth" | "byok" | "pro";

export interface RateLimitDecision {
  /** Si el caller puede proceder con la llamada IA. */
  ok: boolean;
  /** Tier que aplicó (para logging). */
  tier: RateLimitTier;
  /** Identifier opaco (para debugging + record). */
  identifier: string;
  /** Endpoint del request (para tracking). */
  endpoint: string;
  /** Si !ok: segundos hasta poder reintentar. */
  resetIn?: number;
  /** Si !ok: motivo legible para el client. */
  reason?: "daily_cap" | "monthly_cap" | "disabled" | "daily_budget_reached";
  /** Uso actual del mes (para UI "12/50 calls"). */
  monthly: { used: number; cap: number };
  /** Uso del día (para feedback inmediato). */
  daily: { used: number; cap: number };
}

interface UsageSnapshot {
  /** Calls hoy (UTC). */
  countDay: number;
  /** Calls en el mes calendario (UTC). */
  countMonth: number;
  /** Cost USD acumulado HOY across ALL identifiers (circuit breaker). */
  dailyBudgetUsd: number;
  /** Epoch ms cuando se hidrató. Para TTL. */
  cachedAt: number;
}

// ─── Caps por tier ───────────────────────────────────────────────────

const CAPS = {
  anonymous: { day: 20, month: 100 },
  anonymous_strict: { day: 10, month: 50 }, // sin fingerprint = más estricto
  auth:      { day: 50, month: 50 },
  byok:      { day: Infinity, month: Infinity },
  pro:       { day: Infinity, month: Infinity },
} as const;

// ─── L1 cache (in-memory, 5s TTL) ────────────────────────────────────

const L1_TTL_MS = 5_000;
const L1_MAX_ENTRIES = 5000;
const l1Cache = new Map<string, UsageSnapshot>();

/** Cache global del daily budget para evitar query SUM en cada request. */
let dailyBudgetCache: { value: number; cachedAt: number; day: string } | null = null;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}
function monthKey(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM UTC
}

function isCacheFresh(snap: UsageSnapshot | undefined): snap is UsageSnapshot {
  return !!snap && Date.now() - snap.cachedAt < L1_TTL_MS;
}

function setL1(key: string, snap: UsageSnapshot): void {
  if (l1Cache.size >= L1_MAX_ENTRIES) {
    const firstKey = l1Cache.keys().next().value;
    if (firstKey) l1Cache.delete(firstKey);
  }
  l1Cache.set(key, snap);
}

// ─── Identifier resolution ───────────────────────────────────────────

const IP_SALT = process.env.AI_PROXY_IP_SALT || "tampu-default-salt-change-me";

function hashFingerprint(raw: string): string {
  return createHash("sha256").update(raw + IP_SALT).digest("hex").slice(0, 32);
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

/**
 * Lee el `x-device-fingerprint` header (fingerprintjs open-source en el cliente).
 * Si está, devolvemos un identifier estable basado en el device. Si no, caemos a
 * IP hash y al tier más estricto.
 */
async function resolveIdentity(
  req: NextRequest,
): Promise<{ identifier: string; tier: RateLimitTier; deviceFingerprint: string }> {
  // 1. Auth Supabase tiene prioridad (cookie session)
  try {
    const supa = await createSupabaseServer();
    if (supa) {
      const { data } = await supa.auth.getUser();
      if (data?.user) {
        const fp = `user:${data.user.id}`;
        return { identifier: fp, tier: "auth", deviceFingerprint: fp };
      }
    }
  } catch {
    // ignore — caemos a anonymous
  }

  // 2. Anonymous con device fingerprint del header
  const rawFp = req.headers.get("x-device-fingerprint");
  if (rawFp && rawFp.length >= 8 && rawFp.length <= 256) {
    const fp = `fp:${hashFingerprint(rawFp)}`;
    return { identifier: fp, tier: "anonymous", deviceFingerprint: fp };
  }

  // 3. Anonymous sin fingerprint — tier strict, identifier por IP hash
  const ip = getClientIp(req);
  const fp = `ip:${hashFingerprint(ip)}`;
  return { identifier: fp, tier: "anonymous_strict", deviceFingerprint: fp };
}

// ─── Supabase queries ────────────────────────────────────────────────
//
// Schema esperado (creado por Agent C en migration 00022):
//   create table ai_proxy_usage (
//     id bigserial primary key,
//     device_fingerprint text not null,
//     endpoint text not null,
//     tokens_in int not null default 0,
//     tokens_out int not null default 0,
//     cost_usd numeric(10,6) not null default 0,
//     created_at timestamptz not null default now()
//   );
//   create index on ai_proxy_usage (device_fingerprint, created_at);
//   create index on ai_proxy_usage (created_at);

async function loadUsageFromSupabase(identifier: string): Promise<UsageSnapshot | null> {
  const supa = createSupabaseService();
  if (!supa) return null;
  try {
    const day = todayKey();
    const monthStart = `${monthKey()}-01T00:00:00Z`;
    const dayStart = `${day}T00:00:00Z`;

    const { data: dayRows, error: dayErr } = await supa
      .from("ai_proxy_usage")
      .select("id", { count: "exact", head: false })
      .eq("device_fingerprint", identifier)
      .gte("created_at", dayStart);
    if (dayErr) return null;

    const { data: monthRows, error: monthErr } = await supa
      .from("ai_proxy_usage")
      .select("id", { count: "exact", head: false })
      .eq("device_fingerprint", identifier)
      .gte("created_at", monthStart);
    if (monthErr) return null;

    return {
      countDay: dayRows?.length ?? 0,
      countMonth: monthRows?.length ?? 0,
      dailyBudgetUsd: 0, // se hidrata aparte
      cachedAt: Date.now(),
    };
  } catch (e) {
    captureException(e, { tag: "rate-limit.loadUsage", level: "warning" });
    return null;
  }
}

/**
 * Suma cost_usd del día actual a través de TODOS los identifiers — circuit
 * breaker global. Cacheado en memoria por L1_TTL_MS para no quemar Supabase.
 */
async function getDailyBudgetSpent(): Promise<number> {
  const day = todayKey();
  if (dailyBudgetCache && dailyBudgetCache.day === day && Date.now() - dailyBudgetCache.cachedAt < L1_TTL_MS) {
    return dailyBudgetCache.value;
  }

  const supa = createSupabaseService();
  if (!supa) {
    // Sin Supabase no podemos evaluar — devolvemos 0 y dejamos pasar.
    // El operator debería ver el warning una sola vez en logs y configurar.
    if (!dailyBudgetCache) {
      captureMessage("rate-limit: Supabase service client not configured — daily budget circuit breaker DISABLED", {
        tag: "rate-limit.budget",
        level: "warning",
      });
    }
    dailyBudgetCache = { value: 0, cachedAt: Date.now(), day };
    return 0;
  }

  try {
    const dayStart = `${day}T00:00:00Z`;
    const { data, error } = await supa
      .from("ai_proxy_usage")
      .select("cost_usd")
      .gte("created_at", dayStart);
    if (error) {
      dailyBudgetCache = { value: 0, cachedAt: Date.now(), day };
      return 0;
    }
    const total = (data ?? []).reduce((acc, row) => acc + Number((row as { cost_usd: number }).cost_usd ?? 0), 0);
    dailyBudgetCache = { value: total, cachedAt: Date.now(), day };
    return total;
  } catch (e) {
    captureException(e, { tag: "rate-limit.budget", level: "warning" });
    dailyBudgetCache = { value: 0, cachedAt: Date.now(), day };
    return 0;
  }
}

/**
 * Circuit breaker global. Devuelve true si el budget diario está agotado.
 * Llamado antes de cada request al provider IA.
 */
export async function checkDailyBudget(): Promise<{ exceeded: boolean; spentUsd: number; capUsd: number }> {
  const capUsd = Number(process.env.AI_DAILY_BUDGET_USD || "50");
  const spentUsd = await getDailyBudgetSpent();
  const exceeded = spentUsd >= capUsd;
  if (exceeded) {
    captureMessage(`AI daily budget reached: USD ${spentUsd.toFixed(2)} >= cap USD ${capUsd}`, {
      tag: "rate-limit.budget",
      level: "error",
      extra: { spentUsd, capUsd },
    });
  }
  return { exceeded, spentUsd, capUsd };
}

// ─── API pública ─────────────────────────────────────────────────────

/**
 * Chequea si el caller puede usar el proxy IA. NO incrementa el contador
 * (eso lo hace `recordProxyCall` después de un éxito upstream).
 *
 * Orden de chequeo:
 *   1. proxy habilitado (TAMPU_ANTHROPIC_KEY) — si no, "disabled"
 *   2. circuit breaker global (daily budget)
 *   3. caps por tier (anonymous/auth)
 */
export async function canCallProxy(req: NextRequest, endpoint = "/api/ai-proxy"): Promise<RateLimitDecision> {
  if (!process.env.TAMPU_ANTHROPIC_KEY) {
    return {
      ok: false,
      tier: "anonymous",
      identifier: "disabled",
      endpoint,
      reason: "disabled",
      monthly: { used: 0, cap: 0 },
      daily: { used: 0, cap: 0 },
    };
  }

  // Circuit breaker GLOBAL — antes que caps individuales
  const budget = await checkDailyBudget();
  if (budget.exceeded) {
    const now = new Date();
    const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const resetIn = Math.max(60, Math.floor((tomorrow.getTime() - now.getTime()) / 1000));
    return {
      ok: false,
      tier: "anonymous",
      identifier: "circuit-breaker",
      endpoint,
      reason: "daily_budget_reached",
      resetIn,
      monthly: { used: 0, cap: 0 },
      daily: { used: 0, cap: 0 },
    };
  }

  const { identifier, tier } = await resolveIdentity(req);

  // L1 cache
  let snap = l1Cache.get(identifier);
  if (!isCacheFresh(snap)) {
    const fromSupa = await loadUsageFromSupabase(identifier);
    if (fromSupa) {
      snap = fromSupa;
      setL1(identifier, snap);
    } else if (!snap) {
      // Sin Supabase y sin cache → asumimos fresh (degradado pero seguro,
      // los caps siguen aplicando vía L1 cache durante esta sesión).
      snap = { countDay: 0, countMonth: 0, dailyBudgetUsd: 0, cachedAt: Date.now() };
      setL1(identifier, snap);
    }
  }

  const caps = CAPS[tier];

  if (snap.countMonth >= caps.month) {
    const now = new Date();
    const firstOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const resetIn = Math.max(60, Math.floor((firstOfNextMonth.getTime() - now.getTime()) / 1000));
    return {
      ok: false, tier, identifier, endpoint,
      resetIn, reason: "monthly_cap",
      monthly: { used: snap.countMonth, cap: caps.month },
      daily: { used: snap.countDay, cap: caps.day === Infinity ? -1 : caps.day },
    };
  }
  if (snap.countDay >= caps.day) {
    const now = new Date();
    const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const resetIn = Math.max(60, Math.floor((tomorrow.getTime() - now.getTime()) / 1000));
    return {
      ok: false, tier, identifier, endpoint,
      resetIn, reason: "daily_cap",
      monthly: { used: snap.countMonth, cap: caps.month },
      daily: { used: snap.countDay, cap: caps.day },
    };
  }

  return {
    ok: true, tier, identifier, endpoint,
    monthly: { used: snap.countMonth, cap: caps.month === Infinity ? -1 : caps.month },
    daily: { used: snap.countDay, cap: caps.day === Infinity ? -1 : caps.day },
  };
}

/**
 * Registra el uso después de una llamada upstream exitosa. Persiste a Supabase
 * (fuente de verdad) y bumpa el L1 cache en paralelo. Si Supabase no está,
 * sólo bumpa L1 y registra un warning una vez.
 *
 * Llamar SIEMPRE — incluso BYOK — para tener analytics + circuit breaker
 * coherente cross-tenant.
 */
export async function recordProxyCall(
  identifier: string,
  meta: {
    endpoint: string;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    provider?: "anthropic" | "gemini" | "tampu";
    model?: string;
    userId?: string | null;
  },
): Promise<void> {
  // Bump L1 inmediato (latencia 0 para la siguiente request en la misma instancia)
  const snap = l1Cache.get(identifier);
  if (snap) {
    snap.countDay += 1;
    snap.countMonth += 1;
    snap.cachedAt = Date.now();
  }
  // Bump dailyBudgetCache también — evita que un attacker burlee el circuit
  // breaker en la ventana de 5s antes del próximo refresh de Supabase
  if (dailyBudgetCache && dailyBudgetCache.day === todayKey()) {
    dailyBudgetCache.value += meta.costUsd;
  }

  const supa = createSupabaseService();
  if (!supa) return;
  try {
    // provider es NOT NULL + CHECK ('anthropic','gemini','tampu') en la DB.
    // Si el caller no lo pasa, default a 'tampu' (que ya está en la lista) para no romper.
    await supa.from("ai_proxy_usage").insert({
      device_fingerprint: identifier,
      endpoint: meta.endpoint,
      provider: meta.provider ?? "tampu",
      model: meta.model ?? null,
      user_id: meta.userId ?? null,
      tokens_in: Math.max(0, Math.floor(meta.tokensIn)),
      tokens_out: Math.max(0, Math.floor(meta.tokensOut)),
      cost_usd: Math.max(0, Number(meta.costUsd.toFixed(6))),
    });
  } catch (e) {
    captureException(e, { tag: "rate-limit.record", level: "warning", extra: { identifier, ...meta } });
  }
}

/**
 * Lectura standalone del uso (para mostrar "12/50 calls este mes" en /settings).
 */
export async function getCurrentUsage(req: NextRequest): Promise<{
  tier: RateLimitTier;
  monthly: { used: number; cap: number };
  daily: { used: number; cap: number };
  enabled: boolean;
}> {
  const enabled = Boolean(process.env.TAMPU_ANTHROPIC_KEY);
  const { identifier, tier } = await resolveIdentity(req);
  let snap = l1Cache.get(identifier);
  if (!isCacheFresh(snap)) {
    const fromSupa = await loadUsageFromSupabase(identifier);
    if (fromSupa) {
      snap = fromSupa;
      setL1(identifier, snap);
    }
  }
  snap ??= { countDay: 0, countMonth: 0, dailyBudgetUsd: 0, cachedAt: Date.now() };
  const caps = CAPS[tier];
  return {
    tier,
    enabled,
    monthly: { used: snap.countMonth, cap: caps.month === Infinity ? -1 : caps.month },
    daily: { used: snap.countDay, cap: caps.day === Infinity ? -1 : caps.day },
  };
}

/** Para tests: limpia el store en memoria (L1 cache + budget cache). */
export function _resetRateLimitStore(): void {
  l1Cache.clear();
  dailyBudgetCache = null;
}

/**
 * Pricing por modelo (USD por millón de tokens). Mayo 2026.
 * Keys: el `model` concreto que devuelve el provider (NO el alias "haiku"/"sonnet").
 * Fallback: si el modelo no está en la tabla, asumimos Haiku (más barato → conservador
 * para budget, pero NO subestimamos masivamente en caso de error).
 */
const PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  // Gemini
  "gemini-2.0-flash": { input: 0.075, output: 0.3 },
  // Tampu proxy (defaultea a Haiku — el modelo real lo elige el endpoint)
  "tampu": { input: 1, output: 5 },
};

/**
 * Helper compartido para estimar costo USD de una call. Acepta:
 *  - `model` string concreto (preferido): "claude-haiku-4-5", "claude-sonnet-4-5",
 *    "gemini-2.0-flash". Lookup directo en PRICING.
 *  - Alias legacy "haiku"/"sonnet" (compat con callers viejos): mapean a Anthropic.
 *
 * Devuelve USD totales (NO por millón). Ejemplo: 1000 tokens in con haiku
 * = 1000 * (1 / 1_000_000) = USD 0.001.
 */
export function estimateCostUsd(
  tokensIn: number,
  tokensOut: number,
  model: string = "haiku",
): number {
  // Compat con callers que todavía pasan los alias.
  const concreteModel = model === "haiku"
    ? "claude-haiku-4-5"
    : model === "sonnet"
      ? "claude-sonnet-4-5"
      : model;
  const price = PRICING[concreteModel] ?? PRICING["claude-haiku-4-5"];
  // PRICING está en USD / 1M tokens → dividir entre 1_000_000.
  return (tokensIn * price.input + tokensOut * price.output) / 1_000_000;
}
