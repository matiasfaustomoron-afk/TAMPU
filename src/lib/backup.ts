"use client";

// ─── JSON backup / restore ───
// Export everything Tampu stores on this device into a single JSON file,
// and import the same back into a fresh install. Solves "I lost my phone".
// All data is local — this is the closest thing to cloud sync without auth.

const DB_NAME = "travel-os-vault";
const STORE = "files";
const VERSION = 1;

interface BackupBlob {
  id: string;
  type: string;
  size: number;
  savedAt: number;
  data_base64: string;
}

export interface Backup {
  v: 1;
  exported_at: string;
  app: "travel-os";
  localStorage: Record<string, string>;
  blobs: BackupBlob[];
  ua: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function readAllBlobs(): Promise<BackupBlob[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await openDB();
    return await new Promise<BackupBlob[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = async () => {
        const items = (req.result || []) as Array<{ id: string; blob: Blob; type: string; size: number; savedAt: number }>;
        const out: BackupBlob[] = [];
        for (const it of items) {
          try {
            const data_base64 = await blobToBase64(it.blob);
            out.push({ id: it.id, type: it.type, size: it.size, savedAt: it.savedAt, data_base64 });
          } catch { /* skip */ }
        }
        db.close();
        resolve(out);
      };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch { return []; }
}

async function writeAllBlobs(blobs: BackupBlob[]): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const b of blobs) {
      const blob = base64ToBlob(b.data_base64, b.type);
      store.put({ id: b.id, blob, type: b.type, size: b.size, savedAt: b.savedAt });
    }
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function buildBackup(): Promise<Backup> {
  const ls: Record<string, string> = {};
  if (typeof localStorage !== "undefined") {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (!k.startsWith("travel-os-")) continue;       // only our keys
      const v = localStorage.getItem(k);
      if (v !== null) ls[k] = v;
    }
  }
  const blobs = await readAllBlobs();
  return {
    v: 1,
    exported_at: new Date().toISOString(),
    app: "travel-os",
    localStorage: ls,
    blobs,
    ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
  };
}

export async function downloadBackup(): Promise<{ count_keys: number; count_blobs: number; bytes: number }> {
  const backup = await buildBackup();
  const json = JSON.stringify(backup);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `travel-os-backup-${stamp}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return {
    count_keys: Object.keys(backup.localStorage).length,
    count_blobs: backup.blobs.length,
    bytes: json.length,
  };
}

export async function importBackup(file: File): Promise<{ ok: boolean; count_keys: number; count_blobs: number; error?: string }> {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as Backup;
    // Aceptamos tanto el identificador legacy "travel-os" como el nuevo "tampu"
    // para back-compat con backups exportados antes del rebrand de mayo 2026.
    const appOk = parsed.app === "travel-os" || (parsed.app as string) === "tampu";
    if (!appOk || parsed.v !== 1) {
      return { ok: false, count_keys: 0, count_blobs: 0, error: "Este archivo no es un backup válido de Tampu (v1)" };
    }
    // Write localStorage keys (only travel-os- prefixed)
    let kCount = 0;
    if (typeof localStorage !== "undefined") {
      for (const [k, v] of Object.entries(parsed.localStorage)) {
        if (!k.startsWith("travel-os-")) continue;
        localStorage.setItem(k, v);
        kCount++;
      }
    }
    // Write blobs
    await writeAllBlobs(parsed.blobs);
    // Notify the app to refresh caches
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("travel-os-vault-change"));
      window.dispatchEvent(new Event("travel-os-anthropic-key-change"));
      window.dispatchEvent(new Event("travel-os-pinned-change"));
    }
    return { ok: true, count_keys: kCount, count_blobs: parsed.blobs.length };
  } catch (e) {
    return { ok: false, count_keys: 0, count_blobs: 0, error: (e as Error).message };
  }
}
