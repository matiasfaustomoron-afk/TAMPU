"use client";

import { lookupAirport, type AirportBasic } from "@/lib/config/airports-data";
import { findAirportByIATA, type AirportInfo } from "@/lib/config/airports";
import { withApiKeyHeaders, hasUserApiKey } from "@/lib/ai/user-key";

// ─── Live airport info ───
// Strategy:
//   1. Curated (5 hand-tuned hubs) — instant, no network.
//   2. localStorage cache (Claude-generated within last 7 days).
//   3. Live call to Claude through /api/airport-info using the user's
//      Anthropic key (passed via x-anthropic-key header).
//   4. Without a key: a basic skeleton + UI tells the user how to enable AI.
//
// NO hardcoded "quick info" anywhere. Every airport outside the 5 curated
// is a fresh Claude call (cached for 7 days afterwards).

const CACHE_PREFIX = "travel-os-airport-info:";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedEntry {
  expires_at: number;
  info: AirportInfo;
}

function readCache(iata: string): AirportInfo | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + iata);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry;
    if (Date.now() > parsed.expires_at) {
      localStorage.removeItem(CACHE_PREFIX + iata);
      return null;
    }
    return parsed.info;
  } catch {
    return null;
  }
}

function writeCache(iata: string, info: AirportInfo): void {
  if (typeof localStorage === "undefined") return;
  try {
    const entry: CachedEntry = { expires_at: Date.now() + CACHE_TTL_MS, info };
    localStorage.setItem(CACHE_PREFIX + iata, JSON.stringify(entry));
  } catch { /* localStorage quota — ignore */ }
}

export interface AirportInfoResult {
  info: AirportInfo | null;
  source: "curated" | "cache" | "ai-live" | "no-key" | "unknown";
}

export async function getAirportInfoSourced(iata: string): Promise<AirportInfoResult> {
  iata = iata.toUpperCase();

  // 1. Curated (richest)
  const curated = findAirportByIATA(iata);
  if (curated) return { info: curated, source: "curated" };

  // 2. Cache
  const cached = readCache(iata);
  if (cached) return { info: cached, source: "cache" };

  // 3. Coordinates from dataset
  const basic = lookupAirport(iata);
  if (!basic) return { info: null, source: "unknown" };

  // 4. If no user key, return basic skeleton with a flag
  if (!hasUserApiKey()) {
    return {
      info: {
        iata: basic.iata, name: basic.name, city: basic.city, country: basic.country,
        lat: basic.lat, lng: basic.lng,
        terminals: [], food: [], currency_exchange: [], lounges: [], transport_to_city: [], tips: [],
        emergency: null,
      },
      source: "no-key",
    };
  }

  // 5. Live call to Claude
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || "";
    const res = await fetch(`${base}/api/airport-info`, {
      method: "POST",
      headers: withApiKeyHeaders(),
      body: JSON.stringify({ iata, name: basic.name, city: basic.city, country: basic.country }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const generated = await res.json() as {
      iata: string; generated: boolean; source: string;
      terminals: AirportInfo["terminals"]; food: AirportInfo["food"];
      currency_exchange: AirportInfo["currency_exchange"]; lounges: AirportInfo["lounges"];
      transport_to_city: AirportInfo["transport_to_city"]; tips: string[];
    };
    const info: AirportInfo = {
      iata: basic.iata, name: basic.name, city: basic.city, country: basic.country,
      lat: basic.lat, lng: basic.lng,
      terminals: generated.terminals,
      food: generated.food,
      currency_exchange: generated.currency_exchange,
      lounges: generated.lounges,
      transport_to_city: generated.transport_to_city,
      tips: generated.tips,
      emergency: null,
    };
    if (generated.generated) writeCache(iata, info);
    return { info, source: "ai-live" };
  } catch {
    return {
      info: {
        iata: basic.iata, name: basic.name, city: basic.city, country: basic.country,
        lat: basic.lat, lng: basic.lng,
        terminals: [], food: [], currency_exchange: [], lounges: [], transport_to_city: [], tips: [],
        emergency: null,
      },
      source: "unknown",
    };
  }
}

/** Convenience: returns just AirportInfo or null. */
export async function getAirportInfo(iata: string): Promise<AirportInfo | null> {
  const r = await getAirportInfoSourced(iata);
  return r.info;
}

export function airportBasicLookup(iata: string): AirportBasic | null {
  return lookupAirport(iata);
}
