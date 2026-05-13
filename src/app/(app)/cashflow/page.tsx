"use client";

import { useMemo } from "react";
import { LargeTitle, IOSSection, IOSRow, IOSFeatureCard, StatChip } from "@/components/ios";
import { EmptyState } from "@/components/shared";
import { useCommandCenter } from "@/lib/hooks/use-trip-data";
import { useI18n } from "@/i18n/provider";
import { Calendar, Clock, MapPin, TrendingUp } from "lucide-react";
import { BarChart, Bar, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ComposedChart } from "recharts";
import { cn } from "@/lib/utils/helpers";

export default function CashflowPage() {
  const { data: cc, loading } = useCommandCenter();
  const { formatCurrency } = useI18n();

  const chartData = useMemo(() => {
    if (!cc) return [];
    return cc.cashflow.buckets.map(b => ({
      date: b.date.slice(5),
      out: b.expenses + b.payments_due,
      cumulative: b.cumulative,
      budget_line: b.budget_line,
    }));
  }, [cc]);

  if (loading) return <CashflowSkeleton />;
  if (!cc) return <div className="px-4 mt-8"><EmptyState title="Sin viaje activo" icon={<Calendar className="w-8 h-8" />} /></div>;

  const { cashflow, money_in_flight, dashboard } = cc;
  const avgBudgetPerDay = cashflow.total_budget / Math.max(1, dashboard.trip_duration);
  const burnStatus: "ok" | "warn" | "alert" =
    cashflow.daily_burn_rate <= avgBudgetPerDay ? "ok"
    : cashflow.daily_burn_rate <= avgBudgetPerDay * 1.25 ? "warn"
    : "alert";

  return (
    <div className="animate-fade-in">
      <LargeTitle
        eyebrow="Movimiento diario"
        title="Movimiento"
        serif
      />

      {/* Hero — daily burn rate. Gradient terracota (paleta Tampu), no SaaS blue/violet. */}
      <div className="px-4">
        <IOSFeatureCard
          gradient="linear-gradient(135deg, oklch(0.55 0.18 38), oklch(0.42 0.16 28))"
          className="text-white"
          padding="xl"
        >
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/70">
            Quema diaria
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="font-serif text-[56px] sm:text-[64px] leading-none tabular-nums">
              {formatCurrency(cashflow.daily_burn_rate)}
            </p>
          </div>
          <p className="text-[13px] text-white/70 mt-2">
            <span className="opacity-60">presupuestado</span>{" "}
            {formatCurrency(avgBudgetPerDay)} / día
          </p>
          <div className="mt-5 grid grid-cols-3 gap-3 text-white">
            <Mini label="Gastado" value={formatCurrency(cashflow.total_spent)} />
            <Mini label="Comprometido" value={formatCurrency(cashflow.total_committed_future)} />
            <Mini label="Restante" value={formatCurrency(Math.max(0, cashflow.total_budget - cashflow.total_spent - cashflow.total_committed_future))} />
          </div>
        </IOSFeatureCard>
      </div>

      {/* Status chips */}
      <section className="px-4 mt-6">
        <p className="ios-eyebrow">Estado</p>
        <div className="ios-card p-5 grid grid-cols-3 gap-4">
          <StatChip label="Ritmo" value={burnStatus === "ok" ? "OK" : burnStatus === "warn" ? "Cuidado" : "Excede"} status={burnStatus} />
          <StatChip label="Días" value={dashboard.trip_duration} />
          <StatChip label="Pagos" value={money_in_flight.items.length} />
        </div>
      </section>

      {/* Daily bars chart */}
      {chartData.length > 0 && (
        <section className="px-4 mt-6">
          <p className="ios-eyebrow">Gasto diario</p>
          <div className="ios-card p-5">
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    formatter={(v) => formatCurrency(typeof v === "number" ? v : 0)}
                    contentStyle={{
                      fontSize: 11,
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                    }}
                    cursor={{ fill: "var(--color-accent)", opacity: 0.4 }}
                  />
                  <Bar dataKey="out" fill="oklch(0.72 0.18 230)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {/* Cumulative vs budget */}
      {chartData.length > 0 && (
        <section className="px-4 mt-6">
          <p className="ios-eyebrow">Acumulado vs presupuesto</p>
          <div className="ios-card p-5">
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <ComposedChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    formatter={(v) => formatCurrency(typeof v === "number" ? v : 0)}
                    contentStyle={{
                      fontSize: 11,
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                    }}
                  />
                  <Line type="monotone" dataKey="budget_line" stroke="oklch(0.7 0.02 260)" strokeDasharray="4 4" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="cumulative" stroke="oklch(0.72 0.18 230)" strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-primary" /> Real
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-px border-t border-dashed border-muted-foreground" /> Presupuesto
              </span>
            </div>
          </div>
        </section>
      )}

      {/* By destination */}
      {cashflow.by_destination.length > 0 && (
        <IOSSection eyebrow="Por destino">
          {cashflow.by_destination.map(d => (
            <div key={d.city} className="ios-list-row">
              <span className="w-8 h-8 rounded-[10px] bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[15px] font-medium truncate">{d.city}</p>
                  <span className="text-[14px] font-semibold tabular-nums shrink-0">{formatCurrency(d.spent)}</span>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${d.pct}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{d.pct}% del total</p>
              </div>
            </div>
          ))}
        </IOSSection>
      )}

      {/* Money in flight (upcoming payments) */}
      {money_in_flight.items.length > 0 && (
        <IOSSection eyebrow="Pagos próximos">
          {money_in_flight.items.map(it => (
            <IOSRow
              key={it.id}
              icon={<Clock className="w-4 h-4" />}
              iconBg={cn(
                it.severity === "critical" ? "tampu-icon tampu-icon-carmin" :
                it.severity === "warning"  ? "tampu-icon tampu-icon-mostaza" :
                                             "bg-muted text-muted-foreground"
              )}
              title={it.title}
              subtitle={[it.provider || it.source, it.deadline].filter(Boolean).join(" · ")}
              value={
                <span className={cn("tabular-nums font-semibold",
                  it.severity === "critical" ? "text-destructive" :
                  it.severity === "warning"  ? "text-warning" :
                                               undefined
                )}>
                  {formatCurrency(it.base_amount)}
                </span>
              }
            />
          ))}
        </IOSSection>
      )}

      {/* Weekly buckets — compact alternative view */}
      {cashflow.weekly.length > 0 && (
        <section className="px-4 mb-8">
          <p className="ios-eyebrow">Por semana</p>
          <div className="ios-card p-5 space-y-3">
            {cashflow.weekly.map(w => {
              const total = w.expenses + w.payments_due;
              const max = Math.max(...cashflow.weekly.map(x => x.expenses + x.payments_due), 1);
              return (
                <div key={w.week_start}>
                  <div className="flex items-center justify-between text-[13px] mb-1">
                    <span className="font-medium">Semana del {w.week_start.slice(5)}</span>
                    <span className="tabular-nums font-semibold">{formatCurrency(total)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden flex">
                    <div className="h-full bg-primary" style={{ width: `${(w.expenses / max) * 100}%` }} />
                    <div className="h-full bg-warning" style={{ width: `${(w.payments_due / max) * 100}%` }} />
                  </div>
                  <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
                    <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mr-1" />gastos {formatCurrency(w.expenses)}</span>
                    <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-warning mr-1" />pagos {formatCurrency(w.payments_due)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-wider uppercase text-white/60 mb-1 truncate">{label}</p>
      <p className="text-[14px] font-bold tabular-nums truncate">{value}</p>
    </div>
  );
}

function CashflowSkeleton() {
  return (
    <div className="animate-fade-in">
      <div className="px-5 pt-4 pb-5"><div className="h-3 w-28 skeleton rounded mb-2" /><div className="h-10 w-44 skeleton rounded-xl" /></div>
      <div className="px-4"><div className="h-52 rounded-[var(--radius-xl)] skeleton" /></div>
      <div className="px-4 mt-6"><div className="h-24 rounded-[var(--radius)] skeleton" /></div>
      <div className="px-4 mt-6"><div className="h-56 rounded-[var(--radius)] skeleton" /></div>
    </div>
  );
}

// Keep TrendingUp referenced for future stat icons
void TrendingUp;
