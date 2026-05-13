"use client";

// ─── Live currency rates ───
// Free, no key, CORS-friendly. exchangerate.host is the standard free FX API.
// Cached 6 hours in localStorage so we don't hammer the endpoint on every expense.

const CACHE_KEY = "travel-os-fx-rates";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

interface CachedRates {
  base: string;
  rates: Record<string, number>;
  fetched_at: number;
}

let inflight: Promise<CachedRates | null> | null = null;

async function fetchUSDRates(): Promise<CachedRates | null> {
  try {
    // exchangerate.host returns rates relative to base (USD)
    const url = "https://api.exchangerate.host/latest?base=USD";
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json() as { rates?: Record<string, number> };
    if (!data.rates) return null;
    return { base: "USD", rates: data.rates, fetched_at: Date.now() };
  } catch { return null; }
}

export async function getRates(): Promise<CachedRates | null> {
  if (typeof localStorage === "undefined") return null;
  // Cache check
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as CachedRates;
      if (Date.now() - cached.fetched_at < CACHE_TTL_MS) return cached;
    }
  } catch { /* fall through */ }
  // Single inflight request to dedupe
  if (inflight) return inflight;
  inflight = (async () => {
    const fresh = await fetchUSDRates();
    if (fresh) localStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
    inflight = null;
    return fresh;
  })();
  return inflight;
}

/** Convert N units of `from` currency to `to` using cached USD rates. */
export async function convert(amount: number, from: string, to: string): Promise<{ value: number; rate: number } | null> {
  if (from === to) return { value: amount, rate: 1 };
  const r = await getRates();
  if (!r) return null;
  const fromRate = from === r.base ? 1 : r.rates[from];
  const toRate = to === r.base ? 1 : r.rates[to];
  if (!fromRate || !toRate) return null;
  // amount[from] -> USD -> to
  const usd = amount / fromRate;
  const value = usd * toRate;
  // exchange_rate stored on Expense is "1 unit of base in original units"
  // i.e. base_amount = original_amount / exchange_rate when expressed correctly.
  // We use rate = (1 from) in (to). So to=USD/from=EUR -> rate = 1.08 (1 EUR = 1.08 USD).
  const rate = toRate / fromRate;
  return { value, rate };
}
