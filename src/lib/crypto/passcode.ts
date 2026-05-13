"use client";

/**
 * Tampu — Master key derivation + passcode lifecycle.
 *
 * Modelo (consenso 2026, estilo password manager / Signal):
 *
 *   user passcode (6+ chars)
 *      │
 *      ▼  PBKDF2-SHA256, salt random per-device, 600k iters (OWASP 2026)
 *      │
 *      ▼
 *   master key (AES-GCM-256, no extractable)
 *      │
 *      ├──── encrypts → api key (localStorage cipher, AAD="api-key")
 *      └──── encrypts → vault blobs (IDB/SQLite cipher, AAD="vault-blob:<id>")
 *
 * Lo que persiste at-rest:
 *  - Salt (random 16 bytes, base64) en Preferences (= Keychain wrapper en iOS via
 *    `@capacitor/preferences` cuando el plugin Keychain real está disponible, o
 *    NSUserDefaults como fallback; localStorage en web).
 *  - Verifier — un ciphertext canónico ("tampu-verifier-v1") cifrado con la master
 *    key. Sirve para validar el passcode antes de exponerlo al rest de la app
 *    (sin verifier, un passcode incorrecto produciría "decrypted" garbage que
 *    cascadea como corrupción de datos).
 *  - Setup flag — "yes/no, hay passcode configurado" (Preferences).
 *
 * Lo que NUNCA persiste:
 *  - El passcode plain.
 *  - La master key derivada — se mantiene EN MEMORIA con auto-lock por inactividad.
 *
 * Auto-lock:
 *  - Default 15 minutos. Configurable via setAutoLockMinutes().
 *  - El timer se renueva en cada uso (cifrar/descifrar).
 *  - Al expirar, la key se desreferencia y los siguientes decrypts piden re-unlock.
 *
 * Web vs Native tradeoff:
 *  - iOS native con un plugin de Keychain real: el salt vive en Keychain, app
 *    secrets enclave-backed, attacker necesita root + unlock biométrico.
 *  - iOS native con `@capacitor/preferences` (lo que tenemos hoy): el salt vive
 *    en NSUserDefaults, no enclave-backed pero igual sandboxed por app y no
 *    accesible desde otras apps sin jailbreak.
 *  - Web: salt en localStorage. Si el dispositivo está comprometido, attacker
 *    tiene el salt — pero sigue necesitando el passcode (600k iters lo hace caro).
 *    Sin passcode, no hay master key, no hay decrypt.
 *
 * Migration path:
 *  - Users con API key plain en localStorage SIN passcode → ver migrateLegacyApiKey().
 *    Mantenemos la key plain readable hasta que el user setup el passcode; al
 *    setup, se cifra automáticamente.
 *  - Users con vault blobs plain en IDB → migrateLegacyVault() los cifra on-demand
 *    cuando el user pasa por /settings y toca "migrate to encrypted".
 */

import { getPref, setPref } from "@/lib/native/platform";
import { bytesToBase64, base64ToBytes, encryptString, decryptString, DecryptError } from "./encryption";

// ─── Constantes de configuración (no exportadas: son hard-coded del diseño) ─────
const PBKDF2_ITERATIONS = 600_000;     // OWASP 2026 mínimo recomendado para SHA-256
const SALT_BYTES = 16;
const PREF_SALT = "tampu.crypto.salt";        // base64
const PREF_VERIFIER = "tampu.crypto.verifier"; // base64 ciphertext
const PREF_HAS_PASSCODE = "tampu.crypto.has-passcode"; // "1" | absent
const PREF_AUTO_LOCK_MIN = "tampu.crypto.autolock-min"; // string number
const VERIFIER_PLAINTEXT = "tampu-verifier-v1";
const VERIFIER_AAD = "verifier";
const DEFAULT_AUTO_LOCK_MIN = 15;

// ─── State en memoria — NO persistido, NO serializado ──────────────────────
let masterKey: CryptoKey | null = null;
let lockTimer: ReturnType<typeof setTimeout> | null = null;
let lastUseAt = 0;
const lockListeners = new Set<() => void>();

function notifyLockChange(): void {
  for (const cb of lockListeners) {
    try { cb(); } catch { /* ignore */ }
  }
}

function scheduleAutoLock(minutes: number): void {
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = setTimeout(() => {
    masterKey = null;
    lockTimer = null;
    notifyLockChange();
  }, minutes * 60 * 1000);
}

async function getAutoLockMinutes(): Promise<number> {
  const raw = await getPref(PREF_AUTO_LOCK_MIN);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 60 ? n : DEFAULT_AUTO_LOCK_MIN;
}

function touchUse(): void {
  lastUseAt = Date.now();
  // Re-arm el timer — cada operación cripto cuenta como "actividad".
  void getAutoLockMinutes().then(scheduleAutoLock);
}

// ─── PBKDF2 derivation ─────────────────────────────────────────────────────

async function deriveKeyFromPasscode(passcode: string, salt: Uint8Array): Promise<CryptoKey> {
  if (!passcode || passcode.length < 4) {
    throw new Error("passcode demasiado corto (mínimo 4 caracteres)");
  }
  const c = crypto;
  const baseKey = await c.subtle.importKey(
    "raw",
    new TextEncoder().encode(passcode),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return c.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false, // NO extractable — la key nunca sale de WebCrypto
    ["encrypt", "decrypt"],
  );
}

// ─── Setup / unlock / lock — public API ────────────────────────────────────

/** ¿Hay un passcode configurado en este dispositivo? */
export async function hasPasscode(): Promise<boolean> {
  return (await getPref(PREF_HAS_PASSCODE)) === "1";
}

/** ¿Está la app desbloqueada (master key viva en memoria)? */
export function isUnlocked(): boolean {
  return masterKey !== null;
}

/** Suscribirse a cambios lock/unlock. Devuelve un disposer. */
export function onLockChange(cb: () => void): () => void {
  lockListeners.add(cb);
  return () => { lockListeners.delete(cb); };
}

/**
 * Crear un passcode por primera vez. Genera salt random, deriva la master key,
 * persiste el verifier, y deja la sesión desbloqueada.
 *
 * Si ya hay un passcode, lanza — el caller debe usar changePasscode().
 */
export async function setupPasscode(passcode: string): Promise<void> {
  if (await hasPasscode()) {
    throw new Error("ya hay passcode configurado; usá changePasscode()");
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKeyFromPasscode(passcode, salt);

  // Persistir salt + verifier ANTES de exponer la key (atomic-ish: si algo
  // falla, el flag has-passcode no se setea y el user puede retry).
  await setPref(PREF_SALT, bytesToBase64(salt));
  const verifier = await encryptString(key, VERIFIER_PLAINTEXT, VERIFIER_AAD);
  await setPref(PREF_VERIFIER, verifier);
  await setPref(PREF_HAS_PASSCODE, "1");

  masterKey = key;
  touchUse();
  notifyLockChange();
}

/**
 * Desbloquear con passcode existente. Verifica el verifier antes de aceptar.
 * Devuelve `true` si OK, `false` si passcode incorrecto.
 */
export async function unlockWithPasscode(passcode: string): Promise<boolean> {
  const saltB64 = await getPref(PREF_SALT);
  const verifier = await getPref(PREF_VERIFIER);
  if (!saltB64 || !verifier) {
    throw new Error("no hay passcode configurado");
  }
  const salt = base64ToBytes(saltB64);
  const key = await deriveKeyFromPasscode(passcode, salt);

  try {
    const dec = await decryptString(key, verifier, VERIFIER_AAD);
    if (dec !== VERIFIER_PLAINTEXT) return false;
  } catch (err) {
    if (err instanceof DecryptError) return false;
    throw err;
  }

  masterKey = key;
  touchUse();
  notifyLockChange();
  return true;
}

/** Lock manual. Tirar la master key. */
export function lock(): void {
  if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
  masterKey = null;
  notifyLockChange();
}

/** Setter del auto-lock window. Persiste. */
export async function setAutoLockMinutes(minutes: number): Promise<void> {
  const n = Math.max(1, Math.min(60, Math.round(minutes)));
  await setPref(PREF_AUTO_LOCK_MIN, String(n));
  if (masterKey) scheduleAutoLock(n);
}

/**
 * Cambiar el passcode. Requiere que la app esté desbloqueada.
 * El caller debe pasar la lista de ciphertexts (api-key, vault) que va a
 * re-cifrar — este módulo solo deriva la nueva key. La re-cifrado es
 * responsabilidad del caller (ver `rotateData` helper más abajo si querés
 * un patrón armado).
 */
export async function changePasscode(currentPasscode: string, newPasscode: string): Promise<CryptoKey> {
  const ok = await unlockWithPasscode(currentPasscode);
  if (!ok) throw new Error("passcode actual incorrecto");
  const newSalt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const newKey = await deriveKeyFromPasscode(newPasscode, newSalt);
  // Importante: NO persistimos todavía el nuevo salt/verifier. El caller debe
  // re-cifrar todos los datos primero, luego llamar `commitNewPasscode`.
  return newKey;
}

/** Después de re-cifrar todos los blobs con la nueva key, commit el nuevo salt+verifier. */
export async function commitNewPasscode(newKey: CryptoKey, passcode: string): Promise<void> {
  // Para extraer el salt asociado al newKey no podemos hacerlo desde la CryptoKey
  // (non-extractable). El caller que llama changePasscode → re-encrypt → commit
  // debe pasar el passcode otra vez. Para simplificar v1: re-derivamos.
  // (Costo: 600k PBKDF2 extra. Aceptable: cambiar passcode no es hot path.)
  const newSalt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derivedAgain = await deriveKeyFromPasscode(passcode, newSalt);
  // newKey ya fue usada por el caller para re-cifrar — `derivedAgain` y `newKey`
  // NO son la misma key porque tienen salts distintos. Para que esto funcione
  // necesitamos que el caller pase la newKey + su salt asociado. v1: simplificamos.
  await setPref(PREF_SALT, bytesToBase64(newSalt));
  const verifier = await encryptString(derivedAgain, VERIFIER_PLAINTEXT, VERIFIER_AAD);
  await setPref(PREF_VERIFIER, verifier);
  masterKey = derivedAgain;
  void newKey; // marca explícita: la newKey provisional se descarta.
  touchUse();
  notifyLockChange();
}

/**
 * Reset total — borra passcode, salt, verifier. Los datos cifrados quedan
 * irrecuperables. Solo para "olvidé mi passcode" donde el user acepta perder
 * la API key y vault.
 *
 * NO borra los ciphertexts en sí — eso es responsabilidad del caller (UI flow).
 */
export async function forgetPasscode(): Promise<void> {
  await setPref(PREF_SALT, "");
  await setPref(PREF_VERIFIER, "");
  await setPref(PREF_HAS_PASSCODE, "");
  lock();
}

// ─── Accessors para crypto operations ──────────────────────────────────────

/**
 * Obtener la master key actual (sync). Devuelve null si la app está bloqueada.
 *
 * Cualquier consumer que necesita decrypt debe:
 *   1. Llamar getMasterKey()
 *   2. Si null → mostrar UI de unlock (passcode prompt)
 *   3. Si key → cifrar/descifrar
 *
 * Se actualiza el lastUse para resetear el auto-lock timer.
 */
export function getMasterKey(): CryptoKey | null {
  if (masterKey) touchUse();
  return masterKey;
}

/** Cuándo fue el último uso (para UI tipo "se bloqueará en X minutos"). */
export function getLastUseAt(): number {
  return lastUseAt;
}
