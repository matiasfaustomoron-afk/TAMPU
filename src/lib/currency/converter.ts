"use client";

/**
 * Currency converter — structured wrapper on top of the legacy `lib/currency-rates.ts`.
 *
 * Adds:
 *   - Single-shot getRate(from, to) public API (returns number).
 *   - Offline fallback table (mayo 2026 reference rates) used when API + cache
 *     both fail (airplane mode, ad blocker, regional firewall).
 *   - 24h hard cache (longer than the live module's 6h "soft" cache) for the
 *     offline fallback — ensures we always have a recent local copy.
 *   - ARS dual rate (official + blue) since Argentina runs an unofficial parallel
 *     market that's the *real* tourist rate.
 *
 * Provider note: frankfurter.app (ECB-backed) doesn't carry ARS, so we keep
 * exchangerate.host as the primary, mirroring what `currency-rates.ts` already does.
 */

import { useEffect, useState } from "react";
import { getRates, convert as convertLive } from "@/lib/currency-rates";

const HARD_CACHE_KEY = "travel-os-fx-hard";
const HARD_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Reference rates (1 USD = X). Updated manually each release. Used only when both
 * live API and 6h soft cache are unavailable. Better to show a stale rate than nothing.
 *
 * Last refresh: mayo 2026 (ARS blue tracks via dolarito/bluelytics ballpark;
 * VES tracks paralelo via monitordolar/dolartoday ballpark, no el oficial BCV).
 */
export const OFFLINE_USD_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 152,
  KRW: 1370,
  ARS: 1180,        // official (BCRA reference)
  ARS_BLUE: 1320,   // blue dollar — parallel market
  BRL: 5.05,
  AED: 3.67,
  PHP: 56.5,
  PGK: 3.95,
  CLP: 940,
  COP: 4080,
  MXN: 17.2,
  PEN: 3.75,
  // ─── LatAm extra (mayo 2026) — agregadas en QW10
  UYU: 40,          // Peso Uruguayo (BCU referencia)
  PYG: 7400,        // Guaraní Paraguayo (BCP referencia)
  BOB: 6.9,         // Boliviano (paralelo + oficial convergen en este rango)
  VES: 36,          // Bolívar Soberano — TASA PARALELA (no el oficial BCV, mucho más cercano al cash real)
};

interface HardCache {
  rates: Record<string, number>;  // USD-relative
  fetched_at: number;
}

function readHardCache(): HardCache | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(HARD_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as HardCache;
    if (Date.now() - c.fetched_at > HARD_CACHE_TTL_MS) return null;
    return c;
  } catch { return null; }
}

function writeHardCache(rates: Record<string, number>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(HARD_CACHE_KEY, JSON.stringify({ rates, fetched_at: Date.now() }));
  } catch { /* quota */ }
}

/**
 * Get exchange rate. 1 unit of `from` = N units of `to`.
 * Returns `null` if no source has data (extremely rare — offline fallback covers most ccy).
 */
export async function getRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1;

  // Try live + soft cache via the legacy helper
  const live = await convertLive(1, from, to);
  if (live) {
    // mirror to hard cache for offline next time
    const all = await getRates();
    if (all?.rates) writeHardCache(all.rates);
    return live.rate;
  }

  // Fall back to hard 24h cache
  const hard = readHardCache();
  if (hard) {
    const f = from === "USD" ? 1 : hard.rates[from];
    const t = to === "USD" ? 1 : hard.rates[to];
    if (f && t) return t / f;
  }

  // Last resort: hardcoded offline table
  const f = from === "USD" ? 1 : OFFLINE_USD_RATES[from];
  const t = to === "USD" ? 1 : OFFLINE_USD_RATES[to];
  if (f && t) return t / f;
  return null;
}

/**
 * Convert N units of `from` to `to`. Same fallback chain as getRate().
 */
export async function convertCurrency(amount: number, from: string, to: string): Promise<number | null> {
  const rate = await getRate(from, to);
  if (rate === null) return null;
  return amount * rate;
}

/**
 * React hook — convenient component-level access. Re-fetches when from/to change.
 *
 * Returns:
 *   - rate: current 1:1 rate (null while loading or unavailable)
 *   - source: "live" | "offline" — to optionally show a "tipo aproximado" hint
 *   - loading: while first fetch is in flight
 */
export function useExchangeRate(from: string, to: string): {
  rate: number | null;
  source: "live" | "offline" | null;
  loading: boolean;
} {
  const [state, setState] = useState<{ rate: number | null; source: "live" | "offline" | null; loading: boolean }>({
    rate: from === to ? 1 : null,
    source: from === to ? "live" : null,
    loading: from !== to,
  });

  useEffect(() => {
    if (from === to) {
      setState({ rate: 1, source: "live", loading: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      const live = await convertLive(1, from, to);
      if (cancelled) return;
      if (live) {
        setState({ rate: live.rate, source: "live", loading: false });
        const all = await getRates();
        if (all?.rates) writeHardCache(all.rates);
        return;
      }
      const hard = readHardCache();
      if (hard) {
        const f = from === "USD" ? 1 : hard.rates[from];
        const t = to === "USD" ? 1 : hard.rates[to];
        if (f && t) {
          if (!cancelled) setState({ rate: t / f, source: "live", loading: false });
          return;
        }
      }
      const f = from === "USD" ? 1 : OFFLINE_USD_RATES[from];
      const t = to === "USD" ? 1 : OFFLINE_USD_RATES[to];
      if (f && t) {
        if (!cancelled) setState({ rate: t / f, source: "offline", loading: false });
        return;
      }
      if (!cancelled) setState({ rate: null, source: null, loading: false });
    })();
    return () => { cancelled = true; };
  }, [from, to]);

  return state;
}

/**
 * Argentina-specific helper — returns both official and blue rates for 1 unit of `from`.
 * Useful when the user paid in cash USD (which usually got blue rate) vs card (official + tax).
 */
export function useArsRates(from: string = "USD"): {
  official: number | null;
  blue: number | null;
  loading: boolean;
} {
  const { rate: official, loading: l1 } = useExchangeRate(from, "ARS");
  const [blue, setBlue] = useState<number | null>(null);

  useEffect(() => {
    // Blue rate is offline-only (no free API tracks it reliably from outside .ar).
    // We approximate via OFFLINE_USD_RATES.ARS_BLUE × usd-to-from inverse.
    const usdToFrom = from === "USD" ? 1 : OFFLINE_USD_RATES[from];
    if (!usdToFrom) { setBlue(null); return; }
    setBlue(OFFLINE_USD_RATES.ARS_BLUE / usdToFrom);
  }, [from]);

  return { official, blue, loading: l1 };
}
