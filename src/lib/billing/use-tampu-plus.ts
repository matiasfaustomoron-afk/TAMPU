// ─── src/lib/billing/use-tampu-plus.ts ───────────────────────────────────
//
// Hook React para resolver "¿este user es Tampu+ lifetime?" sin que cada
// componente reimplemente el chequeo.
//
// Llama a `public.is_tampu_plus(user_id)` (Supabase RPC, security definer).
// Cachea el resultado en memoria por 5 minutos para no martillar la DB cada
// vez que se monta un componente.
//
// API:
//   const { isPlus, loading, purchase, refresh } = useTampuPlus();
//
// - isPlus: boolean | null  → null mientras loading
// - loading: boolean
// - purchase: PurchaseInfo | null (fecha de compra, monto) — útil para mostrar
//   "Sos Tampu+ desde {fecha}". Null si no hay compra o si está sin sesión.
// - refresh(): force re-fetch (post compra exitosa, por ejemplo).
//
// Diseño: se usa SOLO desde client components. Si no hay supabase configurado
// devuelve `{ isPlus: false, loading: false }` y nunca falla.

"use client";

import { useCallback, useEffect, useState } from "react";
import { useSupabase } from "@/lib/context/supabase-provider";

const CACHE_TTL_MS = 5 * 60 * 1000;

interface PurchaseInfo {
  purchased_at: string;
  amount_usd: number;
  currency: string;
  status: "active" | "refunded" | "disputed";
}

interface CacheEntry {
  isPlus: boolean;
  purchase: PurchaseInfo | null;
  ts: number;
}

// Cache module-level para que múltiples mounts del hook compartan resultado.
// Key = user.id (o "anon" si no hay sesión).
const cache = new Map<string, CacheEntry>();

export interface UseTampuPlusResult {
  isPlus: boolean | null;
  loading: boolean;
  purchase: PurchaseInfo | null;
  refresh: () => Promise<void>;
}

export function useTampuPlus(): UseTampuPlusResult {
  const { client, user } = useSupabase();
  const [state, setState] = useState<{
    isPlus: boolean | null;
    loading: boolean;
    purchase: PurchaseInfo | null;
  }>({ isPlus: null, loading: true, purchase: null });

  const fetchStatus = useCallback(
    async (force = false) => {
      if (!client) {
        setState({ isPlus: false, loading: false, purchase: null });
        return;
      }

      const cacheKey = user?.id ?? "anon";
      const cached = cache.get(cacheKey);
      if (!force && cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        setState({ isPlus: cached.isPlus, loading: false, purchase: cached.purchase });
        return;
      }

      setState((s) => ({ ...s, loading: true }));

      try {
        // RPC al helper SQL — security definer, así que funciona aunque
        // RLS bloquearía la lectura directa de la tabla.
        const { data: isPlusRaw, error: rpcErr } = await client.rpc("is_tampu_plus", {
          p_user_id: user?.id ?? null,
        });

        if (rpcErr) {
          // eslint-disable-next-line no-console
          console.warn("[useTampuPlus] rpc error:", rpcErr.message);
          cache.set(cacheKey, { isPlus: false, purchase: null, ts: Date.now() });
          setState({ isPlus: false, loading: false, purchase: null });
          return;
        }

        const isPlus = isPlusRaw === true;
        let purchase: PurchaseInfo | null = null;

        if (isPlus) {
          // Buscar la row activa más reciente para mostrar fecha + amount.
          // Si el user_id es null (compra anonymous aún no backfilled),
          // matcheamos por email del JWT vía RLS.
          const { data: row, error: selErr } = await client
            .from("tampu_plus_lifetime")
            .select("purchased_at, amount_usd, currency, status")
            .eq("status", "active")
            .order("purchased_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!selErr && row) {
            purchase = {
              purchased_at: row.purchased_at as string,
              amount_usd: Number(row.amount_usd),
              currency: row.currency as string,
              status: row.status as PurchaseInfo["status"],
            };
          }
        }

        cache.set(cacheKey, { isPlus, purchase, ts: Date.now() });
        setState({ isPlus, loading: false, purchase });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[useTampuPlus] unexpected error:", (err as Error).message);
        setState({ isPlus: false, loading: false, purchase: null });
      }
    },
    [client, user?.id],
  );

  useEffect(() => {
    void fetchStatus(false);
  }, [fetchStatus]);

  const refresh = useCallback(() => fetchStatus(true), [fetchStatus]);

  return {
    isPlus: state.isPlus,
    loading: state.loading,
    purchase: state.purchase,
    refresh,
  };
}

// Helper exportado para invalidar el cache manualmente desde otros módulos
// (ej. después de una compra exitosa o un "Restaurar compra").
export function invalidateTampuPlusCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}
