// ─── Sentry — client init ───
//
// Cargado por Next.js automáticamente cuando existe este archivo. NO importa
// `@sentry/nextjs` con un import top-level porque la dep es opcional (ver
// `src/lib/observability/sentry.ts`). Hacemos dynamic import para que el
// build no rompa si la dep no está instalada en el deploy.
//
// Para activar:
//   1. npm i @sentry/nextjs
//   2. Setear NEXT_PUBLIC_SENTRY_DSN en Vercel
//
// Si NEXT_PUBLIC_SENTRY_DSN no está, esto es un no-op.

export {};

const clientDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (clientDsn) {
  void (async () => {
    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.init({
        dsn: clientDsn,
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 1.0,
        environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
      });
    } catch {
      // Dep no instalada — no-op. Los `captureException` del codebase ya hacen
      // fallback a console.error (ver src/lib/observability/sentry.ts).
    }
  })();
}
