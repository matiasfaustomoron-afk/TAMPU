// ─── Sentry — server init ───
//
// Análogo a sentry.client.config.ts pero para Node/edge runtimes. Cargado
// vía src/instrumentation.ts.
//
// Top-level import (no IIFE async) para auto-instrumentación correcta de
// route handlers + source maps. El IIFE previo retrasaba el init y muchos
// errores tempranos escapaban a la captura.

import * as Sentry from "@sentry/nextjs";

// ─── PII scrubbing ───
// Duplicado de sentry.client.config.ts a propósito — los init corren en
// runtimes distintos (Node server vs browser) y Sentry no comparte config.
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

const serverDsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

Sentry.init({
  dsn: serverDsn,
  enabled: !!serverDsn,
  tracesSampleRate: 0.05,
  environment: process.env.VERCEL_ENV || "development",
  sendDefaultPii: false,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  beforeSend(event: any) {
    return scrubEvent(event as SentryEvent) as any;
  },
});
