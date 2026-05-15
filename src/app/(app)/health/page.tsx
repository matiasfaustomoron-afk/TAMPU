"use client";
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader, EmptyState, Semaphore, KPICard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useActiveTrip, useCities, useTasks, useDocuments } from "@/lib/hooks/use-trip-data";
import { buildTripHealthPlan } from "@/lib/domain/vaccinations";
import { AttachDocButton } from "@/components/ios/attach-doc-button";
import { Heart, Syringe, Bug, ExternalLink, Clock } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";

const LEVEL_COLOR: Record<string, "red" | "orange" | "yellow" | "gray"> = {
  required: "red",
  strongly_recommended: "orange",
  recommended: "yellow",
  consider: "gray",
};

const STATUS_COLOR: Record<string, "green" | "yellow" | "red"> = {
  ready: "green",
  in_progress: "yellow",
  pending: "red",
};

export default function HealthPage() {
  const { data: trip } = useActiveTrip();
  const { data: cities } = useCities(trip?.id);
  const { data: tasks } = useTasks(trip?.id);
  const { data: documents } = useDocuments(trip?.id);
  const { t } = useI18n();
  const th = t.health;

  const LEVEL_LABEL: Record<string, string> = {
    required: th.levels.required,
    strongly_recommended: th.levels.high_risk,
    recommended: th.levels.recommended,
    consider: th.levels.routine,
  };

  const STATUS_LABEL: Record<string, string> = {
    ready: th.statuses.completed,
    in_progress: th.statuses.in_progress,
    pending: th.statuses.not_started,
  };

  const plan = useMemo(() => {
    if (!trip || !cities || !tasks || !documents) return null;
    return buildTripHealthPlan(cities, tasks, documents);
  }, [trip, cities, tasks, documents]);

  if (!plan) return <EmptyState title={t.common.noActiveTrip} icon={<Heart className="w-8 h-8" />} action={<Link href="/trips"><Button variant="default">{t.trips.createFirst}</Button></Link>} />;

  return (
    <div className="space-y-4 pb-20 lg:pb-0 animate-fade-in">
      <SectionHeader
        title={th.title}
        subtitle={th.subtitle}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard
          label={th.kpi.pendingVaccines}
          value={`${plan.open_count}`}
          status={plan.open_count === 0 ? "green" : plan.open_count > 3 ? "red" : "orange"}
          icon={<Syringe className="w-4 h-4" />}
        />
        <KPICard
          label={th.kpi.leadTime}
          value={`${plan.total_lead_weeks}s`}
          subtitle="antes del viaje"
          status="gray"
          icon={<Clock className="w-4 h-4" />}
        />
        <KPICard
          label={th.kpi.malariaCountries}
          value={plan.malaria_required ? t.common.yes : t.common.no}
          subtitle={plan.malaria_required ? plan.malaria_countries.join(", ") : "Ningún país con malaria"}
          status={plan.malaria_required ? "orange" : "green"}
          icon={<Bug className="w-4 h-4" />}
        />
        <KPICard
          label={th.kpi.countries}
          value={`${plan.countries.length}`}
          status="gray"
          icon={<Heart className="w-4 h-4" />}
        />
      </div>

      {plan.countries.length === 0 ? (
        <EmptyState title={th.emptyTitle} description={th.emptyDescription} icon={<Heart className="w-8 h-8" />} action={<Link href="/itinerary"><Button>Cargar ciudades</Button></Link>} />
      ) : (
        <>
          {/* Aggregated vaccine list */}
          <Card>
            <CardContent className="p-4">
              <h2 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2"><Syringe className="w-4 h-4" />Vacunas (consolidado por viaje)</h2>
              <ul className="space-y-2">
                {plan.vaccines_needed.map(v => {
                  const color = LEVEL_COLOR[v.vaccine.level];
                  const statusColor = STATUS_COLOR[v.user_status];
                  return (
                    <li key={v.vaccine.id} className="rounded-md border p-3 bg-card">
                      <div className="flex items-start gap-3">
                        <Semaphore status={color} size={10} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{v.vaccine.name}</p>
                            <span className="text-[10px] uppercase px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{LEVEL_LABEL[v.vaccine.level]}</span>
                            <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded-full ${statusColor === "green" ? "bg-success/10 text-success" : statusColor === "yellow" ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"}`}>{STATUS_LABEL[v.user_status]}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{v.vaccine.reason}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Para: {v.countries.join(", ")} · Lead {v.vaccine.lead_weeks} semanas
                          </p>
                        </div>
                        <AttachDocButton
                          entityType="document"
                          entityId={`vaccine-${v.vaccine.id}`}
                          category="health"
                          compact
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[10px] text-muted-foreground mt-3">
                Fuente: <a href="https://wwwnc.cdc.gov/travel" target="_blank" rel="noreferrer" className="underline">CDC Travelers&apos; Health</a>.
                Esto es una guía de planificación. Consultá una clínica de medicina del viajero.
              </p>
            </CardContent>
          </Card>

          {/* Malaria detail */}
          {plan.malaria_required && (
            <Card className="border-l-4 border-l-primary">
              <CardContent className="p-4 space-y-2">
                <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2"><Bug className="w-4 h-4 text-primary" />{th.malariaInfo.title}</h2>
                <p className="text-xs">
                  {th.malariaInfo.intro} <strong>{plan.malaria_countries.join(", ")}</strong>
                </p>
                <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                  <li>{th.malariaInfo.bullet1}</li>
                  <li>{th.malariaInfo.bullet2}</li>
                  <li>{th.malariaInfo.bullet3}</li>
                  <li>{th.malariaInfo.bullet4}</li>
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Per-country breakdown */}
          <Card>
            <CardContent className="p-4">
              <h2 className="text-sm font-bold uppercase tracking-wider mb-3">Detalle por país</h2>
              <div className="space-y-3">
                {plan.countries.map(c => (
                  <div key={c.iso2} className="rounded-md border p-3 bg-card">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold">{c.country}</h3>
                      <a href={c.source_url} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-1">
                        CDC <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    {c.risks.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase text-muted-foreground">Riesgos sanitarios</p>
                        {c.risks.map(r => (
                          <div key={r.id} className="flex items-start gap-2 text-xs">
                            <Semaphore status={r.level === "critical" ? "red" : r.level === "warning" ? "orange" : "yellow"} size={6} />
                            <div>
                              <strong className="text-foreground">{r.label}.</strong>{" "}
                              <span className="text-muted-foreground">{r.detail}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/20">
            <CardContent className="p-3 text-[10px] text-muted-foreground">
              {th.disclaimer}
              <Link href="/alerts" className="text-primary hover:underline ml-1">Ver alertas activas →</Link>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
