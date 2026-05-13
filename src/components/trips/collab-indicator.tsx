"use client";

import { useState, useRef, useEffect } from "react";
import { Users, Clock } from "lucide-react";
import { useCollabDoc } from "@/lib/collab/use-collab-doc";
import { timeAgo } from "@/lib/collab/activity-feed";
import { useSupabase } from "@/lib/context/supabase-provider";
import { usePathname } from "next/navigation";

/**
 * <CollabIndicator /> — pequeño cluster de avatares + dropdown con activity feed.
 *
 * Stack visual estilo Google Docs / Figma / Linear:
 *   - 2-4 avatares circulares con la inicial del nombre y un dot de presencia.
 *   - Al tap (mobile) o hover (desktop), abre un dropdown con:
 *     - Lista de miembros activos (último visto)
 *     - Últimos 10 eventos del activity feed ("María agregó vuelo LATAM 800")
 *
 * Si no hay Y.Doc disponible (sin tripId, sin env var del WS) → devuelve null,
 * la UI sigue funcionando sin colaboración.
 */
export function CollabIndicator({ tripId }: { tripId: string | null | undefined }) {
  const { user } = useSupabase();
  const pathname = usePathname() || "/";
  const userBundle = user ? {
    id: user.id,
    display_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Tú",
    current_page: pathname,
  } : null;

  const { members, activity, provider } = useCollabDoc(tripId, userBundle);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  // Si no hay tripId o no hay un provider activo, no mostramos nada
  if (!tripId) return null;

  const activeMembers = members.filter(m => m.user_id !== user?.id);
  const totalOnline = members.length;

  // Si literalmente nadie está en este trip y no hay activity, ocultá el cluster
  // (no es interesante mostrar "0 online · 0 events").
  if (activeMembers.length === 0 && activity.length === 0) return null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="pressable inline-flex items-center gap-1.5 px-2 py-1.5 rounded-full bg-muted text-[12px] font-semibold"
        title={`${totalOnline} en línea · ${activity.length} eventos`}
      >
        {activeMembers.length > 0 ? (
          <div className="flex -space-x-1.5">
            {activeMembers.slice(0, 3).map(m => (
              <span
                key={m.client_id}
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white border border-background"
                style={{ background: m.color }}
                aria-label={m.display_name}
              >
                {m.display_name.charAt(0).toUpperCase()}
              </span>
            ))}
          </div>
        ) : (
          <Users className="w-3.5 h-3.5" />
        )}
        <span className="text-[11px]">{activity.length > 0 ? activity.length : ""}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 max-w-[88vw] ios-card shadow-lg z-50 overflow-hidden">
          {/* Members section */}
          {activeMembers.length > 0 && (
            <div className="p-3 border-b border-border">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                En línea ({activeMembers.length})
              </p>
              <ul className="space-y-1">
                {activeMembers.slice(0, 5).map(m => (
                  <li key={m.client_id} className="flex items-center gap-2 text-[12px]">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                      style={{ background: m.color }}
                    >
                      {m.display_name.charAt(0).toUpperCase()}
                    </span>
                    <span className="font-medium truncate">{m.display_name}</span>
                    {m.editing_item && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        edit {m.editing_item}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Activity feed section */}
          <div className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Actividad reciente
            </p>
            {activity.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                Sin eventos. Cambios en este viaje van a aparecer acá.
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {activity.slice(0, 10).map(e => (
                  <li key={e.id} className="text-[12px] leading-snug">
                    <span className="font-medium">{e.display_name}</span>
                    <span className="text-muted-foreground"> {e.summary}</span>
                    <span className="text-[10px] text-muted-foreground/80 ml-1">
                      · {timeAgo(e.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer: indicador de modo */}
          <div className="px-3 py-2 bg-muted/50 text-[10px] text-muted-foreground border-t border-border flex items-center justify-between">
            <span>
              {provider ? "Sync online" : "Modo local"}
            </span>
            <span className="font-mono">CRDT</span>
          </div>
        </div>
      )}
    </div>
  );
}
