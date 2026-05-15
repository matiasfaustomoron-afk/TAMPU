import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// Module-level singleton. createBrowserClient() instancia un client nuevo cada
// vez que se llama: invocaciones repetidas (en hooks, providers, callbacks)
// generaban N clients con N suscripciones auth diferentes, causando handlers
// auth duplicados y posibles race conditions en token refresh.
//
// Con este cache, todo el browser-side comparte el mismo client (mismo
// onAuthStateChange listener subyacente).
let cached: SupabaseClient | null = null;

export function createClient(): SupabaseClient | null {
  if (cached) return cached;
  if (!supabaseUrl || !supabaseAnonKey) return null;
  cached = createBrowserClient(supabaseUrl, supabaseAnonKey);
  return cached;
}

/**
 * Resetea el singleton cacheado. Pensado para llamar desde el handler de
 * SIGNED_OUT (en supabase-provider o donde sea que se suscriba a
 * `onAuthStateChange`): después de logout, la siguiente invocación de
 * `createClient()` devolverá una instancia nueva con storage limpio, en vez
 * de reciclar el client que tenía la sesión vieja en memoria.
 *
 * NO se llama auto desde acá — el wiring queda en manos del caller para no
 * acoplar este módulo a la lógica de auth.
 */
export function resetClient(): void {
  cached = null;
}
