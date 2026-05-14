"use client";

/**
 * Papúa + Seúl 2026 — DEMO TRIP (opt-in)
 *
 * Bucket aislado para el viaje de ejemplo del founder. La regla es simple:
 * este archivo es el ÚNICO lugar donde aparece el destino específico
 * "Papúa + Seúl". Si mañana queremos retirar la demo, se borra este archivo
 * y se quita la importación de welcome — nada más toca founder-data.
 *
 * Mental model:
 *   - Welcome NO muestra este viaje por default. Empty + acogedor.
 *   - El user puede pulsar "Ver demo (viaje de ejemplo)" para cargarlo.
 *   - Mientras está en demo: badge global + CTA "Salir del demo".
 *   - El seed real (src/lib/demo/seed-data.ts) se mantiene como fuente de
 *     datos crudos del viaje, marcado como legacy hasta migrar fuera.
 *
 * Decisión de almacenamiento: en este stack los datos del demo viven en
 * localStorage vía `seedExampleTrip`. Es la misma mecánica que ya usaba
 * la app — no introducimos otra dimensión. La diferencia: ahora marcamos
 * `tampu_demo_mode=true` para que el resto de la UI sepa que está en demo
 * y muestre el banner de salida.
 */

import { seedExampleTrip, resetStore, getActiveTrip } from "@/lib/demo/demo-store";

export const DEMO_MODE_KEY = "tampu_demo_mode";

/** ¿Estamos viendo el viaje demo? Safe en SSR (devuelve false). */
export function isDemoActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(DEMO_MODE_KEY) === "true";
  } catch {
    return false;
  }
}

/** ¿Hay un viaje del usuario cargado que NO sea demo? */
export function hasUserTrip(): boolean {
  if (typeof window === "undefined") return false;
  if (isDemoActive()) return false;
  return getActiveTrip() !== null;
}

/**
 * Carga el viaje Papúa + Seúl en el store demo y activa el banner.
 *
 * Importante: pisa el store actual. El caller debe verificar con
 * `hasUserTrip()` antes y pedir confirmación si corresponde.
 */
export function loadDemoTrip(): void {
  if (typeof window === "undefined") return;
  seedExampleTrip();
  try {
    localStorage.setItem(DEMO_MODE_KEY, "true");
  } catch {
    /* private mode / quota — el viaje queda cargado igual, solo sin badge */
  }
  // Notificá a listeners para que la UI refresque vault-change + demo flag.
  window.dispatchEvent(new Event("tampu-demo-mode-change"));
}

/**
 * Sale del demo: limpia store + flag. El user vuelve a /welcome a crear
 * el suyo. No se "preserva" nada — el demo es temporal por diseño.
 */
export function exitDemoTrip(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(DEMO_MODE_KEY);
  } catch { /* ignore */ }
  resetStore();
  window.dispatchEvent(new Event("tampu-demo-mode-change"));
  window.dispatchEvent(new Event("travel-os-vault-change"));
}
