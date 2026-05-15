"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useSupabase } from "@/lib/context/supabase-provider";
import { recordSyncSuccess } from "@/lib/sync/status";

/**
 * useTripRealtime — Suscribe a cambios en reservations/expenses/tasks/cities
 * del trip activo via Supabase Realtime. Cuando llega un evento, dispara
 * `onChange` que tipicamente refetcha los hooks correspondientes.
 *
 * También maneja presencia: cada miembro online aparece en `members` con su
 * id, nombre y last_seen. UI consumidora (`<TripPresence />`) muestra avatares
 * apilados arriba a la derecha.
 *
 * En demo mode es un no-op (sin Supabase no hay realtime).
 *
 * Wanderlog parity: ellos tienen co-edit estilo Google Docs. Acá empezamos
 * con replicación de cambios + presence. CRDT con cursores en celdas es
 * follow-up (Y.js / Liveblocks) — innecesario para MVP donde casi nadie
 * edita exactamente el mismo campo al mismo tiempo.
 */

export interface PresenceMember {
  user_id: string;
  display_name: string;
  color: string;            // hex derivado del user_id para chips de avatar
  online_at: string;        // ISO
  current_page?: string;    // "/itinerary", "/today", etc.
  /** View granular: "day:abc-123", "expense:def-456", "vault:ghi-789" */
  current_view?: string;
  /** Human-readable: "Día 3 · Cusco" — para mostrar en tooltip */
  current_view_label?: string;
}

const COLORS = ["#c75b2f", "#b97c4a", "#4a8a5e", "#d6a13a", "#5a6fa8", "#a13d4e", "#8c6b3a", "#3a8aa1"];

function colorForUser(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

/**
 * Callback map: cada tabla dispara su propio handler. Esto reemplaza el
 * callback único anterior (() => void) que colapsaba las 4 tablas — los
 * callers tenían que refetchear TODO en cada evento, incluso si solo cambió
 * una entity. Con el map, /itinerary refetchea solo days+reservations sin
 * tocar expenses/tasks.
 *
 * Handlers opcionales adicionales (`attachments`, `tripMembers`, `polls`) son
 * capability-only: el hook se suscribe a las tablas correspondientes via
 * postgres_changes pero solo dispara el callback si el caller lo provee. UI
 * actual (vault, boarding-passes, trip-members modal) puede empezar a wirear
 * estos handlers para refetch reactivo sin tocar el contrato del hook.
 */
export interface TripRealtimeHandlers {
  reservations?: () => void;
  expenses?: () => void;
  tasks?: () => void;
  cities?: () => void;
  /** Filtrado por `trip_id=eq.{tripId}` en la tabla `attachments`. */
  attachments?: () => void;
  /** Filtrado por `trip_id=eq.{tripId}` en la tabla `trip_members`. */
  tripMembers?: () => void;
  /** Filtrado por `trip_id=eq.{tripId}` en la tabla `polls`. */
  polls?: () => void;
}

export function useTripRealtime(tripId: string | null | undefined, onChange?: TripRealtimeHandlers): {
  members: PresenceMember[];
  connected: boolean;
} {
  const { client, mode } = useSupabase();
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const [connected, setConnected] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (mode !== "online" || !client || !tripId) {
      setMembers([]);
      setConnected(false);
      return;
    }

    // Cleanup race fix: cuando el effect re-corre o desmonta antes de que el
    // IIFE async resuelva `getUser()`, necesitamos asegurar que cualquier
    // channel creado eventualmente sea destruido. Guardamos la ref del
    // channel en una variable scoped al effect; el cleanup lee esta ref
    // directamente. Si el channel todavía no fue asignado cuando corre el
    // cleanup, `canceled=true` previene su creación en la rama async.
    let canceled = false;
    let channel: RealtimeChannel | null = null;

    (async () => {
      const { data } = await client.auth.getUser();
      if (canceled || !data.user) return;

      const me: PresenceMember = {
        user_id: data.user.id,
        display_name: data.user.user_metadata?.full_name || data.user.email?.split("@")[0] || "Tú",
        color: colorForUser(data.user.id),
        online_at: new Date().toISOString(),
        current_page: typeof window !== "undefined" ? window.location.pathname : undefined,
      };

      channel = client.channel(`trip:${tripId}`, {
        config: { presence: { key: data.user.id } },
      });

      // Si entre `getUser()` y acá el effect fue cancelado, abortar antes de
      // subscribirse para evitar leak del channel recién creado.
      if (canceled) {
        client.removeChannel(channel);
        channel = null;
        return;
      }

      // ─── DB changes ───
      // Dispatcher: cada tabla dispara solo su handler correspondiente.
      const dispatch = (table: keyof TripRealtimeHandlers) => {
        recordSyncSuccess();
        onChangeRef.current?.[table]?.();
      };

      channel
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "reservations", filter: `trip_id=eq.${tripId}` },
          () => dispatch("reservations"),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "expenses", filter: `trip_id=eq.${tripId}` },
          () => dispatch("expenses"),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "tasks", filter: `trip_id=eq.${tripId}` },
          () => dispatch("tasks"),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cities", filter: `trip_id=eq.${tripId}` },
          () => dispatch("cities"),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "attachments", filter: `trip_id=eq.${tripId}` },
          () => dispatch("attachments"),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "trip_members", filter: `trip_id=eq.${tripId}` },
          () => dispatch("tripMembers"),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "polls", filter: `trip_id=eq.${tripId}` },
          () => dispatch("polls"),
        );

      // ─── Presence ───
      channel.on("presence", { event: "sync" }, () => {
        if (canceled || !channel) return;
        const state = channel.presenceState() as unknown as Record<string, PresenceMember[]>;
        const flat: PresenceMember[] = [];
        for (const key of Object.keys(state)) {
          for (const p of state[key]) flat.push(p);
        }
        setMembers(flat);
      });

      channel.subscribe(async (status) => {
        if (canceled || !channel) return;
        if (status === "SUBSCRIBED") {
          setConnected(true);
          await channel.track(me);
        } else {
          setConnected(false);
        }
      });
    })();

    return () => {
      canceled = true;
      if (channel) {
        channel.untrack().catch(() => {});
        client.removeChannel(channel);
        channel = null;
      }
    };
  }, [client, mode, tripId]);

  return { members, connected };
}

/**
 * Hook lite — solo presence (no DB watch). Útil para chrome global donde
 * solo querés mostrar quién está online sin re-fetchear data en cada cambio.
 */
export function useTripPresence(tripId: string | null | undefined): PresenceMember[] {
  const { members } = useTripRealtime(tripId);
  return members;
}

export { colorForUser };
