"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader, EmptyState, KPICard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useActiveTrip, useExpenses } from "@/lib/hooks/use-trip-data";
import { useI18n } from "@/i18n/provider";
import { buildSplitSummary, parseSplitFromNotes, type SplitExpense } from "@/lib/domain/split";
import { Users, ArrowRight } from "lucide-react";

export default function SplitPage() {
  const { t, formatCurrency } = useI18n();
  const { data: trip } = useActiveTrip();
  const { data: expenses } = useExpenses(trip?.id);

  const splitExpenses = useMemo<SplitExpense[]>(() => {
    if (!expenses) return [];
    return expenses.map(e => ({ ...e, split: parseSplitFromNotes(e.notes) || undefined }));
  }, [expenses]);

  const summary = useMemo(() => buildSplitSummary(splitExpenses), [splitExpenses]);

  if (!trip) return <EmptyState title={t.split.noTrip} icon={<Users className="w-8 h-8" />} action={<Link href="/trips"><Button variant="default">{t.split.createOrPickTrip}</Button></Link>} />;

  const hasSplits = summary.count > 0;

  return (
    <div className="space-y-4 pb-20 lg:pb-0 animate-fade-in">
      <SectionHeader
        title={t.split.title}
        subtitle={hasSplits ? `${summary.count} ${t.split.subtitleCount} · ${formatCurrency(summary.total)} ${t.expenses.total.toLowerCase()}` : t.split.subtitleEmpty}
      />

      {hasSplits ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPICard label={t.split.eyebrowShared} value={`${summary.count}`} status="gray" icon={<Users className="w-4 h-4" />} />
            <KPICard label={t.expenses.total} value={formatCurrency(summary.total)} status="gray" />
            <KPICard label={t.split.people} value={`${summary.by_user.length}`} status="gray" />
            <KPICard label={t.split.settlements} value={`${summary.settlements.length}`} status={summary.settlements.length === 0 ? "green" : "yellow"} />
          </div>

          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wider">{t.split.balanceByPerson}</h3>
              <ul className="space-y-1.5">
                {summary.by_user.map(b => (
                  <li key={b.user} className="flex items-center justify-between p-2 rounded-md bg-muted/20">
                    <span className="text-sm font-medium">{b.user}</span>
                    <span className={`text-sm font-semibold tabular-nums ${b.net > 0 ? "text-success" : "text-destructive"}`}>
                      {b.net > 0 ? "+" : ""}{formatCurrency(Math.abs(b.net))}
                      <span className="text-[10px] text-muted-foreground ml-1">
                        {b.net > 0 ? t.split.owesTo : t.split.owes}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wider">{t.split.eyebrowSettlements}</h3>
              {summary.settlements.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">{t.split.allSettled}</p>
              ) : (
                <ul className="space-y-1.5">
                  {summary.settlements.map((s, i) => (
                    <li key={i} className="flex items-center gap-3 p-2 rounded-md bg-success/5 border border-success/10">
                      <span className="text-sm font-medium">{s.from}</span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                      <span className="text-sm font-medium flex-1">{s.to}</span>
                      <span className="text-sm font-bold tabular-nums">{formatCurrency(s.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="p-6 text-center space-y-2">
            <Users className="w-10 h-10 text-muted-foreground/40 mx-auto" />
            <p className="text-sm font-medium">{t.split.noSharedYet}</p>
            <p className="text-xs text-muted-foreground">
              {t.split.howTo}<br />
              <code className="text-[10px]">__SPLIT__:{`{"paid_by":"Yo","shared_with":["Yo","Ana"]}`}__</code>
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="bg-muted/20">
        <CardContent className="p-3 text-[10px] text-muted-foreground">
          {t.split.algorithm}
        </CardContent>
      </Card>
    </div>
  );
}
