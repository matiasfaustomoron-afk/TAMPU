"use client";

import { useState, useMemo, useCallback } from "react";
import { LargeTitle, IOSSection, IOSRow, Pill } from "@/components/ios";
import { EmptyState } from "@/components/shared";
import { useDynamicAlerts } from "@/lib/hooks/use-trip-data";
import { useI18n } from "@/i18n/provider";
import { toast } from "@/components/ios/toast";
import { Bell, AlertTriangle, Info, CheckCircle2, Check } from "lucide-react";
import { cn } from "@/lib/utils/helpers";

export default function AlertsPage() {
  const { t, formatDate } = useI18n();
  const { data: alerts, loading } = useDynamicAlerts();
  const [filter, setFilter] = useState<"all" | "critical" | "warning" | "info">("all");
  // ─── Dismissed in-memory set (iter 4 scope reducido) ──────────────────
  // Las alertas son derivadas (useDynamicAlerts), no rows. El "dismiss" real
  // se persiste en la tabla public.alert_dismissals (migración 00036). Iter 5
  // wirea el POST + el filter contra esa tabla. Por ahora, sesión-only.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const dismissAlert = useCallback((id: string) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    // TODO iter 5: POST alert_signature a /api/alert-dismissals + invalidar query
    toast(t.common.acknowledge, "info");
  }, [t]);

  const filtered = useMemo(() => {
    let r = alerts.filter(a => !dismissed.has(a.id));
    if (filter !== "all") r = r.filter(a => a.severity === filter);
    return r.sort((a, b) => {
      const s: Record<string, number> = { critical: 3, warning: 2, info: 1 };
      return (s[b.severity] || 0) - (s[a.severity] || 0);
    });
  }, [alerts, filter, dismissed]);

  const counts = {
    critical: alerts.filter(a => a.severity === "critical").length,
    warning:  alerts.filter(a => a.severity === "warning").length,
    info:     alerts.filter(a => a.severity === "info").length,
  };

  if (loading) return <AlertsSkeleton />;

  if (alerts.length === 0) {
    return (
      <div className="animate-fade-in">
        <LargeTitle title="Alertas" eyebrow="Notificaciones del viaje" serif />
        <div className="mt-8">
          <EmptyState
            title="Todo en orden"
            description="No hay alertas activas. Tu viaje está bajo control."
            icon={<CheckCircle2 className="w-8 h-8 text-success" />}
          />
        </div>
      </div>
    );
  }

  // Group filtered alerts by severity for iOS-style section headers
  const groups: { severity: "critical" | "warning" | "info"; items: typeof filtered }[] = [
    { severity: "critical", items: filtered.filter(a => a.severity === "critical") },
    { severity: "warning",  items: filtered.filter(a => a.severity === "warning") },
    { severity: "info",     items: filtered.filter(a => a.severity === "info") },
  ].filter(g => g.items.length > 0) as never;

  return (
    <div className="animate-fade-in">
      <LargeTitle
        eyebrow={`${alerts.length} ${alerts.length === 1 ? "alerta activa" : "alertas activas"}`}
        title="Alertas"
        serif
      />

      {/* Severity summary chips */}
      <div className="px-4 mb-4">
        <div className="grid grid-cols-3 gap-2">
          <SeverityTile
            tone="alert" icon={<AlertTriangle className="w-4 h-4" />}
            label="Críticas" count={counts.critical}
            active={filter === "critical" || filter === "all"}
            onClick={() => setFilter(filter === "critical" ? "all" : "critical")}
          />
          <SeverityTile
            tone="warn" icon={<Bell className="w-4 h-4" />}
            label="Avisos" count={counts.warning}
            active={filter === "warning" || filter === "all"}
            onClick={() => setFilter(filter === "warning" ? "all" : "warning")}
          />
          <SeverityTile
            tone="info" icon={<Info className="w-4 h-4" />}
            label="Info" count={counts.info}
            active={filter === "info" || filter === "all"}
            onClick={() => setFilter(filter === "info" ? "all" : "info")}
          />
        </div>
      </div>

      {/* Filter pill */}
      {filter !== "all" && (
        <div className="px-4 mb-2">
          <button
            onClick={() => setFilter("all")}
            className="pressable px-3 py-1 text-[12px] font-medium rounded-full bg-primary/15 text-primary"
          >
            Ver todas
          </button>
        </div>
      )}

      {/* Grouped alerts list */}
      {groups.map(({ severity, items }) => (
        <IOSSection
          key={severity}
          eyebrow={severity === "critical" ? "Críticas" : severity === "warning" ? "Avisos" : "Info"}
        >
          {items.map(a => (
            <div key={a.id} className="flex items-stretch gap-1">
              <div className="flex-1 min-w-0">
                <IOSRow
                  compact
                  icon={
                    severity === "critical" ? <AlertTriangle className="w-3.5 h-3.5" /> :
                    severity === "warning"  ? <Bell className="w-3.5 h-3.5" /> :
                                              <Info className="w-3.5 h-3.5" />
                  }
                  iconBg={
                    severity === "critical" ? "tampu-icon tampu-icon-carmin" :
                    severity === "warning"  ? "tampu-icon tampu-icon-mostaza" :
                                              "tampu-icon tampu-icon-indigo"
                  }
                  title={a.title}
                  subtitle={[a.description, a.suggested_action ? `→ ${a.suggested_action}` : null, a.target_date ? formatDate(a.target_date) : null].filter(Boolean).join(" · ")}
                  href={a.deep_link ?? undefined}
                  chevron={!!a.deep_link}
                />
              </div>
              <button
                onClick={() => dismissAlert(a.id)}
                className="pressable shrink-0 px-3 self-stretch text-muted-foreground hover:text-foreground"
                aria-label={t.common.acknowledge}
                title={t.common.acknowledge}
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          ))}
        </IOSSection>
      ))}
    </div>
  );
}

function SeverityTile({
  tone, icon, label, count, active, onClick,
}: {
  tone: "alert" | "warn" | "info";
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const tint =
    tone === "alert" ? "tampu-icon tampu-icon-carmin" :
    tone === "warn"  ? "tampu-icon tampu-icon-mostaza" :
                       "tampu-icon tampu-icon-indigo";
  return (
    <button
      onClick={onClick}
      className={cn(
        "ios-card pressable p-3 text-left transition-all",
        active ? "ring-2 ring-primary/40" : "opacity-90"
      )}
    >
      <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center mb-2", tint)}>
        {icon}
      </div>
      <p className="text-[11px] font-medium tracking-wider uppercase text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums leading-none mt-1">{count}</p>
    </button>
  );
}

function AlertsSkeleton() {
  return (
    <div className="animate-fade-in">
      <div className="px-5 pt-4 pb-5">
        <div className="h-3 w-32 skeleton rounded mb-2" />
        <div className="h-10 w-40 skeleton rounded-xl" />
      </div>
      <div className="px-4 grid grid-cols-3 gap-2">
        {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-[var(--radius)] skeleton" />)}
      </div>
      <div className="px-4 mt-6 space-y-2">
        {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-[var(--radius)] skeleton" />)}
      </div>
    </div>
  );
}

// Pill is exported for future use; mark as referenced to silence linter
void Pill;
