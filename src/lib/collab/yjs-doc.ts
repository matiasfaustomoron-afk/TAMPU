// ─── Yjs CRDT doc per trip ───
//
// Cada trip puede tener un Y.Doc colaborativo donde se mantienen estructuras
// compartidas (notas libres, lista de ideas, drafts de itinerario en edición,
// activity feed, presence map). Las CRDT garantizan que múltiples editores
// concurrentes (web + iOS native) convergen sin conflicto sin necesidad de
// lock o "última escritura gana".
//
// Estado actual:
//   - El Y.Doc vive en memoria + se persiste a **IndexedDB** vía y-indexeddb
//     (anteriormente localStorage base64 — migrado en mayo 2026 para soportar
//     docs > 5MB y reads non-blocking).
//   - Sync: opcional WebsocketProvider apuntando a `NEXT_PUBLIC_YJS_WS_URL`.
//     Si la env no está seteada, el Y.Doc igual funciona — solo es local.
//     y-websocket está en deps pero NO conectamos por default hasta que haya
//     backend WS productivo.
//   - Migración futura: y-websocket server + persistence a Supabase
//     (tabla `yjs_updates` con (trip_id, clock, update bytes)).
//
// Por qué Yjs + y-indexeddb (justificación de las deps):
//   - Yjs es el estándar de facto para CRDTs en JS (Linear, Notion, Figma
//     offline mode). Bundle ~12KB gzip.
//   - y-indexeddb es el persister oficial — ~3KB gzip. Hace local-first
//     real: cargás la app offline, ves tu trip, hacés cambios, y cuando volvés
//     online el sync se mergea automágicamente. Sin esto, perdés todo al
//     cerrar pestaña en demo mode.
//   - Funciona offline-first.
//   - automerge sería más pesado y con peor adopción en JS.

import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";

interface DocEntry {
  doc: Y.Doc;
  provider: WebsocketProvider | null;
  persistence: IndexeddbPersistence | null;
}

const docCache = new Map<string, DocEntry>();

/**
 * Devuelve (creando si no existe) el Y.Doc del trip. Persiste a IndexedDB
 * y, si hay env var, conecta el WebsocketProvider.
 *
 * IMPORTANTE: NO llamar desde código server-side; este módulo asume `window`
 * (la importación es lazy-safe vía el "use client" del hook).
 *
 * Devuelve un wrapper con doc + provider + persistence. Para uso simple,
 * `getCollabDocRaw(tripId)` devuelve solo el Y.Doc.
 */
export function getCollabDoc(tripId: string): DocEntry {
  const cached = docCache.get(tripId);
  if (cached) return cached;

  const doc = new Y.Doc({ guid: `tampu-${tripId}` });

  // IndexedDB persistence — local-first. y-indexeddb se encarga de hidratar
  // el doc al iniciar y guardar cada update incrementalmente.
  let persistence: IndexeddbPersistence | null = null;
  if (typeof window !== "undefined" && typeof indexedDB !== "undefined") {
    try {
      persistence = new IndexeddbPersistence(`tampu-collab-${tripId}`, doc);
    } catch (err) {
      console.warn("[yjs] indexeddb persistence init failed", err);
    }
  }

  // Connect to WS provider only if configured
  let provider: WebsocketProvider | null = null;
  const wsUrl = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_YJS_WS_URL : undefined;
  if (wsUrl && typeof window !== "undefined") {
    try {
      provider = new WebsocketProvider(wsUrl, `trip-${tripId}`, doc, {
        // Connect lazily so el bundle no abre sockets en pantallas que no
        // muestran nada colaborativo. La presencia hook lo conecta on-demand.
        connect: false,
      });
    } catch (err) {
      console.warn("[yjs] websocket provider init failed", err);
    }
  }

  const entry: DocEntry = { doc, provider, persistence };
  docCache.set(tripId, entry);
  return entry;
}

/**
 * Helper conveniente que devuelve solo el Y.Doc del trip — útil para mutaciones
 * one-shot donde no necesitás el provider/persistence (ej. recordActivity).
 */
export function getCollabDocRaw(tripId: string): Y.Doc {
  return getCollabDoc(tripId).doc;
}

/**
 * Destruye el doc + provider + persistence del cache. Llamar al cerrar la
 * sesión del trip activamente (logout, switch a otro trip).
 *
 * NO borra los datos persistidos en IndexedDB; el próximo getCollabDoc()
 * los rehidrata. Para wipe total usar `wipeCollabDoc(tripId)`.
 */
export function disposeCollabDoc(tripId: string): void {
  const entry = docCache.get(tripId);
  if (!entry) return;
  try { entry.provider?.destroy(); } catch { /* idempotent */ }
  try { entry.persistence?.destroy(); } catch { /* idempotent */ }
  try { entry.doc.destroy(); } catch { /* idempotent */ }
  docCache.delete(tripId);
}

/**
 * Borra TODO el estado persistido del trip (IndexedDB + cache).
 * Usar en debug / "Limpiar datos del viaje" del settings, no en flow normal.
 */
export async function wipeCollabDoc(tripId: string): Promise<void> {
  const entry = docCache.get(tripId);
  if (entry?.persistence) {
    try { await entry.persistence.clearData(); } catch { /* ignore */ }
  }
  disposeCollabDoc(tripId);
}

// ─── Helpers de alto nivel para estructuras shareadas ───────────────────────

/**
 * Y.Map<unknown> root del trip — para metadata compartida (subtítulo, draft
 * notes, configuración colaborativa). Distintos miembros pueden editar campos
 * concurrentemente sin pisarse.
 */
export function getTripMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap("trip");
}

/** Alias retro-compat: el viejo "metadata" era el mismo concepto que getTripMap. */
export function getMetadataMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap("metadata");
}

/** Y.Array<string> con notas libres del viaje, append-only por timeline. */
export function getNotesArray(doc: Y.Doc): Y.Array<string> {
  return doc.getArray<string>("notes");
}

// `getActivityFeed` y los tipos viven en activity-feed.ts (evita import cycle).
// `getPresenceMap` similar en presence.ts.
