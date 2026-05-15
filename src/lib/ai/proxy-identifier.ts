// ─── Helper compartido para `recordProxyCall` identifier ───
//
// Antes cada endpoint AI hardcodeaba "byok:<endpoint>" / "fallback:<endpoint>"
// como identifier para `recordProxyCall`. Eso significaba que TODOS los users
// compartían el mismo bucket de rate-limit por endpoint — un user que abusa
// del proxy podía DoS-ear a los demás.
//
// Con este helper, intentamos pegar el `user.id` de la sesión Supabase y
// generamos `byok:user:<uuid>:<suffix>` / `fallback:user:<uuid>:<suffix>`.
// Si no hay sesión (anon request, cookies vacías), fallback al identifier
// viejo `byok:<suffix>` / `fallback:<suffix>` — mantiene retro-compat con
// callers internos / webhooks que no traen cookies de usuario.
//
// Usage:
//   const id = await getProxyIdentifier(
//     "categorize-expense",
//     keySource === "byok" ? "byok" : "fallback",
//   );
//   await recordProxyCall(id, { ... });

import { createSupabaseServer } from "@/lib/supabase/server";

export async function getProxyIdentifier(
  suffix: string,
  fallback: "byok" | "fallback",
): Promise<string> {
  try {
    const sb = await createSupabaseServer();
    if (sb) {
      const { data: { user } } = await sb.auth.getUser();
      if (user?.id) return `${fallback}:user:${user.id}:${suffix}`;
    }
  } catch (e) {
    // No sesión disponible (anon request, cookies vacías, etc) — usá fallback.
    console.warn(`[ai-proxy-id] user lookup failed:`, e);
  }
  return `${fallback}:${suffix}`;
}
