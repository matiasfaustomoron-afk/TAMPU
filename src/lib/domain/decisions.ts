import type { Task, Reservation } from "@/lib/types/database";
import { daysUntil } from "@/lib/utils/helpers";

export interface DecisionItem {
  id: string;
  source: "task" | "reservation";
  title: string;
  description: string | null;
  category: string;
  deadline: string | null;
  days_until: number | null;
  urgency: "info" | "warning" | "critical";
  suggested_action: string | null;
  deep_link: string;
}

/**
 * Decisions Center = subset of pending work that requires a *decision*, not just operation.
 * Heuristic:
 *  - tasks in "planning" stage with criticality essential|blocker, status pending|in_progress|waiting,
 *    AND not yet started OR that require additional research/choice (next_action set)
 *  - critical-criticality reservations still pending (need to decide which provider/option)
 * Excludes purely operational tasks like "charge power bank", "web check-in".
 */
export function buildOpenDecisions(tasks: Task[], reservations: Reservation[]): DecisionItem[] {
  const items: DecisionItem[] = [];

  for (const t of tasks) {
    if (t.status === "done" || t.status === "cancelled") continue;
    if (t.criticality === "nice_to_have") continue;
    const isPlanningStage = !t.stage || t.stage === "planning";
    const looksOperational = /(check-in|pack|charge|print|backup|notify|register)/i.test(t.title);
    if (!isPlanningStage) continue;
    if (looksOperational && t.criticality !== "blocker") continue;
    const dl = t.due_date ? daysUntil(t.due_date) : null;
    const urgency: DecisionItem["urgency"] =
      dl === null ? "info"
      : dl < 0 ? "critical"
      : dl <= 7 ? "critical"
      : dl <= 14 ? "warning"
      : "info";
    items.push({
      id: t.id, source: "task", title: t.title, description: t.description,
      category: t.category, deadline: t.due_date, days_until: dl, urgency,
      suggested_action: t.next_action, deep_link: `/tasks/${t.id}`,
    });
  }

  for (const r of reservations) {
    if (r.status !== "pending") continue;
    if (r.criticality === "nice_to_have") continue;
    const dl = r.payment_deadline ? daysUntil(r.payment_deadline) : (r.use_date ? daysUntil(r.use_date) : null);
    const urgency: DecisionItem["urgency"] =
      dl === null ? "info"
      : dl < 0 ? "critical"
      : dl <= 7 ? "critical"
      : dl <= 14 ? "warning"
      : "info";
    items.push({
      id: r.id, source: "reservation",
      title: r.description.length > 80 ? r.description.substring(0, 77) + "..." : r.description,
      description: `${r.provider} · ${r.criticality}`,
      category: r.type, deadline: r.payment_deadline || r.use_date, days_until: dl, urgency,
      suggested_action: r.cancellation_policy ? `Política: ${r.cancellation_policy}` : null,
      deep_link: "/reservations",
    });
  }

  const sevRank = { critical: 3, warning: 2, info: 1 };
  return items.sort((a, b) => {
    const s = sevRank[b.urgency] - sevRank[a.urgency];
    if (s !== 0) return s;
    if (a.days_until === null) return 1;
    if (b.days_until === null) return -1;
    return a.days_until - b.days_until;
  });
}
