"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { SupabaseClient, User } from "@supabase/supabase-js";

type AppMode = "online" | "demo" | "unconfigured";

interface SupabaseCtx {
  client: SupabaseClient | null;
  user: User | null;
  mode: AppMode;
  loading: boolean;
}

const isDemoEnabled = process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "true";

function resolveMode(): AppMode {
  if (isSupabaseConfigured) return "online";
  if (isDemoEnabled) return "demo";
  return "unconfigured";
}

const Ctx = createContext<SupabaseCtx>({
  client: null, user: null, mode: resolveMode(), loading: true,
});

const clientSingleton = isSupabaseConfigured ? createClient() : null;

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(resolveMode() === "online");
  const mode = resolveMode();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!clientSingleton) return;
    let mounted = true;
    clientSingleton.auth.getUser().then(({ data }) => {
      if (mounted) { setUser(data.user); setLoading(false); }
    });
    const { data: { subscription } } = clientSingleton.auth.onAuthStateChange((ev, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      // Limpiar todo el cache de React Query cuando cambia el usuario.
      // Esencial para evitar leak de data entre cuentas (ej user A logout, user B login
      // en el mismo browser tab: NO debe ver trips de A cacheados).
      if (ev === "SIGNED_IN" || ev === "SIGNED_OUT" || ev === "USER_UPDATED") {
        queryClient.clear();
      }
    });
    return () => { mounted = false; subscription.unsubscribe(); };
    // queryClient es stable (mismo ref durante toda la sesión vía useState en TampuQueryProvider).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Ctx.Provider value={{ client: clientSingleton, user, mode, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSupabase() { return useContext(Ctx); }
export function useAppMode() { return useContext(Ctx).mode; }
