// ─── Next.js instrumentation hook ───
//
// Llamado una vez al boot del runtime server. Lo usamos para inicializar
// Sentry server-side. La config vive en sentry.server.config.ts y
// sentry.client.config.ts (client) — ambos son no-ops sin DSN.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.server.config");
  }
}
