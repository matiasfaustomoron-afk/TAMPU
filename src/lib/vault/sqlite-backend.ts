"use client";

/**
 * SQLite backend del vault — para iOS/Android nativo (Capacitor).
 *
 * Por qué SQLite y no IndexedDB en native:
 *  - WebKit IndexedDB tiene historial documentado de bugs de corrupción en
 *    migraciones iOS (bug 178204) y eviction LRU bajo storage pressure.
 *  - Para una app travel-companion que vive de offline (boarding passes en
 *    Tashkent sin red), la confiabilidad del storage es el moat de confianza.
 *  - @capacitor-community/sqlite guarda en el sandbox FILE de la app, no en
 *    WebKit storage — sobrevive a la eviction LRU del browser.
 *
 * Modelo:
 *  - En native (iOS/Android) usamos SQLite via plugin Capacitor.
 *  - En web (PWA, dev en navegador) caemos a IndexedDB (storage.ts existente).
 *
 * Patrón de import:
 *  - Usamos `import()` dinámico, NUNCA estático. El paquete `@capacitor-community/sqlite`
 *    tiene código nativo y romper el build web es real (lo aprendimos rompiendo
 *    /welcome en mayo 2026). El dynamic import asegura que el bundler web
 *    nunca toca el módulo si la rama native nunca ejecuta.
 */

import { Capacitor } from "@capacitor/core";

const DB_NAME = "tampu_vault";
const TABLE = "vault_files";

// Tipo minimal del plugin (lo importamos dinámicamente, no podemos extraer tipos).
type SQLiteDb = {
  open(): Promise<void>;
  execute(stmt: string): Promise<unknown>;
  run(stmt: string, values: unknown[]): Promise<unknown>;
  query(stmt: string, values?: unknown[]): Promise<{ values?: unknown[] }>;
};
type SQLiteConn = {
  isConnection(name: string, readOnly: boolean): Promise<{ result: boolean }>;
  createConnection(name: string, encrypted: boolean, mode: string, version: number, readOnly: boolean): Promise<SQLiteDb>;
  retrieveConnection(name: string, readOnly: boolean): Promise<SQLiteDb>;
};

let dbHandle: SQLiteDb | null = null;
let opened = false;

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

async function getDb(): Promise<SQLiteDb> {
  if (dbHandle && opened) return dbHandle;

  // Dynamic import — el bundler web NUNCA empaqueta este módulo porque
  // la rama solo se ejecuta cuando isNative() es true.
  const mod = await import("@capacitor-community/sqlite");
  const connection: SQLiteConn = new (mod.SQLiteConnection as new (cs: unknown) => SQLiteConn)(mod.CapacitorSQLite);

  const exists = await connection.isConnection(DB_NAME, false);
  if (exists.result) {
    dbHandle = await connection.retrieveConnection(DB_NAME, false);
  } else {
    dbHandle = await connection.createConnection(DB_NAME, false, "no-encryption", 1, false);
  }

  await dbHandle.open();
  opened = true;

  await dbHandle.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id TEXT PRIMARY KEY,
      mime TEXT,
      size INTEGER,
      saved_at INTEGER,
      data BLOB
    );
  `);

  return dbHandle;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const idx = dataUrl.indexOf(",");
      resolve(idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function sqliteSaveBlob(id: string, blob: Blob): Promise<void> {
  if (!isNative()) throw new Error("sqlite backend only available on native");
  const db = await getDb();
  const data = await blobToBase64(blob);
  await db.run(
    `INSERT OR REPLACE INTO ${TABLE} (id, mime, size, saved_at, data) VALUES (?, ?, ?, ?, ?)`,
    [id, blob.type, blob.size, Date.now(), data],
  );
}

export async function sqliteGetBlob(id: string): Promise<Blob | null> {
  if (!isNative()) return null;
  const db = await getDb();
  const r = await db.query(`SELECT mime, data FROM ${TABLE} WHERE id = ?`, [id]);
  const row = r.values?.[0] as { mime?: string; data?: string } | undefined;
  if (!row?.data) return null;
  return base64ToBlob(row.data, row.mime || "application/octet-stream");
}

export async function sqliteDeleteBlob(id: string): Promise<void> {
  if (!isNative()) return;
  const db = await getDb();
  await db.run(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
}

export async function sqliteEstimateUsage(): Promise<{ count: number; bytes: number }> {
  if (!isNative()) return { count: 0, bytes: 0 };
  const db = await getDb();
  const r = await db.query(`SELECT COUNT(*) as c, COALESCE(SUM(size), 0) as bytes FROM ${TABLE}`);
  const row = r.values?.[0] as { c?: number; bytes?: number } | undefined;
  return { count: row?.c || 0, bytes: row?.bytes || 0 };
}

export async function migrateIndexedDbToSqlite(): Promise<{ migrated: number; skipped: number }> {
  if (!isNative()) return { migrated: 0, skipped: 0 };

  let allFromIdb: Array<{ id: string; blob: Blob }> = [];
  try {
    const idb = await openLegacyIdb();
    allFromIdb = await readAllLegacyIdb(idb);
    idb.close();
  } catch (err) {
    console.warn("[vault-migrate] no legacy IDB:", err);
    return { migrated: 0, skipped: 0 };
  }

  if (allFromIdb.length === 0) return { migrated: 0, skipped: 0 };

  let migrated = 0;
  let skipped = 0;
  for (const item of allFromIdb) {
    const existing = await sqliteGetBlob(item.id);
    if (existing) {
      skipped++;
      continue;
    }
    try {
      await sqliteSaveBlob(item.id, item.blob);
      migrated++;
    } catch (err) {
      console.error("[vault-migrate] failed", item.id, err);
    }
  }
  return { migrated, skipped };
}

function openLegacyIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("travel-os-vault", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readAllLegacyIdb(db: IDBDatabase): Promise<Array<{ id: string; blob: Blob }>> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readonly");
    const req = tx.objectStore("files").getAll();
    req.onsuccess = () => {
      const items = (req.result || []) as Array<{ id: string; blob: Blob }>;
      resolve(items.filter((i) => i.id && i.blob));
    };
    req.onerror = () => reject(req.error);
  });
}
