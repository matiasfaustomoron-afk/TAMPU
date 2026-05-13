"use client";

import { useState } from "react";
import Link from "next/link";
import { Compass, Plane, Bed, MapPin, Calendar, ExternalLink } from "lucide-react";

interface SharedTrip {
  v: number;
  name: string;
  destination: string;
  start: string;
  end: string;
  duration: number;
  cities: string[];
  flights: { desc: string; provider: string; locator?: string | null; date: string | null }[];
  hotels: { desc: string; provider: string; in: string | null; out: string | null }[];
}

function decodeFromUrl(): { data: SharedTrip | null; err: string | null } {
  if (typeof window === "undefined") return { data: null, err: null };
  const params = new URLSearchParams(window.location.search);
  const b64 = params.get("d");
  if (!b64) return { data: null, err: "Link inválido" };
  try {
    const json = decodeURIComponent(escape(atob(decodeURIComponent(b64))));
    const parsed = JSON.parse(json) as SharedTrip;
    if (parsed.v !== 1) return { data: null, err: "Versión no soportada" };
    return { data: parsed, err: null };
  } catch {
    return { data: null, err: "No pude decodificar el itinerario" };
  }
}

function destHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
  } catch { return d; }
}

export default function SharePage() {
  // Decode once on mount via lazy initializer — pure within useState
  const [{ data, err }] = useState(() => decodeFromUrl());

  if (err) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <Compass className="w-12 h-12 text-muted-foreground/40 mb-4" />
        <h1 className="text-xl font-bold mb-2">Link de itinerario inválido</h1>
        <p className="text-sm text-muted-foreground mb-6">{err}</p>
        <Link href="/" className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm">
          Ir a Tampu
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-3 w-32 skeleton rounded" />
      </div>
    );
  }

  const hue = destHue(data.destination || data.name);
  const gradient = `linear-gradient(135deg, oklch(0.55 0.20 ${hue}), oklch(0.40 0.22 ${(hue + 50) % 360}))`;

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Hero */}
      <section
        className="relative overflow-hidden grain text-white"
        style={{ background: gradient, paddingBottom: "2.5rem" }}
      >
        <div className="max-w-2xl mx-auto px-6 pt-10 pb-8">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/70 mb-3">
            Itinerario compartido
          </p>
          <h1 className="font-serif text-[44px] sm:text-[56px] leading-[0.95]">{data.name}</h1>
          <p className="text-white/75 text-base mt-3">{data.destination}</p>
          <p className="text-white/60 text-sm mt-1 tabular-nums">
            {formatDate(data.start)} <span className="opacity-60">→</span> {formatDate(data.end)} · {data.duration} días
          </p>
          {data.cities.length > 0 && (
            <p className="text-white/80 text-[13px] mt-4 flex items-center gap-1.5 flex-wrap">
              <MapPin className="w-3.5 h-3.5" />
              {data.cities.join(" · ")}
            </p>
          )}
        </div>
      </section>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 mt-8 space-y-8">
        {/* Flights */}
        {data.flights.length > 0 && (
          <section>
            <p className="ios-eyebrow flex items-center gap-1.5">
              <Plane className="w-3.5 h-3.5" /> Vuelos ({data.flights.length})
            </p>
            <div className="ios-list">
              {data.flights.map((f, i) => (
                <div key={i} className="ios-list-row">
                  <span className="w-8 h-8 rounded-xl tampu-icon tampu-icon-indigo flex items-center justify-center shrink-0">
                    <Plane className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium leading-tight truncate">{f.desc}</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      {f.provider}{f.locator && ` · ${f.locator}`}{f.date && ` · ${formatDate(f.date)}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Hotels */}
        {data.hotels.length > 0 && (
          <section>
            <p className="ios-eyebrow flex items-center gap-1.5">
              <Bed className="w-3.5 h-3.5" /> Hoteles ({data.hotels.length})
            </p>
            <div className="ios-list">
              {data.hotels.map((h, i) => (
                <div key={i} className="ios-list-row">
                  <span className="w-8 h-8 rounded-xl tampu-icon tampu-icon-cardon flex items-center justify-center shrink-0">
                    <Bed className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium leading-tight truncate">{h.desc}</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      {h.provider}{h.in && ` · ${formatDate(h.in)}`}{h.out && ` → ${formatDate(h.out)}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="text-center pt-6 pb-4 border-t border-border/40">
          <div className="inline-flex items-center gap-2 text-[12px] text-muted-foreground mb-3">
            <Calendar className="w-3.5 h-3.5" />
            Vista de solo lectura · compartido vía Tampu
          </div>
          <div>
            <Link
              href="/"
              className="pressable inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
            >
              <ExternalLink className="w-4 h-4" /> Abrir Tampu
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
