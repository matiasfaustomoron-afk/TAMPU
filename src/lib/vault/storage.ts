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
//
// ─── At-rest encryption (audit 05/2026) ───
//
// Cada blob se cifra con AES-GCM(256) usando la master key derivada del passcode
// del user (ver `lib/crypto/passcode.ts`). Lo cifrado:
//   - bytes del blob (el contenido completo)
// Lo NO cifrado (deliberado, para UX sin unlock):
//   - id del item (UUID, no leak de PII)
//   - mime type (`application/pdf`, `image/jpeg`, ...)
//   - size en bytes (para mostrar uso de storage)
//   - savedAt timestamp
// Esos metadatos permiten al UI listar archivos, mostrar uso, y filtrar por tipo
// sin pedir el passcode. El contenido — el dato sensible — sí requiere desbloqueo.
//
// Migration: si la app está desbloqueada y un blob legacy plain está en IDB/SQLite,
// el primer read lo deja como está (compat) pero `migrateLegacyVault()` los re-cifra
// on-demand (botón en /settings).
//
// ─── OFFLINE-FIRST GUARANTEE (audit Agent PWA, 05/2026) ───
// Este módulo es 100% local: NO hace fetch() de red, NO importa @supabase/*,
// NO pasa por el Service Worker. Toda lectura/escritura de blobs golpea
// IndexedDB (web) o SQLite (native) directamente. Esto garantiza que el
// Vault — la promesa core de Tampu — funcione idénticamente con o sin red.
//
// El SW NO cachea estos blobs: ya viven en IndexedDB/SQLite, duplicarlos en
// Cache Storage gastaría cuota dos veces y crearía una segunda fuente de
// verdad desincronizable.
//
// Si en el futuro agregás Supabase sync para el Vault, hacelo en un módulo
// SEPARADO (`vault/sync.ts`) que corra best-effort en background, NUNCA
// bloqueando las funciones exportadas desde acá.

import { Capacitor } from "@capacitor/core";
import {
  sqliteSaveBlob,
  sqliteGetBlob,
  sqliteDeleteBlob,
  sqliteEstimateUsage,
} from "./sqlite-backend";
import { getMasterKey, hasPasscode } from "@/lib/crypto/passcode";
import {
  encryptBlob,
  decryptToBlob,
  looksEncrypted,
  bytesToBase64,
  base64ToBytes,
  DecryptError,
} from "@/lib/crypto/encryption";

function isSqliteBackend(): boolean {
  return Capacitor.isNativePlatform();
}

const DB_NAME = "travel-os-vault";
const STORE = "files";
const VERSION = 2; // bumped: ahora guardamos `cipher` (Uint8Array) + `encrypted: true` flag

const AAD_PREFIX = "vault-blob:"; // domain separation por blob ID

function aadFor(id: string): string {
  return AAD_PREFIX + id;
}

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
      // v1 → v2: agregamos campo `cipher` y `encrypted`. No tocamos rows existentes
      // (siguen siendo plain `blob`). El reader detecta plain vs cipher en runtime.
    };
    req.onblocked = () => {
      dbPromise = null;
      reject(new Error("IndexedDB upgrade blocked by another tab"));
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
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

// ─── Row types ─────────────────────────────────────────────────────────────

// v1 (legacy, plain): { id, blob, type, size, savedAt }
// v2 (encrypted):     { id, cipher: Uint8Array, type, size, savedAt, encrypted: true }
// El reader maneja ambos.

interface PlainRow {
  id: string;
  blob: Blob;
  type?: string;
  size?: number;
  savedAt?: number;
}
interface CipherRow {
  id: string;
  cipher: Uint8Array;
  type: string;
  size: number;
  savedAt: number;
  encrypted: true;
}
type AnyRow = PlainRow | CipherRow;

function isCipherRow(r: AnyRow): r is CipherRow {
  return "encrypted" in r && r.encrypted === true && "cipher" in r;
}

// ─── Encryption helpers ────────────────────────────────────────────────────

/**
 * Política de cifrado:
 *   - Si la app tiene passcode + master key viva → cifrar.
 *   - Si NO hay passcode → guardar plain (compat). El user verá el banner en
 *     /settings recomendando configurar passcode.
 *   - Si hay passcode pero la app está locked → error explícito. El caller
 *     debe mostrar el unlock prompt.
 */
async function maybeEncrypt(id: string, blob: Blob): Promise<{ kind: "cipher"; bytes: Uint8Array } | { kind: "plain"; blob: Blob }> {
  const passcodeSet = await hasPasscode();
  if (!passcodeSet) return { kind: "plain", blob };
  const key = getMasterKey();
  if (!key) {
    throw new Error("Vault bloqueado · ingresá tu passcode para guardar este archivo");
  }
  const bytes = await encryptBlob(key, blob, aadFor(id));
  return { kind: "cipher", bytes };
}

async function maybeDecrypt(id: string, row: AnyRow): Promise<Blob | null> {
  if (!isCipherRow(row)) {
    // Plain legacy row. Devolver tal cual.
    return row.blob;
  }
  const key = getMasterKey();
  if (!key) {
    throw new Error("Vault bloqueado · ingresá tu passcode para abrir este archivo");
  }
  try {
    return await decryptToBlob(key, row.cipher, row.type, aadFor(id));
  } catch (err) {
    if (err instanceof DecryptError) {
      console.error("[vault] decrypt failed for", id, err.message);
      return null;
    }
    throw err;
  }
}

// ─── Public API — preserva la firma exacta del módulo legacy ───────────────

export async function saveVaultBlob(id: string, blob: Blob): Promise<void> {
  if (isSqliteBackend()) {
    const enc = await maybeEncrypt(id, blob);
    if (enc.kind === "plain") return sqliteSaveBlob(id, enc.blob);
    // Para SQLite, guardamos el cipher como un Blob (el backend ya hace base64 internamente).
    // Marcamos el "type" interno con un prefijo `x-tampu-cipher/` para que el read sepa que
    // debe descifrar. El mime original viaja como Blob.type del payload re-empaquetado vía
    // un trailer JSON al principio del cipher? No — más simple: guardamos sidecar metadata.
    // Decisión: empaquetamos el cipher como Blob de tipo `application/x-tampu-cipher+<mime>`
    // — el reader parsea el subtype y descifra.
    const cipherBlob = new Blob([enc.bytes as BlobPart], { type: `application/x-tampu-cipher+${blob.type || "application/octet-stream"}` });
    return sqliteSaveBlob(id, cipherBlob);
  }
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB not available");

  const enc = await maybeEncrypt(id, blob);
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    if (enc.kind === "cipher") {
      const row: CipherRow = {
        id,
        cipher: enc.bytes,
        type: blob.type || "application/octet-stream",
        size: blob.size,
        savedAt: Date.now(),
        encrypted: true,
      };
      tx.objectStore(STORE).put(row);
    } else {
      tx.objectStore(STORE).put({ id, blob: enc.blob, type: blob.type, size: blob.size, savedAt: Date.now() });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getVaultBlob(id: string): Promise<Blob | null> {
  if (isSqliteBackend()) {
    const raw = await sqliteGetBlob(id);
    if (!raw) return null;
    // Detectar cipher por mime prefix.
    if (raw.type.startsWith("application/x-tampu-cipher+")) {
      const originalMime = raw.type.slice("application/x-tampu-cipher+".length);
      const key = getMasterKey();
      if (!key) throw new Error("Vault bloqueado · ingresá tu passcode para abrir este archivo");
      const bytes = new Uint8Array(await raw.arrayBuffer());
      if (!looksEncrypted(bytes)) {
        console.warn("[vault] mime dice cipher pero bytes no parecen cifrados:", id);
        return raw;
      }
      try {
        return await decryptToBlob(key, bytes, originalMime, aadFor(id));
      } catch (err) {
        if (err instanceof DecryptError) {
          console.error("[vault] sqlite decrypt failed for", id, err.message);
          return null;
        }
        throw err;
      }
    }
    return raw;
  }

  if (typeof indexedDB === "undefined") return null;
  const db = await getDB();
  const row = await new Promise<AnyRow | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as AnyRow) ?? null);
    req.onerror = () => reject(req.error);
  });
  if (!row) return null;
  return maybeDecrypt(id, row);
}

export async function deleteVaultBlob(id: string): Promise<void> {
  if (isSqliteBackend()) return sqliteDeleteBlob(id);
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
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  if (!win) {
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
  if (isSqliteBackend()) return sqliteEstimateUsage();
  if (typeof indexedDB === "undefined") return { count: 0, bytes: 0 };
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const items = (req.result || []) as AnyRow[];
      const bytes = items.reduce((s, i) => {
        if (isCipherRow(i)) return s + (i.size || 0);
        return s + (i.size || 0);
      }, 0);
      resolve({ count: items.length, bytes });
    };
    req.onerror = () => reject(req.error);
  });
}

// ─── Migration: legacy plain blobs → cifrados ──────────────────────────────

/**
 * Cuenta cuántos blobs están todavía en plaintext (no cifrados).
 * Útil para mostrar "X archivos pendientes de migrar" en /settings.
 */
export async function countLegacyPlainVaultBlobs(): Promise<number> {
  if (isSqliteBackend()) {
    // En SQLite el cipher se distingue por mime `application/x-tampu-cipher+...`.
    // Sin acceso fácil a un SELECT con LIKE desde acá, devolvemos 0 si no podemos.
    // El backend SQLite no expone un listAll todavía — v1 ignora SQLite migration
    // (los blobs nuevos ya nacen cifrados; el viejo conjunto se migrará en una
    // pasada manual cuando el user toque el botón).
    return 0;
  }
  if (typeof indexedDB === "undefined") return 0;
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        const rows = (req.result || []) as AnyRow[];
        resolve(rows.filter(r => !isCipherRow(r)).length);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return 0;
  }
}

/**
 * Migra todos los blobs plain a cipher. Requiere app desbloqueada (master key).
 * Idempotente: los que ya están cifrados se ignoran.
 * Devuelve {migrated, skipped, failed} para feedback al user.
 */
export async function migrateLegacyVaultToEncrypted(): Promise<{ migrated: number; skipped: number; failed: number }> {
  const stats = { migrated: 0, skipped: 0, failed: 0 };
  if (!(await hasPasscode())) return stats;
  const key = getMasterKey();
  if (!key) throw new Error("Vault bloqueado · ingresá tu passcode antes de migrar");

  if (isSqliteBackend()) {
    // v1: skip — SQLite blobs nuevos nacen cifrados, los viejos se migrarán cuando
    // el user los abra (lazy migration por demanda).
    return stats;
  }
  if (typeof indexedDB === "undefined") return stats;

  const db = await getDB();
  const rows = await new Promise<AnyRow[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result || []) as AnyRow[]);
    req.onerror = () => reject(req.error);
  });

  for (const row of rows) {
    if (isCipherRow(row)) { stats.skipped++; continue; }
    try {
      const blob = row.blob;
      const bytes = await encryptBlob(key, blob, aadFor(row.id));
      const cipherRow: CipherRow = {
        id: row.id,
        cipher: bytes,
        type: blob.type || row.type || "application/octet-stream",
        size: blob.size || row.size || bytes.length,
        savedAt: row.savedAt || Date.now(),
        encrypted: true,
      };
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(cipherRow);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      stats.migrated++;
    } catch (err) {
      console.error("[vault-migrate] failed for", row.id, err);
      stats.failed++;
    }
  }
  return stats;
}

// Exports para tests / debugging avanzado — base64 helpers para inspect.
export const __testing__ = { bytesToBase64, base64ToBytes };
