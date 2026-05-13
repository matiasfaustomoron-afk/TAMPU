// ─── Rate limiter para el proxy IA de Tampu ───
//
// MVP sin Redis ni Upstash:
//   - Storage primario: in-memory LRU `Map<identifier, RateBucket>`.
//     Single-instance Vercel — se resetea en cold start. Aceptable en MVP
//     porque los caps son generosos (50/mes) y los cold starts no son
//     suficientemente frecuentes para que un user lo explote.
//   - Storage secundario (opcional): tabla Supabase `ai_proxy_usage`
//     (migration 00022, todavía no aplicada — graceful degrade si no existe).
//
// Identifier:
//   - User auth (Supabase): `user:<uuid>` — cuenta unique por usuario logueado.
//   - Anonymous: `ip:<sha256(ip + salt)>` — hash para no loguear IPs raw.
//
// Decisión de policy: ver PROXY-DESIGN.md sección "Rate limit policy".

import type { NextRequest } from "next/server";
import { createHash } from "crypto";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseService } from "@/lib/supabase/service";

// ─── Tipos ───────────────────────────────────────────────────────────

export type RateLimitTier = "anonymous" | "auth" | "byok" | "pro";

export interface RateLimitDecision {
  /** Si el caller puede proceder con la llamada IA. */
  ok: boolean;
  /** Tier que aplicó (para logging). */
  tier: RateLimitTier;
  /** Identifier opaco (para debugging). */
  identifier: string;
  /** Si !ok: segundos hasta poder reintentar. */
  resetIn?: number;
  /** Si !ok: motivo legible para el client. */
  reason?: "daily_cap" | "monthly_cap" | "disabled";
  /** Uso actual del mes (para UI "12/50 calls"). */
  monthly: { used: number; cap: number };
  /** Uso del día (para feedback inmediato). */
  daily: { used: number; cap: number };
}

interface RateBucket {
  /** Calls hoy (UTC). */
  countDay: number;
  /** Calls en el mes calendario (UTC). */
  countMonth: number;
  /** ISO date `YYYY-MM-DD` del último reset diario. */
  dayKey: string;
  /** ISO `YYYY-MM` del último reset mensual. */
  monthKey: string;
}

// ─── Caps por tier ───────────────────────────────────────────────────

const CAPS = {
  anonymous: { day: 20, month: 100 },
  auth:      { day: 50, month: 50 }, // 50/mes total — el day cap también es 50 para no abrir backdoor
  byok:      { day: Infinity, month: Infinity },
  pro:       { day: Infinity, month: Infinity },
} as const;

// ─── In-memory store ─────────────────────────────────────────────────

const MAX_ENTRIES = 5000; // LRU cap — más allá vamos descartando los más viejos
const store = new Map<string, RateBucket>();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}
function monthKey(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM UTC
}

function getBucket(identifier: string): RateBucket {
  const day = todayKey();
  const month = monthKey();
  const existing = store.get(identifier);
  if (existing) {
    // Reset daily si cambió el día
    if (existing.dayKey !== day) { existing.countDay = 0; existing.dayKey = day; }
    if (existing.monthKey !== month) { existing.countMonth = 0; existing.monthKey = month; }
    // Touch (LRU): re-insert para que quede al final
    store.delete(identifier);
    store.set(identifier, existing);
    return existing;
  }
  // Crear nuevo + evict si pasamos el límite
  if (store.size >= MAX_ENTRIES) {
    const firstKey = store.keys().next().value;
    if (firstKey) store.delete(firstKey);
  }
  const fresh: RateBucket = { countDay: 0, countMonth: 0, dayKey: day, monthKey: month };
  store.set(identifier, fresh);
  return fresh;
}

// ─── Identifier resolution ───────────────────────────────────────────

const IP_SALT = process.env.AI_PROXY_IP_SALT || "tampu-default-salt-change-me";

function hashIp(ip: string): string {
  return createHash("sha256").update(ip + IP_SALT).digest("hex").slice(0, 16);
}

function getClientIp(req: NextRequest): string {
  // Vercel sets x-forwarded-for. Tomamos el primer hop (cliente real).
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

/**
 * Resuelve el identifier + tier del request:
 *   - Si hay user Supabase logueado → `user:<uuid>` tier `auth` (o `pro` si suscripción activa).
 *   - Si no → `ip:<hash>` tier `anonymous`.
 */
async function resolveIdentity(req: NextRequest): Promise<{ identifier: string; tier: RateLimitTier }> {
  // Intentar leer user de Supabase (cookies)
  try {
    const supa = await createSupabaseServer();
    if (supa) {
      const { data } = await supa.auth.getUser();
      if (data?.user) {
        // TODO Stripe: chequear `profiles.subscription_tier === "pro"` y devolver tier "pro"
        return { identifier: `user:${data.user.id}`, tier: "auth" };
      }
    }
  } catch {
    // Supabase no configurado o cookies invalidas — caemos a IP
  }
  const ip = getClientIp(req);
  return { identifier: `ip:${hashIp(ip)}`, tier: "anonymous" };
}

// ─── Supabase persistence (opcional, graceful) ───────────────────────
//
// Tabla esperada (migration TODO):
//   create table ai_proxy_usage (
//     identifier text primary key,
//     count_day int not null default 0,
//     count_month int not null default 0,
//     day_key text not null,
//     month_key text not null,
//     updated_at timestamptz default now()
//   );
//
// Si la tabla no existe, todas las llamadas devuelven `null` y caemos
// al in-memory store.

async function loadFromSupabase(identifier: string): Promise<RateBucket | null> {
  const supa = createSupabaseService();
  if (!supa) return null;
  try {
    const { data, error } = await supa
      .from("ai_proxy_usage")
      .select("count_day, count_month, day_key, month_key")
      .eq("identifier", identifier)
      .maybeSingle();
    if (error || !data) return null;
    return {
      countDay: data.count_day as number,
      countMonth: data.count_month as number,
      dayKey: data.day_key as string,
      monthKey: data.month_key as string,
    };
  } catch {
    return null;
  }
}

async function persistToSupabase(identifier: string, bucket: RateBucket): Promise<void> {
  const supa = createSupabaseService();
  if (!supa) return;
  try {
    await supa
      .from("ai_proxy_usage")
      .upsert({
        identifier,
        count_day: bucket.countDay,
        count_month: bucket.countMonth,
        day_key: bucket.dayKey,
        month_key: bucket.monthKey,
        updated_at: new Date().toISOString(),
      });
  } catch {
    // tabla no existe o error de red — ignoramos, el in-memory ya es la fuente de verdad
  }
}

// ─── API pública ─────────────────────────────────────────────────────

/**
 * Chequea si el caller puede usar el proxy IA. NO incrementa el contador.
 * Para incrementar (after a successful call), usar `recordProxyCall()`.
 */
export async function canCallProxy(req: NextRequest): Promise<RateLimitDecision> {
  // Si TAMPU_ANTHROPIC_KEY no está configurada, el proxy está deshabilitado entirely.
  if (!process.env.TAMPU_ANTHROPIC_KEY) {
    return {
      ok: false,
      tier: "anonymous",
      identifier: "disabled",
      reason: "disabled",
      monthly: { used: 0, cap: 0 },
      daily: { used: 0, cap: 0 },
    };
  }

  const { identifier, tier } = await resolveIdentity(req);

  // Hidratar desde Supabase si está disponible (sync con otras instances)
  const persisted = await loadFromSupabase(identifier);
  if (persisted) {
    const cur = todayKey(), mon = monthKey();
    if (persisted.dayKey !== cur) { persisted.countDay = 0; persisted.dayKey = cur; }
    if (persisted.monthKey !== mon) { persisted.countMonth = 0; persisted.monthKey = mon; }
    store.set(identifier, persisted);
  }

  const bucket = getBucket(identifier);
  const caps = CAPS[tier];

  if (bucket.countMonth >= caps.month) {
    // Reset al inicio del mes próximo
    const now = new Date();
    const firstOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const resetIn = Math.max(60, Math.floor((firstOfNextMonth.getTime() - now.getTime()) / 1000));
    return {
      ok: false, tier, identifier,
      resetIn, reason: "monthly_cap",
      monthly: { used: bucket.countMonth, cap: caps.month },
      daily: { used: bucket.countDay, cap: caps.day === Infinity ? -1 : caps.day },
    };
  }
  if (bucket.countDay >= caps.day) {
    // Reset a medianoche UTC
    const now = new Date();
    const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const resetIn = Math.max(60, Math.floor((tomorrow.getTime() - now.getTime()) / 1000));
    return {
      ok: false, tier, identifier,
      resetIn, reason: "daily_cap",
      monthly: { used: bucket.countMonth, cap: caps.month },
      daily: { used: bucket.countDay, cap: caps.day },
    };
  }

  return {
    ok: true, tier, identifier,
    monthly: { used: bucket.countMonth, cap: caps.month === Infinity ? -1 : caps.month },
    daily: { used: bucket.countDay, cap: caps.day === Infinity ? -1 : caps.day },
  };
}

/**
 * Incrementa contadores después de una llamada exitosa al provider IA.
 * No-op si el tier es unlimited (byok/pro) — esos no pasan por el proxy.
 */
export async function recordProxyCall(identifier: string): Promise<void> {
  const bucket = getBucket(identifier);
  bucket.countDay += 1;
  bucket.countMonth += 1;
  // Fire-and-forget persistencia. Si Supabase no está, no-op.
  void persistToSupabase(identifier, bucket);
}

/**
 * Lectura standalone del uso (para mostrar "12/50 calls este mes" en /settings).
 * No requiere request — toma user/IP del contexto Supabase si existe.
 */
export async function getCurrentUsage(req: NextRequest): Promise<{
  tier: RateLimitTier;
  monthly: { used: number; cap: number };
  daily: { used: number; cap: number };
  enabled: boolean;
}> {
  const enabled = Boolean(process.env.TAMPU_ANTHROPIC_KEY);
  const { identifier, tier } = await resolveIdentity(req);
  const persisted = await loadFromSupabase(identifier);
  if (persisted) store.set(identifier, persisted);
  const bucket = getBucket(identifier);
  const caps = CAPS[tier];
  return {
    tier,
    enabled,
    monthly: { used: bucket.countMonth, cap: caps.month === Infinity ? -1 : caps.month },
    daily: { used: bucket.countDay, cap: caps.day === Infinity ? -1 : caps.day },
  };
}

/** Para tests: limpia el store en memoria. */
export function _resetRateLimitStore(): void {
  store.clear();
}
