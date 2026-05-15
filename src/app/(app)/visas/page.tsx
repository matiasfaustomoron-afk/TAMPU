"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionHeader, EmptyState, Semaphore, KPICard } from "@/components/shared";
import { useActiveTrip, useCities, useDocuments } from "@/lib/hooks/use-trip-data";
import { useI18n } from "@/i18n/provider";
import { buildTripVisaSummary, VISA_TYPE_LABELS, DEFAULT_PASSPORT_ISO2 } from "@/lib/domain/visa-requirements";
import { Stamp, ExternalLink, Clock, DollarSign } from "lucide-react";
import { CountryCard } from "@/components/ios/country-card";

const TYPE_COLOR: Record<string, "green" | "yellow" | "orange" | "red"> = {
  visa_free: "green",
  transit: "green",
  eta: "yellow",
  evisa: "orange",
  visa_on_arrival: "yellow",
  embassy_visa: "red",
  unknown: "orange",
};

export default function VisasPage() {
  const { t } = useI18n();
  const { data: trip } = useActiveTrip();
  const { data: cities } = useCities(trip?.id);
  const { data: documents } = useDocuments(trip?.id);

  const summary = useMemo(() => {
    if (!trip || !cities) return null;
    return buildTripVisaSummary(cities);
  }, [trip, cities]);

  if (!summary || !cities) return (
    <EmptyState
      title={t.visas.emptyTitle}
      icon={<Stamp className="w-8 h-8" />}
      action={<Link href="/itinerary"><Button>Cargar ciudades</Button></Link>}
    />
  );

  // Cross-reference: does the user have a document of type "visa" with status "ready" for this country?
  const docsByName = (documents || []).filter(d => d.type === "visa");
  const isHandled = (label: string) => docsByName.some(d => d.status === "ready" && (d.name.toLowerCase().includes(label.toLowerCase()) || label.toLowerCase().includes(d.name.toLowerCase().split(/\s+/)[0])));

  return (
    <div className="space-y-4 pb-20 lg:pb-0 animate-fade-in">
      <SectionHeader
        title={t.visas.title}
        subtitle={`${t.visas.passport} ${DEFAULT_PASSPORT_ISO2} · ${summary.requirements.length} ${t.visas.destinations} · ${summary.open_count} ${t.visas.openActions.toLowerCase()} · USD ${summary.total_cost_usd} ${t.common.of.toLowerCase()}`}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard label={t.visas.openActions} value={`${summary.open_count}`} status={summary.open_count === 0 ? "green" : summary.open_count > 1 ? "orange" : "yellow"} />
        <KPICard label={t.visas.totalCost} value={`USD ${summary.total_cost_usd}`} status="gray" icon={<DollarSign className="w-4 h-4" />} />
        <KPICard label={t.visas.maxLead} value={`${summary.total_lead_days}d`} subtitle={t.visas.beforeTrip} status="gray" icon={<Clock className="w-4 h-4" />} />
        <KPICard label={t.visas.destinations.charAt(0).toUpperCase() + t.visas.destinations.slice(1)} value={`${summary.requirements.length}`} status="gray" />
      </div>

      {summary.requirements.length === 0 ? (
        <EmptyState
          title={t.visas.noDataTitle}
          description={t.visas.noDataDescription}
          icon={<Stamp className="w-8 h-8" />}
          action={<Link href="/itinerary"><Button>Cargar ciudades</Button></Link>}
        />
      ) : (
        <ul className="space-y-2">
          {summary.requirements.map(r => {
            const color = TYPE_COLOR[r.type];
            const handled = isHandled(r.destination_label);
            return (
              <li key={r.destination_iso2}>
                <Card className={`border-l-4 ${color === "green" ? "border-l-success" : color === "yellow" ? "border-l-warning" : color === "orange" ? "border-l-primary" : "border-l-destructive"}`}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold">{r.destination_label}</h3>
                          <Semaphore status={color} size={10} />
                          {handled && <span className="text-[10px] text-success">✓ {t.visas.docLoaded}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">{VISA_TYPE_LABELS[r.type]}</p>
                      </div>
                      <div className="text-right text-[10px] text-muted-foreground">
                        {t.visas.verified} {r.last_verified}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {r.max_stay_days !== null && (
                        <div className="rounded bg-muted/30 p-2">
                          <p className="text-[10px] uppercase text-muted-foreground">{t.visas.maxStay}</p>
                          <p className="font-semibold">{r.max_stay_days} {t.common.days}</p>
                        </div>
                      )}
                      {r.cost_usd !== null && (
                        <div className="rounded bg-muted/30 p-2">
                          <p className="text-[10px] uppercase text-muted-foreground">{t.visas.cost}</p>
                          <p className="font-semibold">USD {r.cost_usd}</p>
                        </div>
                      )}
                      {r.apply_lead_days !== null && r.apply_lead_days > 0 && (
                        <div className="rounded bg-muted/30 p-2">
                          <p className="text-[10px] uppercase text-muted-foreground">{t.visas.lead}</p>
                          <p className="font-semibold">{r.apply_lead_days} {t.common.days}</p>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">{r.notes}</p>

                    {r.apply_url && (
                      <a href={r.apply_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        {t.visas.applyOnline} <ExternalLink className="w-3 h-3" />
                      </a>
                    )}

                    {/* Live country info from REST Countries (currency, language, etc.) */}
                    <div className="pt-2">
                      <CountryCard countryName={r.destination_label} />
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Card className="bg-muted/20">
        <CardContent className="p-3 text-[10px] text-muted-foreground">
          {t.visas.sourcesNote}
        </CardContent>
      </Card>
    </div>
  );
}
