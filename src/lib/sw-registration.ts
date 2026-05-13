"use client";

/**
 * Tampu — Service Worker registration helper.
 *
 * Responsabilidades:
 *   1. Registrar /sw.js con scope "/" (idempotente).
 *   2. Detectar updates (un SW nuevo en estado `waiting`) y emitir un evento
 *      `tampu-sw-update-ready` para que la UI muestre un toast "Actualizar".
 *   3. Exponer `applyServiceWorkerUpdate()` para que ese toast haga
 *      skipWaiting + reload sin loops.
 *   4. Bypass total en development (evita el infierno del cache durante HMR).
 *
 * Diseño:
 *   - El SW es enhancement, no requirement. Cualquier error es silencioso —
 *     la app sigue funcionando, sólo pierde offline-first.
 *   - El check de updates corre on-load + cada 60 min (los viajeros pueden
 *     tener la PWA abierta días).
 *   - El reload post-skipWaiting se hace UNA sola vez por sesión (flag en
 *     window) para evitar reload loop si dos SWs se pelean.
 *
 * Capacitor iOS:
 *   - El SW funciona dentro del WKWebView pero la persistencia de Cache
 *     Storage es por bundle. Skip registration cuando estamos en Capacitor
 *     native: el bundle YA viene con todos los assets (output:'export'),
 *     un SW agregaría complejidad sin valor.
 */

const SW_PATH = "/sw.js";
const SW_SCOPE = "/";
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1h

const RELOAD_FLAG = "__tampu_sw_reloading__";

interface SWUpdateDetail {
  registration: ServiceWorkerRegistration;
}

export type SWUpdateEvent = CustomEvent<SWUpdateDetail>;

/**
 * Registra el SW. Idempotente — llamalo donde quieras, sólo registra una vez
 * por carga de página. Devuelve la registration o null si falló / no aplica.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;
  if (process.env.NODE_ENV === "development") return null;

  // Capacitor native: skip — el bundle es local, no necesitamos SW.
  // Detección defensiva (sin import de @capacitor/core): si window.Capacitor
  // existe y reporta native, abortamos.
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.()) return null;

  try {
    const registration = await navigator.serviceWorker.register(SW_PATH, {
      scope: SW_SCOPE,
      // updateViaCache: 'none' fuerza al browser a NO cachear /sw.js mismo,
      // así nuevos deploys son detectados en cada navigation.
      updateViaCache: "none",
    });

    // Reload una sola vez cuando un SW nuevo toma control (post skipWaiting).
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      // Guard contra reload loops — si ya pasamos por acá esta sesión, no.
      if ((window as unknown as Record<string, unknown>)[RELOAD_FLAG]) return;
      (window as unknown as Record<string, unknown>)[RELOAD_FLAG] = true;
      refreshing = true;
      window.location.reload();
    });

    // Si ya hay un SW waiting al momento del registro, notificar de inmediato.
    if (registration.waiting && navigator.serviceWorker.controller) {
      dispatchUpdateReady(registration);
    }

    // Escuchar instalaciones nuevas: cuando `updatefound` dispara, miramos al
    // newWorker — cuando llega a `installed` Y hay un controller activo,
    // significa que es un UPDATE (no la primera instalación).
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          dispatchUpdateReady(registration);
        }
      });
    });

    // Mensajes del SW (postMessage en activate, etc).
    navigator.serviceWorker.addEventListener("message", (event) => {
      const data = event.data as { type?: string; version?: string } | undefined;
      if (data?.type === "tampu-sw-activated") {
        // Telemetría liviana opcional — solo logueamos en debug.
        if (typeof console !== "undefined") {
          console.debug("[Tampu SW] activated", data.version);
        }
      }
    });

    // Polling de updates para PWAs que viven mucho tiempo abiertas.
    setInterval(() => {
      registration.update().catch(() => { /* silent */ });
    }, UPDATE_CHECK_INTERVAL_MS);

    return registration;
  } catch {
    // SW es enhancement — fail silently.
    return null;
  }
}

/**
 * Aplica el update pending: le dice al SW waiting que tome control vía
 * skipWaiting. El listener `controllerchange` se encarga del reload.
 */
export function applyServiceWorkerUpdate(registration: ServiceWorkerRegistration): void {
  const waiting = registration.waiting;
  if (!waiting) return;
  waiting.postMessage({ type: "SKIP_WAITING" });
}

function dispatchUpdateReady(registration: ServiceWorkerRegistration): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SWUpdateDetail>("tampu-sw-update-ready", {
      detail: { registration },
    })
  );
}
