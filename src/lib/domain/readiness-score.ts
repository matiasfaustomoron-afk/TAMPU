import type { Trip, Task, Reservation, Document, PackingItem, TripDay, BudgetSummary, TripReadiness } from "@/lib/types/database";
import { daysBetween, clamp, severityLevel } from "@/lib/utils/helpers";

export const READINESS_WEIGHTS = {
  critical_tasks: 25,
  critical_reservations: 20,
  critical_documents: 15,
  essential_packing: 10,
  budget_health: 15,
  itinerary_completeness: 15,
} as const;

export function calculateReadiness(
  trip: Trip,
  tasks: Task[],
  reservations: Reservation[],
  documents: Document[],
  packingItems: PackingItem[],
  budgetSummary: BudgetSummary,
  tripDays: TripDay[]
): TripReadiness {
  const criticalTasks = tasks.filter(t => t.criticality === "blocker" || t.criticality === "essential");
  const criticalTasksDone = criticalTasks.filter(t => t.status === "done").length;
  const criticalTasksTotal = criticalTasks.length;
  const taskScore = criticalTasksTotal > 0 ? (criticalTasksDone / criticalTasksTotal) * 100 : 100;

  const criticalRes = reservations.filter(r => r.criticality === "blocker" || r.criticality === "essential");
  const criticalResDone = criticalRes.filter(r => ["confirmed", "paid"].includes(r.status)).length;
  const criticalResTotal = criticalRes.length;
  const resScore = criticalResTotal > 0 ? (criticalResDone / criticalResTotal) * 100 : 100;

  const criticalDocs = documents.filter(d => d.criticality === "blocker" || d.criticality === "essential");
  const criticalDocsReady = criticalDocs.filter(d => d.status === "ready").length;
  const criticalDocsTotal = criticalDocs.length;
  const docScore = criticalDocsTotal > 0 ? (criticalDocsReady / criticalDocsTotal) * 100 : 100;

  const essentialItems = packingItems.filter(p => p.is_essential);
  const essentialDone = essentialItems.filter(p => p.status === "packed").length;
  const essentialTotal = essentialItems.length;
  const packScore = essentialTotal > 0 ? (essentialDone / essentialTotal) * 100 : 100;

  const budgetScore = budgetSummary.percent_used <= 80 ? 100
    : budgetSummary.percent_used <= 95 ? 70
    : budgetSummary.percent_used <= 110 ? 40 : 10;

  const plannedDays = tripDays.filter(d => d.status !== "empty").length;
  const totalDays = tripDays.length;
  const itinScore = totalDays > 0 ? (plannedDays / totalDays) * 100 : 0;

  const nightsTotal = daysBetween(trip.start_date, trip.end_date);
  const nightsCovered = tripDays.filter(d => d.accommodation && !d.accommodation.toLowerCase().startsWith("pending")).length;
  const nightsUncovered = nightsTotal - nightsCovered;

  const w = READINESS_WEIGHTS;
  const overall = clamp(Math.round(
    (taskScore * w.critical_tasks +
     resScore * w.critical_reservations +
     docScore * w.critical_documents +
     packScore * w.essential_packing +
     budgetScore * w.budget_health +
     itinScore * w.itinerary_completeness) / 100
  ), 0, 100);

  return {
    overall_score: overall,
    status: severityLevel(overall),
    critical_tasks_done: criticalTasksDone,
    critical_tasks_total: criticalTasksTotal,
    critical_reservations_done: criticalResDone,
    critical_reservations_total: criticalResTotal,
    critical_docs_ready: criticalDocsReady,
    critical_docs_total: criticalDocsTotal,
    essential_packing_done: essentialDone,
    essential_packing_total: essentialTotal,
    budget_health_score: budgetScore,
    itinerary_completeness: Math.round(itinScore),
    nights_total: nightsTotal,
    nights_covered: nightsCovered,
    nights_uncovered: nightsUncovered,
  };
}
