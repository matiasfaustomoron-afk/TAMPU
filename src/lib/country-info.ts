"use client";

// ─── Country info via REST Countries ───
// Free, no key, CORS friendly. Returns currency / language / capital / region.

const CACHE_PREFIX = "travel-os-country:";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface CountryInfo {
  name: string;
  flag: string;          // emoji
  capital: string;
  region: string;
  currencies: { code: string; name: string; symbol?: string }[];
  languages: string[];
  population: number;
  area: number;
  timezones: string[];
  drives_on: "right" | "left" | "unknown";
}

interface RawCountry {
  name?: { common: string };
  flag?: string;
  capital?: string[];
  region?: string;
  currencies?: Record<string, { name: string; symbol?: string }>;
  languages?: Record<string, string>;
  population?: number;
  area?: number;
  timezones?: string[];
  car?: { side?: "right" | "left" };
}

interface Cached { expires_at: number; data: CountryInfo }

function cacheKey(name: string): string { return CACHE_PREFIX + name.toLowerCase().trim(); }

function readCache(name: string): CountryInfo | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(name));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (Date.now() > parsed.expires_at) {
      localStorage.removeItem(cacheKey(name));
      return null;
    }
    return parsed.data;
  } catch { return null; }
}

function writeCache(name: string, data: CountryInfo): void {
  if (typeof localStorage === "undefined") return;
  try {
    const entry: Cached = { expires_at: Date.now() + CACHE_TTL_MS, data };
    localStorage.setItem(cacheKey(name), JSON.stringify(entry));
  } catch { /* quota */ }
}

export async function fetchCountryInfo(countryName: string): Promise<CountryInfo | null> {
  const cached = readCache(countryName);
  if (cached) return cached;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  try {
    const url = `https://restcountries.com/v3.1/name/${encodeURIComponent(countryName)}?fields=name,flag,capital,region,currencies,languages,population,area,timezones,car`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const arr = await res.json() as RawCountry[];
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const c = arr[0];
    const info: CountryInfo = {
      name: c.name?.common || countryName,
      flag: c.flag || "🌍",
      capital: c.capital?.[0] || "—",
      region: c.region || "—",
      currencies: c.currencies
        ? Object.entries(c.currencies).map(([code, v]) => ({ code, name: v.name, symbol: v.symbol }))
        : [],
      languages: c.languages ? Object.values(c.languages) : [],
      population: c.population || 0,
      area: c.area || 0,
      timezones: c.timezones || [],
      drives_on: c.car?.side === "right" || c.car?.side === "left" ? c.car.side : "unknown",
    };
    writeCache(countryName, info);
    return info;
  } catch { return null; }
}
