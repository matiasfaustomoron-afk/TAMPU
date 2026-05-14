"use client";

/**
 * ─── Cloudflare Turnstile widget ───
 *
 * Wrapper liviano que carga el script oficial de Cloudflare on demand y
 * renderiza el widget. Evitamos depender de `@marsidev/react-turnstile` para
 * mantener la bundle size baja — la lógica es ~40 líneas.
 *
 * Uso:
 *   <Turnstile onSuccess={(token) => setCaptchaToken(token)} />
 *
 * Después validá `token` server-side llamando a /api/verify-turnstile.
 *
 * Sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY
 *   - En dev podés usar la sitekey "always pass" oficial de Cloudflare:
 *     `1x00000000000000000000AA` (https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
 *   - En production se setea en Vercel — sin la env, el widget no se monta y
 *     `onSuccess` se llama con un token sentinel `"DISABLED"` para no romper
 *     flows en preview deploys donde Turnstile no está configurado.
 */

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "flexible" | "compact";
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    __tampuTurnstileLoading?: Promise<void>;
  }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (window.__tampuTurnstileLoading) return window.__tampuTurnstileLoading;
  window.__tampuTurnstileLoading = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src^="${SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("turnstile-script-failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = `${SCRIPT_URL}?render=explicit`;
    s.async = true;
    s.defer = true;
    s.addEventListener("load", () => resolve());
    s.addEventListener("error", () => reject(new Error("turnstile-script-failed")));
    document.head.appendChild(s);
  });
  return window.__tampuTurnstileLoading;
}

export interface TurnstileProps {
  /** Callback con el token. Mandalo al server para que valide. */
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  theme?: "light" | "dark" | "auto";
  className?: string;
}

export function Turnstile({ onSuccess, onError, onExpire, theme = "auto", className }: TurnstileProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error" | "disabled">("idle");

  useEffect(() => {
    const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY;
    if (!sitekey) {
      // Sitekey no configurada — degradamos a "siempre pasa" para no bloquear
      // preview deploys ni tests locales. El verify endpoint server-side
      // rechaza tokens "DISABLED" salvo que ALLOW_DISABLED_TURNSTILE esté on.
      setStatus("disabled");
      onSuccess("DISABLED");
      return;
    }

    let cancelled = false;
    setStatus("loading");

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(ref.current, {
          sitekey,
          theme,
          callback: (token) => {
            if (!cancelled) onSuccess(token);
          },
          "error-callback": () => {
            if (cancelled) return;
            setStatus("error");
            onError?.();
          },
          "expired-callback": () => {
            if (!cancelled) onExpire?.();
          },
        });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
          onError?.();
        }
      });

    return () => {
      cancelled = true;
      try {
        if (widgetIdRef.current && window.turnstile?.remove) {
          window.turnstile.remove(widgetIdRef.current);
        }
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "disabled") {
    return (
      <p className={`text-[10px] text-muted-foreground ${className ?? ""}`}>
        Turnstile no configurado en este entorno (NEXT_PUBLIC_TURNSTILE_SITEKEY).
      </p>
    );
  }
  return <div ref={ref} className={className} data-testid="turnstile-widget" />;
}
