"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Search, MapPin, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils/helpers";

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  place_id: number;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    country?: string;
  };
}

export interface DestinationPick {
  display: string;          // pretty string for the trip
  short: string;            // city / village
  country?: string;
  lat: number;
  lon: number;
}

export function DestinationInput({
  value, onChange, onPick, placeholder = "Buscá una ciudad o país…", autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (pick: DestinationPick) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return; }
    setBusy(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1`;
      const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) return;
      const data = await res.json() as NominatimResult[];
      // Prefer cities/towns/villages/regions, drop houses/buildings
      const filtered = data.filter(d => !["house", "building"].includes(d.type)).slice(0, 6);
      setResults(filtered);
    } catch { /* ignore */ } finally {
      setBusy(false);
    }
  }, []);

  // Debounced search on value changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { search(value); }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value, search]);

  const pick = (r: NominatimResult) => {
    const short = r.address?.city || r.address?.town || r.address?.village || r.display_name.split(",")[0].trim();
    const country = r.address?.country;
    const display = country ? `${short}, ${country}` : short;
    onPick({ display, short, country, lat: parseFloat(r.lat), lon: parseFloat(r.lon) });
    onChange(display);
    setOpen(false);
    setResults([]);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="pl-9 pr-9"
          autoFocus={autoFocus}
        />
        {busy && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}
        {!busy && value.length > 0 && (
          <button
            onClick={() => { onChange(""); setResults([]); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Limpiar"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 ios-card overflow-hidden">
          {results.map((r, i) => {
            const short = r.address?.city || r.address?.town || r.address?.village || r.display_name.split(",")[0].trim();
            const country = r.address?.country;
            return (
              <button
                key={r.place_id}
                onClick={() => pick(r)}
                className={cn(
                  "pressable w-full text-left flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-accent/60",
                  i < results.length - 1 && "border-b border-border/40"
                )}
              >
                <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-1 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium truncate">{short}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {country ? `${country} · ${r.type}` : r.type}
                  </p>
                </div>
              </button>
            );
          })}
          <p className="text-[10px] text-muted-foreground/70 text-center px-3 py-1.5 border-t border-border/40">
            OpenStreetMap · Nominatim
          </p>
        </div>
      )}
    </div>
  );
}
