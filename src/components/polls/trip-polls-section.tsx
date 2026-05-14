"use client";

import { useState, useEffect, useCallback } from "react";
import { PollCard } from "./poll-card";
import { CreatePoll } from "./create-poll";
import { getLocalPolls, type Poll } from "@/lib/polls/poll";
import { useI18n } from "@/i18n/provider";

/**
 * <TripPollsSection /> — sección lista para drop-in en /itinerary o /reservations.
 *
 * Levanta los polls del trip, renderiza una lista de cards y un trigger de
 * crear. Se subscribe a `storage` event para sincronizarse con otras tabs.
 *
 * En el futuro: cuando esté la tabla `polls` en Supabase + RLS, este componente
 * va a tener que delegar el fetch a un hook (`usePolls(tripId)`). Por ahora
 * el localStorage es la fuente única.
 */
export function TripPollsSection({
  tripId,
  defaultQuestion,
  defaultOptions,
  emptyHint,
  maxShown,
}: {
  tripId: string;
  defaultQuestion?: string;
  defaultOptions?: Array<{ label: string; description?: string }>;
  emptyHint?: string;
  maxShown?: number;
}) {
  const { t } = useI18n();
  const [polls, setPolls] = useState<Poll[]>([]);

  const refresh = useCallback(() => {
    setPolls(getLocalPolls(tripId));
  }, [tripId]);

  useEffect(() => {
    refresh();
    const handler = (ev: StorageEvent) => {
      if (ev.key && ev.key.startsWith("tampu.polls.")) refresh();
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [refresh]);

  const shown = maxShown ? polls.slice(0, maxShown) : polls;

  return (
    <section className="px-4 mt-6">
      <div className="flex items-baseline justify-between mb-2 px-1">
        <p className="ios-eyebrow !p-0">{t.polls.title}</p>
        <p className="text-[11px] text-muted-foreground">
          {polls.length === 0 ? t.polls.subtitle : `${polls.length} activa${polls.length === 1 ? "" : "s"}`}
        </p>
      </div>

      {shown.length === 0 ? (
        <div className="ios-card p-4 text-center text-[13px] text-muted-foreground">
          {emptyHint || t.polls.emptyAll}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map(p => (
            <PollCard key={p.id} poll={p} onChange={refresh} />
          ))}
        </div>
      )}

      <div className="mt-3">
        <CreatePoll
          tripId={tripId}
          defaultQuestion={defaultQuestion}
          defaultOptions={defaultOptions}
          onCreated={refresh}
        />
      </div>
    </section>
  );
}
