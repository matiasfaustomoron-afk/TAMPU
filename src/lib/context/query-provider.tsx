"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { reportError } from "@/lib/utils/errors";

/**
 * Tampu — TanStack Query provider.
 *
 * Cliente único por render-tree. Configurado con:
 *   - staleTime 30s: evita refetches duplicados al navegar entre pages que
 *     consumen el mismo entity (ej /dashboard → /expenses comparten useExpenses).
 *   - refetchOnWindowFocus default true: cuando el user vuelve al tab,
 *     refresca data si stale (sync UX).
 *   - retry 1: errors transitorios pueden recuperarse, pero RLS/4xx no se
 *     retrian indefinidamente.
 *
 * NOTA: el QueryClient se crea con `useState` para que sea estable a través
 * de re-renders (no re-instanciar entre HMR ni Strict-Mode double-render).
 * No se memoiza como módulo singleton porque rompería SSR boundaries.
 *
 * TODO (perf/observability audit, mayo 2026) — Persist query cache to localStorage:
 *   1. `npm i @tanstack/query-sync-storage-persister @tanstack/react-query-persist-client`
 *   2. Wrap el provider:
 *        import { persistQueryClient } from "@tanstack/react-query-persist-client";
 *        import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
 *        const persister = createSyncStoragePersister({ storage: window.localStorage });
 *        persistQueryClient({ queryClient, persister, maxAge: 1000 * 60 * 60 * 24 });
 *   3. Beneficio: cold start de la app muestra data cached instantánea (sin spinner),
 *      crítico para PWA offline-first + iOS standalone. Riesgo: stale data si el
 *      schema cambia → manejar con `buster` key vinculada al app version.
 *   No se aplica en este pass para no agregar nuevos packages tan cerca del release.
 */
export function TampuQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // staleTime 5min (bump mayo 2026 — nav perf audit):
            // 60s era demasiado agresivo para navegación entre tabs. Cada
            // toggle /today ↔ /expenses ↔ /vault disparaba refetch en cascada
            // de queries compartidas (useTripActive, useTripMembers, etc.)
            // generando "freeze" perceptible al navegar. 5 min es el nuevo
            // sweet spot: realtime sub cubre updates frescos (use-trip-realtime),
            // staleTime cubre tab-switch UX. Supabase realtime es la fuente
            // de actualización, no el polling de focus.
            staleTime: 5 * 60_000,
            // gcTime 10min: queries inactivas (componente desmontado) sobreviven
            // 10 min antes de garbage-collect. Esto permite navegación rápida
            // back/forward sin refetch (ej toggle entre /dashboard y /expenses).
            gcTime: 10 * 60_000,
            retry: 1,
            // refetchOnWindowFocus false (bump mayo 2026 — nav perf audit):
            // El default true disparaba refetch en cascada cada vez que el user
            // volvía al tab (multi-tab usage común en planning desktop), o tras
            // bg/fg en mobile. Combinado con realtime sub que YA empuja updates
            // frescos vía postgres_changes (use-trip-realtime), el window-focus
            // refetch es redundante y caro. Apagarlo elimina la "ola de spinners"
            // post tab-switch.
            refetchOnWindowFocus: false,
            // Reconnect SÍ refetch: si perdiste red y volvés, la sub realtime
            // pudo haber perdido eventos durante el offline window — refetch
            // explícito cierra el gap. "always" fuerza incluso con data fresh.
            refetchOnReconnect: "always",
          },
          mutations: {
            // onError central — antes, cada mutation en use-trip-data.ts solo
            // tenía onSuccess (invalidate queries); los errores bubbleaban via
            // throw a los callers, que en muchos componentes no estaban
            // wrapped en try/catch → toast silencioso, error invisible al user
            // (P0 audit finding).
            //
            // Acá disparamos reportError(e) por default, que ya hace:
            //   console.error (debug) + toast user-facing + haptic heavy.
            //
            // Callers que quieran handling custom (silenciar el toast por
            // optimistic update, etc.) pueden seguir pasando su propio
            // `onError` al useMutation — los handlers per-mutation se
            // ejecutan ADEMÁS del default, no en lugar de.
            onError: (err) => {
              reportError(err, "Error en operación");
            },
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
