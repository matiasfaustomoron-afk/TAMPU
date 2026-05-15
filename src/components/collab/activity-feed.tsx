"use client";

import { useMemo } from "react";
import {
  Plane, Calendar, Vote, MessageCircle, CheckSquare,
  Edit3, Trash2, Plus, Sparkles, DollarSign,
} from "lucide-react";
import {
  useRecentActivity, timeAgo,
  type ActivityEvent, type ActivityVerb, type ActivityEntity,
} from "@/lib/collab/activity-feed";
import { useI18n } from "@/i18n/provider";

interface Props {
  tripId: string | null | undefined;
  /** Cuántas entries mostrar como máximo. Default 20. */
  limit?: number;
  /** Si true (default), aplica overflow-y scroll cuando hay > 6 items. */
  scrollable?: boolean;
  className?: string;
}

/**
 * <ActivityFeed /> — lista vertical de las últimas N actividades del trip.
 *
 * Empty state: mensaje amigable + hint. Cuando hay > 6 items, scrollable.
 * Iconos según verb + entity (avatar de color + icono lucide).
 */
export function ActivityFeed({
  tripId,
  limit = 20,
  scrollable = true,
  className,
}: Props) {
  const { t } = useI18n();
  const entries = useRecentActivity(tripId, limit);
  const tall = scrollable && entries.length > 6;

  if (!tripId) {
    return (
      <div className="ios-card p-4 text-center text-[13px] text-muted-foreground">
        {t.common.noActiveTrip}.
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className={"ios-card p-6 text-center " + (className || "")}>
        <Sparkles className="w-5 h-5 text-muted-foreground/60 mx-auto mb-1.5" />
        <p className="text-[13px] font-semibold">Sin actividad todavía</p>
        <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
          Cuando vos o un compañero agreguen algo al viaje, aparece acá. Probá
          agregar un vuelo, votar en una encuesta o comentar en una reserva.
        </p>
      </div>
    );
  }

  return (
    <ul
      className={
        "ios-card divide-y divide-border/40 " +
        (tall ? "max-h-[26rem] overflow-y-auto " : "") +
        (className || "")
      }
    >
      {entries.map(e => (
        <ActivityRow key={e.id} event={e} />
      ))}
    </ul>
  );
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  const { verb, entity } = useMemo(() => normalize(event), [event]);
  const icon = pickIcon(verb, entity);
  return (
    <li className="flex items-start gap-3 p-3">
      <span
        className={"w-8 h-8 rounded-xl flex items-center justify-center shrink-0 " + pickIconClass(entity)}
        aria-hidden
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] leading-snug">
          <span className="font-semibold">{event.display_name}</span>
          <span className="text-muted-foreground"> {event.summary}</span>
        </p>
        <p className="text-[10.5px] text-muted-foreground mt-0.5">
          {timeAgo(event.created_at)}
        </p>
      </div>
    </li>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function normalize(e: ActivityEvent): { verb: ActivityVerb; entity: ActivityEntity } {
  if (e.verb && e.entity) return { verb: e.verb, entity: e.entity };
  // Map kind legacy → verb + entity
  switch (e.kind) {
    case "reservation_added": return { verb: "added", entity: "reservation" };
    case "reservation_updated": return { verb: "updated", entity: "reservation" };
    case "reservation_deleted": return { verb: "removed", entity: "reservation" };
    case "day_updated": return { verb: "updated", entity: "trip_day" };
    case "poll_created": return { verb: "added", entity: "poll" };
    case "poll_voted": return { verb: "voted", entity: "poll" };
    case "comment_added": return { verb: "commented", entity: "comment" };
    case "task_added": return { verb: "added", entity: "task" };
    case "task_completed": return { verb: "completed", entity: "task" };
    case "expense_added": return { verb: "added", entity: "expense" };
    default: return { verb: "updated", entity: "trip_day" };
  }
}

function pickIcon(verb: ActivityVerb, entity: ActivityEntity): React.ReactNode {
  const cls = "w-3.5 h-3.5";
  if (verb === "voted") return <Vote className={cls} />;
  if (verb === "commented") return <MessageCircle className={cls} />;
  if (verb === "removed") return <Trash2 className={cls} />;
  if (verb === "updated") return <Edit3 className={cls} />;
  if (verb === "completed") return <CheckSquare className={cls} />;
  // verb === "added"
  if (entity === "reservation") return <Plane className={cls} />;
  if (entity === "trip_day") return <Calendar className={cls} />;
  if (entity === "task") return <CheckSquare className={cls} />;
  if (entity === "poll") return <Vote className={cls} />;
  if (entity === "expense") return <DollarSign className={cls} />;
  return <Plus className={cls} />;
}

function pickIconClass(entity: ActivityEntity): string {
  // Hornocal palette via tampu-icon-* classes already in globals.css
  switch (entity) {
    case "reservation": return "tampu-icon tampu-icon-indigo";
    case "trip_day": return "tampu-icon tampu-icon-cobre";
    case "task": return "tampu-icon tampu-icon-terracota";
    case "poll": return "tampu-icon tampu-icon-mostaza";
    case "comment": return "tampu-icon tampu-icon-canela";
    case "expense": return "tampu-icon tampu-icon-cardon";
    default: return "tampu-icon tampu-icon-piedra";
  }
}
