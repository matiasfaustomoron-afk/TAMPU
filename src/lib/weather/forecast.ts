"use client";

/**
 * Weather forecast — structured wrapper on top of legacy `lib/weather-client.ts`.
 *
 * Adds:
 *   - getForecast(destination, dates) → returns only days inside the trip range.
 *   - Detection helpers for "weather warning days" (rain >70%, temps extremes).
 *   - 6h cache (delegated to weather-client which already does 3h; we just expose
 *     a thin facade so the integration in alert-engine stays clean).
 *
 * Provider: Open-Meteo (free, no key, CORS-friendly). 14-day rolling forecast.
 */

import { fetchWeather, type DailyForecast } from "@/lib/weather-client";

export type { DailyForecast } from "@/lib/weather-client";

export interface WeatherWarning {
  date: string;
  kind: "rain" | "heat" | "cold" | "storm" | "uv_extreme" | "aqi_poor" | "tropical_storm";
  message: string;
  severity: "warning" | "critical";
  precip_prob: number;
  temp_max: number;
  temp_min: number;
  /** Solo para uv_extreme — el índice UV del día. */
  uv_index?: number;
  /** Solo para aqi_poor — índice europeo (0-100+). */
  aqi?: number;
}

// ─── QW9: UV + AQI + Tropical storm ────────────────────────────────────────

export type AQICategory = "good" | "fair" | "moderate" | "poor" | "very_poor";

export interface AirQualityDay {
  date: string;
  /** European AQI scale 0-100+ — 0=good, 100+=very poor */
  aqi: number;
  category: AQICategory;
  pm25: number;
}

function aqiCategory(aqi: number): AQICategory {
  if (aqi <= 20) return "good";
  if (aqi <= 40) return "fair";
  if (aqi <= 60) return "moderate";
  if (aqi <= 80) return "poor";
  return "very_poor";
}

/**
 * Fetch air quality desde Open-Meteo air-quality API.
 * No requiere key. Cache implícita a través de la red del navegador (HTTP cache + 6h staleness).
 */
export async function getAirQuality(
  lat: number, lng: number, startDate: string, endDate: string
): Promise<AirQualityDay[]> {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&daily=european_aqi,pm2_5&start_date=${startDate}&end_date=${endDate}&timezone=auto`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json() as {
      daily?: { time: string[]; european_aqi: number[]; pm2_5: number[] };
    };
    if (!data.daily?.time) return [];
    return data.daily.time.map((date, i) => {
      const aqi = data.daily!.european_aqi[i] ?? 0;
      const pm25 = data.daily!.pm2_5[i] ?? 0;
      return { date, aqi, pm25, category: aqiCategory(aqi) };
    });
  } catch { return []; }
}

/** Tropical storm zone: latitudes entre -30 y +30 (tropics). */
export function isTropicalZone(lat: number | null | undefined): boolean {
  if (lat === null || lat === undefined) return false;
  return lat >= -30 && lat <= 30;
}

/** Detecta tropical storm: zona tropical + WMO code >= 95 (severe thunderstorm). */
export function detectTropicalStorm(
  forecast: DailyForecast[], lat: number | null | undefined
): WeatherWarning[] {
  if (!isTropicalZone(lat)) return [];
  return forecast
    .filter(d => d.code >= 95)
    .map(d => ({
      date: d.date,
      kind: "tropical_storm" as const,
      message: `Tormenta tropical pronosticada (${d.label})`,
      severity: "critical" as const,
      precip_prob: d.precip_prob,
      temp_max: d.temp_max,
      temp_min: d.temp_min,
    }));
}

/** Detecta UV extremo (índice >= 8 = muy alto, >= 11 = extremo). */
export function detectUVExtreme(
  forecast: Array<DailyForecast & { uv_index_max?: number }>
): WeatherWarning[] {
  return forecast
    .filter(d => (d.uv_index_max ?? 0) >= 8)
    .map(d => ({
      date: d.date,
      kind: "uv_extreme" as const,
      message: `UV ${d.uv_index_max! >= 11 ? "extremo" : "muy alto"}: ${d.uv_index_max}. Usá protector +50.`,
      severity: (d.uv_index_max! >= 11 ? "critical" : "warning") as "critical" | "warning",
      precip_prob: d.precip_prob,
      temp_max: d.temp_max,
      temp_min: d.temp_min,
      uv_index: d.uv_index_max,
    }));
}

/** Detecta AQI pobre (≥61 = poor, ≥81 = very poor). */
export function detectAQIWarnings(aqDays: AirQualityDay[], forecast: DailyForecast[]): WeatherWarning[] {
  const byDate = new Map(forecast.map(f => [f.date, f]));
  return aqDays
    .filter(a => a.aqi >= 61)
    .map(a => {
      const f = byDate.get(a.date);
      return {
        date: a.date,
        kind: "aqi_poor" as const,
        message: `Calidad de aire ${a.category === "very_poor" ? "muy mala" : "mala"} (AQI ${a.aqi})`,
        severity: (a.aqi >= 81 ? "critical" : "warning") as "critical" | "warning",
        precip_prob: f?.precip_prob ?? 0,
        temp_max: f?.temp_max ?? 0,
        temp_min: f?.temp_min ?? 0,
        aqi: a.aqi,
      };
    });
}

/**
 * Get daily forecast restricted to a date range. Empty if API unavailable.
 * Open-Meteo returns max 14 days, so out-of-range trip days won't appear.
 */
export async function getForecast(
  destination: string,
  startDate: string,
  endDate: string,
): Promise<DailyForecast[]> {
  const data = await fetchWeather(destination);
  if (!data) return [];
  return data.daily.filter((d) => d.date >= startDate && d.date <= endDate);
}

/**
 * Convert raw forecast into weather warnings.
 *
 * Heuristics (mayo 2026, calibrated for Tampu users who travel to a mix of climates):
 *   - rain: precip_prob >= 70 → warning, >= 90 → critical
 *   - heat: temp_max >= 35°C → warning, >= 40°C → critical
 *   - cold: temp_min <= -5°C → warning, <= -15°C → critical
 *   - storm: WMO code >= 95 → always critical
 */
export function detectWarnings(forecast: DailyForecast[]): WeatherWarning[] {
  const out: WeatherWarning[] = [];
  for (const d of forecast) {
    if (d.code >= 95) {
      out.push({
        date: d.date,
        kind: "storm",
        message: `Tormenta pronosticada (${d.label})`,
        severity: "critical",
        precip_prob: d.precip_prob,
        temp_max: d.temp_max,
        temp_min: d.temp_min,
      });
      continue;
    }
    if (d.precip_prob >= 70) {
      out.push({
        date: d.date,
        kind: "rain",
        message: `${d.precip_prob}% de probabilidad de lluvia`,
        severity: d.precip_prob >= 90 ? "critical" : "warning",
        precip_prob: d.precip_prob,
        temp_max: d.temp_max,
        temp_min: d.temp_min,
      });
      continue;
    }
    if (d.temp_max >= 35) {
      out.push({
        date: d.date,
        kind: "heat",
        message: `Calor extremo: ${d.temp_max}°C`,
        severity: d.temp_max >= 40 ? "critical" : "warning",
        precip_prob: d.precip_prob,
        temp_max: d.temp_max,
        temp_min: d.temp_min,
      });
      continue;
    }
    if (d.temp_min <= -5) {
      out.push({
        date: d.date,
        kind: "cold",
        message: `Frío extremo: ${d.temp_min}°C`,
        severity: d.temp_min <= -15 ? "critical" : "warning",
        precip_prob: d.precip_prob,
        temp_max: d.temp_max,
        temp_min: d.temp_min,
      });
    }
  }
  return out;
}

/**
 * One-shot helper for alert-engine and widgets: fetch + analyze + return warnings only.
 * Safe to call from any client component; returns [] if anything fails.
 */
export async function getWeatherWarnings(
  destination: string,
  startDate: string,
  endDate: string,
): Promise<WeatherWarning[]> {
  try {
    const forecast = await getForecast(destination, startDate, endDate);
    return detectWarnings(forecast);
  } catch {
    return [];
  }
}
