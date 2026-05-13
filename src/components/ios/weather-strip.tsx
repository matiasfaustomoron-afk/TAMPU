"use client";

import { useState, useEffect } from "react";
import { fetchWeather, type DailyForecast } from "@/lib/weather-client";
import { CloudSun, Loader2, Umbrella, Sun } from "lucide-react";
import { cn } from "@/lib/utils/helpers";

/**
 * Horizontal strip showing 7-day forecast for the trip destination.
 * Highlights any day with high rain probability or extreme UV.
 */
export function WeatherStrip({
  destination,
  startDate,
  endDate,
}: {
  destination: string;
  startDate?: string;
  endDate?: string;
}) {
  const [daily, setDaily] = useState<DailyForecast[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchWeather(destination).then(r => {
      if (!alive) return;
      if (!r) { setErr("Sin pronóstico"); setLoading(false); return; }
      // Filter to trip dates if provided, else first 7
      let days = r.daily;
      if (startDate && endDate) {
        days = r.daily.filter(d => d.date >= startDate && d.date <= endDate);
      }
      setDaily(days.slice(0, 7));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [destination, startDate, endDate]);

  if (loading) {
    return (
      <div className="ios-card p-4 flex items-center gap-2 text-[12px] text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Cargando clima de {destination}…
      </div>
    );
  }

  if (err || !daily || daily.length === 0) {
    return (
      <div className="ios-card p-4 text-[12px] text-muted-foreground">
        Sin pronóstico disponible para {destination}.
      </div>
    );
  }

  return (
    <div className="ios-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
        <p className="text-[13px] font-semibold flex items-center gap-1.5">
          <CloudSun className="w-3.5 h-3.5 text-warning" /> Clima · {destination}
        </p>
        <p className="text-[10px] text-muted-foreground">
          Open-Meteo · cacheado 3h
        </p>
      </div>
      <div className="flex gap-1 overflow-x-auto no-scrollbar p-3">
        {daily.map(d => {
          const wet = d.precip_prob >= 50;
          const hotSun = d.uv_index_max >= 8;
          return (
            <div key={d.date} className="shrink-0 w-[78px] rounded-xl bg-muted/30 p-2.5 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {new Date(d.date + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short" })}
              </p>
              <p className="text-[10px] text-muted-foreground/70 tabular-nums">
                {new Date(d.date + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
              </p>
              <p className="text-2xl my-1.5" title={d.label}>{d.emoji}</p>
              <p className="text-[13px] font-bold tabular-nums">
                {d.temp_max}°<span className="text-muted-foreground text-[11px]">/{d.temp_min}°</span>
              </p>
              <div className="flex items-center justify-center gap-1 mt-1">
                {wet && (
                  <span className="text-[9px] flex items-center gap-0.5 text-info" title={`${d.precip_prob}% probabilidad de lluvia`}>
                    <Umbrella className="w-2.5 h-2.5" /> {d.precip_prob}
                  </span>
                )}
                {hotSun && !wet && (
                  <span className="text-[9px] flex items-center gap-0.5 text-primary" title={`UV ${d.uv_index_max}`}>
                    <Sun className="w-2.5 h-2.5" /> UV{Math.round(d.uv_index_max)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className={cn(
        "px-4 py-2 border-t border-border/60 text-[11px]",
        daily.some(d => d.precip_prob >= 50)
          ? "text-info"
          : daily.some(d => d.uv_index_max >= 8)
          ? "text-primary"
          : "text-muted-foreground"
      )}>
        {daily.filter(d => d.precip_prob >= 50).length > 0
          ? `Lluvia probable en ${daily.filter(d => d.precip_prob >= 50).length} día(s). Llevá impermeable.`
          : daily.some(d => d.uv_index_max >= 8)
          ? "UV alto. Llevá protector y gorra."
          : "Clima estable para tu rango."}
      </div>
    </div>
  );
}
