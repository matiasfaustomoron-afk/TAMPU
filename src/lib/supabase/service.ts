import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. SOLO server-side (webhooks que necesitan
 * bypass RLS para escribir en `email_inbox` por ejemplo).
 *
 * NUNCA exponer al cliente. NUNCA importar desde un componente client.
 *
 * Devuelve null si las ENV no están configuradas — los webhooks que dependen
 * de esto deberían fallar suavemente o devolver 503 con setup docs.
 */
export function createSupabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
