"use client";

// ─── Vault blob storage ───
//
// Dos backends, seleccionados automáticamente:
//   - Native (iOS/Android Capacitor) → SQLite (`sqlite-backend.ts`)
//     · sobrevive eviction LRU de WebKit
//     · sin bugs documentados de corrupción
//     · usado para el vault crítico (boarding passes, pasaportes, seguros)
//   - Web (PWA, navegador) → IndexedDB (legacy, en este archivo)
//
// La migración IndexedDB → SQLite corre on-demand en el primer cold-start native.
// Ver `sqlite-backend.ts → migrateIndexedDbToSqlite`.

import { Capacitor } from "@capacitor/core";
import {
  sqliteSaveBlob,
  sqliteGetBlob,
  sqliteDeleteBlob,
  sqliteEstimateUsage,
} from "./sqlite-backend";

function useSqlite(): boolean {
  return Capacitor.isNativePlatform();
}

const DB_NAME = "travel-os-vault";
const STORE = "files";
const VERSION = 1;

// ─── IndexedDB connection pool ───
//
// Antes: openDB() + db.close() en CADA operación. Abrir IDB es expensive
// (handshake, version check, schema validation). Cerrar serializa ops y
// fuerza al next call a re-abrir.
//
// Ahora: singleton promise — la conexión se abre una vez y se reutiliza.
// La conexión queda viva para toda la sesión del tab.
//
// Edge cases manejados:
//   - onblocked: otro tab tiene una conexión más vieja con versión menor.
//     Resolvemos con `null` y dejamos que el caller reintente; el caller
//     no debería ver una conexión muerta.
//   - onversionchange: otro tab abre el DB con versión mayor. Cerramos
//     nuestra conexión para que ese tab pueda upgradear (de lo contrario
//     bloquearíamos su onblocked).
//   - onclose: el navegador puede cerrar el DB inesperadamente (eviction,
//     hibernate). Limpiamos el cache para que el próximo getDB() reabra.
let dbPromise: Promise<IDBDatabase> | null = null;

function openDBOnce(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onblocked = () => {
      // Otro tab tiene una conexión vieja abierta. No podemos upgradear.
      // Rechazamos para que el caller pueda mostrar UI ("cerrá las otras
      // pestañas para actualizar"). Reset el cache.
      dbPromise = null;
      reject(new Error("IndexedDB upgrade blocked by another tab"));
    };
    req.onsuccess = () => {
      const db = req.result;
      // Si otro tab quiere upgradear, soltamos nuestra conexión.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      // Browser cerró la conexión (eviction, tab inactive too long).
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
}

function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDBOnce().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export async function saveVaultBlob(id: string, blob: Blob): Promise<void> {
  if (useSqlite()) return sqliteSaveBlob(id, blob);
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB not available");
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id, blob, type: blob.type, size: blob.size, savedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getVaultBlob(id: string): Promise<Blob | null> {
  if (useSqlite()) return sqliteGetBlob(id);
  if (typeof indexedDB === "undefined") return null;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result?.blob ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteVaultBlob(id: string): Promise<void> {
  if (useSqlite()) return sqliteDeleteBlob(id);
  if (typeof indexedDB === "undefined") return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Open a blob in a new tab. The Object URL is revoked after the new tab loads it. */
export async function openVaultBlob(id: string, fileName: string): Promise<void> {
  const blob = await getVaultBlob(id);
  if (!blob) { alert("Archivo no encontrado en el dispositivo."); return; }
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  // Some browsers ignore noreferrer + revoke instantly. Delay revoke to 10s.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  if (!win) {
    // Popup blocked — fall back to download
    const a = document.createElement("a");
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
}

/** Trigger a browser download of the blob. */
export async function downloadVaultBlob(id: string, fileName: string): Promise<void> {
  const blob = await getVaultBlob(id);
  if (!blob) { alert("Archivo no encontrado."); return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Cheap: read file as data URL (for image previews in <img src>). */
export async function getVaultDataUrl(id: string): Promise<string | null> {
  const blob = await getVaultBlob(id);
  if (!blob) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/** Approx storage used by vault (sum of file sizes). */
export async function estimateVaultUsage(): Promise<{ count: number; bytes: number }> {
  if (useSqlite()) return sqliteEstimateUsage();
  if (typeof indexedDB === "undefined") return { count: 0, bytes: 0 };
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const items = (req.result || []) as { size?: number }[];
      const bytes = items.reduce((s, i) => s + (i.size || 0), 0);
      resolve({ count: items.length, bytes });
    };
    req.onerror = () => reject(req.error);
  });
}
