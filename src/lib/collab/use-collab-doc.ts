"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
import { getCollabDoc, disposeCollabDoc } from "./yjs-doc";
import {
  publishPresence,
  readMembers,
  onPresenceChange,
  markEditing,
  type PresenceMember,
} from "./presence";
import {
  getRecentActivity,
  onActivityChange,
  type ActivityEvent,
} from "./activity-feed";

interface UseCollabResult {
  /** Y.Doc reactivo. Mutaciones disparan re-render via el `tick`. */
  doc: Y.Doc | null;
  /** WebsocketProvider — null si no hay env var configurada. */
  provider: WebsocketProvider | null;
  /** Miembros presentes ahora (excluyéndote a vos si querés filtrar). */
  members: PresenceMember[];
  /** Últimas 20 entries del activity feed. */
  activity: ActivityEvent[];
  /** Marca al current user como editando un item específico (o null). */
  setEditingItem: (item: string | null) => void;
}

/**
 * `useCollabDoc(tripId)` — devuelve el Y.Doc del trip + utilidades reactivas.
 *
 * El doc se cache-a global a través de getCollabDoc(), así que múltiples
 * componentes con el mismo tripId comparten la misma instancia (correcto:
 * son la misma sesión colaborativa).
 *
 * El hook conecta el WebsocketProvider al montar y lo desconecta al desmontar.
 * Si todos los consumidores se desmontan, el provider queda activo pero idle.
 * disposeCollabDoc(tripId) hay que llamarlo manualmente al cerrar el trip
 * activamente (logout, switch a otro trip).
 */
export function useCollabDoc(
  tripId: string | null | undefined,
  user: { id: string; display_name: string; current_page: string } | null
): UseCollabResult {
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  // State (not refs) for doc/provider so reads during render are safe.
  // The Y.Doc instance is cached globally by getCollabDoc, so swapping by reference
  // doesn't cause spurious resyncs — same tripId returns same Y.Doc.
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  // Provider ref used inside event handlers; kept up-to-date via effect.
  const providerRef = useRef<WebsocketProvider | null>(null);

  useEffect(() => {
    if (!tripId) {
      providerRef.current = null;
      setDoc(null);
      setProvider(null);
      setMembers([]);
      setActivity([]);
      return;
    }
    const { doc: d, provider: p } = getCollabDoc(tripId);
    setDoc(d);
    setProvider(p);
    providerRef.current = p;

    // Connect provider if not connected
    if (p) {
      try { p.connect(); } catch { /* already connected or bad ws url */ }
    }

    // Publish initial presence
    if (user && p) {
      publishPresence(p, {
        user_id: user.id,
        display_name: user.display_name,
        current_page: user.current_page,
      });
    }

    setMembers(readMembers(p));
    setActivity(getRecentActivity(tripId));

    const unsubPresence = onPresenceChange(p, m => setMembers(m));
    const unsubActivity = onActivityChange(tripId, () => setActivity(getRecentActivity(tripId)));

    return () => {
      unsubPresence();
      unsubActivity();
      // Clear local presence so otros nos vean offline
      if (p) p.awareness.setLocalState(null);
    };
  }, [tripId, user?.id, user?.display_name, user?.current_page]);

  const setEditingItem = useCallback((item: string | null) => {
    markEditing(providerRef.current, item);
  }, []);

  return {
    doc,
    provider,
    members,
    activity,
    setEditingItem,
  };
}

/** Re-export útil para que los consumidores no tengan que importar dos paths. */
export { disposeCollabDoc };
