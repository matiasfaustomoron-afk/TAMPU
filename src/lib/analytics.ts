"use client";

/**
 * Tampu — Telemetría híbrida (local + opt-in remoto).
 *
 * Privacy posture:
 *   - SIEMPRE escribimos a localStorage (visible al user en /more → "Actividad").
 *   - OPCIONALMENTE enviamos a Plausible (self-hosted o cloud) si el user opta in
 *     desde Ajustes. Plausible no usa cookies, no trackea cross-site, sin PII.
 *   - Si el user opta out, dispatch NUNCA sale del device.
 *
 * Para activar Plausible: setear `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` + opcionalmente
 * `NEXT_PUBLIC_PLAUSIBLE_API_HOST` (default: plausible.io). El user todavía tiene
 * que opt-in explícito en Ajustes (default = off).
 *
 * Eventos canónicos: definidos abajo como `TampuEvent`. NUNCA loguear PII (emails,
 * nombres de usuario, contenido de gastos). Solo metadata estructural.
 */

const KEY = "travel-os-events";
const OPT_IN_KEY = "tampu-telemetry-opt-in";
const MAX_EVENTS = 500;

// ─── Eventos canónicos del producto ─────────────────────────────────────────
// Cualquier código que llame `track()` debería usar uno de estos nombres
// para que las dashboards downstream tengan claves estables.
export const EVENTS = {
  // Onboarding funnel
  ONBOARDING_START: "onboarding.start",
  ONBOARDING_AHA_VIEWED: "onboarding.aha_viewed",       // pantalla 2 del welcome
  ONBOARDING_LOAD_EXAMPLE: "onboarding.load_example",   // tap en "cargar ejemplo"
  ONBOARDING_CREATE_TRIP: "onboarding.create_trip",     // tap en "crear viaje"

  // Filo 10x — adopción del flow killer
  IMPORT_PASTED: "import.pasted",                       // user pegó texto
  IMPORT_PARSED: "import.parsed",                       // parser devolvió >=1 booking
  IMPORT_SAVED: "import.saved",                         // user commiteó al viaje
  EMAIL_INBOUND_RECEIVED: "email.inbound_received",     // webhook entró
  WHATSAPP_INBOUND_RECEIVED: "whatsapp.inbound_received",

  // Vault
  VAULT_UPLOAD: "vault.upload",
  VAULT_CLASSIFY: "vault.classify",
  VAULT_PKPASS_REQUEST: "vault.pkpass_request",

  // Retención
  TRIP_CREATED: "trip.created",
  TRIP_OPENED: "trip.opened",
  EXPENSE_ADDED: "expense.added",
  BUDGET_EDITED: "budget.edited",
  RESERVATION_ADDED: "reservation.added",

  // Monetización
  BOOKING_LINK_CLICKED: "booking.link_clicked",
  AFFILIATE_CLICK: "affiliate.click",                   // partner ACTIVE

  // Multi-user
  TRIP_INVITED: "trip.invited",
  TRIP_INVITE_ACCEPTED: "trip.invite_accepted",
} as const;

export type TampuEvent = typeof EVENTS[keyof typeof EVENTS];

export interface AppEvent {
  ts: number;
  name: string;
  ctx?: Record<string, string | number | boolean | null | undefined>;
}

// ─── Opt-in state ───────────────────────────────────────────────────────────

export type TelemetryConsent = "unknown" | "opted-in" | "opted-out";

export function getTelemetryConsent(): TelemetryConsent {
  if (typeof localStorage === "undefined") return "unknown";
  const v = localStorage.getItem(OPT_IN_KEY);
  if (v === "opted-in" || v === "opted-out") return v;
  return "unknown";
}

export function setTelemetryConsent(c: "opted-in" | "opted-out"): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(OPT_IN_KEY, c);
    window.dispatchEvent(new Event("tampu-telemetry-consent-change"));
  } catch { /* ignore */ }
}

// ─── Remote sink (Plausible) ────────────────────────────────────────────────

function sendToPlausible(name: string, ctx?: AppEvent["ctx"]): void {
  if (typeof window === "undefined") return;
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  if (!domain) return; // No configurado
  if (getTelemetryConsent() !== "opted-in") return; // User no opted in

  const host = process.env.NEXT_PUBLIC_PLAUSIBLE_API_HOST || "https://plausible.io";
  const payload = {
    name,
    url: window.location.href,
    domain,
    props: ctx,
  };

  // Fire-and-forget. No bloqueamos el thread.
  fetch(`${host}/api/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => { /* silent — privacy posture */ });
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function track(name: string, ctx?: AppEvent["ctx"]): void {
  if (typeof localStorage === "undefined") return;

  // 1) Local (siempre)
  try {
    const raw = localStorage.getItem(KEY);
    const arr: AppEvent[] = raw ? JSON.parse(raw) : [];
    arr.push({ ts: Date.now(), name, ctx });
    const trimmed = arr.length > MAX_EVENTS ? arr.slice(-MAX_EVENTS) : arr;
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch { /* ignore */ }

  // 2) Remote (opt-in)
  sendToPlausible(name, ctx);
}

export function getEvents(): AppEvent[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as AppEvent[] : [];
  } catch { return []; }
}

export function clearEvents(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(KEY);
}

/** Summary: count by event name, sorted desc. */
export function summarize(events?: AppEvent[]): { name: string; count: number; lastTs: number }[] {
  const e = events ?? getEvents();
  const m = new Map<string, { count: number; lastTs: number }>();
  for (const ev of e) {
    const cur = m.get(ev.name) || { count: 0, lastTs: 0 };
    cur.count++;
    if (ev.ts > cur.lastTs) cur.lastTs = ev.ts;
    m.set(ev.name, cur);
  }
  return Array.from(m.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Retention check — devuelve true si el user volvió al día N después del primer evento.
 * D2 retention = "volvió 24h después de la primera vez que usó la app".
 */
export function returnedAtDay(n: number): boolean {
  const events = getEvents();
  if (events.length === 0) return false;
  const firstTs = events[0].ts;
  const targetWindow = [firstTs + n * 86400000, firstTs + (n + 1) * 86400000];
  return events.some(e => e.ts >= targetWindow[0] && e.ts < targetWindow[1]);
}
