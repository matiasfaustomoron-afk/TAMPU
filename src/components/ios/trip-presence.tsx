"use client";

import { useTripPresence, type PresenceMember } from "@/lib/hooks/use-trip-realtime";

/**
 * <TripPresence /> — avatares apilados de los miembros del viaje que están
 * online ahora mismo. Mostrado en el header de /itinerary y /today para
 * dar la sensación "viaje vivo" estilo Google Docs.
 *
 * Si no hay supabase o el user está solo, devuelve null (no ocupa espacio).
 */
export function TripPresence({ tripId, max = 4 }: { tripId: string | null | undefined; max?: number }) {
  const members = useTripPresence(tripId);
  if (members.length <= 1) return null; // Solo vos = no es interesante mostrar

  const shown = members.slice(0, max);
  const extra = Math.max(0, members.length - shown.length);

  return (
    <div className="flex items-center -space-x-2" aria-label={`${members.length} miembros online`}>
      {shown.map((m, i) => (
        <Avatar key={m.user_id} m={m} z={shown.length - i} />
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

function Avatar({ m, z }: { m: PresenceMember; z: number }) {
  const initial = m.display_name.charAt(0).toUpperCase() || "?";
  const where = m.current_view_label || m.current_page?.replace("/", "") || "en línea";
  return (
    <span
      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white border-2 border-background ring-2 ring-success/40 pulse-dot"
      style={{ background: m.color, zIndex: z, color: m.color }}
      title={`${m.display_name} · ${where}`}
      role="img"
      aria-label={`${m.display_name} en ${where}`}
    >
      <span style={{ color: "white" }}>{initial}</span>
    </span>
  );
}
