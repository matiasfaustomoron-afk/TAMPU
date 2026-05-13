"use client";

// ─── Yjs awareness / presence ───
//
// Tracking de quién está editando qué en tiempo real. La awareness API de
// y-protocols expone un estado efímero por cliente (no parte del Y.Doc) que
// se propaga a todos los conectados pero no se persiste — perfecto para
// cursores, selección activa, "está escribiendo".
//
// **Demo fallback**: como en demo mode no hay WebsocketProvider, además
// guardamos un Y.Map<Presence> "presence" en el doc — así el current user
// igual "se ve a sí mismo" en la UI (avatar + indicador). Heartbeat cada
// 30s; stale tras 60s.

import { useEffect, useState } from "react";
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
import { getCollabDocRaw } from "./yjs-doc";

export interface PresenceState {
  user_id: string;
  display_name: string;
  /** OKLCH de color de avatar */
  color: string;
  /** Path actual (ej. /itinerary, /trips). */
  current_page: string;
  /** Item que el user está editando (ej. "reservation:<id>", "day:<date>"). null = no edita nada. */
  editing_item: string | null;
  /** Timestamp de la última actividad (ms epoch). */
  last_seen: number;
}

export interface PresenceMember extends PresenceState {
  /** Yjs client ID (numérico, asignado en cada conexión). */
  client_id: number;
}

/**
 * Pool de 8 colores Hornocal — paleta tierra del norte argentino, alineada
 * con la marca Tampu (BRAND.md: terracota, indigo, cardón, canela, etc.).
 * Asignación determinística por hash del userId.
 */
export const HORNOCAL_COLORS = [
  "oklch(0.62 0.17 30)",    // terracota
  "oklch(0.55 0.16 265)",   // indigo Hornocal
  "oklch(0.55 0.13 145)",   // cardón verde mineral
  "oklch(0.68 0.16 65)",    // canela
  "oklch(0.70 0.17 95)",    // mostaza
  "oklch(0.55 0.20 25)",    // carmín
  "oklch(0.55 0.10 40)",    // cobre
  "oklch(0.50 0.05 80)",    // piedra
];

function pickColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return HORNOCAL_COLORS[h % HORNOCAL_COLORS.length];
}

/** Color público alineado a la spec: deterministic-by-hash. */
export function colorForUserId(userId: string): string {
  return pickColor(userId);
}

/**
 * Setea el estado local del current user en la awareness.
 *
 * Llamar:
 *  - Al montar el componente con (userId, name, page).
 *  - Cuando el user empieza a editar un item: editing_item = "reservation:abc".
 *  - Cuando deja de editar: editing_item = null.
 *  - Periódicamente para heartbeat (opcional; awareness ya hace timeout interno).
 */
export function publishPresence(
  provider: WebsocketProvider | null,
  state: Partial<PresenceState> & { user_id: string; display_name: string; current_page: string }
): void {
  if (!provider) return;
  const merged: PresenceState = {
    user_id: state.user_id,
    display_name: state.display_name,
    color: state.color ?? pickColor(state.user_id),
    current_page: state.current_page,
    editing_item: state.editing_item ?? null,
    last_seen: Date.now(),
  };
  provider.awareness.setLocalState(merged);
}

/**
 * Marca a current user como editando un item específico. No-op si no hay provider.
 */
export function markEditing(provider: WebsocketProvider | null, item: string | null): void {
  if (!provider) return;
  const cur = provider.awareness.getLocalState() as PresenceState | null;
  if (!cur) return;
  provider.awareness.setLocalState({ ...cur, editing_item: item, last_seen: Date.now() });
}

/**
 * Lee todos los miembros presentes ahora mismo (incluído current user).
 * Ordenados por last_seen desc para que la UI agarre los más activos primero.
 */
export function readMembers(provider: WebsocketProvider | null): PresenceMember[] {
  if (!provider) return [];
  const out: PresenceMember[] = [];
  provider.awareness.getStates().forEach((state, clientId) => {
    if (!state || typeof state !== "object") return;
    const s = state as Partial<PresenceState>;
    if (!s.user_id || !s.display_name) return;
    out.push({
      client_id: clientId,
      user_id: s.user_id,
      display_name: s.display_name,
      color: s.color ?? pickColor(s.user_id),
      current_page: s.current_page ?? "",
      editing_item: s.editing_item ?? null,
      last_seen: s.last_seen ?? 0,
    });
  });
  return out.sort((a, b) => b.last_seen - a.last_seen);
}

/**
 * Suscribite a cambios de presencia. Devuelve la función de unsubscribe.
 */
export function onPresenceChange(
  provider: WebsocketProvider | null,
  cb: (members: PresenceMember[]) => void
): () => void {
  if (!provider) return () => {};
  const handler = () => cb(readMembers(provider));
  provider.awareness.on("change", handler);
  return () => provider.awareness.off("change", handler);
}

// ─── Spec API: Presence + setPresence + usePresence ─────────────────────────
//
// Shape pedido por la spec:
//   Presence { userId, userName, cursorItem?, lastSeen, color }
// Para demo mode (sin WebsocketProvider) guardamos los Presence en un Y.Map
// dentro del doc, persistido en IndexedDB. Heartbeat + stale como pide la
// spec.

export interface Presence {
  userId: string;
  userName: string;
  /** Item que el usuario está editando ahora ("reservation:abc-123" u otro string opaco). */
  cursorItem?: string | null;
  /** ms epoch. Si < Date.now() - STALE_AFTER_MS, el peer se considera offline. */
  lastSeen: number;
  /** Color asignado deterministicamente por hash del userId. */
  color: string;
}

const PRESENCE_MAP_KEY = "presence";
const STALE_AFTER_MS = 60_000;     // 60s sin update → offline
const HEARTBEAT_MS = 30_000;       // refresh cada 30s

/** Y.Map<Presence> root para el trip. */
function getPresenceMap(doc: Y.Doc): Y.Map<Presence> {
  return doc.getMap<Presence>(PRESENCE_MAP_KEY);
}

/**
 * Setea / actualiza la Presence del current user en el doc. Llamar al montar
 * + cada 30s de heartbeat + cuando cambia cursorItem.
 *
 * Sincroniza vía Y.Doc (offline-safe). Si además hay WebsocketProvider, los
 * demás peers la van a ver al instante.
 */
export function setPresence(doc: Y.Doc, presence: Omit<Presence, "lastSeen" | "color"> & { color?: string; lastSeen?: number }): Presence {
  const map = getPresenceMap(doc);
  const full: Presence = {
    userId: presence.userId,
    userName: presence.userName,
    cursorItem: presence.cursorItem ?? null,
    lastSeen: presence.lastSeen ?? Date.now(),
    color: presence.color ?? pickColor(presence.userId),
  };
  map.set(presence.userId, full);
  return full;
}

/**
 * React hook: devuelve los Presence (otros usuarios + el current) que están
 * activos ahora — filtrando staleness > 60s.
 *
 * En demo mode el array contendrá solo al current user. En online mode con WS
 * incluirá los demás peers.
 */
export function usePresence(tripId: string | null | undefined): Presence[] {
  const [list, setList] = useState<Presence[]>([]);
  useEffect(() => {
    if (!tripId) {
      // Limpiá la lista solo si tiene datos previos para evitar cascading
      // renders del lint react-hooks/set-state-in-effect.
      setList(prev => (prev.length === 0 ? prev : []));
      return;
    }
    const doc = getCollabDocRaw(tripId);
    const map = getPresenceMap(doc);
    const recompute = () => {
      const now = Date.now();
      const arr: Presence[] = [];
      map.forEach(p => {
        if (now - (p.lastSeen ?? 0) <= STALE_AFTER_MS) arr.push(p);
      });
      arr.sort((a, b) => b.lastSeen - a.lastSeen);
      setList(arr);
    };
    recompute();
    map.observe(recompute);
    // Tick para que entries "stale" desaparezcan sin esperar a otro cambio.
    const tick = setInterval(recompute, HEARTBEAT_MS);
    return () => {
      map.unobserve(recompute);
      clearInterval(tick);
    };
  }, [tripId]);
  return list;
}

/**
 * React hook: heartbeat automático del current user. Llamar una vez en el
 * shell colaborativo. Re-publica Presence cada 30s con `lastSeen = now`.
 *
 * Si user es null, no hace nada (no log spam).
 */
export function usePresenceHeartbeat(
  tripId: string | null | undefined,
  user: { id: string; name: string; cursorItem?: string | null } | null
): void {
  useEffect(() => {
    if (!tripId || !user) return;
    const doc = getCollabDocRaw(tripId);
    const beat = () => {
      setPresence(doc, {
        userId: user.id,
        userName: user.name,
        cursorItem: user.cursorItem ?? null,
      });
    };
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => {
      clearInterval(id);
      // Best-effort: marcar al user como stale al desmontar.
      try {
        const map = doc.getMap<Presence>(PRESENCE_MAP_KEY);
        const cur = map.get(user.id);
        if (cur) {
          map.set(user.id, { ...cur, lastSeen: 0 });
        }
      } catch { /* ignore */ }
    };
  }, [tripId, user]);
}
