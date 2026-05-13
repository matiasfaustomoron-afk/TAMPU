"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { KPICard, SectionHeader, Semaphore } from "@/components/shared";
import { useBudgetSummary, useActiveTrip } from "@/lib/hooks/use-trip-data";
import { useI18n } from "@/i18n/provider";
import { PieChart, TrendingUp, TrendingDown } from "lucide-react";

export default function BudgetPage() {
  const { t, formatCurrency } = useI18n();
  const { data: trip } = useActiveTrip();
  const { data: budget, loading } = useBudgetSummary();
  if (loading || !budget || !trip) return <div className="animate-pulse space-y-4">{[1,2,3,4].map(i=><div key={i} className="h-24 bg-muted rounded-lg" />)}</div>;
  return (
    <div className="space-y-6 pb-20 lg:pb-0 animate-fade-in">
      <SectionHeader title={t.budget.title} subtitle={t.budget.financialHealth} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard label={t.budget.totalBudget} value={formatCurrency(budget.total_budget)} status="gray" icon={<PieChart className="w-4 h-4" />} />
        <KPICard label={t.budget.totalSpent} value={formatCurrency(budget.total_spent)} status={budget.percent_used < 80 ? "green" : "orange"} />
        <KPICard label={t.dashboard.committed} value={formatCurrency(budget.total_committed)} status="gray" />
        <KPICard label={t.dashboard.available} value={formatCurrency(budget.available)} status={budget.available > 0 ? "green" : "red"} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <KPICard label={`${t.common.used}`} value={`${budget.percent_used}%`} subtitle={`${formatCurrency(budget.total_spent + budget.total_committed)} ${t.common.of} ${formatCurrency(budget.total_budget)}`} status={budget.percent_used < 80 ? "green" : budget.percent_used < 95 ? "yellow" : "red"} />
        <KPICard label={t.dashboard.forecast} value={formatCurrency(budget.forecast_total)} subtitle={budget.forecast_total > budget.total_budget ? `${t.common.overBy} ${formatCurrency(budget.forecast_total - budget.total_budget)}` : t.common.onTrack} status={budget.forecast_status} icon={budget.forecast_total > budget.total_budget ? <TrendingUp className="w-4 h-4 text-destructive" /> : <TrendingDown className="w-4 h-4 text-success" />} />
      </div>
      <Card><CardContent className="p-4"><div className="flex items-center justify-between mb-2"><span className="text-sm font-medium">{t.budget.overall}</span><span className="text-sm text-muted-foreground">{budget.percent_used}%</span></div><div className="relative h-4 bg-muted rounded-full overflow-hidden"><div className="absolute h-full bg-success" style={{ width: `${Math.min((budget.total_spent / budget.total_budget) * 100, 100)}%` }} /><div className="absolute h-full bg-info/50" style={{ left: `${Math.min((budget.total_spent / budget.total_budget) * 100, 100)}%`, width: `${Math.min((budget.total_committed / budget.total_budget) * 100, 100)}%` }} /></div><div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success" />{t.dashboard.spent}</span><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-info/50" />{t.dashboard.committed}</span><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground" />{t.dashboard.available}</span></div></CardContent></Card>
      <Card><CardHeader><CardTitle>{t.budget.byCategory}</CardTitle></CardHeader><CardContent><div className="space-y-4">{budget.categories.filter(c => c.budgeted > 0).sort((a, b) => b.spent - a.spent).map(cat => { const bc = cat.status === "green" ? "bg-success" : cat.status === "yellow" ? "bg-warning" : cat.status === "orange" ? "bg-primary" : "bg-destructive"; return (<div key={cat.category} className="space-y-1"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Semaphore status={cat.status} /><span className="text-sm font-medium">{cat.label}</span></div><span className="text-sm tabular-nums">{formatCurrency(cat.spent)} <span className="text-muted-foreground">/ {formatCurrency(cat.budgeted)}</span></span></div><Progress value={Math.min(cat.percent, 100)} className="h-2" indicatorClassName={bc} /><div className="flex justify-between text-[10px] text-muted-foreground"><span>{cat.percent}% {t.common.used}</span><span>{formatCurrency(cat.remaining)} {t.common.remaining}</span></div></div>); })}</div></CardContent></Card>
    </div>
  );
}
