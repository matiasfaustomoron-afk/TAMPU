"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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

export function useTripRealtime(tripId: string | null | undefined, onChange?: () => void): {
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

    let canceled = false;
    let cleanup: (() => void) | null = null;

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

      const channel = client.channel(`trip:${tripId}`, {
        config: { presence: { key: data.user.id } },
      });

      // ─── DB changes ───
      channel
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "reservations", filter: `trip_id=eq.${tripId}` },
          () => {
            recordSyncSuccess();
            onChangeRef.current?.();
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "expenses", filter: `trip_id=eq.${tripId}` },
          () => {
            recordSyncSuccess();
            onChangeRef.current?.();
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "tasks", filter: `trip_id=eq.${tripId}` },
          () => {
            recordSyncSuccess();
            onChangeRef.current?.();
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cities", filter: `trip_id=eq.${tripId}` },
          () => {
            recordSyncSuccess();
            onChangeRef.current?.();
          },
        );

      // ─── Presence ───
      channel.on("presence", { event: "sync" }, () => {
        if (canceled) return;
        const state = channel.presenceState() as unknown as Record<string, PresenceMember[]>;
        const flat: PresenceMember[] = [];
        for (const key of Object.keys(state)) {
          for (const p of state[key]) flat.push(p);
        }
        setMembers(flat);
      });

      channel.subscribe(async (status) => {
        if (canceled) return;
        if (status === "SUBSCRIBED") {
          setConnected(true);
          await channel.track(me);
        } else {
          setConnected(false);
        }
      });

      cleanup = () => {
        channel.untrack().catch(() => {});
        client.removeChannel(channel);
      };
    })();

    return () => {
      canceled = true;
      if (cleanup) cleanup();
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
