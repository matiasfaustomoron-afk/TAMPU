"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchDestinationGuide, groupedByTab, type FetchGuideResult, type POI } from "@/lib/wikivoyage-client";
import { Bus, Wallet, Utensils, MapPin, Shield, BookOpen, RefreshCw, Loader2, ExternalLink, WifiOff, ChevronDown, Map, Camera } from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import { useI18n } from "@/i18n/provider";

type Tab = "transport" | "money" | "food" | "see" | "safety";

const TABS: { key: Tab; label: string; icon: typeof Bus }[] = [
  { key: "transport", label: "Transporte", icon: Bus },
  { key: "money",     label: "Dinero",     icon: Wallet },
  { key: "food",      label: "Comer",      icon: Utensils },
  { key: "see",       label: "Lugares",    icon: MapPin },
  { key: "safety",    label: "Seguridad",  icon: Shield },
];

export function DestinationGuideCard({
  destination,
  defaultOpen = false,
}: { destination: string; defaultOpen?: boolean }) {
  const { t } = useI18n();
  const [result, setResult] = useState<FetchGuideResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("food");
  const [expanded, setExpanded] = useState(defaultOpen);

  const load = useCallback(async (force: boolean = false) => {
    setBusy(true);
    const r = await fetchDestinationGuide(destination, { forceRefresh: force });
    setResult(r);
    setBusy(false);
  }, [destination]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // ─── Collapsed state — always visible header card with single-line summary ───
  if (!expanded) {
    const guide = result?.guide;
    const totalPois = guide ? guide.pois.restaurants.length + guide.pois.attractions.length + guide.pois.cafes.length + guide.pois.historic.length : 0;
    const hasContent = guide && (guide.sections.length > 0 || totalPois > 0);
    return (
      <button
        onClick={() => setExpanded(true)}
        className="pressable w-full ios-card p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-semibold leading-tight">
              Guía de {guide?.page_title || destination}
            </p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {!result
                ? "Buscando…"
                : result.source === "offline"
                ? "Sin internet"
                : result.source === "not-found"
                ? "Sin info encontrada"
                : hasContent
                ? `${guide!.sections.length} secciones · ${totalPois} lugares cerca`
                : "Sin contenido"}
            </p>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
      </button>
    );
  }

  // ─── Loading / error / not-found states ───
  if (!result) {
    return (
      <div className="ios-card p-5">
        <HeaderRow title={`Buscando guía de ${destination}…`} onCollapse={() => setExpanded(false)} />
        <div className="flex items-center gap-2 mt-2 text-[13px] text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Wikivoyage + OpenStreetMap…
        </div>
      </div>
    );
  }

  if (result.source === "offline") {
    return (
      <div className="ios-card p-5">
        <HeaderRow title="Guía del destino" onCollapse={() => setExpanded(false)} />
        <div className="flex items-start gap-2 mt-2 text-[13px] text-muted-foreground">
          <WifiOff className="w-4 h-4 mt-0.5 shrink-0" />
          <p>Sin internet. La guía se descarga y se cachea por 30 días.</p>
        </div>
      </div>
    );
  }

  if (result.source === "not-found") {
    return (
      <div className="ios-card p-5">
        <HeaderRow title="Guía del destino" onCollapse={() => setExpanded(false)} />
        <p className="text-[13px] text-muted-foreground mt-2 mb-2">
          No encontré <strong>{destination}</strong> en Wikivoyage ni en OpenStreetMap. Probá con el nombre en inglés o la ciudad principal del país.
        </p>
        <button onClick={() => load(true)} className="pressable inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary">
          <RefreshCw className="w-3.5 h-3.5" /> Reintentar
        </button>
      </div>
    );
  }

  if (result.source === "error" || !result.guide) {
    return (
      <div className="ios-card p-5">
        <HeaderRow title="Guía del destino" onCollapse={() => setExpanded(false)} />
        <p className="text-[13px] text-muted-foreground mt-2 mb-2">No pude cargar la guía. Probá de nuevo en un rato.</p>
        <button onClick={() => load(true)} className="pressable inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary">
          <RefreshCw className="w-3.5 h-3.5" /> Reintentar
        </button>
      </div>
    );
  }

  const g = result.guide;
  const grouped = groupedByTab(g);
  const tabHasContent = (k: Tab) => {
    if (k === "food") return (grouped.food?.length || 0) > 0 || g.pois.restaurants.length + g.pois.cafes.length > 0;
    if (k === "see")  return (grouped.see?.length || 0) > 0 || g.pois.attractions.length + g.pois.historic.length > 0;
    return (grouped[k]?.length || 0) > 0;
  };

  return (
    <div className="ios-card overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ios-eyebrow !p-0 flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-primary" />
            Guía de {g.page_title}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {g.sources.map(s => s.name).join(" + ") || "Sin fuentes"} · {result.source === "cache" ? "cacheado" : "actualizado"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => load(true)}
            disabled={busy}
            className="pressable w-8 h-8 rounded-full bg-muted text-muted-foreground hover:text-primary flex items-center justify-center disabled:opacity-50"
            aria-label="Actualizar"
            title="Volver a buscar"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setExpanded(false)}
            className="pressable w-8 h-8 rounded-full bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center"
            aria-label={t.common.close}
            title={t.common.close}
          >
            <ChevronDown className="w-3.5 h-3.5 rotate-180" />
          </button>
        </div>
      </div>

      {/* Summary (only if has content) */}
      {g.summary && (
        <p className="px-5 pb-3 text-[13.5px] text-muted-foreground leading-relaxed italic line-clamp-3">
          {g.summary}
        </p>
      )}

      {/* Tab strip */}
      <div className="flex gap-1 px-3 overflow-x-auto no-scrollbar pb-1">
        {TABS.map(({ key, label, icon: Icon }) => {
          const has = tabHasContent(key);
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              disabled={!has}
              className={cn(
                "pressable shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all",
                tab === key
                  ? "bg-primary text-primary-foreground"
                  : has
                  ? "text-muted-foreground hover:text-foreground hover:bg-accent"
                  : "text-muted-foreground/40 cursor-not-allowed"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="px-5 pt-3 pb-4 text-[13.5px] leading-relaxed space-y-4">
        {tab === "food" && (
          <FoodTab guide={g} sections={grouped.food} />
        )}
        {tab === "see" && (
          <SeeTab guide={g} sections={grouped.see} />
        )}
        {tab !== "food" && tab !== "see" && (
          <SectionsList sections={grouped[tab]} />
        )}
      </div>

      {/* Source links */}
      <div className="px-5 pb-5 pt-3 border-t border-border/40">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Fuentes</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {g.sources.map(s => (
            <a
              key={s.name}
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
              className="pressable inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {s.name}{s.lang ? ` (${s.lang.toUpperCase()})` : ""}
            </a>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
          Wikivoyage = guía curada por viajeros. OpenStreetMap = lugares reales con coordenadas. <strong>Sin IA. Sin Wikipedia.</strong>
        </p>
      </div>
    </div>
  );
}

function HeaderRow({ title, onCollapse }: { title: string; onCollapse: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex items-start justify-between gap-3">
      <p className="ios-eyebrow !p-0 flex items-center gap-1.5">
        <BookOpen className="w-3.5 h-3.5 text-primary" /> {title}
      </p>
      <button
        onClick={onCollapse}
        className="pressable w-8 h-8 rounded-full bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center"
        aria-label={t.common.close}
      >
        <ChevronDown className="w-3.5 h-3.5 rotate-180" />
      </button>
    </div>
  );
}

function SectionsList({ sections }: { sections: import("@/lib/wikivoyage-client").GuideSection[] | undefined }) {
  if (!sections || sections.length === 0) {
    return <p className="text-muted-foreground italic">Wikivoyage no tiene esta sección documentada todavía.</p>;
  }
  return (
    <>
      {sections.map((s, idx) => (
        <section key={idx}>
          <h4 className="text-[14px] font-semibold mb-2">{s.heading}</h4>
          {s.paragraphs.map((p, i) => <p key={i} className="mb-2">{p}</p>)}
          {s.bullets.length > 0 && (
            <ul className="space-y-1.5">
              {s.bullets.slice(0, 12).map((b, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-muted-foreground mt-1">·</span>
                  <span className="flex-1">{b}</span>
                </li>
              ))}
              {s.bullets.length > 12 && (
                <li className="text-[12px] text-muted-foreground italic pl-3">+{s.bullets.length - 12} más</li>
              )}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}

function FoodTab({ guide, sections }: { guide: import("@/lib/wikivoyage-client").DestinationGuide; sections: import("@/lib/wikivoyage-client").GuideSection[] | undefined }) {
  return (
    <div className="space-y-5">
      {/* Real named places from OSM first */}
      {guide.pois.restaurants.length > 0 && (
        <POIList title="Restaurantes cerca (OpenStreetMap)" pois={guide.pois.restaurants} icon={<Utensils className="w-3.5 h-3.5" />} />
      )}
      {guide.pois.cafes.length > 0 && (
        <POIList title="Cafés cerca" pois={guide.pois.cafes} icon={<Camera className="w-3.5 h-3.5" />} />
      )}
      {/* Wikivoyage curated narrative */}
      <SectionsList sections={sections} />
      {guide.pois.restaurants.length === 0 && (!sections || sections.length === 0) && (
        <p className="text-muted-foreground italic">Sin datos gastronómicos para este destino.</p>
      )}
    </div>
  );
}

function SeeTab({ guide, sections }: { guide: import("@/lib/wikivoyage-client").DestinationGuide; sections: import("@/lib/wikivoyage-client").GuideSection[] | undefined }) {
  return (
    <div className="space-y-5">
      {guide.pois.attractions.length > 0 && (
        <POIList title="Atracciones (OpenStreetMap)" pois={guide.pois.attractions} icon={<MapPin className="w-3.5 h-3.5" />} />
      )}
      {guide.pois.historic.length > 0 && (
        <POIList title="Sitios históricos" pois={guide.pois.historic} icon={<Map className="w-3.5 h-3.5" />} />
      )}
      <SectionsList sections={sections} />
      {guide.pois.attractions.length === 0 && guide.pois.historic.length === 0 && (!sections || sections.length === 0) && (
        <p className="text-muted-foreground italic">Sin lugares cargados para este destino.</p>
      )}
    </div>
  );
}

function POIList({ title, pois, icon }: { title: string; pois: POI[]; icon: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
        {icon}{title}
        <span className="ml-auto normal-case font-normal">{pois.length}</span>
      </h4>
      <ul className="space-y-1.5">
        {pois.slice(0, 15).map(p => {
          const mapUrl = `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=18/${p.lat}/${p.lon}`;
          const meta: string[] = [];
          if (p.cuisine) meta.push(p.cuisine.replace(/_/g, " ").replace(/;/g, " · "));
          if (p.price_range) meta.push(p.price_range);
          if (p.stars) meta.push(`${p.stars}★`);
          return (
            <li key={p.id} className="rounded-lg hover:bg-accent/40 transition-colors p-1.5">
              <div className="flex items-center gap-2">
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="pressable flex items-center gap-2 flex-1 min-w-0 text-[13.5px] hover:text-primary"
                  title={`Ver en mapa: ${p.name}`}
                >
                  <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="truncate font-medium">{p.name}</span>
                </a>
                {p.website && (
                  <a href={p.website} target="_blank" rel="noreferrer noopener"
                    className="pressable shrink-0 text-muted-foreground hover:text-primary" aria-label="Web">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              {(meta.length > 0 || p.hours || p.phone) && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 ml-5 text-[10.5px] text-muted-foreground">
                  {meta.length > 0 && <span>{meta.join(" · ")}</span>}
                  {p.hours && <span className="truncate max-w-[180px]" title={p.hours}>🕐 {p.hours}</span>}
                  {p.phone && (
                    <a href={`tel:${p.phone}`} className="pressable hover:text-primary">
                      📞 {p.phone}
                    </a>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {pois.length > 15 && (
          <li className="text-[11px] text-muted-foreground italic pl-5">+{pois.length - 15} más en OpenStreetMap</li>
        )}
      </ul>
    </section>
  );
}
