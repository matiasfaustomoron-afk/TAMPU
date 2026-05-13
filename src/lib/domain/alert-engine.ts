import type { Trip, Task, Reservation, Document, PackingItem, TripDay, Alert, BudgetSummary } from "@/lib/types/database";
import { daysUntil } from "@/lib/utils/helpers";
import type { WeatherWarning } from "@/lib/weather/forecast";

/**
 * Generates alerts dynamically from current data state.
 * This replaces static seed alerts — every alert is derived from actual data.
 */
export function generateAlerts(
  trip: Trip,
  tasks: Task[],
  reservations: Reservation[],
  documents: Document[],
  packingItems: PackingItem[],
  tripDays: TripDay[],
  budget: BudgetSummary
): Alert[] {
  const alerts: Alert[] = [];
  const now = new Date().toISOString().split("T")[0];
  const warnDays = trip.alert_days_warning;
  const critDays = trip.alert_days_critical;
  let seq = 0;
  const id = () => `generated-alert-${++seq}`;
  const base = { trip_id: trip.id, detected_at: new Date().toISOString(), created_at: new Date().toISOString(), status: "active" as const };

  // ─── TASK ALERTS ───

  for (const t of tasks) {
    if (t.status === "done" || t.status === "cancelled") continue;

    // ─── Sin prefijos verbales redundantes con la severity ───
    // El icono + el color + la sección ("Críticas" / "Avisos") ya transmiten urgencia.
    // El title queda con el sujeto puro (el nombre de la tarea) para evitar fatiga visual.

    // Overdue task
    if (t.due_date && t.due_date < now) {
      const daysLate = Math.abs(daysUntil(t.due_date));
      alerts.push({ ...base, id: id(), type: "task_overdue", severity: "critical", module: "tasks", origin_id: t.id,
        title: t.title, description: `Vencida hace ${daysLate} día(s)`,
        target_date: t.due_date, suggested_action: t.next_action || "Completá o re-agendá", deep_link: "/tasks" });
    }
    // Due soon
    else if (t.due_date) {
      const dl = daysUntil(t.due_date);
      if (dl <= critDays && dl >= 0) {
        alerts.push({ ...base, id: id(), type: "task_due_soon", severity: "critical", module: "tasks", origin_id: t.id,
          title: t.title, description: `Vence en ${dl}d`,
          target_date: t.due_date, suggested_action: t.next_action || "Resolvelo ahora", deep_link: "/tasks" });
      } else if (dl <= warnDays) {
        alerts.push({ ...base, id: id(), type: "task_due_soon", severity: "warning", module: "tasks", origin_id: t.id,
          title: t.title, description: `Vence en ${dl}d`,
          target_date: t.due_date, suggested_action: t.next_action || "Planeá completar pronto", deep_link: "/tasks" });
      }
    }

    // Critical task not started — SOLO si no es bloqueante (el blocker alert ya la cubre)
    if ((t.criticality === "blocker" || t.criticality === "essential") && t.status === "pending" && t.priority === "critical" && !t.is_blocker) {
      alerts.push({ ...base, id: id(), type: "task_critical_not_started", severity: "critical", module: "tasks", origin_id: t.id,
        title: t.title, description: t.description || "Crítica y sin iniciar",
        target_date: t.due_date, suggested_action: t.next_action || "Empezala ya", deep_link: "/tasks" });
    }

    // Blocker pending
    if (t.is_blocker) {
      alerts.push({ ...base, id: id(), type: "task_blocker_pending", severity: "critical", module: "tasks", origin_id: t.id,
        title: t.title, description: "Bloquea otras tareas",
        target_date: t.due_date, suggested_action: t.next_action || "Resolvelo", deep_link: "/tasks" });
    }
  }

  // ─── DOCUMENT ALERTS ───

  for (const d of documents) {
    if (d.status === "not_applicable") continue;

    // Critical document missing
    if ((d.criticality === "blocker" || d.criticality === "essential") && d.status !== "ready") {
      alerts.push({ ...base, id: id(), type: "doc_critical_missing", severity: "critical", module: "documents", origin_id: d.id,
        title: d.name, description: d.action_required || `Estado: ${d.status}`,
        target_date: d.expiry_date, suggested_action: d.action_required || "Preparalo", deep_link: "/vault" });
    }

    // Document expiring
    if (d.expiry_date && d.status === "ready") {
      const dl = daysUntil(d.expiry_date);
      if (dl >= 0 && dl <= 30) {
        alerts.push({ ...base, id: id(), type: "doc_expiring", severity: dl <= 7 ? "critical" : "warning", module: "documents", origin_id: d.id,
          title: d.name, description: `Vence en ${dl}d`,
          target_date: d.expiry_date, suggested_action: "Renovalo antes de la fecha", deep_link: "/vault" });
      }
    }

    // No offline copy for ready document
    if (d.status === "ready" && !d.has_offline_copy && (d.criticality === "blocker" || d.criticality === "essential")) {
      alerts.push({ ...base, id: id(), type: "doc_no_offline", severity: "warning", module: "documents", origin_id: d.id,
        title: d.name, description: "Sin copia offline",
        target_date: null, suggested_action: "Descargá copia offline", deep_link: "/vault" });
    }
  }

  // ─── RESERVATION ALERTS ───

  for (const r of reservations) {
    if (r.status === "cancelled" || r.status === "expired") continue;

    // Critical reservation not booked
    if ((r.criticality === "blocker" || r.criticality === "essential") && r.status === "pending") {
      const deadline = r.payment_deadline;
      const urgency = deadline && daysUntil(deadline) <= 14 ? "critical" : "warning";
      alerts.push({ ...base, id: id(), type: "reservation_critical_pending", severity: urgency as "critical" | "warning", module: "reservations", origin_id: r.id,
        title: r.description.substring(0, 60), description: `${r.provider}${deadline ? ` · Deadline ${deadline}` : ""}`,
        target_date: deadline, suggested_action: "Reservala", deep_link: "/reservations" });
    }

    // Paid but no confirmation
    if (r.status === "paid" && !r.confirmation_received) {
      alerts.push({ ...base, id: id(), type: "reservation_unconfirmed", severity: "warning", module: "reservations", origin_id: r.id,
        title: r.description.substring(0, 60), description: `Pagado a ${r.provider} sin confirmación`,
        target_date: r.use_date, suggested_action: "Pedile confirmación", deep_link: "/reservations" });
    }

    // Payment deadline approaching
    if (r.payment_deadline && r.status === "pending") {
      const dl = daysUntil(r.payment_deadline);
      if (dl >= 0 && dl <= warnDays) {
        alerts.push({ ...base, id: id(), type: "payment_due_soon", severity: dl <= critDays ? "critical" : "warning", module: "reservations", origin_id: r.id,
          title: r.description.substring(0, 50), description: `Pago vence en ${dl}d · ${r.provider}`,
          target_date: r.payment_deadline, suggested_action: "Pagá antes del deadline", deep_link: "/reservations" });
      }
    }
  }

  // ─── ITINERARY ALERTS ───

  // Nights without accommodation
  const uncoveredNights = tripDays.filter(d => {
    if (!d.accommodation) return true;
    if (d.accommodation.toLowerCase().startsWith("pending")) return true;
    return false;
  });
  if (uncoveredNights.length > 0) {
    // Group consecutive
    const cities = [...new Set(uncoveredNights.map(d => d.city_name).filter(Boolean))];
    alerts.push({ ...base, id: id(), type: "night_uncovered", severity: "warning", module: "itinerary", origin_id: null,
      title: `${uncoveredNights.length} noche(s) sin alojamiento`,
      description: `Falta dónde dormir en: ${cities.join(", ") || "ubicaciones sin asignar"}`,
      target_date: uncoveredNights[0]?.date || null, suggested_action: "Reservá las noches sin cubrir", deep_link: "/itinerary" });
  }

  // Incomplete itinerary days near trip
  const daysToTrip = daysUntil(trip.start_date);
  if (daysToTrip <= 30 && daysToTrip > 0) {
    const emptyDays = tripDays.filter(d => d.status === "empty");
    if (emptyDays.length > tripDays.length * 0.3) {
      alerts.push({ ...base, id: id(), type: "itinerary_incomplete", severity: "warning", module: "itinerary", origin_id: null,
        title: `${emptyDays.length} días sin plan`,
        description: `El viaje sale en ${daysToTrip} días y el ${Math.round((emptyDays.length / tripDays.length) * 100)}% de los días está vacío.`,
        target_date: trip.start_date, suggested_action: "Planeá los días vacíos", deep_link: "/itinerary" });
    }
  }

  // ─── BUDGET ALERTS ───

  // Categories over budget
  for (const cat of budget.categories) {
    if (cat.percent >= 100 && cat.budgeted > 0) {
      alerts.push({ ...base, id: id(), type: "budget_over_category", severity: cat.percent >= 120 ? "critical" : "warning", module: "budget", origin_id: null,
        title: `Pasaste el presupuesto: ${cat.label}`,
        description: `${cat.percent}% usado ($${Math.round(cat.spent)} de $${Math.round(cat.budgeted)})`,
        target_date: null, suggested_action: "Revisá los gastos de esta categoría", deep_link: "/budget" });
    }
  }

  // Forecast exceeded
  if (budget.forecast_total > budget.total_budget) {
    const overBy = Math.round(budget.forecast_total - budget.total_budget);
    alerts.push({ ...base, id: id(), type: "forecast_exceeded", severity: overBy > budget.contingency ? "critical" : "warning", module: "budget", origin_id: null,
      title: `Proyección excede presupuesto en $${overBy}`,
      description: `Total proyectado: $${Math.round(budget.forecast_total)} vs presupuesto: $${Math.round(budget.total_budget)}`,
      target_date: null, suggested_action: "Reducí gastos o aumentá el presupuesto", deep_link: "/budget" });
    }

  // Low contingency
  const contingencyUsed = budget.total_spent + budget.total_committed - (budget.total_budget - budget.contingency);
  if (contingencyUsed > 0 && contingencyUsed > budget.contingency * 0.5) {
    alerts.push({ ...base, id: id(), type: "contingency_low", severity: contingencyUsed > budget.contingency * 0.8 ? "critical" : "warning", module: "budget", origin_id: null,
      title: "Contingencia agotándose",
      description: `Ya estás usando contingencia. Revisá la salud del presupuesto.`,
      target_date: null, suggested_action: "Recortá gastos no esenciales", deep_link: "/budget" });
  }

  // ─── PACKING ALERTS ───

  const essentialNotPacked = packingItems.filter(p => p.is_essential && p.status !== "packed");
  const needsPurchase = packingItems.filter(p => p.needs_purchase && !p.is_purchased);

  if (essentialNotPacked.length > 0 && daysToTrip <= 30) {
    alerts.push({ ...base, id: id(), type: "packing_essential_missing", severity: daysToTrip <= 7 ? "critical" : "warning", module: "packing", origin_id: null,
      title: `${essentialNotPacked.length} ítem(s) esencial(es) sin empacar`,
      description: `Ítems: ${essentialNotPacked.slice(0, 5).map(p => p.item).join(", ")}${essentialNotPacked.length > 5 ? "..." : ""}`,
      target_date: trip.start_date, suggested_action: "Empacá los esenciales", deep_link: "/packing" });
  }

  if (needsPurchase.length > 0) {
    alerts.push({ ...base, id: id(), type: "packing_not_purchased", severity: daysToTrip <= 14 ? "critical" : "warning", module: "packing", origin_id: null,
      title: `${needsPurchase.length} ítem(s) por comprar`,
      description: `Ítems: ${needsPurchase.slice(0, 5).map(p => p.item).join(", ")}${needsPurchase.length > 5 ? "..." : ""}`,
      target_date: needsPurchase[0]?.deadline || trip.start_date, suggested_action: "Comprá lo que falta", deep_link: "/packing" });
  }

  return alerts;
}

/**
 * Convert weather warnings (from `lib/weather/forecast.ts`) into Alert[] rows.
 *
 * Kept SEPARATE from generateAlerts() because weather requires async network IO,
 * while generateAlerts() is sync-pure (derives from data already in memory).
 * Consumers (today/itinerary pages) call this after `getWeatherWarnings()` resolves
 * and merge the output into the alert feed.
 */
export function weatherWarningsToAlerts(tripId: string, warnings: WeatherWarning[]): Alert[] {
  const now = new Date().toISOString();
  let seq = 0;
  return warnings.map((w) => {
    const type =
      w.kind === "storm" ? "weather_storm" :
      w.kind === "tropical_storm" ? "weather_tropical_storm" :
      w.kind === "uv_extreme" ? "weather_uv_extreme" :
      w.kind === "aqi_poor" ? "weather_aqi_poor" :
      "weather_warning";
    const description =
      w.kind === "uv_extreme" ? `${w.date} · UV ${w.uv_index} · Máx ${w.temp_max}°C`
      : w.kind === "aqi_poor" ? `${w.date} · AQI ${w.aqi} · Máx ${w.temp_max}°C`
      : `${w.date} · Máx ${w.temp_max}°C / Mín ${w.temp_min}°C · ${w.precip_prob}% lluvia`;
    const suggested_action =
      w.kind === "rain" ? "Llevá impermeable o reagendá actividades exteriores"
      : w.kind === "heat" ? "Hidratate, evitá horas pico de sol"
      : w.kind === "cold" ? "Abrigo extra, chequeá calefacción del alojamiento"
      : w.kind === "uv_extreme" ? "Protector solar +50, gorra, sombra entre 11-16h"
      : w.kind === "aqi_poor" ? "Limitá actividades al aire libre, mascarilla si tenés"
      : w.kind === "tropical_storm" ? "Buscá refugio sólido y monitoreá alertas oficiales"
      : "Revisá actividades planificadas — clima severo";
    return {
      id: `weather-${w.date}-${w.kind}-${++seq}`,
      trip_id: tripId,
      type,
      severity: w.severity,
      module: "itinerary",
      origin_id: null,
      title: w.message,
      description,
      detected_at: now,
      target_date: w.date,
      status: "active" as const,
      suggested_action,
      deep_link: "/itinerary",
      created_at: now,
    };
  });
}
