/**
 * ─── Sentry abstraction layer ───
 *
 * Wrappers para `@sentry/nextjs`. La dep es opcional — si no está instalada,
 * todos los helpers son no-ops (loguean a console.error) para que el código
 * de production no rompa si el deploy se hace sin Sentry configurado.
 *
 * Para activar:
 *   1. npm i @sentry/nextjs
 *   2. Setear NEXT_PUBLIC_SENTRY_DSN en Vercel
 *   3. src/sentry.client.config.ts y src/sentry.server.config.ts ya están
 *      en el repo (este sprint).
 *
 * Diseño: usamos dynamic `import()` con try/catch para que TypeScript no
 * marque error cuando la dep no está y bundlers tree-shakeen sólo si la
 * encuentran.
 */

interface CaptureCtx {
  tag?: string;
  level?: "info" | "warning" | "error" | "fatal";
  extra?: Record<string, unknown>;
  user?: { id?: string; email?: string };
}

type SentryAPI = {
  captureException: (err: unknown, ctx?: unknown) => void;
  captureMessage: (msg: string, ctx?: unknown) => void;
};

let sentryCache: SentryAPI | null | undefined;

async function loadSentry(): Promise<SentryAPI | null> {
  if (sentryCache !== undefined) return sentryCache;
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    sentryCache = null;
    return null;
  }
  try {
    // Importamos dinámicamente — si la dep no está, el catch silencia.
    const mod = await import("@sentry/nextjs");
    sentryCache = mod as unknown as SentryAPI;
    return sentryCache;
  } catch {
    sentryCache = null;
    return null;
  }
}

export function captureException(err: unknown, ctx: CaptureCtx = {}): void {
  void loadSentry().then((s) => {
    if (!s) {
      // Fallback: log local. Tag para grepability en logs Vercel.
      // eslint-disable-next-line no-console
      console.error(`[sentry-fallback] ${ctx.tag ?? "no-tag"}:`, err, ctx.extra ?? "");
      return;
    }
    try {
      s.captureException(err, {
        level: ctx.level ?? "error",
        tags: ctx.tag ? { component: ctx.tag } : undefined,
        extra: ctx.extra,
        user: ctx.user,
      });
    } catch {
      // ignore
    }
  });
}

export function captureMessage(message: string, ctx: CaptureCtx = {}): void {
  void loadSentry().then((s) => {
    if (!s) {
      // eslint-disable-next-line no-console
      console.warn(`[sentry-fallback] ${ctx.tag ?? "no-tag"}: ${message}`, ctx.extra ?? "");
      return;
    }
    try {
      s.captureMessage(message, {
        level: ctx.level ?? "warning",
        tags: ctx.tag ? { component: ctx.tag } : undefined,
        extra: ctx.extra,
      });
    } catch {
      // ignore
    }
  });
}
