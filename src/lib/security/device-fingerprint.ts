"use client";

/**
 * ─── Device fingerprint helper ───
 *
 * Wrapper alrededor de `@fingerprintjs/fingerprintjs` open-source. Si la dep
 * no está instalada, hacemos fallback a un fingerprint pseudo-estable basado
 * en `navigator.userAgent` + screen + timezone. Esto es mucho menos preciso,
 * pero suficiente para que el rate-limit anónimo no caiga al tier strict.
 *
 * El valor se cachea en `localStorage` después del primer cálculo para
 * estabilidad cross-session.
 */

const CACHE_KEY = "tampu_dfp_v1";

async function computeFallbackFingerprint(): Promise<string> {
  if (typeof navigator === "undefined") return "fallback:no-window";
  const bits = [
    navigator.userAgent,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    navigator.hardwareConcurrency?.toString() ?? "?",
  ].join("|");
  // Hash con SubtleCrypto si está disponible
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bits));
      return `fallback:${Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32)}`;
    } catch {
      // ignore — caemos al string raw
    }
  }
  return `fallback:${btoa(bits).slice(0, 32)}`;
}

let cached: string | null = null;

export async function getDeviceFingerprint(): Promise<string> {
  if (cached) return cached;
  if (typeof window === "undefined") return "ssr:no-window";

  // Cache localStorage primero (estable cross-session)
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored && stored.length >= 8 && stored.length <= 256) {
      cached = stored;
      return stored;
    }
  } catch {
    // ignore
  }

  let fp: string;
  try {
    const Fingerprint = await import("@fingerprintjs/fingerprintjs");
    const agent = await Fingerprint.load();
    const result = await agent.get();
    fp = result.visitorId || (await computeFallbackFingerprint());
  } catch {
    fp = await computeFallbackFingerprint();
  }

  cached = fp;
  try {
    localStorage.setItem(CACHE_KEY, fp);
  } catch {
    // ignore — modo privado o cuota llena
  }
  return fp;
}

/** Devuelve un header dict listo para mergear en `fetch`. */
export async function withDeviceFingerprint(headers: Record<string, string> = {}): Promise<Record<string, string>> {
  try {
    const fp = await getDeviceFingerprint();
    return { ...headers, "x-device-fingerprint": fp };
  } catch {
    return headers;
  }
}
