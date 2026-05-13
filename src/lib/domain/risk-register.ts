import type { Trip, Task, Reservation, Document, TripDay, BudgetSummary } from "@/lib/types/database";
import { daysUntil } from "@/lib/utils/helpers";

export type RiskDomain = "health" | "documents" | "money" | "lodging" | "transport";
export type RiskStatus = "green" | "yellow" | "orange" | "red" | "gray";

export interface DomainRisk {
  domain: RiskDomain;
  status: RiskStatus;
  open_count: number;
  total_count: number;
  top_issue: string | null;
  top_issue_detail: string | null;
  deep_link: string;
}

export interface RiskRegister {
  overall: RiskStatus;
  domains: DomainRisk[];
  open_total: number;
}

function statusFromRatio(open: number, total: number): RiskStatus {
  if (total === 0) return "gray";
  const pct = (open / total) * 100;
  if (pct === 0) return "green";
  if (pct < 25) return "yellow";
  if (pct < 50) return "orange";
  return "red";
}

function worst(a: RiskStatus, b: RiskStatus): RiskStatus {
  const order: RiskStatus[] = ["gray", "green", "yellow", "orange", "red"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

export function buildRiskRegister(
  trip: Trip,
  tasks: Task[],
  reservations: Reservation[],
  documents: Document[],
  tripDays: TripDay[],
  budget: BudgetSummary,
): RiskRegister {
  // ─── HEALTH ───
  const healthTasks = tasks.filter(t => t.category === "health" || t.category === "insurance" || t.subcategory === "vaccinations");
  const healthOpen = healthTasks.filter(t => t.status !== "done" && t.status !== "cancelled" && (t.criticality === "blocker" || t.criticality === "essential"));
  const healthInsurance = reservations.find(r => r.type === "insurance");
  let healthStatus = statusFromRatio(healthOpen.length, Math.max(1, healthTasks.length));
  if (healthInsurance && healthInsurance.status === "pending" && (healthInsurance.criticality === "blocker" || healthInsurance.criticality === "essential")) {
    healthStatus = worst(healthStatus, "red");
  }
  const healthTop = healthOpen[0];
  const health: DomainRisk = {
    domain: "health", status: healthStatus,
    open_count: healthOpen.length + (healthInsurance && healthInsurance.status === "pending" ? 1 : 0),
    total_count: healthTasks.length + (healthInsurance ? 1 : 0),
    top_issue: healthTop?.title || (healthInsurance && healthInsurance.status === "pending" ? "Seguro de viaje no contratado" : null),
    top_issue_detail: healthTop?.next_action || healthInsurance?.notes || null,
    deep_link: "/tasks",
  };

  // ─── DOCUMENTS ───
  const critDocs = documents.filter(d => (d.criticality === "blocker" || d.criticality === "essential") && d.status !== "not_applicable");
  const docsOpen = critDocs.filter(d => d.status !== "ready");
  const docsNoOffline = documents.filter(d => d.status === "ready" && !d.has_offline_copy && (d.criticality === "blocker" || d.criticality === "essential"));
  let docsStatus = statusFromRatio(docsOpen.length, Math.max(1, critDocs.length));
  if (docsNoOffline.length > 0 && docsStatus === "green") docsStatus = "yellow";
  const documentsRisk: DomainRisk = {
    domain: "documents", status: docsStatus,
    open_count: docsOpen.length,
    total_count: critDocs.length,
    top_issue: docsOpen[0]?.name || (docsNoOffline[0] ? `${docsNoOffline[0].name} sin copia offline` : null),
    top_issue_detail: docsOpen[0]?.action_required || (docsNoOffline[0] ? "Descargar y guardar offline" : null),
    deep_link: "/documents",
  };

  // ─── MONEY ───
  const overCats = budget.categories.filter(c => c.percent >= 100 && c.budgeted > 0);
  const moneyStatus: RiskStatus =
    budget.forecast_status === "red" ? "red"
    : budget.forecast_status === "orange" ? "orange"
    : overCats.length > 0 ? "yellow"
    : budget.forecast_status === "yellow" ? "yellow"
    : "green";
  const moneyTop = budget.forecast_total > budget.total_budget
    ? `Forecast excede en ${Math.round(budget.forecast_total - budget.total_budget)}`
    : overCats[0]?.label || null;
  const money: DomainRisk = {
    domain: "money", status: moneyStatus,
    open_count: overCats.length + (budget.forecast_total > budget.total_budget ? 1 : 0),
    total_count: budget.categories.length,
    top_issue: moneyTop ? `Categoría sobre presupuesto: ${moneyTop}` : null,
    top_issue_detail: overCats[0] ? `${overCats[0].percent}% usado` : null,
    deep_link: "/budget",
  };

  // ─── LODGING ───
  const totalNights = tripDays.length;
  const uncovered = tripDays.filter(d => !d.accommodation || d.accommodation.toLowerCase().startsWith("pending"));
  let lodgingStatus = statusFromRatio(uncovered.length, Math.max(1, totalNights));
  const daysToTrip = daysUntil(trip.start_date);
  if (uncovered.length > 0 && daysToTrip <= 30) lodgingStatus = worst(lodgingStatus, "orange");
  if (uncovered.length > 0 && daysToTrip <= 14) lodgingStatus = "red";
  const lodging: DomainRisk = {
    domain: "lodging", status: lodgingStatus,
    open_count: uncovered.length,
    total_count: totalNights,
    top_issue: uncovered.length > 0 ? `${uncovered.length} noches sin cubrir` : null,
    top_issue_detail: uncovered.length > 0 ? `Ciudades: ${[...new Set(uncovered.map(d => d.city_name).filter(Boolean))].join(", ")}` : null,
    deep_link: "/itinerary",
  };

  // ─── TRANSPORT ───
  const flights = reservations.filter(r => r.type === "flight" || r.type === "train" || r.type === "bus");
  const flightsCritical = flights.filter(r => r.criticality === "blocker" || r.criticality === "essential");
  const flightsOpen = flightsCritical.filter(r => r.status === "pending");
  let transportStatus = statusFromRatio(flightsOpen.length, Math.max(1, flightsCritical.length));
  if (flightsOpen.length > 0 && daysToTrip <= 30) transportStatus = worst(transportStatus, "orange");
  if (flightsOpen.length > 0 && daysToTrip <= 14) transportStatus = "red";
  const transport: DomainRisk = {
    domain: "transport", status: transportStatus,
    open_count: flightsOpen.length,
    total_count: flightsCritical.length,
    top_issue: flightsOpen[0]?.description.substring(0, 60) || null,
    top_issue_detail: flightsOpen[0]?.provider || null,
    deep_link: "/reservations",
  };

  const domains: DomainRisk[] = [health, documentsRisk, money, lodging, transport];
  const overall = domains.reduce<RiskStatus>((acc, d) => worst(acc, d.status), "gray");
  const open_total = domains.reduce((s, d) => s + d.open_count, 0);
  return { overall, domains, open_total };
}
