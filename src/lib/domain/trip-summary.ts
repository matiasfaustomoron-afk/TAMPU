import type { Trip, Task, Reservation, Expense, BudgetCategory, TripDay, BudgetSummary } from "@/lib/types/database";
import { daysBetween } from "@/lib/utils/helpers";

export interface CitySummary {
  city: string;
  nights: number;
  spent: number;
  expenses_count: number;
}

export interface CategoryActual {
  category: string;
  label: string;
  budgeted: number;
  actual: number;
  variance: number;
  variance_pct: number;
}

export interface TripSummary {
  trip: Trip;
  budget: BudgetSummary;
  total_actual: number;
  budget_variance: number;
  budget_variance_pct: number;
  tasks_done: number;
  tasks_total: number;
  tasks_cancelled: number;
  reservations_confirmed: number;
  reservations_total: number;
  days_planned: number;
  days_total: number;
  by_city: CitySummary[];
  by_category: CategoryActual[];
  daily_avg: number;
  highest_day: { date: string; amount: number } | null;
  lowest_day: { date: string; amount: number } | null;
  duration_days: number;
}

export function buildTripSummary(
  trip: Trip,
  tasks: Task[],
  reservations: Reservation[],
  expenses: Expense[],
  budgetCategories: BudgetCategory[],
  tripDays: TripDay[],
  budget: BudgetSummary,
): TripSummary {
  const total_actual = expenses.reduce((s, e) => s + e.base_amount, 0)
    + reservations.filter(r => ["confirmed", "paid"].includes(r.status)).reduce((s, r) => s + r.base_amount, 0);

  const budget_variance = total_actual - trip.total_budget;
  const budget_variance_pct = trip.total_budget > 0 ? Math.round((budget_variance / trip.total_budget) * 100) : 0;

  // ─── BY CITY ───
  const cityMap = new Map<string, CitySummary>();
  for (const d of tripDays) {
    if (!d.city_name) continue;
    const c = cityMap.get(d.city_name) || { city: d.city_name, nights: 0, spent: 0, expenses_count: 0 };
    c.nights += 1;
    cityMap.set(d.city_name, c);
  }
  for (const e of expenses) {
    if (!e.city_name) continue;
    const c = cityMap.get(e.city_name) || { city: e.city_name, nights: 0, spent: 0, expenses_count: 0 };
    c.spent += e.base_amount;
    c.expenses_count += 1;
    cityMap.set(e.city_name, c);
  }
  const by_city = Array.from(cityMap.values()).sort((a, b) => b.spent - a.spent || b.nights - a.nights);

  // ─── BY CATEGORY ───
  const catMap = new Map<string, { budgeted: number; actual: number }>();
  for (const c of budgetCategories) catMap.set(c.category, { budgeted: c.budgeted_amount, actual: 0 });
  for (const e of expenses) {
    const c = catMap.get(e.category) || { budgeted: 0, actual: 0 };
    c.actual += e.base_amount;
    catMap.set(e.category, c);
  }
  const by_category: CategoryActual[] = budgetCategories.map(bc => {
    const data = catMap.get(bc.category)!;
    const variance = data.actual - data.budgeted;
    const variance_pct = data.budgeted > 0 ? Math.round((variance / data.budgeted) * 100) : 0;
    return { category: bc.category, label: bc.label, budgeted: data.budgeted, actual: data.actual, variance, variance_pct };
  }).sort((a, b) => b.actual - a.actual);

  // ─── DAILY ───
  const dailyMap = new Map<string, number>();
  for (const e of expenses) dailyMap.set(e.date, (dailyMap.get(e.date) || 0) + e.base_amount);
  const dailyArr = Array.from(dailyMap.entries()).map(([date, amount]) => ({ date, amount }));
  const daily_avg = dailyArr.length > 0 ? Math.round(dailyArr.reduce((s, x) => s + x.amount, 0) / dailyArr.length) : 0;
  const highest_day = dailyArr.length > 0 ? dailyArr.reduce((a, b) => (a.amount > b.amount ? a : b)) : null;
  const lowest_day = dailyArr.length > 0 ? dailyArr.reduce((a, b) => (a.amount < b.amount ? a : b)) : null;

  return {
    trip, budget, total_actual, budget_variance, budget_variance_pct,
    tasks_done: tasks.filter(t => t.status === "done").length,
    tasks_total: tasks.length,
    tasks_cancelled: tasks.filter(t => t.status === "cancelled").length,
    reservations_confirmed: reservations.filter(r => ["confirmed", "paid"].includes(r.status)).length,
    reservations_total: reservations.length,
    days_planned: tripDays.filter(d => d.status !== "empty").length,
    days_total: tripDays.length,
    by_city, by_category,
    daily_avg, highest_day, lowest_day,
    duration_days: daysBetween(trip.start_date, trip.end_date),
  };
}
