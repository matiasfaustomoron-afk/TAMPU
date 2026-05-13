import type { Reservation, Task, Trip } from "@/lib/types/database";
import { daysUntil } from "@/lib/utils/helpers";

export interface MoneyInFlightItem {
  id: string;
  source: "reservation" | "task";
  title: string;
  provider: string | null;
  deadline: string;
  days_until: number;
  amount: number;
  currency: string;
  base_amount: number;
  severity: "info" | "warning" | "critical";
  deep_link: string;
}

export interface MoneyInFlightSummary {
  items: MoneyInFlightItem[];
  total_base_7d: number;
  total_base_30d: number;
  total_base_all: number;
  critical_count: number;
}

/**
 * Money in Flight = future cash outflows the user is committed to but hasn't paid yet.
 * Covers:
 *  - pending/booked reservations with payment_deadline
 *  - tasks that require_payment with a due_date and unpaid actual_amount
 */
export function buildMoneyInFlight(trip: Trip, reservations: Reservation[], tasks: Task[]): MoneyInFlightSummary {
  const items: MoneyInFlightItem[] = [];

  for (const r of reservations) {
    if (r.status === "cancelled" || r.status === "expired" || r.status === "paid") continue;
    if (!r.payment_deadline) continue;
    const dl = daysUntil(r.payment_deadline);
    if (dl < -3) continue;
    const base = r.base_amount > 0 ? r.base_amount : 0;
    const sev: MoneyInFlightItem["severity"] = dl <= trip.alert_days_critical ? "critical" : dl <= trip.alert_days_warning ? "warning" : "info";
    items.push({
      id: r.id,
      source: "reservation",
      title: r.description,
      provider: r.provider,
      deadline: r.payment_deadline,
      days_until: dl,
      amount: r.original_amount,
      currency: r.original_currency,
      base_amount: base,
      severity: sev,
      deep_link: "/reservations",
    });
  }

  for (const t of tasks) {
    if (!t.requires_payment) continue;
    if (t.status === "done" || t.status === "cancelled") continue;
    if (t.actual_amount && t.actual_amount > 0) continue;
    if (!t.due_date) continue;
    const dl = daysUntil(t.due_date);
    if (dl < -3) continue;
    const est = t.estimated_amount ?? 0;
    const sev: MoneyInFlightItem["severity"] = dl <= trip.alert_days_critical ? "critical" : dl <= trip.alert_days_warning ? "warning" : "info";
    items.push({
      id: t.id,
      source: "task",
      title: t.title,
      provider: null,
      deadline: t.due_date,
      days_until: dl,
      amount: est,
      currency: trip.base_currency,
      base_amount: est,
      severity: sev,
      deep_link: `/tasks/${t.id}`,
    });
  }

  items.sort((a, b) => a.days_until - b.days_until);

  const total_base_7d = items.filter(i => i.days_until <= 7 && i.days_until >= -3).reduce((s, i) => s + i.base_amount, 0);
  const total_base_30d = items.filter(i => i.days_until <= 30 && i.days_until >= -3).reduce((s, i) => s + i.base_amount, 0);
  const total_base_all = items.reduce((s, i) => s + i.base_amount, 0);
  const critical_count = items.filter(i => i.severity === "critical").length;

  return { items, total_base_7d, total_base_30d, total_base_all, critical_count };
}
