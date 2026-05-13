"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Vote, Sparkles } from "lucide-react";
import { LargeTitle, Pill } from "@/components/ios";
import { EmptyState } from "@/components/shared";
import { PollCard } from "@/components/polls/poll-card";
import { CreatePoll } from "@/components/polls/create-poll";
import { useActiveTrip } from "@/lib/hooks/use-trip-data";
import { listPolls, isPollClosed, autoClosePollsIfDue, type Poll } from "@/lib/polls/poll";

type Filter = "open" | "closed" | "all";

/**
 * /polls — lista de todos los polls del trip activo, con filtros y CTA de
 * creación. Feature 2 de la tanda colaborativa.
 *
 * Demo mode: los polls viven en localStorage scopeados al trip. Si más
 * adelante la tabla `polls` existe en Supabase, el lib ya tiene wrapper.
 */
export default function PollsPage() {
  const { data: trip } = useActiveTrip();
  const [filter, setFilter] = useState<Filter>("open");
  // initial sync read so primer render no es vacío (Lazy initializer evita
  // el lint "setState in effect").
  const [polls, setPolls] = useState<Poll[]>(() =>
    trip ? listPolls(trip.id, { status: "all" }) : []
  );
  const refresh = useCallback(() => {
    if (!trip) return setPolls(prev => (prev.length === 0 ? prev : []));
    setPolls(listPolls(trip.id, { status: "all" }));
  }, [trip]);

  // Refresh cuando cambia el trip o cuando otra tab modifica localStorage.
  // No invocamos refresh inside the effect — lo conectamos como subscription.
  const tripIdRef = useRef(trip?.id);
  useEffect(() => {
    tripIdRef.current = trip?.id;
    const handler = (ev: StorageEvent) => {
      if (ev.key && ev.key.startsWith("tampu.polls.") && tripIdRef.current) {
        setPolls(listPolls(tripIdRef.current, { status: "all" }));
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [trip?.id]);

  // ─── Auto-close polls cuyo deadline pasó (QW7) ───
  // Corre al montar + cada 60s + cuando vuelve la tab al foreground.
  // Cuando cierra, dispara activity event "poll_closed" con el ganador.
  useEffect(() => {
    if (!trip?.id) return;
    // Sin identidad fuerte en demo, usamos placeholder local. En online mode
    // se sobrescribe con el user real de Supabase.
    const actor = { userId: "self", displayName: "Vos" };
    const tick = () => {
      const result = autoClosePollsIfDue(trip.id, actor);
      if (result.closed > 0) {
        setPolls(listPolls(trip.id, { status: "all" }));
      }
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [trip?.id]);

  // Cuando el trip cambia, refrescamos via state initializer pattern (no setState directo
  // en effect). Si vienen polls de otro trip cached, le damos un nudge:
  const lastTripIdRef = useRef(trip?.id);
  if (lastTripIdRef.current !== trip?.id) {
    lastTripIdRef.current = trip?.id;
    // Schedule a refresh on next tick — fuera del render flush.
    queueMicrotask(refresh);
  }

  const counts = useMemo(() => {
    const open = polls.filter(p => !isPollClosed(p)).length;
    const closed = polls.length - open;
    return { open, closed, all: polls.length };
  }, [polls]);

  const visible = useMemo(() => {
    if (filter === "all") return polls;
    if (filter === "open") return polls.filter(p => !isPollClosed(p));
    return polls.filter(p => isPollClosed(p));
  }, [polls, filter]);

  if (!trip) {
    return (
      <div className="animate-fade-in">
        <LargeTitle title="Encuestas" eyebrow="Decidí con el grupo" serif />
        <div className="px-4">
          <EmptyState
            title="Sin viaje activo"
            description="Activá un viaje en /trips para crear y votar encuestas."
            icon={<Vote className="w-8 h-8" />}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-24">
      <LargeTitle
        eyebrow={`${counts.open} activa${counts.open === 1 ? "" : "s"} · ${counts.closed} cerrada${counts.closed === 1 ? "" : "s"}`}
        title="Encuestas"
        serif
      />

      {/* Filter chips */}
      <div className="px-4 mb-3 flex gap-1.5 overflow-x-auto no-scrollbar">
        <Chip active={filter === "open"} onClick={() => setFilter("open")}>
          Activas <span className="ml-1 opacity-80 tabular-nums">{counts.open}</span>
        </Chip>
        <Chip active={filter === "closed"} onClick={() => setFilter("closed")}>
          Cerradas <span className="ml-1 opacity-80 tabular-nums">{counts.closed}</span>
        </Chip>
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          Todas <span className="ml-1 opacity-80 tabular-nums">{counts.all}</span>
        </Chip>
      </div>

      {/* List */}
      <section className="px-4">
        {visible.length === 0 ? (
          <div className="ios-card p-6 text-center">
            <Sparkles className="w-5 h-5 text-muted-foreground/60 mx-auto mb-2" />
            <p className="text-[14px] font-semibold">
              {filter === "closed" ? "Sin polls cerrados todavía"
                : filter === "all" ? "Sin polls todavía"
                : "Sin polls activos"}
            </p>
            <p className="text-[12.5px] text-muted-foreground mt-1 max-w-xs mx-auto leading-relaxed">
              Creá una para decidir entre opciones: hotel A vs B, cenar temprano
              o tarde, qué tour hacer. El grupo vota y queda registrado.
            </p>
            <div className="mt-3">
              <CreatePoll tripId={trip.id} onCreated={refresh} variant="compact" />
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {visible.map(p => (
              <li key={p.id}>
                <div className="relative">
                  {isPollClosed(p) && (
                    <div className="absolute -top-2 -left-1 z-10">
                      <Pill tone="warn" className="!text-[10px]">Cerrada</Pill>
                    </div>
                  )}
                  <PollCard poll={p} onChange={refresh} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* FAB para crear (visible siempre) */}
      <div className="fixed bottom-24 right-4 z-30 lg:bottom-6">
        <FabCreate tripId={trip.id} onCreated={refresh} />
      </div>
    </div>
  );
}

function Chip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        "pressable shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors " +
        (active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")
      }
    >
      {children}
    </button>
  );
}

/**
 * FAB compacto que abre la sheet de creación. Reusa <CreatePoll variant="compact">
 * pero le damos un wrapper con look de pildora flotante.
 */
function FabCreate({ tripId, onCreated }: { tripId: string; onCreated: () => void }) {
  return (
    <div className="shadow-xl rounded-full bg-primary text-primary-foreground">
      <CreatePoll tripId={tripId} onCreated={onCreated} variant="compact" />
    </div>
  );
}
