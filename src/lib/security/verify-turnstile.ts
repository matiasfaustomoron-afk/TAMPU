"use client";

/**
 * ─── Cliente-side helper: validar token Turnstile contra el server ───
 *
 * Llamado por los flows donde mostramos `<Turnstile />` (signup, passcode
 * setup, BYOK key paste). El widget produce un token; este helper lo manda
 * a /api/verify-turnstile y devuelve true/false.
 *
 * Si NEXT_PUBLIC_TURNSTILE_SITEKEY no está en el bundle (preview deploys),
 * el widget produce el token sentinel "DISABLED" — el server lo acepta sólo
 * si `ALLOW_DISABLED_TURNSTILE=true`. En production esto debe estar OFF.
 */

export async function verifyTurnstileToken(token: string | null): Promise<{
  ok: boolean;
  reason?: string;
  errors?: string[];
}> {
  if (!token) return { ok: false, reason: "missing_token" };
  try {
    const res = await fetch("/api/verify-turnstile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { reason?: string; errors?: string[] };
      return { ok: false, reason: json.reason ?? "verification_failed", errors: json.errors };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message || "network_error" };
  }
}
