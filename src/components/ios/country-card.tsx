"use client";

import { useEffect, useState } from "react";
import { fetchCountryInfo, type CountryInfo } from "@/lib/country-info";
import { Loader2 } from "lucide-react";

export function CountryCard({ countryName }: { countryName: string }) {
  const [data, setData] = useState<CountryInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchCountryInfo(countryName).then(info => {
      if (!alive) return;
      // setState inside async callback is fine — not synchronous in effect body
      setData(info);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [countryName]);

  if (loading && !data) {
    return (
      <div className="ios-card p-3 flex items-center gap-2 text-[12px] text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando info de {countryName}…
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="ios-card p-4">
      <div className="flex items-start gap-3">
        <span className="text-3xl shrink-0">{data.flag}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight">{data.name}</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {data.capital !== "—" && `${data.capital} · `}{data.region}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 text-[12px]">
        {data.currencies.length > 0 && (
          <Stat label="Moneda" value={data.currencies.map(c => `${c.code}${c.symbol ? ` (${c.symbol})` : ""}`).join(" · ")} />
        )}
        {data.languages.length > 0 && (
          <Stat label="Idioma" value={data.languages.slice(0, 3).join(" · ")} />
        )}
        {data.drives_on !== "unknown" && (
          <Stat label="Manejan por" value={data.drives_on === "right" ? "derecha →" : "izquierda ←"} />
        )}
        {data.timezones.length > 0 && (
          <Stat label="Zona" value={data.timezones[0]} />
        )}
      </div>
      <p className="text-[10px] text-muted-foreground mt-3">
        Fuente: REST Countries · cacheado 30 días
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      <p className="font-medium truncate" title={value}>{value}</p>
    </div>
  );
}
