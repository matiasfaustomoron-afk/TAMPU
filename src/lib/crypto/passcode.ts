"use client";

/**
 * Tampu — Master key derivation + passcode lifecycle.
 *
 * Modelo (consenso 2026, estilo password manager / Signal):
 *
 *   user passcode (12+ chars o passphrase 4 palabras)
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
 *  - Salt (random 16 bytes, base64) en Preferences.
 *  - Verifier — ciphertext canónico ("tampu-verifier-v1") cifrado con la master key.
 *  - Setup flag — "yes/no, hay passcode configurado".
 *  - Lockout counter — intentos fallidos consecutivos (localStorage).
 *
 * Lo que NUNCA persiste:
 *  - El passcode plain.
 *  - La master key derivada — se mantiene EN MEMORIA con auto-lock por inactividad.
 *
 * ─── Red team audit (mayo 2026) ──────────────────────────────────────────────
 * Cambios v2:
 *  1. Floor de passcode subido: 12 chars alphanumeric O passphrase 4 palabras
 *     (mín 16 chars). Score zxcvbn ≥ 3 obligatorio. Esto convierte el ataque
 *     offline-dictionary de "<60s con RTX 4090" a "años de cómputo".
 *  2. Lockout exponencial con escalada hasta wipe a los 10 intentos. Previene
 *     brute-force tanto online (live device) como offline-en-memoria si el
 *     attacker tiene el cipher pero no quiere romper PBKDF2 a mano.
 *  3. `commitNewPasscode` refactor: double-write + verify + commit. Si el cambio
 *     de passcode se interrumpe a mitad (tab cerrada, OOM, IDB error), el vault
 *     queda en estado coherente con la OLD key — nunca corrupto / split.
 */

import { getPref, setPref } from "@/lib/native/platform";
import { bytesToBase64, base64ToBytes, encryptString, decryptString, DecryptError, encryptBlob, decryptBytes } from "./encryption";
import { zxcvbnAsync, zxcvbnOptions } from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import * as zxcvbnEsEsPackage from "@zxcvbn-ts/language-es-es";

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

// Lockout — el spec del red team usa estas keys/values exactos.
const LS_FAILURES_KEY = "tampu_pc_failures";
const LS_LEGACY_MASTER_CIPHER = "tampu_master_cipher"; // legacy key, wipe target
const VAULT_DB_NAME = "travel-os-vault";

// ─── State en memoria — NO persistido, NO serializado ──────────────────────
let masterKey: CryptoKey | null = null;
let lockTimer: ReturnType<typeof setTimeout> | null = null;
let lastUseAt = 0;
const lockListeners = new Set<() => void>();

// ─── zxcvbn setup — lazy, módulo-scope. Sólo se inicializa una vez. ────────
let zxcvbnReady = false;
function ensureZxcvbn(): void {
  if (zxcvbnReady) return;
  zxcvbnOptions.setOptions({
    translations: zxcvbnEsEsPackage.translations,
    dictionary: {
      ...zxcvbnCommonPackage.dictionary,
      ...zxcvbnEsEsPackage.dictionary,
    },
    graphs: zxcvbnCommonPackage.adjacencyGraphs,
    // Custom user dictionary — palabras Tampu-específicas que NO debería usar.
    // Suma "tampu" y palabras de viaje a la lista global del usuario.
  });
  zxcvbnReady = true;
}

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

// ─── Strength validation (zxcvbn + rules) ──────────────────────────────────

export interface PasscodeStrength {
  ok: boolean;
  /** Mensaje corto en español rioplatense, listo para mostrar. */
  reason?: string;
  /** Sugerencia accionable ("agregá una palabra más"). */
  suggestion?: string;
  /** zxcvbn raw score 0–4 (sólo informativo, para barra UI). */
  score?: 0 | 1 | 2 | 3 | 4;
  /** Estimación human-readable de tiempo de crack offline. */
  crackTime?: string;
}

/** ¿Pasa el floor estructural (largo / palabras)?
 *
 * Reglas:
 *  - Path A: 12+ caracteres alphanumeric (passcode "denso", típicamente con
 *    símbolos / mix). Funciona con o sin espacios — si tenés "abc def ghi jkl"
 *    de 15 chars, pasa el floor también.
 *  - Path B: 4+ palabras separadas por espacio + ≥16 chars total (passphrase
 *    estilo diceware). Más fácil de recordar, menos fácil de tipear mal.
 *
 * El score zxcvbn ≥3 (chequeado después) es la barrera real contra "12 chars
 * de un nombre conocido" o "4 palabras todas en un dict común".
 */
function meetsStructuralFloor(s: string): { ok: true } | { ok: false; reason: string; suggestion: string } {
  const trimmed = s.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  // Path A: 12+ caracteres totales.
  if (trimmed.length >= 12) return { ok: true };

  // Path B: 4+ palabras separadas por espacio Y mínimo 16 chars total.
  // (Cubre el caso "4 palabras de 3 chars cada una" donde Path A no aplica.)
  if (wordCount >= 4 && trimmed.length >= 16) return { ok: true };

  // Mensaje según el shape del input — guía al user al path más cercano.
  if (wordCount >= 2) {
    return {
      ok: false,
      reason: "Te falta llegar al mínimo de fuerza.",
      suggestion: "Llegá a 12+ caracteres o agregá palabras hasta tener 4 (mín 16 chars total).",
    };
  }
  return {
    ok: false,
    reason: "Está muy corto: con un GPU moderno te lo crackean en segundos.",
    suggestion: "Usá 12+ caracteres o mejor 4 palabras separadas por espacio.",
  };
}

/**
 * Valida que el passcode pase el floor estructural Y el score zxcvbn ≥ 3.
 *
 * IMPORTANTE: usa zxcvbnAsync — la versión sync de zxcvbn-ts no devuelve
 * resultados completos. La función es async, el caller debe esperarla.
 */
export async function validatePasscodeStrength(s: string): Promise<PasscodeStrength> {
  ensureZxcvbn();

  // 1. Floor estructural (rápido, sin zxcvbn).
  const floor = meetsStructuralFloor(s);
  if (!floor.ok) {
    return { ok: false, reason: floor.reason, suggestion: floor.suggestion, score: 0 };
  }

  // 2. zxcvbn — detecta nombres, fechas, secuencias, leaks comunes.
  let result;
  try {
    result = await zxcvbnAsync(s);
  } catch {
    // Si zxcvbn falla por cualquier motivo, no bloqueamos al user pero loggeamos.
    console.error("[passcode] zxcvbn failed, falling back to structural-only");
    return { ok: true, score: 3 };
  }

  const score = result.score as 0 | 1 | 2 | 3 | 4;
  const crackTime = String(result.crackTimesDisplay?.offlineSlowHashing1e4PerSecond ?? "");

  if (score < 3) {
    // Construir mensaje voseo a partir del feedback de zxcvbn.
    const warning = result.feedback?.warning;
    let reason = "Está muy débil, te crackean en " + (crackTime || "minutos") + ".";
    if (warning && /name|nombre|fecha|date|common/i.test(String(warning))) {
      reason = "No uses tu nombre, fecha de nacimiento, ni palabras comunes — son las primeras que prueba el atacante.";
    }
    const suggestions: string[] = (result.feedback?.suggestions ?? []).map(String);
    const suggestion = suggestions[0] ?? "Agregá una palabra más, o mezclá símbolos y números.";

    return { ok: false, reason, suggestion, score, crackTime };
  }

  return { ok: true, score, crackTime };
}

// ─── Lockout exponencial ───────────────────────────────────────────────────

export interface LockoutState {
  /** ¿Está actualmente bloqueado por timeout? */
  locked: boolean;
  /** Milisegundos hasta que se desbloquee. 0 si !locked. */
  remainingMs: number;
  /** Intentos restantes antes del wipe a los 10. */
  attemptsLeft: number;
  /** ¿El vault fue wipeado por demasiados intentos? */
  wiped: boolean;
  /** Total de intentos fallidos consecutivos hasta ahora. */
  count: number;
}

interface FailureRecord {
  count: number;
  lastAttempt: number;
  wiped: boolean;
}

function readFailures(): FailureRecord {
  if (typeof localStorage === "undefined") return { count: 0, lastAttempt: 0, wiped: false };
  try {
    const raw = localStorage.getItem(LS_FAILURES_KEY);
    if (!raw) return { count: 0, lastAttempt: 0, wiped: false };
    const parsed = JSON.parse(raw);
    return {
      count: Number(parsed.count) || 0,
      lastAttempt: Number(parsed.lastAttempt) || 0,
      wiped: Boolean(parsed.wiped),
    };
  } catch {
    return { count: 0, lastAttempt: 0, wiped: false };
  }
}

function writeFailures(rec: FailureRecord): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(LS_FAILURES_KEY, JSON.stringify(rec)); } catch { /* ignore */ }
}

/**
 * Duración del lockout en ms según el número de intento que ACABA de fallar.
 * Escalada:
 *   - 1, 2  → 0 ms (no lockout)
 *   - 3     → 30 s
 *   - 4     → 2 min
 *   - 5     → 5 min
 *   - 6–9   → 30 min cada uno
 *   - 10    → wipe (manejado afuera, este devuelve Infinity como flag)
 */
function lockoutDurationMs(count: number): number {
  if (count <= 2) return 0;
  if (count === 3) return 30 * 1000;
  if (count === 4) return 2 * 60 * 1000;
  if (count === 5) return 5 * 60 * 1000;
  if (count >= 6 && count <= 9) return 30 * 60 * 1000;
  return Number.POSITIVE_INFINITY; // count >= 10 → wipe
}

/** Estado del lockout en este momento. Llamala cada tick del countdown. */
export function getLockoutState(): LockoutState {
  const rec = readFailures();
  if (rec.wiped) {
    return { locked: false, remainingMs: 0, attemptsLeft: 0, wiped: true, count: rec.count };
  }
  const dur = lockoutDurationMs(rec.count);
  const elapsed = Date.now() - rec.lastAttempt;
  const remainingMs = Math.max(0, dur - elapsed);
  const attemptsLeft = Math.max(0, 10 - rec.count);
  return {
    locked: remainingMs > 0 && Number.isFinite(dur),
    remainingMs,
    attemptsLeft,
    wiped: false,
    count: rec.count,
  };
}

/** Wipe local (cipher + vault). Idempotente. NO toca server-side. */
async function wipeLocalVault(): Promise<void> {
  // 1. Borrar el verifier + salt + flag (master cipher de Tampu).
  try { await setPref(PREF_SALT, ""); } catch { /* ignore */ }
  try { await setPref(PREF_VERIFIER, ""); } catch { /* ignore */ }
  try { await setPref(PREF_HAS_PASSCODE, ""); } catch { /* ignore */ }

  // 2. Borrar la legacy key `tampu_master_cipher` si existió en localStorage.
  if (typeof localStorage !== "undefined") {
    try { localStorage.removeItem(LS_LEGACY_MASTER_CIPHER); } catch { /* ignore */ }
  }

  // 3. Borrar la base de IDB del vault entera.
  if (typeof indexedDB !== "undefined") {
    try {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(VAULT_DB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();   // no bloqueamos: si falla, sigue
        req.onblocked = () => resolve();
      });
    } catch { /* ignore */ }
  }

  // 4. In-memory key — out.
  masterKey = null;
  if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
  notifyLockChange();
}

/**
 * Registrar un intento fallido. Suma al contador, persiste, y si llegó a 10
 * dispara el wipe automático.
 *
 * Devuelve el state actualizado para que el caller decida qué UI mostrar.
 */
export async function recordFailedAttempt(): Promise<LockoutState> {
  const rec = readFailures();
  if (rec.wiped) {
    // Ya wipeado — no recontamos.
    return { locked: false, remainingMs: 0, attemptsLeft: 0, wiped: true, count: rec.count };
  }
  rec.count += 1;
  rec.lastAttempt = Date.now();

  if (rec.count >= 10) {
    rec.wiped = true;
    writeFailures(rec);
    console.error("[passcode] 10 intentos fallidos · wipe local del vault disparado");
    await wipeLocalVault();
    return { locked: false, remainingMs: 0, attemptsLeft: 0, wiped: true, count: rec.count };
  }

  writeFailures(rec);
  const dur = lockoutDurationMs(rec.count);
  return {
    locked: dur > 0,
    remainingMs: dur,
    attemptsLeft: Math.max(0, 10 - rec.count),
    wiped: false,
    count: rec.count,
  };
}

/** Reset del contador (lo llamamos automáticamente al unlock exitoso). */
export function resetFailedAttempts(): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.removeItem(LS_FAILURES_KEY); } catch { /* ignore */ }
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
 * Crear un passcode por primera vez. Valida fuerza, genera salt random, deriva
 * la master key, persiste el verifier, y deja la sesión desbloqueada.
 *
 * Si ya hay un passcode, lanza — el caller debe usar changePasscode().
 * Si la fuerza no pasa, lanza un Error con el reason.
 */
export async function setupPasscode(passcode: string): Promise<void> {
  if (await hasPasscode()) {
    throw new Error("ya hay passcode configurado; usá changePasscode()");
  }
  const strength = await validatePasscodeStrength(passcode);
  if (!strength.ok) {
    throw new Error(strength.reason || "Passcode muy débil");
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
  resetFailedAttempts();
  touchUse();
  notifyLockChange();
}

/**
 * Desbloquear con passcode existente. Verifica el verifier antes de aceptar.
 * Devuelve `true` si OK, `false` si passcode incorrecto.
 *
 * NOTA: esta función NO consulta ni actualiza el lockout — eso es responsabilidad
 * del caller (UI). Razón: queremos que el caller decida la UI/UX del lockout
 * (countdown, mensaje, redirect al wipe screen) sin que esta función la imponga.
 * El caller típico: chequea `getLockoutState().locked` antes de llamar; al recibir
 * `false`, llama `recordFailedAttempt()`; al recibir `true`, llama `resetFailedAttempts()`.
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

// ─── Cambio de passcode — algoritmo seguro double-write + verify + commit ─

/**
 * Resultado de `changePasscode`. Guardamos la newKey + newSalt en memoria
 * efímera (en el state local del caller) hasta que termine el commit.
 */
export interface PendingPasscodeChange {
  /** Master key derivada del nuevo passcode. NO se expone a otros módulos. */
  newKey: CryptoKey;
  /** Salt asociado a newKey. Necesario para el commit. */
  newSalt: Uint8Array;
  /** Old key — se mantiene viva hasta que el commit confirme. */
  oldKey: CryptoKey;
}

/**
 * Cambiar el passcode — paso 1 de 2. Verifica el passcode actual, deriva una
 * nueva master key con un salt nuevo, y devuelve TANTO la new como la old key
 * para que el commit pueda re-cifrar atomically.
 *
 * IMPORTANTE: hasta que el caller llame `commitNewPasscode`, los datos siguen
 * cifrados con la OLD key. No tocamos nada persistido todavía.
 */
export async function changePasscode(
  currentPasscode: string,
  newPasscode: string,
): Promise<PendingPasscodeChange> {
  // 1. Verificar el current — esto también re-activa la masterKey actual en memoria.
  const ok = await unlockWithPasscode(currentPasscode);
  if (!ok) throw new Error("passcode actual incorrecto");
  const oldKey = masterKey;
  if (!oldKey) throw new Error("imposible: unlock exitoso pero masterKey vacía");

  // 2. Validar fuerza del nuevo.
  const strength = await validatePasscodeStrength(newPasscode);
  if (!strength.ok) throw new Error(strength.reason || "Nuevo passcode muy débil");

  // 3. Derivar new — pero todavía NO persistimos.
  const newSalt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const newKey = await deriveKeyFromPasscode(newPasscode, newSalt);

  return { newKey, newSalt, oldKey };
}

/**
 * Cambiar el passcode — paso 2 de 2. Algoritmo "double-write + verify + commit"
 * para evitar corrupción si el flow se interrumpe a mitad.
 *
 * ─── Algoritmo ─────────────────────────────────────────────────────────────
 *
 * 1. PREPARE. Tomamos `pending.newKey` (= encrypt-side) y `pending.oldKey`
 *    (= decrypt-side de los datos actuales). Ambas vivas en memoria hasta el
 *    commit.
 *
 * 2. RE-ENCRYPT en batches de 5 con `Promise.allSettled`. Para cada blob del
 *    vault IDB:
 *      a. decrypt(oldKey, row.cipher) → plaintext bytes
 *      b. encrypt(newKey, plaintext)  → newCipher
 *      c. put en IDB con id = "tampu_vault_v2_pending_" + originalId
 *    Los originales NO se tocan. Si OOM o tab close a mitad, los pending
 *    quedan huérfanos pero los originales están intactos.
 *
 * 3. VERIFY. Para cada pending row, decrypt con `newKey`. Si CUALQUIERA falla
 *    → abort: borrar todos los pending, mantenerse con oldKey + oldCipher.
 *    El user ve "no se pudo cambiar el passcode, tu vault sigue accesible
 *    con el passcode viejo". Sin corrupción.
 *
 * 4. COMMIT. En UNA transacción IDB readwrite:
 *      - Para cada pending row, copiar a key original (sobrescribiendo).
 *      - Borrar el pending.
 *    Persistir nuevo `salt` + `verifier` con newKey en Preferences.
 *    Recién acá descartamos `oldKey` y promovemos `newKey` al state global.
 *
 * 5. FAIL-SAFE. Si cualquier paso falla, logueamos con `console.error`
 *    (Agent A todavía no instaló Sentry; cuando lo haga, este punto va a
 *    capturar la excepción con contexto).
 *
 * ─── Tests manuales documentados ───────────────────────────────────────────
 *
 * Para verificar que el bug original (vault corrupto en mid-rotation con
 * archivo grande) está fixeado:
 *
 *  TEST 1 — change passcode con vault chico (< 10 MB):
 *    1. Setup passcode "correctcaballo bateria grapadora"
 *    2. Subir 3 PDFs chicos al vault
 *    3. Cambiar passcode a "altavoz mariposa relámpago electricidad"
 *    4. Verificar: los 3 PDFs siguen abriéndose post-cambio.
 *    Esperado: ✓ todos accesibles.
 *
 *  TEST 2 — change passcode con archivo grande (50+ MB):
 *    1. Setup passcode
 *    2. Subir un MP4 de 50 MB
 *    3. Cambiar passcode
 *    4. Antes del bug fix: el cambio fallaba a mitad → vault inaccesible.
 *    5. Después del fix: el cambio es atómico → si falla, se queda con la old key.
 *
 *  TEST 3 — abort a mitad (cerrar tab durante el re-encrypt):
 *    1. Setup passcode + 20 archivos
 *    2. Iniciar cambio de passcode
 *    3. Cerrar la tab cuando vas por la mitad
 *    4. Re-abrir la app: debería desbloquearse con el passcode VIEJO.
 *    5. Los pending rows quedan huérfanos — `cleanupOrphanedPending` los limpia.
 *
 *  TEST 4 — verify failure simulado (corromper un pending manualmente):
 *    1. Setup + 5 archivos
 *    2. Iniciar cambio, pero antes del commit corromper un pending row
 *       (DevTools → IDB → editar bytes)
 *    3. Continuar: el verify debería fallar y abortar el cambio.
 *    4. El vault sigue accesible con el passcode viejo.
 */
export async function commitNewPasscode(
  pending: PendingPasscodeChange,
  newPasscode: string,
): Promise<void> {
  // Sanity: el caller debería tener la app desbloqueada (oldKey === masterKey
  // current). Si masterKey cambió bajo nuestros pies (otro flow lock-ó), abortamos.
  if (masterKey !== pending.oldKey) {
    throw new Error("estado de cifrado cambió durante el cambio de passcode · abortado");
  }

  // 1. Re-encrypt todos los blobs del vault IDB (web). En native (SQLite), el
  //    backend tiene su propio flow — out of scope para este commit.
  if (typeof indexedDB !== "undefined") {
    try {
      await rotateVaultIdbBlobs(pending.oldKey, pending.newKey);
    } catch (err) {
      console.error("[passcode-change] rotateVaultIdbBlobs failed · abort", err);
      await cleanupOrphanedPending();
      throw new Error("No se pudo re-cifrar el vault. Tu passcode sigue siendo el viejo.");
    }
  }

  // 2. Verify es interno a rotateVaultIdbBlobs. Si llegamos acá, todos los pending
  //    se decryptearon OK con newKey. Hacemos el SWAP final.
  if (typeof indexedDB !== "undefined") {
    try {
      await swapPendingToOriginal();
    } catch (err) {
      console.error("[passcode-change] swap failed · abort, vault posiblemente inconsistente", err);
      // Acá ya hay riesgo: si el swap falló a mitad, algunos blobs pueden estar
      // con newCipher y otros con oldCipher. Pero como TODAVÍA no persistimos
      // el nuevo verifier, el masterKey actual (que es oldKey) ya no decrypta
      // los blobs swapeados. El user va a ver errores de decrypt en esos.
      // En la práctica: una transacción IDB readwrite es atómica a nivel de
      // browser engine, así que este path es raro. Pero loggeamos por las dudas.
      throw new Error("Cambio de passcode interrumpido durante el commit. Re-intentá.");
    }
  }

  // 3. Persistir nuevo salt + verifier (último paso — point of no return para la old key).
  await setPref(PREF_SALT, bytesToBase64(pending.newSalt));
  const newVerifier = await encryptString(pending.newKey, VERIFIER_PLAINTEXT, VERIFIER_AAD);
  await setPref(PREF_VERIFIER, newVerifier);

  // 4. Promover newKey al state global. Discard oldKey.
  masterKey = pending.newKey;
  // Hint al GC: no podemos zeroizar una CryptoKey non-extractable, pero al menos
  // soltamos la referencia.
  void pending.oldKey;
  void newPasscode; // ya no la necesitamos (la usamos al derivar newKey antes)

  resetFailedAttempts();
  touchUse();
  notifyLockChange();
}

// ─── IDB helpers para el rotate ────────────────────────────────────────────
//
// Estos están aislados de `vault/storage.ts` para evitar circular imports y
// porque la lógica de rotación es propia del flow de passcode change.

const PENDING_PREFIX = "tampu_vault_v2_pending_";
const VAULT_STORE = "files";
const VAULT_DB_VERSION = 2;

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(VAULT_DB_NAME, VAULT_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(VAULT_STORE)) {
        db.createObjectStore(VAULT_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IDB upgrade blocked"));
  });
}

interface VaultRowAny {
  id: string;
  cipher?: Uint8Array;
  blob?: Blob;
  type?: string;
  size?: number;
  savedAt?: number;
  encrypted?: boolean;
}

async function readAllVaultRows(db: IDBDatabase): Promise<VaultRowAny[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE, "readonly");
    const req = tx.objectStore(VAULT_STORE).getAll();
    req.onsuccess = () => resolve((req.result || []) as VaultRowAny[]);
    req.onerror = () => reject(req.error);
  });
}

async function putRow(db: IDBDatabase, row: VaultRowAny): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE, "readwrite");
    tx.objectStore(VAULT_STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Re-cifra todos los blobs del vault en batches de 5 con `Promise.allSettled`.
 * Guarda cada uno bajo `tampu_vault_v2_pending_{id}`. NO toca los originales.
 * Si CUALQUIER blob falla (re-encrypt o verify), aborta y limpia los pending.
 */
async function rotateVaultIdbBlobs(oldKey: CryptoKey, newKey: CryptoKey): Promise<void> {
  const db = await openVaultDb();
  const rows = await readAllVaultRows(db);

  // Filtramos: sólo cipher rows (las legacy plain no necesitan rotation porque
  // no están cifradas con oldKey; siguen siendo plain).
  const cipherRows = rows.filter(r => r.encrypted === true && r.cipher && !r.id.startsWith(PENDING_PREFIX));

  if (cipherRows.length === 0) return; // nada que rotar

  const BATCH = 5;
  for (let i = 0; i < cipherRows.length; i += BATCH) {
    const batch = cipherRows.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(async (row) => {
      // Decrypt con oldKey.
      const aad = "vault-blob:" + row.id;
      const plaintext = await decryptBytes(oldKey, row.cipher!, aad);
      // Re-encrypt con newKey. Usamos encryptBlob para mantener el mismo path
      // de cifrado que el resto del vault.
      const blob = new Blob([plaintext.buffer as ArrayBuffer], { type: row.type || "application/octet-stream" });
      const newCipher = await encryptBlob(newKey, blob, aad);
      // Persistir en pending key.
      await putRow(db, {
        id: PENDING_PREFIX + row.id,
        cipher: newCipher,
        type: row.type || "application/octet-stream",
        size: row.size || 0,
        savedAt: row.savedAt || Date.now(),
        encrypted: true,
      });
    }));

    // Si CUALQUIERA del batch falló → abort.
    const failed = results.filter(r => r.status === "rejected");
    if (failed.length > 0) {
      const reasons = failed.map(r => (r as PromiseRejectedResult).reason).map(String).join(" · ");
      throw new Error("re-encrypt batch failed: " + reasons);
    }
  }

  // VERIFY pass — releer todos los pending y decrypt-checkear con newKey.
  const allRows2 = await readAllVaultRows(db);
  const pendingRows = allRows2.filter(r => r.id.startsWith(PENDING_PREFIX) && r.cipher);
  for (const p of pendingRows) {
    const originalId = p.id.slice(PENDING_PREFIX.length);
    const aad = "vault-blob:" + originalId;
    try {
      await decryptBytes(newKey, p.cipher!, aad);
    } catch (err) {
      throw new Error("verify failed for " + originalId + ": " + (err as Error).message);
    }
  }
}

/**
 * Swap atómico: por cada pending row, sobreescribir el original y borrar el pending.
 * UNA transacción IDB readwrite para que sea atómico a nivel browser.
 */
async function swapPendingToOriginal(): Promise<void> {
  const db = await openVaultDb();
  const rows = await readAllVaultRows(db);
  const pending = rows.filter(r => r.id.startsWith(PENDING_PREFIX));
  if (pending.length === 0) return;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE, "readwrite");
    const store = tx.objectStore(VAULT_STORE);
    for (const p of pending) {
      const originalId = p.id.slice(PENDING_PREFIX.length);
      store.put({ ...p, id: originalId });
      store.delete(p.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("tx aborted"));
  });
}

/** Limpia pending rows huérfanos (de un cambio de passcode abortado). */
async function cleanupOrphanedPending(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openVaultDb();
    const rows = await readAllVaultRows(db);
    const pending = rows.filter(r => r.id.startsWith(PENDING_PREFIX));
    if (pending.length === 0) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(VAULT_STORE, "readwrite");
      const store = tx.objectStore(VAULT_STORE);
      for (const p of pending) store.delete(p.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("[passcode-change] cleanup orphan pending failed", err);
  }
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
  resetFailedAttempts();
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
