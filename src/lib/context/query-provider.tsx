"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
 */
export function TampuQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
