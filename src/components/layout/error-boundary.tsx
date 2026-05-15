"use client";

import { Component, type ReactNode } from "react";
import Link from "next/link";

// Global React error boundary — required by App Store guideline 2.1 (crash-free).
// On error: logs to console (and optionally to /api/error) + shows a recovery UI
// that never traps the user. Both the error itself and a clear "Volver al inicio"
// CTA are surfaced.

interface State {
  error: Error | null;
  errorId: string | null;
}

function logBoundaryError(err: Error, info: { componentStack?: string | null }) {
  const payload = {
    name: err.name,
    message: err.message,
    stack: err.stack?.split("\n").slice(0, 8).join("\n"),
    componentStack: (info.componentStack || "").split("\n").slice(0, 8).join("\n"),
    ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
    url: typeof location !== "undefined" ? location.href : "",
    ts: new Date().toISOString(),
  };
  if (typeof console !== "undefined") console.error("[TravelOS:ErrorBoundary]", payload);
  // Fire-and-forget POST. Endpoint is optional — never throws if missing.
  try {
    const base = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_API_BASE_URL || "" : "";
    fetch(`${base}/api/error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch { /* ignore */ }
}

export class GlobalErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, errorId: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, errorId: Math.random().toString(36).slice(2, 10) };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    logBoundaryError(error, info);
  }

  reset = () => this.setState({ error: null, errorId: null });

  render() {
    if (!this.state.error) return this.props.children;
    const errMsg = this.state.error.message || "Error desconocido";
    const stack = this.state.error.stack?.split("\n").slice(0, 6).join("\n") || "";
    const copyText = `Tampu error\nID: ${this.state.errorId}\nURL: ${typeof location !== "undefined" ? location.href : ""}\nUA: ${typeof navigator !== "undefined" ? navigator.userAgent : ""}\nMessage: ${errMsg}\n\n${stack}`;
    const copy = () => {
      try { navigator.clipboard.writeText(copyText); }
      catch { /* ignore */ }
    };
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
        <div
          className="max-w-md w-full rounded-[var(--radius-lg)] p-6 sm:p-7 space-y-4"
          style={{
            background: "var(--color-card)",
            boxShadow: "var(--shadow-floating)",
            border: "1px solid var(--color-border)",
          }}
        >
          {/* Icon header */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl tampu-icon tampu-icon-carmin flex items-center justify-center text-2xl">
              ⚠️
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-destructive font-bold">Algo se rompió</p>
              <h1 className="text-lg font-bold leading-tight mt-0.5">Pero tu data está intacta</h1>
            </div>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">
            Vive en este dispositivo. Reintentá; si vuelve a pasar, copiá los detalles y avisanos.
          </p>

          {/* Error message — visible always (not just dev) */}
          <details className="rounded-xl bg-muted/40 p-3 text-[11.5px]">
            <summary className="cursor-pointer font-semibold text-muted-foreground">Detalles técnicos</summary>
            <pre className="mt-2 overflow-auto max-h-40 text-[10.5px] whitespace-pre-wrap break-words font-mono opacity-90">
              {errMsg}
              {stack && "\n\n" + stack}
            </pre>
          </details>

          <div className="flex gap-2">
            <button
              onClick={this.reset}
              className="pressable flex-1 px-3 py-2.5 rounded-xl bg-muted text-sm font-semibold"
            >
              Reintentar
            </button>
            <Link
              href="/today"
              onClick={this.reset}
              className="pressable flex-1 px-3 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold text-center"
            >
              Volver a Hoy
            </Link>
          </div>

          <button
            onClick={copy}
            className="pressable w-full text-[12px] text-muted-foreground hover:text-foreground py-1"
          >
            Copiar detalles del error
          </button>

          {this.state.errorId && (
            <p className="text-[10px] text-muted-foreground text-center">
              ID: <code className="font-mono">{this.state.errorId}</code>
            </p>
          )}
        </div>
      </div>
    );
  }
}
