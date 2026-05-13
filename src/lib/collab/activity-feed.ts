"use client";

// ─── Y.Doc activity feed ───
//
// Cada vez que un user hace un cambio relevante (agregó vuelo, editó día,
// votó en una poll, etc.) se appendea un evento al Y.Array<ActivityEvent>
// llamado "activity_log". Toda la flota colaborativa lo ve.
//
// Diferencia con un changelog del backend: esto vive en el Y.Doc, así que es
// CRDT (sin orden total, pero con ordering por timestamp + client_id). Funciona
// offline; cuando volvés a estar online, tus eventos se mergean en la timeline
// común sin perder nada.

import { useEffect, useState } from "react";
import * as Y from "yjs";
import { getCollabDoc, getCollabDocRaw } from "./yjs-doc";

export type ActivityEventKind =
  | "reservation_added"
  | "reservation_updated"
  | "reservation_deleted"
  | "day_updated"
  | "poll_created"
  | "poll_voted"
  | "poll_closed"
  | "comment_added"
  | "trip_renamed"
  | "expense_added"
  | "task_added"
  | "task_completed";

/**
 * Forma normalizada estilo "verb + entity" — la spec del feature pide esta
 * granularidad para iconos. ActivityEntry es un compañero estructural a
 * ActivityEvent (mantenemos retro-compat con el kind enum legacy).
 */
export type ActivityVerb = "added" | "updated" | "removed" | "voted" | "commented" | "completed";
export type ActivityEntity = "reservation" | "trip_day" | "task" | "poll" | "comment" | "expense";

export interface ActivityEntry {
  id: string;
  userId: string;
  userName: string;
  verb: ActivityVerb;
  entity: ActivityEntity;
  entityId: string;
  entityLabel: string;
  ts: number;
}

export interface ActivityEvent {
  id: string;                  // crypto.randomUUID o fallback
  trip_id: string;
  user_id: string;
  display_name: string;
  kind: ActivityEventKind;
  /** Texto humano corto: "agregó vuelo LATAM 800". */
  summary: string;
  /** Path interno al item afectado, si corresponde: "/itinerary?day=3" */
  href: string | null;
  /** ms epoch. */
  created_at: number;
  /** verb + entity normalizado (opcional, retro-compat). */
  verb?: ActivityVerb;
  entity?: ActivityEntity;
  entity_id?: string;
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Lee el Y.Array<ActivityEvent> del Y.Doc del trip. */
export function getActivityArray(tripId: string): Y.Array<ActivityEvent> {
  const { doc } = getCollabDoc(tripId);
  return doc.getArray<ActivityEvent>("activity_log");
}

/**
 * `getActivityFeed(doc)` — spec-compatible accessor que toma directamente un
 * Y.Doc (sin tripId). Útil cuando ya tenés el doc del hook `useCollabDoc`.
 */
export function getActivityFeed(doc: Y.Doc): Y.Array<ActivityEvent> {
  return doc.getArray<ActivityEvent>("activity_log");
}

/**
 * Appendea un evento al activity feed. Llamar después de cada mutación
 * relevante en /lib/hooks/use-trip-data o desde un IOSRow handler.
 *
 * Si el Y.Doc no está disponible (SSR), es no-op.
 */
export function logActivity(opts: {
  tripId: string;
  userId: string;
  displayName: string;
  kind: ActivityEventKind;
  summary: string;
  href?: string | null;
}): void {
  try {
    const arr = getActivityArray(opts.tripId);
    const event: ActivityEvent = {
      id: newId(),
      trip_id: opts.tripId,
      user_id: opts.userId,
      display_name: opts.displayName,
      kind: opts.kind,
      summary: opts.summary,
      href: opts.href ?? null,
      created_at: Date.now(),
    };
    arr.push([event]);
    // Cap the log at 200 events to keep the doc small; oldest first.
    const len = arr.length;
    if (len > 200) {
      arr.delete(0, len - 200);
    }
  } catch (err) {
    console.warn("[activity-feed] log failed", err);
  }
}

/**
 * Devuelve los N eventos más recientes (orden DESC por created_at).
 * Default 20.
 */
export function getRecentActivity(tripId: string, limit = 20): ActivityEvent[] {
  try {
    const arr = getActivityArray(tripId).toArray();
    return arr.sort((a, b) => b.created_at - a.created_at).slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Suscribite a cambios en el feed. Devuelve unsubscribe.
 */
export function onActivityChange(tripId: string, cb: () => void): () => void {
  const arr = getActivityArray(tripId);
  const handler = () => cb();
  arr.observe(handler);
  return () => arr.unobserve(handler);
}

/** Texto "hace X" sin date-fns para mantener bundle chico. */
export function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

// ─── Spec-compatible API: recordActivity + useRecentActivity ───────────────
//
// La spec pide nombres específicos. Estos son aliases que envuelven la lógica
// existente. `recordActivity` toma un Y.Doc directo (más eficiente cuando ya
// tenés el doc) o se puede usar `logActivity` con tripId.

/**
 * Appendea una ActivityEntry al feed de un Y.Doc. Toma la entry pre-construida
 * — el caller arma `verb + entity + entityLabel` y nosotros normalizamos a
 * ActivityEvent para mantener un solo formato persistido.
 */
export function recordActivity(doc: Y.Doc, entry: Omit<ActivityEntry, "id" | "ts"> & { ts?: number; id?: string }): ActivityEvent {
  const verb = entry.verb;
  const entity = entry.entity;
  // Map verb+entity → kind para retro-compat
  const kind: ActivityEventKind =
    verb === "voted" ? "poll_voted" :
    verb === "commented" ? "comment_added" :
    entity === "reservation" && verb === "added" ? "reservation_added" :
    entity === "reservation" && verb === "updated" ? "reservation_updated" :
    entity === "reservation" && verb === "removed" ? "reservation_deleted" :
    entity === "trip_day" ? "day_updated" :
    entity === "poll" && verb === "added" ? "poll_created" :
    entity === "task" && verb === "added" ? "task_added" :
    entity === "task" && verb === "completed" ? "task_completed" :
    entity === "expense" && verb === "added" ? "expense_added" :
    "trip_renamed"; // fallback genérico

  const verbText: Record<ActivityVerb, string> = {
    added: "agregó", updated: "editó", removed: "eliminó",
    voted: "votó en", commented: "comentó en", completed: "completó",
  };
  const entityText: Record<ActivityEntity, string> = {
    reservation: "reserva", trip_day: "día", task: "tarea",
    poll: "encuesta", comment: "comentario", expense: "gasto",
  };

  const event: ActivityEvent = {
    id: entry.id || newId(),
    trip_id: "", // no usado en este path; el doc ya está scopado al trip
    user_id: entry.userId,
    display_name: entry.userName,
    kind,
    summary: `${verbText[verb]} ${entityText[entity]} ${entry.entityLabel}`.trim(),
    href: null,
    created_at: entry.ts ?? Date.now(),
    verb,
    entity,
    entity_id: entry.entityId,
  };

  try {
    const arr = getActivityFeed(doc);
    arr.push([event]);
    const len = arr.length;
    if (len > 200) arr.delete(0, len - 200);
  } catch (err) {
    console.warn("[activity-feed] recordActivity failed", err);
  }
  return event;
}

/**
 * React hook: devuelve las últimas N entries del activity feed reactivamente.
 * Se re-renderiza cuando el Y.Array<ActivityEvent> cambia (incluído desde
 * otros peers vía WS).
 */
export function useRecentActivity(tripId: string | null | undefined, limit = 20): ActivityEvent[] {
  const [items, setItems] = useState<ActivityEvent[]>([]);
  useEffect(() => {
    if (!tripId) {
      setItems([]);
      return;
    }
    const doc = getCollabDocRaw(tripId);
    const arr = getActivityFeed(doc);
    const update = () => {
      const sorted = arr.toArray().sort((a, b) => b.created_at - a.created_at).slice(0, limit);
      setItems(sorted);
    };
    update();
    arr.observe(update);
    return () => arr.unobserve(update);
  }, [tripId, limit]);
  return items;
}

/** Map normalizado verb → texto humano (re-export para UI). */
export const VERB_HUMAN: Record<ActivityVerb, string> = {
  added: "agregó", updated: "editó", removed: "eliminó",
  voted: "votó en", commented: "comentó en", completed: "completó",
};

/** Map normalizado entity → texto humano (re-export para UI). */
export const ENTITY_HUMAN: Record<ActivityEntity, string> = {
  reservation: "reserva", trip_day: "día", task: "tarea",
  poll: "encuesta", comment: "comentario", expense: "gasto",
};
