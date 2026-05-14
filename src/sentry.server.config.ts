// ─── Sentry — server init ───
//
// Análogo a sentry.client.config.ts pero para Node/edge runtimes. Cargado
// vía src/instrumentation.ts.

export {};

const serverDsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
if (serverDsn) {
  void (async () => {
    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.init({
        dsn: serverDsn,
        tracesSampleRate: 0.05,
        environment: process.env.VERCEL_ENV || "development",
      });
    } catch {
      // ignore
    }
  })();
}
