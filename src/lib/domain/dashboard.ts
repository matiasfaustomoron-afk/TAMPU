import type { Trip, Task, Reservation, BudgetCategory, Expense, Document, PackingItem, Alert, TripDay, DashboardData } from "@/lib/types/database";
import { calculateBudgetSummary } from "./forecast";
import { calculateReadiness } from "./readiness-score";
import { generateAlerts } from "./alert-engine";
import { daysUntil, daysBetween } from "@/lib/utils/helpers";

export function buildDashboardData(
  trip: Trip,
  tasks: Task[],
  reservations: Reservation[],
  budgetCategories: BudgetCategory[],
  expenses: Expense[],
  documents: Document[],
  packingItems: PackingItem[],
  _seedAlerts: Alert[],
  tripDays: TripDay[]
): DashboardData {
  const budget = calculateBudgetSummary(trip, budgetCategories, expenses, reservations);
  const readiness = calculateReadiness(trip, tasks, reservations, documents, packingItems, budget, tripDays);
  const dynamicAlerts = generateAlerts(trip, tasks, reservations, documents, packingItems, tripDays, budget);

  const now = new Date().toISOString().split("T")[0];
  const pendingTasks = tasks.filter(t => t.status !== "done" && t.status !== "cancelled");
  const overdueTasks = pendingTasks.filter(t => t.due_date && t.due_date < now);
  const criticalPending = pendingTasks.filter(t => t.priority === "critical" || t.criticality === "blocker");
  const blockers = pendingTasks.filter(t => t.is_blocker);

  const confirmedRes = reservations.filter(r => ["confirmed", "paid"].includes(r.status));
  const pendingRes = reservations.filter(r => r.status === "pending");
  const criticalPendingRes = pendingRes.filter(r => r.criticality === "blocker" || r.criticality === "essential");

  const upcomingTasks = pendingTasks
    .filter(t => t.due_date)
    .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""))
    .slice(0, 10);

  return {
    trip, readiness, budget,
    tasks_summary: {
      total: tasks.length,
      done: tasks.filter(t => t.status === "done").length,
      pending: pendingTasks.length,
      critical_pending: criticalPending.length,
      overdue: overdueTasks.length,
      blockers: blockers.length,
    },
    reservations_summary: {
      total: reservations.length,
      confirmed: confirmedRes.length,
      pending: pendingRes.length,
      critical_pending: criticalPendingRes.length,
    },
    alerts: dynamicAlerts,
    upcoming_tasks: upcomingTasks,
    days_until_trip: daysUntil(trip.start_date),
    days_until_end: daysUntil(trip.end_date),
    trip_duration: daysBetween(trip.start_date, trip.end_date),
  };
}
