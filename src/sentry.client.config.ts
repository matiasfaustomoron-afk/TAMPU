// ─── Sentry — client init ───
//
// Cargado por Next.js automáticamente cuando existe este archivo. Top-level
// import (en lugar del IIFE async previo) para permitir que el Sentry webpack
// plugin haga auto-instrumentación correcta (route handlers, navegación,
// fetch breadcrumbs) + suba source maps con el bundle.
//
// El IIFE anterior cargaba Sentry "después" del paint inicial → muchos errores
// tempranos (hydration, boot) escapaban a la captura.
//
// `@sentry/nextjs` ya está en package.json (^8.45.0). Si NEXT_PUBLIC_SENTRY_DSN
// no está, marcamos `enabled: false` para que Sentry sea un no-op silencioso.

import * as Sentry from "@sentry/nextjs";

// ─── PII scrubbing ───
// Sentry recibe el error + un blob de contexto. Por defecto incluye headers,
// cookies, body, user.ip. Eso captura tokens (cookie de sesión Supabase,
// `authorization: Bearer ...`), api keys (`x-anthropic-key`, `x-gemini-key`),
// y prompts de usuario completos. Acá los quitamos antes de mandar.
//
// Mismo helper duplicado en sentry.server.config.ts — beforeSend corre en
// runtime distinto y `@sentry/nextjs` no comparte init entre client/server.
type SentryEvent = {
  request?: { headers?: Record<string, string> };
  extra?: Record<string, unknown>;
  user?: { ip_address?: string };
};
function scrubEvent(event: SentryEvent): SentryEvent {
  if (event.request?.headers) {
    delete event.request.headers.cookie;
    delete event.request.headers.Cookie;
    delete event.request.headers.authorization;
    delete event.request.headers.Authorization;
    delete event.request.headers["x-anthropic-key"];
    delete event.request.headers["x-gemini-key"];
  }
  if (event.extra) {
    delete event.extra.identifier;
    delete event.extra.payload;
    delete event.extra.body;
    delete event.extra.userMessage;
    delete event.extra.system;
  }
  if (event.user) delete event.user.ip_address;
  return event;
}

const clientDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: clientDsn,
  // `enabled: false` cuando no hay DSN → Sentry queda como no-op silencioso
  // sin warnings ni intentar mandar eventos a una URL vacía.
  enabled: !!clientDsn,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
  sendDefaultPii: false,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  beforeSend(event: any) {
    return scrubEvent(event as SentryEvent) as any;
  },
});
