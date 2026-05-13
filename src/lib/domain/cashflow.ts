import type { Trip, Expense, Reservation } from "@/lib/types/database";
import { daysBetween } from "@/lib/utils/helpers";

export interface CashflowBucket {
  date: string;
  expenses: number;
  payments_due: number;
  cumulative: number;
  budget_line: number;
}

export interface CashflowSummary {
  buckets: CashflowBucket[];
  weekly: { week_start: string; expenses: number; payments_due: number }[];
  by_destination: { city: string; spent: number; pct: number }[];
  total_spent: number;
  total_committed_future: number;
  total_budget: number;
  daily_burn_rate: number;
  peak_day: { date: string; amount: number } | null;
}

const MS_DAY = 1000 * 60 * 60 * 24;

function isoDate(d: Date): string { return d.toISOString().split("T")[0]; }

/**
 * Builds a daily cashflow series spanning [earliest signal .. trip.end_date + 7d].
 * `expenses` are realised cash outflows by their date.
 * `payments_due` are future committed outflows by their deadline.
 * `cumulative` = sum of expenses+payments_due up to and including the day.
 * `budget_line` = linear ramp from 0 to trip.total_budget over the trip span,
 *  giving the user a "you should be here by now" reference.
 */
export function buildCashflow(trip: Trip, expenses: Expense[], reservations: Reservation[]): CashflowSummary {
  const expDates = expenses.map(e => e.date).filter(Boolean);
  const payDates = reservations
    .filter(r => r.payment_deadline && r.status !== "paid" && r.status !== "cancelled" && r.status !== "expired")
    .map(r => r.payment_deadline as string);
  const allDates = [...expDates, ...payDates, trip.start_date, trip.end_date];
  const min = allDates.reduce((a, b) => (a < b ? a : b), trip.start_date);

  const start = new Date(min + "T00:00:00");
  const end = new Date(trip.end_date + "T00:00:00");
  end.setDate(end.getDate() + 7);
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_DAY));

  const expByDate = new Map<string, number>();
  for (const e of expenses) {
    expByDate.set(e.date, (expByDate.get(e.date) || 0) + e.base_amount);
  }
  const dueByDate = new Map<string, number>();
  for (const r of reservations) {
    if (!r.payment_deadline) continue;
    if (r.status === "paid" || r.status === "cancelled" || r.status === "expired") continue;
    if (r.base_amount <= 0) continue;
    dueByDate.set(r.payment_deadline, (dueByDate.get(r.payment_deadline) || 0) + r.base_amount);
  }

  const buckets: CashflowBucket[] = [];
  let cum = 0;
  const tripSpan = Math.max(1, daysBetween(trip.start_date, trip.end_date));
  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const iso = isoDate(d);
    const ex = expByDate.get(iso) || 0;
    const pd = dueByDate.get(iso) || 0;
    cum += ex + pd;
    const ds = new Date(trip.start_date + "T00:00:00");
    const offset = Math.max(0, Math.min(tripSpan, Math.round((d.getTime() - ds.getTime()) / MS_DAY)));
    const budget_line = Math.round((trip.total_budget * offset) / tripSpan);
    buckets.push({ date: iso, expenses: ex, payments_due: pd, cumulative: Math.round(cum), budget_line });
  }

  const total_spent = expenses.reduce((s, e) => s + e.base_amount, 0);
  const total_committed_future = Array.from(dueByDate.values()).reduce((s, v) => s + v, 0);

  const inTripBuckets = buckets.filter(b => b.date >= trip.start_date && b.date <= trip.end_date && (b.expenses > 0 || b.payments_due > 0));
  const burnDays = Math.max(1, inTripBuckets.length);
  const burnTotal = inTripBuckets.reduce((s, b) => s + b.expenses, 0);
  const daily_burn_rate = Math.round(burnTotal / burnDays);

  const peak = buckets.reduce<{ date: string; amount: number } | null>((acc, b) => {
    const v = b.expenses + b.payments_due;
    if (v <= 0) return acc;
    if (!acc || v > acc.amount) return { date: b.date, amount: v };
    return acc;
  }, null);

  // ─── WEEKLY BUCKETS ───
  const weeklyMap = new Map<string, { expenses: number; payments_due: number }>();
  for (const b of buckets) {
    const d = new Date(b.date + "T00:00:00");
    const dow = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((dow + 6) % 7));
    const wk = isoDate(monday);
    const w = weeklyMap.get(wk) || { expenses: 0, payments_due: 0 };
    w.expenses += b.expenses;
    w.payments_due += b.payments_due;
    weeklyMap.set(wk, w);
  }
  const weekly = Array.from(weeklyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week_start, v]) => ({ week_start, ...v }));

  // ─── BY DESTINATION ───
  const cityMap = new Map<string, number>();
  for (const e of expenses) {
    if (!e.city_name) continue;
    cityMap.set(e.city_name, (cityMap.get(e.city_name) || 0) + e.base_amount);
  }
  const totalByCity = Array.from(cityMap.values()).reduce((s, v) => s + v, 0);
  const by_destination = Array.from(cityMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([city, spent]) => ({ city, spent, pct: totalByCity > 0 ? Math.round((spent / totalByCity) * 100) : 0 }));

  return {
    buckets,
    weekly,
    by_destination,
    total_spent,
    total_committed_future,
    total_budget: trip.total_budget,
    daily_burn_rate,
    peak_day: peak,
  };
}
