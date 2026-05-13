"use client";

import { useMemo } from "react";
import { usePresence, usePresenceHeartbeat, type Presence } from "@/lib/collab/presence";
import { useSupabase } from "@/lib/context/supabase-provider";

/**
 * <PresenceBar /> — stack de avatares de quienes están editando el viaje ahora.
 *
 * Spec:
 *   - Max 4 visibles, +N si hay más
 *   - Tooltip con nombre on hover
 *   - Border color = color asignado al user
 *   - Renderiza null si solo hay 1 usuario (el current) — no es interesante
 *     mostrar "1 online" cuando esa persona ya sabe que está viendo su propio viaje
 *
 * Self-contained: gestiona el heartbeat del current user internamente, así
 * que basta con dropearlo en el header de cualquier vista del trip.
 */
export function PresenceBar({
  tripId,
  max = 4,
  className,
}: {
  tripId: string | null | undefined;
  max?: number;
  className?: string;
}) {
  const { user } = useSupabase();
  const userId = user?.id || "demo-user";
  const userName =
    user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Tú";

  // Heartbeat — marca al current user como online en el doc.
  usePresenceHeartbeat(tripId, { id: userId, name: userName });

  const all = usePresence(tripId);
  const otherCount = useMemo(
    () => all.filter(p => p.userId !== userId).length,
    [all, userId]
  );

  if (!tripId) return null;
  // Si solo hay 1 usuario (el current), no mostramos nada (spec).
  if (otherCount === 0) return null;

  const shown = all.slice(0, max);
  const extra = Math.max(0, all.length - shown.length);

  return (
    <div
      className={"flex items-center -space-x-2 " + (className || "")}
      aria-label={`${all.length} miembro${all.length === 1 ? "" : "s"} editando`}
    >
      {shown.map((p, i) => (
        <PresenceAvatar key={p.userId} presence={p} z={shown.length - i} />
      ))}
      {extra > 0 && (
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold bg-muted text-foreground border-2 border-background"
          style={{ zIndex: 0 }}
          aria-label={`+${extra} más`}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

function PresenceAvatar({ presence, z }: { presence: Presence; z: number }) {
  const initial = (presence.userName.trim().charAt(0) || "?").toUpperCase();
  return (
    <span
      className="relative w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
      style={{
        background: presence.color,
        // Border = color asignado, tal como pide spec.
        boxShadow: `0 0 0 2px ${presence.color}, 0 0 0 4px var(--color-background, white)`,
        zIndex: z,
      }}
      title={
        presence.cursorItem
          ? `${presence.userName} · editando ${presence.cursorItem}`
          : presence.userName
      }
      role="img"
      aria-label={presence.userName}
    >
      {initial}
    </span>
  );
}
