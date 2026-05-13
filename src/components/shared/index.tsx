"use client";

import { cn } from "@/lib/utils/helpers";
import { Card } from "@/components/ui/card";
import { ProgressRing as IOSProgressRing } from "@/components/ios";

// ─── KPI CARD ───
interface KPICardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
  status?: "green" | "yellow" | "orange" | "red" | "gray";
  icon?: React.ReactNode;
  className?: string;
}

const STATUS_TINT: Record<NonNullable<KPICardProps["status"]>, { bg: string; fg: string; ring: string }> = {
  green: { bg: "bg-success/10", fg: "text-success", ring: "ring-success/20" },
  yellow: { bg: "bg-warning/10", fg: "text-warning", ring: "ring-warning/20" },
  orange: { bg: "bg-primary/10", fg: "text-primary", ring: "ring-primary/20" },
  red: { bg: "bg-destructive/10", fg: "text-destructive", ring: "ring-destructive/20" },
  gray: { bg: "bg-muted", fg: "text-muted-foreground", ring: "ring-border" },
};

export function KPICard({ label, value, subtitle, status = "gray", icon, className }: KPICardProps) {
  const tint = STATUS_TINT[status];
  return (
    <Card className={cn("group transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(15,23,42,0.10)]", className)}>
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="eyebrow">{label}</p>
          {icon && (
            <span
              aria-hidden="true"
              className={cn(
                "w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center ring-1 transition-colors",
                tint.bg, tint.fg, tint.ring
              )}
            >
              {icon}
            </span>
          )}
        </div>
        <p className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums leading-none">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{subtitle}</p>}
      </div>
    </Card>
  );
}

// ─── STATUS BADGE ───
interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
  className?: string;
}

const STATUS_COLORS: Record<string, string> = {
  done: "bg-success/12 text-success ring-success/20",
  confirmed: "bg-success/12 text-success ring-success/20",
  paid: "bg-success/12 text-success ring-success/20",
  ready: "bg-success/12 text-success ring-success/20",
  packed: "bg-success/12 text-success ring-success/20",
  resolved: "bg-success/12 text-success ring-success/20",
  in_progress: "bg-info/12 text-info ring-info/20",
  booked: "bg-info/12 text-info ring-info/20",
  active: "bg-info/12 text-info ring-info/20",
  waiting: "bg-warning/12 text-warning ring-warning/20",
  pending: "bg-muted text-muted-foreground ring-border",
  empty: "bg-muted text-muted-foreground ring-border",
  partial: "bg-warning/12 text-warning ring-warning/20",
  planned: "bg-info/12 text-info ring-info/20",
  cancelled: "bg-destructive/12 text-destructive ring-destructive/20",
  expired: "bg-destructive/12 text-destructive ring-destructive/20",
  overdue: "bg-destructive/12 text-destructive ring-destructive/20",
};

export function StatusBadge({ status, size = "sm", className }: StatusBadgeProps) {
  const colorClass = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return (
    <span className={cn(
      "inline-flex items-center rounded-full ring-1 font-medium capitalize focus-ring-inline",
      size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
      colorClass,
      className
    )}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ─── PRIORITY BADGE ───
export function PriorityBadge({ priority, className }: { priority: string; className?: string }) {
  const colors: Record<string, string> = {
    low: "bg-muted text-muted-foreground ring-border",
    medium: "bg-info/12 text-info ring-info/20",
    high: "bg-primary/12 text-primary ring-primary/20",
    critical: "bg-destructive/12 text-destructive ring-destructive/20",
  };
  return (
    <span className={cn(
      "inline-flex items-center rounded-full ring-1 px-2 py-0.5 text-[10px] font-medium capitalize focus-ring-inline",
      colors[priority] || colors.medium,
      className
    )}>
      {priority}
    </span>
  );
}

// ─── SEMAPHORE ───
export function Semaphore({ status, size = 8 }: { status: "green" | "yellow" | "orange" | "red" | "gray"; size?: number }) {
  const colors = {
    green: "bg-success shadow-[0_0_8px_rgba(16,185,129,0.5)]",
    yellow: "bg-warning shadow-[0_0_8px_rgba(234,179,8,0.4)]",
    orange: "bg-primary shadow-[0_0_8px_rgba(249,115,22,0.4)]",
    red: "bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]",
    gray: "bg-muted-foreground",
  };
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block rounded-full", colors[status])}
      style={{ width: size, height: size }}
    />
  );
}

// ─── SCORE RING ───
//
// Re-export del ProgressRing canónico (en `@/components/ios`) con el wrapper
// histórico de label debajo. Mantenido para back-compat: ya estaba importado en
// dashboard/components que esperan `<ScoreRing score={…} label="…" />`.
// Por dentro usa el mismo SVG/animation que ProgressRing — no hay dos implementaciones.
export function ScoreRing({ score, size = 80, label }: { score: number; size?: number; label?: string }) {
  // ProgressRing acepta value (0-100). Mismo color thresholds.
  return (
    <div className="flex flex-col items-center">
      <IOSProgressRing value={score} size={size} stroke={4} />
      {label && (
        <span className="text-[10px] text-muted-foreground uppercase tracking-[0.08em] font-semibold mt-1">
          {label}
        </span>
      )}
    </div>
  );
}

// ─── EMPTY STATE ───
export function EmptyState({ title, description, icon, action }: { title: string; description?: string; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && (
        <div className="relative mb-5" aria-hidden="true">
          <div className="absolute inset-0 blur-2xl bg-primary/20 rounded-full" />
          <div className="relative w-16 h-16 rounded-[var(--radius)] bg-card ring-1 ring-border flex items-center justify-center text-muted-foreground">
            {icon}
          </div>
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground tracking-tight">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mt-2 max-w-md leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ─── SECTION HEADER — editorial ───
export function SectionHeader({ title, subtitle, action, eyebrow }: { title: string; subtitle?: string; action?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="flex items-end justify-between mb-8 gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="font-serif text-4xl sm:text-5xl leading-[1.05] tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-3 max-w-2xl">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ─── SKELETON BLOCK ───
//
// Primitive del shimmer system. role="status" + aria-busy para que screen readers
// anuncien "loading" sin leer el contenido. aria-label opcional para contexto.
export function SkeletonBlock({ className, label }: { className?: string; label?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label ?? "Cargando"}
      className={cn("rounded-[var(--radius-sm)] skeleton", className)}
    />
  );
}

// ─── DASHBOARD SKELETON (matches dashboard shape) ───
export function DashSkeletonShape() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando dashboard" className="space-y-4 animate-fade-in">
      <SkeletonBlock className="h-32" />
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-20" />)}
      </div>
      <SkeletonBlock className="h-40" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-28" />)}
      </div>
      <SkeletonBlock className="h-48" />
    </div>
  );
}
