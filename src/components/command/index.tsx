"use client";

import React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Semaphore, ScoreRing } from "@/components/shared";
import { cn } from "@/lib/utils/helpers";
import type { TripModeInfo } from "@/lib/domain/trip-mode";
import type { QuickAccessSnapshot } from "@/lib/domain/quick-access";
import type { TodayCard as TodayCardData, Next7Day } from "@/lib/domain/command-center";
import type { MoneyInFlightSummary, MoneyInFlightItem } from "@/lib/domain/money-in-flight";
import type { CashflowSummary } from "@/lib/domain/cashflow";
import type { RiskRegister, RiskStatus, DomainRisk } from "@/lib/domain/risk-register";
import type { DecisionItem } from "@/lib/domain/decisions";
import {
  Plane, Home, Shield, Phone, FileText, AlertTriangle, Calendar,
  CheckCircle2, Clock, ArrowRight, TrendingUp, Heart,
  Wallet, Activity, MapPin, Bus,
} from "lucide-react";

// Destination-aware hue (0-360) — every trip gets a unique color identity
function destinationHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

// ─── COUNTDOWN HERO — editorial, full-bleed ───
export function CountdownHero({
  tripName, destination, mode, daysUntilStart, tripDuration, readinessScore,
  formatDate, startDate, endDate, modeLabel, t,
}: {
  tripName: string; destination: string; mode: TripModeInfo["mode"];
  daysUntilStart: number; tripDuration: number; readinessScore: number;
  formatDate: (d: string, s?: "short" | "long" | "iso") => string;
  startDate: string; endDate: string; modeLabel: string;
  t: { daysToGo: string; departs: string; today: string; tripInProgress: string };
}) {
  const showCountdown = mode === "planning" || mode === "pre_departure";
  const hue = destinationHue(destination || tripName);
  const hue2 = (hue + 55) % 360;

  // Stage 1 visual hierarchy: hero is the SCREEN, not a card.
  return (
    <section
      className="relative -mx-4 sm:-mx-6 lg:-mx-8 overflow-hidden grain"
      style={{
        background: `radial-gradient(ellipse at 20% 0%, oklch(0.45 0.20 ${hue} / 0.55), transparent 55%),
                     radial-gradient(ellipse at 90% 90%, oklch(0.35 0.22 ${hue2} / 0.50), transparent 60%),
                     linear-gradient(180deg, oklch(0.18 0.05 ${hue}), oklch(0.13 0.03 ${hue}))`,
      }}
    >
      {/* Decorative blur orbs for depth */}
      <div className="pointer-events-none absolute -top-32 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-50" style={{ background: `oklch(0.65 0.22 ${hue})` }} aria-hidden />
      <div className="pointer-events-none absolute bottom-0 right-1/3 w-80 h-80 rounded-full blur-3xl opacity-40" style={{ background: `oklch(0.60 0.20 ${hue2})` }} aria-hidden />

      <div className="relative px-4 sm:px-8 lg:px-12 py-14 sm:py-20 lg:py-24 max-w-5xl mx-auto">
        {/* Mode pill */}
        <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] bg-white/10 text-white/80 ring-1 ring-white/15 backdrop-blur-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
          {modeLabel}
        </span>

        {/* Editorial title — serif, generous */}
        <h1 className="font-serif text-white text-[clamp(2.75rem,8vw,5.5rem)] leading-[0.95] mt-6 max-w-3xl">
          {tripName}
        </h1>

        {/* Subtitle: destination */}
        <p className="text-white/70 text-lg sm:text-xl mt-4 max-w-2xl font-light">
          {destination}
        </p>

        {/* Date line */}
        <p className="text-white/50 text-sm mt-2 tabular-nums">
          {formatDate(startDate, "long")} <span className="opacity-50 mx-1">—</span> {formatDate(endDate, "long")}
          <span className="opacity-50 mx-2">·</span> {tripDuration} días
        </p>

        {/* Countdown + readiness — minimal, anchored to the bottom-left */}
        <div className="mt-10 sm:mt-14 flex flex-wrap items-end gap-x-12 gap-y-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-white/50 mb-1">
              {showCountdown ? t.daysToGo : t.tripInProgress}
            </p>
            <p className="font-serif text-white text-[clamp(4rem,14vw,9rem)] leading-[0.85] tabular-nums">
              {showCountdown ? (daysUntilStart > 0 ? daysUntilStart : t.today) : "—"}
            </p>
          </div>

          <div className="flex items-end gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-white/50 mb-2">
                Readiness
              </p>
              <ScoreRing score={readinessScore} size={84} />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom gradient fade into page */}
      <div
        className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
        style={{ background: "linear-gradient(180deg, transparent, var(--color-background))" }}
        aria-hidden
      />
    </section>
  );
}

// ─── QUICK ACCESS BAR ───
export function QuickAccessBar({ snapshot, t, formatDate }: {
  snapshot: QuickAccessSnapshot;
  t: { passport: string; insurance: string; nextFlight: string; bed: string; emergency: string; offline: string; ready: string; missing: string };
  formatDate: (d: string, s?: "short" | "long" | "iso") => string;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      <QABlock
        icon={<FileText className="w-4 h-4" />}
        label={t.passport}
        value={snapshot.passport ? (snapshot.passport.ready ? t.ready : t.missing) : t.missing}
        sub={snapshot.passport?.name}
        status={snapshot.passport?.ready ? "green" : "red"}
        href="/vault"
      />
      <QABlock
        icon={<Shield className="w-4 h-4" />}
        label={t.insurance}
        value={snapshot.insurance?.status === "confirmed" || snapshot.insurance?.status === "paid" || snapshot.insurance?.status === "ready" ? t.ready : t.missing}
        sub={snapshot.insurance?.provider}
        status={snapshot.insurance && (snapshot.insurance.status === "confirmed" || snapshot.insurance.status === "paid" || snapshot.insurance.status === "ready") ? "green" : "red"}
        href="/reservations"
      />
      <QABlock
        icon={<Plane className="w-4 h-4" />}
        label={t.nextFlight}
        value={snapshot.next_flight ? formatDate(snapshot.next_flight.date) : t.missing}
        sub={snapshot.next_flight?.provider}
        status={snapshot.next_flight ? "green" : "orange"}
        href="/reservations"
      />
      <QABlock
        icon={<Home className="w-4 h-4" />}
        label={t.bed}
        value={snapshot.current_bed?.city || t.missing}
        sub={snapshot.current_bed?.address || undefined}
        status={snapshot.current_bed ? "green" : "orange"}
        href="/itinerary"
      />
      <QABlock
        icon={<Phone className="w-4 h-4" />}
        label={t.emergency}
        value={`${snapshot.emergency_contacts.length}`}
        sub={snapshot.emergency_contacts[0]?.name}
        status={snapshot.emergency_contacts.length > 0 ? "green" : "orange"}
        href="/vault"
      />
    </div>
  );
}

function QABlock({ icon, label, value, sub, status, href }: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  status: "green" | "orange" | "red"; href: string;
}) {
  const borderColor = status === "green" ? "border-l-success" : status === "orange" ? "border-l-primary" : "border-l-destructive";
  return (
    <Link href={href} className="block group">
      <Card className={cn("border-l-4 hover:shadow-md transition-all", borderColor)}>
        <div className="p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] uppercase tracking-wider">
            {icon}<span>{label}</span>
          </div>
          <p className="text-sm font-semibold mt-1 truncate">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
        </div>
      </Card>
    </Link>
  );
}

// ─── TODAY CARD ───
export function TodayCard({ data, t, formatCurrency }: {
  data: TodayCardData;
  t: { title: string; day: string; sleep: string; activity: string; transport: string; estCost: string; dueToday: string; alertsToday: string; viewDay: string };
  formatCurrency: (n: number, c?: string) => string;
}) {
  return (
    <Card className="border-l-4 border-l-success bg-success/[0.02]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider text-success">
            <Activity className="w-4 h-4" />{t.title}{data.trip_day_number && ` · ${t.day} ${data.trip_day_number}`}
          </h2>
          <Link href="/today" className="text-xs text-primary hover:underline flex items-center gap-1">
            {t.viewDay} <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <Home className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase text-muted-foreground">{t.sleep}</p>
                <p className="text-xs font-medium truncate">{data.accommodation || "—"}</p>
                {data.city && <p className="text-[10px] text-muted-foreground">{data.city}</p>}
              </div>
            </div>
            {data.main_activity && (
              <div className="flex items-start gap-2">
                <Activity className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase text-muted-foreground">{t.activity}</p>
                  <p className="text-xs">{data.main_activity}</p>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {data.next_transport && (
              <div className="flex items-start gap-2">
                <Bus className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase text-muted-foreground">{t.transport}</p>
                  <p className="text-xs">{data.next_transport}</p>
                </div>
              </div>
            )}
            {data.estimated_cost > 0 && (
              <div className="flex items-start gap-2">
                <Wallet className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase text-muted-foreground">{t.estCost}</p>
                  <p className="text-xs font-medium">{formatCurrency(data.estimated_cost)}</p>
                </div>
              </div>
            )}
            {(data.due_today_count > 0 || data.alerts_today_count > 0) && (
              <div className="flex items-center gap-2 mt-2">
                {data.due_today_count > 0 && (
                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    {data.due_today_count} {t.dueToday}
                  </span>
                )}
                {data.alerts_today_count > 0 && (
                  <span className="text-[10px] bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">
                    {data.alerts_today_count} {t.alertsToday}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── NEXT 7 DAYS ───
export function Next7DaysStrip({ days, t, formatCurrency }: {
  days: Next7Day[];
  t: { title: string; today: string; preTrip: string; tripDay: string };
  formatCurrency: (n: number, c?: string) => string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Calendar className="w-4 h-4" />{t.title}</h2>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
          {days.map(d => (
            <div key={d.date} className={cn(
              "shrink-0 w-32 rounded-lg border p-2.5 transition-colors",
              d.is_today ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "bg-card",
              d.is_pre_trip && !d.is_today && "opacity-80"
            )}>
              <div className="flex items-center justify-between mb-1">
                <p className={cn("text-[10px] uppercase font-semibold", d.is_today ? "text-primary" : "text-muted-foreground")}>
                  {d.is_today ? t.today : d.day_label}
                </p>
                {d.alert_count > 0 && (
                  <span className="text-[9px] bg-destructive/10 text-destructive px-1 rounded-full">{d.alert_count}</span>
                )}
              </div>
              {d.city ? (
                <p className="text-xs font-medium truncate flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                  {d.city}
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground italic">{t.preTrip}</p>
              )}
              {d.accommodation && (
                <p className="text-[10px] text-muted-foreground truncate mt-0.5 flex items-center gap-0.5">
                  <Home className="w-2.5 h-2.5 shrink-0" /> {d.accommodation}
                </p>
              )}
              {d.top_task && (
                <p className="text-[10px] text-primary truncate mt-1">→ {d.top_task}</p>
              )}
              {d.task_count > 1 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">+{d.task_count - 1} más</p>
              )}
              {d.estimated_cost > 0 && (
                <p className="text-[10px] font-medium mt-1 tabular-nums">{formatCurrency(d.estimated_cost)}</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── MONEY IN FLIGHT ───
export function MoneyInFlightCard({ summary, t, formatCurrency, formatDate }: {
  summary: MoneyInFlightSummary;
  t: { title: string; pending: string; next7: string; next30: string; total: string; viewAll: string; noPayments: string; daysShort: string; lateShort: string };
  formatCurrency: (n: number, c?: string) => string;
  formatDate: (d: string, s?: "short" | "long" | "iso") => string;
}) {
  const hasItems = summary.items.length > 0;
  return (
    <Card className={cn(summary.critical_count > 0 ? "border-l-4 border-l-destructive" : "border-l-4 border-l-primary")}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider">
            <Wallet className="w-4 h-4" />{t.title}
          </h2>
          <span className="text-[10px] text-muted-foreground">{summary.items.length} {t.pending}</span>
        </div>
        {hasItems ? (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-md bg-destructive/5 p-2 text-center">
                <p className="text-[10px] uppercase text-muted-foreground">{t.next7}</p>
                <p className="text-base font-bold tabular-nums text-destructive">{formatCurrency(summary.total_base_7d)}</p>
              </div>
              <div className="rounded-md bg-primary/5 p-2 text-center">
                <p className="text-[10px] uppercase text-muted-foreground">{t.next30}</p>
                <p className="text-base font-bold tabular-nums text-primary">{formatCurrency(summary.total_base_30d)}</p>
              </div>
              <div className="rounded-md bg-muted/30 p-2 text-center">
                <p className="text-[10px] uppercase text-muted-foreground">{t.total}</p>
                <p className="text-base font-bold tabular-nums">{formatCurrency(summary.total_base_all)}</p>
              </div>
            </div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto scrollbar-thin">
              {summary.items.slice(0, 6).map(it => <MoneyItem key={it.id} item={it} formatCurrency={formatCurrency} formatDate={formatDate} daysShort={t.daysShort} lateShort={t.lateShort} />)}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground py-4 text-center">{t.noPayments}</p>
        )}
      </CardContent>
    </Card>
  );
}

function MoneyItem({ item, formatCurrency, formatDate, daysShort, lateShort }: {
  item: MoneyInFlightItem;
  formatCurrency: (n: number, c?: string) => string;
  formatDate: (d: string, s?: "short" | "long" | "iso") => string;
  daysShort: string;
  lateShort: string;
}) {
  const sevColor = item.severity === "critical" ? "text-destructive" : item.severity === "warning" ? "text-primary" : "text-muted-foreground";
  return (
    <Link href={item.deep_link} className="block p-2 rounded-md hover:bg-accent/30 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium truncate">{item.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] text-muted-foreground">{item.provider || item.source}</span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className={cn("text-[10px] tabular-nums", sevColor)}>
              {item.days_until < 0 ? `${Math.abs(item.days_until)}${daysShort} ${lateShort}` : item.days_until === 0 ? "hoy" : `${item.days_until}${daysShort}`} ({formatDate(item.deadline)})
            </span>
          </div>
        </div>
        <p className={cn("text-xs font-semibold tabular-nums shrink-0", sevColor)}>{formatCurrency(item.base_amount)}</p>
      </div>
    </Link>
  );
}

// ─── RISK GRID ───
const RISK_ICONS: Record<string, React.ReactNode> = {
  health: <Heart className="w-4 h-4" />,
  documents: <FileText className="w-4 h-4" />,
  money: <Wallet className="w-4 h-4" />,
  lodging: <Home className="w-4 h-4" />,
  transport: <Bus className="w-4 h-4" />,
};

const RISK_BORDER: Record<RiskStatus, string> = {
  green: "border-l-success",
  yellow: "border-l-warning",
  orange: "border-l-primary",
  red: "border-l-destructive",
  gray: "border-l-border",
};

export function RiskGrid({ register, t }: {
  register: RiskRegister;
  t: { title: string; allClear: string; openIssues: string; domains: Record<string, string> };
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider"><AlertTriangle className="w-4 h-4" />{t.title}</h2>
          <div className="flex items-center gap-2">
            <Semaphore status={register.overall} size={10} />
            <span className="text-[10px] text-muted-foreground">{register.open_total} {t.openIssues}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {register.domains.map(d => <RiskCell key={d.domain} risk={d} label={t.domains[d.domain]} />)}
        </div>
      </CardContent>
    </Card>
  );
}

function RiskCell({ risk, label }: { risk: DomainRisk; label: string }) {
  return (
    <Link href={risk.deep_link}>
      <Card className={cn("border-l-4 hover:shadow-md transition-all h-full", RISK_BORDER[risk.status])}>
        <div className="p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-muted-foreground">{RISK_ICONS[risk.domain]}</span>
            <Semaphore status={risk.status} size={8} />
          </div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-sm font-bold tabular-nums">{risk.open_count}/{risk.total_count}</p>
          {risk.top_issue && <p className="text-[10px] text-muted-foreground truncate mt-1">{risk.top_issue}</p>}
        </div>
      </Card>
    </Link>
  );
}

// ─── DECISIONS LIST ───
export function DecisionsList({ decisions, t, formatDate, max = 6 }: {
  decisions: DecisionItem[];
  t: { title: string; subtitle: string; noDecisions: string; viewAll: string };
  formatDate: (d: string, s?: "short" | "long" | "iso") => string;
  max?: number;
}) {
  const slice = decisions.slice(0, max);
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider"><Clock className="w-4 h-4" />{t.title}</h2>
            <p className="text-[10px] text-muted-foreground">{t.subtitle}</p>
          </div>
          {decisions.length > max && (
            <Link href="/tasks" className="text-xs text-primary hover:underline">{t.viewAll}</Link>
          )}
        </div>
        {slice.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-success" /> {t.noDecisions}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {slice.map(d => {
              const dot = d.urgency === "critical" ? "bg-destructive" : d.urgency === "warning" ? "bg-primary" : "bg-muted-foreground";
              return (
                <li key={`${d.source}-${d.id}`}>
                  <Link href={d.deep_link} className="flex items-start gap-2 p-2 rounded-md hover:bg-accent/30 transition-colors">
                    <span className={cn("inline-block rounded-full mt-1.5 shrink-0", dot)} style={{ width: 6, height: 6 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{d.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-muted-foreground capitalize">{d.category}</span>
                        {d.deadline && (
                          <>
                            <span className="text-[10px] text-muted-foreground">·</span>
                            <span className="text-[10px] text-muted-foreground">{formatDate(d.deadline)}</span>
                          </>
                        )}
                        {d.suggested_action && (
                          <span className="text-[10px] text-primary truncate">→ {d.suggested_action}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── CASHFLOW MINI CHART ───
export function CashflowMiniChart({ summary, formatCurrency, t }: {
  summary: CashflowSummary;
  formatCurrency: (n: number, c?: string) => string;
  t: { title: string; spent: string; committed: string; budget: string; burn: string; perDay: string };
}) {
  if (summary.buckets.length === 0) return null;
  const maxCum = Math.max(summary.total_budget, ...summary.buckets.map(b => b.cumulative));
  const W = 100; // percentage width
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider"><TrendingUp className="w-4 h-4" />{t.title}</h2>
          <Link href="/cashflow" className="text-xs text-primary hover:underline flex items-center gap-1">
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2 text-center">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">{t.spent}</p>
            <p className="text-sm font-bold tabular-nums">{formatCurrency(summary.total_spent)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">{t.committed}</p>
            <p className="text-sm font-bold tabular-nums">{formatCurrency(summary.total_committed_future)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">{t.budget}</p>
            <p className="text-sm font-bold tabular-nums">{formatCurrency(summary.total_budget)}</p>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} 30`} className="w-full h-12" preserveAspectRatio="none">
          {/* budget line */}
          <polyline
            points={summary.buckets.map((b, i) => `${(i / (summary.buckets.length - 1)) * W},${30 - (b.budget_line / maxCum) * 28}`).join(" ")}
            fill="none" stroke="rgb(244, 114, 182)" strokeWidth={0.4} strokeDasharray="1.5 1" opacity={0.6}
          />
          {/* cumulative spend */}
          <polyline
            points={summary.buckets.map((b, i) => `${(i / (summary.buckets.length - 1)) * W},${30 - (b.cumulative / maxCum) * 28}`).join(" ")}
            fill="none" stroke="rgb(16, 185, 129)" strokeWidth={0.8}
          />
        </svg>
        <p className="text-[10px] text-muted-foreground mt-1">{t.burn}: <span className="font-semibold tabular-nums">{formatCurrency(summary.daily_burn_rate)}{t.perDay}</span></p>
      </CardContent>
    </Card>
  );
}

// ─── ALERTS COMPACT (uses dashboard.alerts) ───
export function AlertsCompact({ alerts, t }: {
  alerts: { id: string; title: string; description: string; severity: "critical" | "warning" | "info"; deep_link: string | null }[];
  t: { title: string; viewAll: string; noAlerts: string };
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider"><AlertTriangle className="w-4 h-4 text-primary" />{t.title} ({alerts.length})</h2>
          <Link href="/alerts" className="text-xs text-primary hover:underline">{t.viewAll}</Link>
        </div>
        {alerts.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">{t.noAlerts}</p>
        ) : (
          <ul className="space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin">
            {alerts.slice(0, 6).map(a => (
              <li key={a.id}>
                <Link href={a.deep_link || "/alerts"} className="block p-2 rounded-md hover:bg-accent/30">
                  <div className="flex items-start gap-2">
                    <Semaphore status={a.severity === "critical" ? "red" : a.severity === "warning" ? "orange" : "yellow"} size={8} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{a.title}</p>
                      <p className="text-[10px] text-muted-foreground line-clamp-2">{a.description}</p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── READINESS MINI (re-used in dashboard) ───
export function ReadinessMini({ items }: {
  items: { label: string; done: number; total: number; icon: React.ReactNode; isPercent?: boolean }[];
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {items.map(i => {
            const p = i.total > 0 ? Math.round((i.done / i.total) * 100) : 0;
            const c = p >= 80 ? "bg-success" : p >= 50 ? "bg-warning" : "bg-destructive";
            return (
              <div key={i.label} className="text-center p-2 rounded-lg bg-muted/30">
                <div className="text-muted-foreground mb-1 flex justify-center">{i.icon}</div>
                <p className="text-[10px] font-medium mb-1 truncate">{i.label}</p>
                <p className="text-xs font-bold tabular-nums">{i.isPercent ? `${i.done}%` : `${i.done}/${i.total}`}</p>
                <Progress value={p} className="h-1 mt-1.5" indicatorClassName={c} />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

