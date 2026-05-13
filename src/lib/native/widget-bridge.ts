/**
 * WidgetBridge — comunica el JS con el Widget Extension iOS via App Group.
 *
 * El plugin Capacitor `WidgetBridge` escribe en
 * `UserDefaults(suiteName: "group.com.tampu.app")` y dispara
 * `WidgetCenter.shared.reloadAllTimelines()` para que el Widget refresque.
 *
 * Flow:
 *   1. JS llama `pushWidgetSnapshot({ next_event, countdown_days, city })`
 *   2. Plugin Swift serializa a JSON y lo guarda en App Group
 *   3. Widget (TimelineProvider) lee desde el mismo App Group y renderiza
 *
 * En web (no native), `pushWidgetSnapshot` es no-op pero conserva el shape para
 * que el callsite no tenga que checkear `isNative`.
 *
 * Live Activities: para una Live Activity de vuelo, llamar
 * `startFlightLiveActivity({ flight_number, gate, departure_at, ... })`. El
 * plugin crea la activity y devuelve un activityToken. Luego para terminarla
 * `endFlightLiveActivity(activityToken)`.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";

export interface WidgetSnapshot {
  /** "Vuelo LATAM LA8081 · Salida en 3h 12m" */
  next_event_title?: string;
  /** ISO date para countdown timer del widget */
  next_event_at?: string;
  /** "Salta + 12 días" */
  countdown_days?: number;
  /** "Buenos Aires → Lima" */
  trip_route?: string;
  /** Hash invalidator — bumpear para forzar reload aunque el resto no cambie */
  rev?: number;
}

export interface FlightLiveActivityInput {
  flight_number: string;       // "LA 8081"
  origin: string;              // "EZE"
  destination: string;         // "LIM"
  gate?: string;
  seat?: string;
  departure_at: string;        // ISO
  status: "scheduled" | "boarding" | "delayed" | "departed" | "arrived" | "cancelled";
  delay_minutes?: number;
}

export interface FlightLiveActivityUpdate {
  status?: FlightLiveActivityInput["status"];
  gate?: string;
  delay_minutes?: number;
  departure_at?: string;
}

interface WidgetBridgePlugin {
  /** Empuja un snapshot al widget y reloads timelines. No-op en web. */
  pushWidgetSnapshot(opts: WidgetSnapshot): Promise<{ ok: boolean }>;
  /** Crea una Live Activity de vuelo. Devuelve el activityToken para luego cerrarla. */
  startFlightLiveActivity(opts: FlightLiveActivityInput): Promise<{ activityToken: string | null; ok: boolean }>;
  /** Update incremental de una Live Activity ya creada. */
  updateFlightLiveActivity(opts: { activityToken: string; update: FlightLiveActivityUpdate }): Promise<{ ok: boolean }>;
  /** Cierra la Live Activity y la quita del Dynamic Island. */
  endFlightLiveActivity(opts: { activityToken: string }): Promise<{ ok: boolean }>;
}

// Stub web implementation — para que la app no rompa en navegador.
const webStub: WidgetBridgePlugin = {
  async pushWidgetSnapshot(opts) {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("tampu-widget-snapshot", JSON.stringify(opts));
      } catch { /* ignore */ }
    }
    return { ok: false };
  },
  async startFlightLiveActivity() {
    return { activityToken: null, ok: false };
  },
  async updateFlightLiveActivity() {
    return { ok: false };
  },
  async endFlightLiveActivity() {
    return { ok: false };
  },
};

export const WidgetBridge = Capacitor.isNativePlatform()
  ? registerPlugin<WidgetBridgePlugin>("WidgetBridge", { web: webStub })
  : webStub;

/**
 * Helper: dado un CommandCenter snapshot, deriva el widget input y empuja.
 * Llamado desde Today (idempotente).
 */
export async function pushWidgetFromCommandCenter(cc: {
  trip: { destination: string; start_date: string; end_date: string };
  mode_info: { days_until_start: number; mode: string };
  today_card?: {
    city?: string | null;
    next_transport?: string | null;
    accommodation?: string | null;
  } | null;
}): Promise<void> {
  const nextTransport = cc.today_card?.next_transport ?? null;
  const accommodation = cc.today_card?.accommodation ?? null;
  const isBefore = cc.mode_info.mode === "planning" || cc.mode_info.mode === "pre_departure";

  const snapshot: WidgetSnapshot = {
    next_event_title: nextTransport || accommodation || cc.trip.destination,
    next_event_at: isBefore ? cc.trip.start_date : undefined,
    countdown_days: isBefore ? cc.mode_info.days_until_start : 0,
    trip_route: cc.today_card?.city || cc.trip.destination,
    rev: Date.now(),
  };

  try {
    await WidgetBridge.pushWidgetSnapshot(snapshot);
  } catch (err) {
    console.warn("[widget-bridge] push failed:", err);
  }
}
