"use client";

import { Calendar, Plane, FileCheck2, Wallet } from "lucide-react";

interface Stats {
  daysUntilStart: number | null;
  flightsRemaining: number;
  documentsNeedingAction: number;
  budgetUsedPct: number;
}

interface Props {
  stats: Stats;
  baseCurrency?: string;
}

/**
 * <QuickStatsCard /> — 4-cell grid de stats clave del viaje activo.
 *
 * Diseñado para /today, arriba del fold. Lee de cc.dashboard viewmodel.
 * NO hace queries propias — el caller pasa los stats ya derivados.
 *
 * Stats:
 *   1. Días hasta el viaje (con countdown urgency color)
 *   2. Vuelos restantes (reservations de type flight con use_date > now)
 *   3. Documentos que requieren acción (status='pending' o expira soon)
 *   4. % de presupuesto consumido (con tone warning/danger)
 */
export function QuickStatsCard({ stats }: Props) {
  const { daysUntilStart, flightsRemaining, documentsNeedingAction, budgetUsedPct } = stats;

  const dayUrgency: StatCellProps["tone"] =
    daysUntilStart === null ? "muted" :
    daysUntilStart < 0 ? "muted" :
    daysUntilStart <= 7 ? "warning" :
    "primary";

  const budgetTone: StatCellProps["tone"] =
    budgetUsedPct < 70 ? "success" :
    budgetUsedPct < 95 ? "warning" : "danger";

  return (
    <div className="ios-card p-4 grid grid-cols-2 gap-3">
      <StatCell
        icon={<Calendar className="w-4 h-4" />}
        label="Días hasta el viaje"
        value={daysUntilStart === null ? "—" : daysUntilStart < 0 ? "En curso" : String(daysUntilStart)}
        tone={dayUrgency}
      />
      <StatCell
        icon={<Plane className="w-4 h-4" />}
        label="Vuelos restantes"
        value={String(flightsRemaining)}
        tone="primary"
      />
      <StatCell
        icon={<FileCheck2 className="w-4 h-4" />}
        label="Docs por revisar"
        value={String(documentsNeedingAction)}
        tone={documentsNeedingAction > 0 ? "warning" : "success"}
      />
      <StatCell
        icon={<Wallet className="w-4 h-4" />}
        label="Presupuesto"
        value={`${Math.round(budgetUsedPct)}%`}
        tone={budgetTone}
      />
    </div>
  );
}

interface StatCellProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "primary" | "muted" | "warning" | "success" | "danger";
}

function StatCell({ icon, label, value, tone }: StatCellProps) {
  const toneClass =
    tone === "primary" ? "text-foreground" :
    tone === "muted" ? "text-muted-foreground" :
    tone === "warning" ? "text-warning" :
    tone === "success" ? "text-success" :
    tone === "danger" ? "text-destructive" : "text-foreground";

  return (
    <div className="flex items-start gap-2.5">
      <div className={`mt-0.5 ${toneClass}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium leading-tight">
          {label}
        </p>
        <p className={`text-2xl font-bold leading-tight tracking-tight mt-1 ${toneClass}`}>
          {value}
        </p>
      </div>
    </div>
  );
}
