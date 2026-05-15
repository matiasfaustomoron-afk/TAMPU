"use client";

// ─── Segment-level error boundary para el route group (app) ───
//
// Next.js App Router: si una page o layout del segmento (app) tira durante
// el render (sync o async), Next sube el árbol buscando el `error.tsx` más
// cercano. Sin uno acá, el error llega al GlobalErrorBoundary en root
// layout → toda la app queda en el fallback global (mala UX: el shell de
// tabs desaparece).
//
// Con este boundary, sólo el área del segmento muestra fallback; el
// bottom tab bar + chrome del layout siguen visibles → el user puede
// navegar a otra tab.
//
// `reset()` re-monta el segmento y reintenta. `error.digest` es el hash
// que Next pone en server-side errors (útil para correlacionar con logs
// en Sentry).

import { useEffect } from "react";
import { captureException } from "@sentry/nextjs";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, { tags: { boundary: "app-segment" } });
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h2 className="text-lg font-semibold mb-2">Algo salió mal</h2>
        <p className="text-sm opacity-70 mb-4">
          Intentá refrescar la página o volver al inicio.
        </p>
        <button
          onClick={() => reset()}
          className="px-4 py-2 rounded bg-foreground text-background pressable"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
