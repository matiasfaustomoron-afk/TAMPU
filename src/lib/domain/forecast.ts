import type { Trip, Expense, Reservation, BudgetCategory, BudgetSummary, CategoryBudget } from "@/lib/types/database";
import { daysUntil, percentOf } from "@/lib/utils/helpers";

export function calculateBudgetSummary(
  trip: Trip,
  categories: BudgetCategory[],
  expenses: Expense[],
  reservations: Reservation[]
): BudgetSummary {
  const totalBudget = trip.total_budget;
  const contingency = trip.contingency_amount;

  const totalSpent = expenses.reduce((sum, e) => sum + e.base_amount, 0);

  // Committed = booked/confirmed reservations not already in expenses
  const expenseReservationIds = new Set(
    expenses.filter(e => e.reservation_id).map(e => e.reservation_id)
  );
  const totalCommitted = reservations
    .filter(r => ["booked", "confirmed", "paid"].includes(r.status) && !expenseReservationIds.has(r.id))
    .reduce((sum, r) => sum + r.base_amount, 0);

  const available = totalBudget - totalSpent - totalCommitted;
  const percentUsed = percentOf(totalSpent + totalCommitted, totalBudget);

  // Forecast
  const daysElapsed = Math.max(0, -daysUntil(trip.start_date));
  const daysRemaining = Math.max(0, daysUntil(trip.end_date));

  const variableExpenses = expenses.filter(e => !e.is_fixed);
  const variableTotal = variableExpenses.reduce((sum, e) => sum + e.base_amount, 0);
  const fixedTotal = totalSpent - variableTotal;

  let forecastTotal: number;
  if (daysElapsed > 0 && daysRemaining > 0) {
    const dailyRate = variableTotal / daysElapsed;
    forecastTotal = fixedTotal + totalCommitted + variableTotal + (dailyRate * daysRemaining);
  } else {
    forecastTotal = totalSpent + totalCommitted;
  }

  const forecastStatus: "green" | "yellow" | "orange" | "red" =
    forecastTotal <= totalBudget * 0.8 ? "green"
    : forecastTotal <= totalBudget ? "yellow"
    : forecastTotal <= totalBudget * 1.1 ? "orange"
    : "red";

  // Per-category breakdown
  const catMap = new Map<string, { budgeted: number; spent: number; committed: number }>();
  for (const cat of categories) {
    catMap.set(cat.category, { budgeted: cat.budgeted_amount, spent: 0, committed: 0 });
  }
  for (const e of expenses) {
    const c = catMap.get(e.category);
    if (c) c.spent += e.base_amount;
    else catMap.set(e.category, { budgeted: 0, spent: e.base_amount, committed: 0 });
  }

  const categoryBudgets: CategoryBudget[] = categories.map(cat => {
    const data = catMap.get(cat.category) || { budgeted: 0, spent: 0, committed: 0 };
    const remaining = data.budgeted - data.spent - data.committed;
    const pct = percentOf(data.spent + data.committed, data.budgeted || 1);
    const status: "green" | "yellow" | "orange" | "red" =
      pct < 80 ? "green" : pct < 95 ? "yellow" : pct < 110 ? "orange" : "red";
    return { category: cat.category, label: cat.label, budgeted: data.budgeted, spent: data.spent, committed: data.committed, remaining, percent: pct, status };
  });

  return {
    total_budget: totalBudget,
    contingency,
    effective_budget: totalBudget,
    total_spent: totalSpent,
    total_committed: totalCommitted,
    available,
    percent_used: percentUsed,
    forecast_total: forecastTotal,
    forecast_status: forecastStatus,
    categories: categoryBudgets,
  };
}
