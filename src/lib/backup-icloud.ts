"use client";

import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { buildBackup, type Backup } from "./backup";

/**
 * Tampu — iCloud Drive backup automático (iOS).
 *
 * En iOS, Capacitor `Filesystem.writeFile` con `Directory.Documents` y la app
 * configurada con `NSUbiquitousContainers` + `LSSupportsOpeningDocumentsInPlace`
 * sincroniza ese directorio con iCloud Drive. El usuario ve los backups en la app
 * Files de iOS bajo "iCloud Drive → Tampu".
 *
 * En Android, `Directory.Documents` mapea a `/storage/emulated/0/Documents` —
 * NO sincroniza con la nube por sí solo. Para Android necesitaríamos integrar
 * Google Drive API o que el usuario use el backup automático de Android.
 *
 * En web, Capacitor Filesystem cae a IndexedDB silenciosamente — el backup queda
 * en el navegador local. No es iCloud pero el usuario ve un fallback que NO falla.
 *
 * SETUP iOS (post `npx cap add ios`):
 *
 * 1. `ios/App/App/Info.plist`:
 *    <key>NSUbiquitousContainers</key>
 *    <dict>
 *      <key>iCloud.com.tampu.app</key>
 *      <dict>
 *        <key>NSUbiquitousContainerIsDocumentScopePublic</key>
 *        <true/>
 *        <key>NSUbiquitousContainerName</key>
 *        <string>Tampu</string>
 *        <key>NSUbiquitousContainerSupportedFolderLevels</key>
 *        <string>Any</string>
 *      </dict>
 *    </dict>
 *    <key>LSSupportsOpeningDocumentsInPlace</key>
 *    <true/>
 *    <key>UIFileSharingEnabled</key>
 *    <true/>
 *
 * 2. Xcode: Target → Signing & Capabilities → "+ Capability" → iCloud.
 *    Marcar "iCloud Documents". Container = `iCloud.com.tampu.app`.
 *
 * 3. App ID en Apple Developer Portal: habilitar iCloud + crear el container.
 */

const BACKUP_DIR = "tampu-backups";

export interface BackupSlot {
  filename: string;
  uri: string;
  size: number;
  mtime: number;
}

/**
 * Guarda un backup en `Documents/tampu-backups/tampu-backup-YYYY-MM-DD-HHmm.json`.
 * En iOS con iCloud activado, este archivo sincroniza automáticamente.
 */
export async function writeBackupToFilesystem(): Promise<{ ok: true; path: string; size: number } | { ok: false; error: string }> {
  try {
    const backup = await buildBackup();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
    const filename = `tampu-backup-${stamp}.json`;
    const path = `${BACKUP_DIR}/${filename}`;
    const data = JSON.stringify(backup);

    // Crear dir si no existe (mkdirp behavior)
    try {
      await Filesystem.mkdir({
        path: BACKUP_DIR,
        directory: Directory.Documents,
        recursive: true,
      });
    } catch {
      // Likely "Directory exists" — safe to ignore.
    }

    const result = await Filesystem.writeFile({
      path,
      data,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true,
    });

    return { ok: true, path: result.uri, size: data.length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Lista los backups existentes en `Documents/tampu-backups/`.
 * Útil para mostrarle al usuario qué backups tiene y permitirle elegir uno para restaurar.
 */
export async function listBackups(): Promise<BackupSlot[]> {
  try {
    const result = await Filesystem.readdir({
      path: BACKUP_DIR,
      directory: Directory.Documents,
    });

    return result.files
      .filter((f) => f.name.endsWith(".json") && f.type === "file")
      .map((f) => ({
        filename: f.name,
        uri: f.uri,
        size: f.size,
        mtime: f.mtime,
      }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    // Dir doesn't exist yet, no backups.
    return [];
  }
}

/**
 * Lee un backup específico desde el filesystem y devuelve el objeto Backup.
 * NO ejecuta la restauración — eso lo hace `importBackup` en `lib/backup.ts`.
 */
export async function readBackupFromFilesystem(filename: string): Promise<Backup | null> {
  try {
    const result = await Filesystem.readFile({
      path: `${BACKUP_DIR}/${filename}`,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    const text = typeof result.data === "string" ? result.data : await result.data.text();
    return JSON.parse(text) as Backup;
  } catch {
    return null;
  }
}

/**
 * Elimina un backup específico. El usuario decide cuáles purgar desde Ajustes.
 */
export async function deleteBackup(filename: string): Promise<boolean> {
  try {
    await Filesystem.deleteFile({
      path: `${BACKUP_DIR}/${filename}`,
      directory: Directory.Documents,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Auto-backup scheduler.
 * Llamar al inicio de la app (en NativeBootstrap o similar). Hace un backup si:
 *   - Es nativo (iOS / Android — en web no aporta)
 *   - Pasaron > N horas desde el último (default 24h)
 *
 * No bloquea el render. Devuelve void.
 */
const AUTO_BACKUP_KEY = "tampu-auto-backup-last";

export async function maybeAutoBackup(intervalHours = 24): Promise<{ ran: boolean; reason: string }> {
  try {
    // Detect platform: si no estamos en Capacitor native, salimos silencioso.
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) {
      return { ran: false, reason: "web-platform" };
    }

    const last = typeof localStorage !== "undefined" ? localStorage.getItem(AUTO_BACKUP_KEY) : null;
    const lastMs = last ? Date.parse(last) : 0;
    const elapsed = Date.now() - lastMs;
    if (elapsed < intervalHours * 3600 * 1000) {
      return { ran: false, reason: "interval-not-elapsed" };
    }

    const result = await writeBackupToFilesystem();
    if (!result.ok) return { ran: false, reason: result.error };

    if (typeof localStorage !== "undefined") {
      localStorage.setItem(AUTO_BACKUP_KEY, new Date().toISOString());
    }
    return { ran: true, reason: "ok" };
  } catch (err) {
    return { ran: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
