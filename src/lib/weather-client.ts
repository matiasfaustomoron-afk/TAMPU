"use client";

// ─── Weather forecast via Open-Meteo ───
// FREE, no API key, CORS-friendly, 16-day forecast.
// We geocode the destination (Nominatim cache or new call) then fetch the daily forecast.

const CACHE_PREFIX = "travel-os-weather:";
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3h — weather changes during day

export interface DailyForecast {
  date: string;             // YYYY-MM-DD
  temp_max: number;
  temp_min: number;
  precip_mm: number;
  precip_prob: number;      // 0-100
  uv_index_max: number;
  code: number;             // WMO weather code
  emoji: string;
  label: string;
}

export interface WeatherResponse {
  destination: string;
  lat: number;
  lon: number;
  daily: DailyForecast[];
  generated_at: string;
}

interface Cached { expires_at: number; data: WeatherResponse }

const cacheKey = (d: string) => CACHE_PREFIX + d.toLowerCase().trim();

function readCache(destination: string): WeatherResponse | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(destination));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (Date.now() > parsed.expires_at) {
      localStorage.removeItem(cacheKey(destination));
      return null;
    }
    return parsed.data;
  } catch { return null; }
}

function writeCache(destination: string, data: WeatherResponse): void {
  if (typeof localStorage === "undefined") return;
  try {
    const entry: Cached = { expires_at: Date.now() + CACHE_TTL_MS, data };
    localStorage.setItem(cacheKey(destination), JSON.stringify(entry));
  } catch { /* quota */ }
}

// WMO weather interpretation codes — https://open-meteo.com/en/docs
function codeToVisual(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: "☀️", label: "Despejado" };
  if (code <= 2) return { emoji: "🌤️", label: "Parcial nuboso" };
  if (code <= 3) return { emoji: "☁️", label: "Nuboso" };
  if (code >= 45 && code <= 48) return { emoji: "🌫️", label: "Niebla" };
  if (code >= 51 && code <= 57) return { emoji: "🌦️", label: "Lloviznas" };
  if (code >= 61 && code <= 67) return { emoji: "🌧️", label: "Lluvia" };
  if (code >= 71 && code <= 77) return { emoji: "❄️", label: "Nieve" };
  if (code >= 80 && code <= 82) return { emoji: "🌧️", label: "Chubascos" };
  if (code >= 85 && code <= 86) return { emoji: "🌨️", label: "Nevadas" };
  if (code >= 95) return { emoji: "⛈️", label: "Tormenta" };
  return { emoji: "🌡️", label: "Variable" };
}

async function geocode(query: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json() as Array<{ lat: string; lon: string }>;
    if (!data?.length) return null;
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  } catch { return null; }
}

interface OpenMeteoResp {
  daily?: {
    time: string[];
    weathercode: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max: number[];
    uv_index_max: number[];
  };
}

export async function fetchWeather(destination: string): Promise<WeatherResponse | null> {
  const cached = readCache(destination);
  if (cached) return cached;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;

  const coords = await geocode(destination);
  if (!coords) return null;

  try {
    const params = new URLSearchParams({
      latitude: String(coords.lat),
      longitude: String(coords.lon),
      daily: [
        "weathercode",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_sum",
        "precipitation_probability_max",
        "uv_index_max",
      ].join(","),
      forecast_days: "14",
      timezone: "auto",
    });
    const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = await res.json() as OpenMeteoResp;
    if (!data.daily) return null;

    const daily: DailyForecast[] = data.daily.time.map((date, i) => {
      const code = data.daily!.weathercode[i] ?? 0;
      const vis = codeToVisual(code);
      return {
        date,
        temp_max: Math.round(data.daily!.temperature_2m_max[i] ?? 0),
        temp_min: Math.round(data.daily!.temperature_2m_min[i] ?? 0),
        precip_mm: data.daily!.precipitation_sum[i] ?? 0,
        precip_prob: data.daily!.precipitation_probability_max[i] ?? 0,
        uv_index_max: data.daily!.uv_index_max[i] ?? 0,
        code,
        emoji: vis.emoji,
        label: vis.label,
      };
    });

    const result: WeatherResponse = {
      destination,
      lat: coords.lat, lon: coords.lon,
      daily,
      generated_at: new Date().toISOString(),
    };
    writeCache(destination, result);
    return result;
  } catch { return null; }
}
