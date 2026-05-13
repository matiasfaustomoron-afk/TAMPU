"use client";

// ─── User-provided AI API key (Anthropic OR Google Gemini) ───
//
// Audit finding 05/2026: la key se guardaba en localStorage plain — leak directo
// si el dispositivo se compromete. Ahora se cifra at-rest con AES-GCM(256) +
// master key derivada del passcode del user (PBKDF2-SHA256, 600k iters).
//
// Estado del flow:
//   localStorage["travel-os-ai-key-cipher"]  = base64(IV || ciphertext+tag)
//   memory cache (this module)               = plaintext key — vive solo en RAM
//
// La función `getUserApiKey()` MANTIENE su firma sync porque hay 9 callsites
// que la consumen sync (assistant, vault, import, etc.) y no podemos romper
// todo. Estrategia:
//   - Al boot, si la app está desbloqueada (master key viva en memoria),
//     intentamos descifrar la key y poblar el cache.
//   - Si la app está bloqueada (passcode no ingresado), `getUserApiKey()`
//     devuelve `null` y la UI muestra el unlock prompt como ya hace con
//     "no hay key configurada".
//   - Si el user NO configuró passcode (flow legacy), seguimos leyendo plain
//     desde el key legacy (LEGACY_KEY o STORAGE_KEY) — compat total con
//     installations existentes. La migración explícita corre desde /settings.

import {
  getMasterKey,
  hasPasscode,
  onLockChange,
} from "@/lib/crypto/passcode";
import { encryptString, decryptString, DecryptError, looksEncryptedB64 } from "@/lib/crypto/encryption";

const STORAGE_KEY = "travel-os-ai-key";                // legacy plain key (back-compat)
const LEGACY_KEY = "travel-os-anthropic-key";          // legacy plain key (pre-mayo 2026)
const CIPHER_KEY = "travel-os-ai-key-cipher";          // NUEVO: ciphertext base64
const API_KEY_AAD = "api-key";                         // domain separation

export type AIProvider = "anthropic" | "gemini" | "unknown";

export function detectProvider(key: string): AIProvider {
  const k = key.trim();
  if (k.startsWith("sk-ant-")) return "anthropic";
  if (k.startsWith("AIza")) return "gemini";
  return "unknown";
}

// ─── In-memory cache: solo vive mientras la app está desbloqueada ──────────
let cachedPlaintext: string | null = null;

// Hookeamos lock → drop cache. Si el user pasa 15 min sin actividad y el
// auto-lock dispara, la API key sale de memoria.
if (typeof window !== "undefined") {
  onLockChange(() => {
    cachedPlaintext = null;
  });
}

/**
 * Lectura sync — la primaria del módulo.
 * Orden de resolución:
 *   1. cache en memoria (rápido, ya descifrado)
 *   2. legacy plain (back-compat para users que aún no migraron)
 *   3. null
 *
 * Si hay cipher pero no master key (app locked), devuelve null. El caller
 * verá "no hay key" y mostrará el prompt — comportamiento idéntico al de
 * "el user no configuró key" desde el punto de vista UX.
 */
export function getUserApiKey(): string | null {
  if (cachedPlaintext) return cachedPlaintext;
  if (typeof localStorage === "undefined") return null;

  // Legacy compatibility — migrar key vieja al unified key.
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy && !localStorage.getItem(STORAGE_KEY) && !localStorage.getItem(CIPHER_KEY)) {
    localStorage.setItem(STORAGE_KEY, legacy);
  }

  // Si hay plain todavía (user no migró), devolverlo y guardar en cache.
  // En el flow nuevo, plain está vacío después de la migración.
  const plain = localStorage.getItem(STORAGE_KEY);
  if (plain) {
    // No metemos en cache si está plain — el cache es solo para descifrado,
    // y leer localStorage es cheap.
    return plain;
  }

  return null;
}

/**
 * Hidrata el cache descifrando el cipher con la master key actual.
 * Llamar después de unlockWithPasscode() — típicamente desde el provider de
 * sesión. Devuelve `true` si descifró OK, `false` si no había nada o falló.
 */
export async function unlockApiKey(): Promise<boolean> {
  if (typeof localStorage === "undefined") return false;
  const cipher = localStorage.getItem(CIPHER_KEY);
  if (!cipher) return false;
  const key = getMasterKey();
  if (!key) return false;
  try {
    cachedPlaintext = await decryptString(key, cipher, API_KEY_AAD);
    return true;
  } catch (err) {
    if (err instanceof DecryptError) {
      // Cipher corrompido o passcode incorrecto. Limpiar cache pero NO el cipher
      // (preservamos data, el user puede retry).
      cachedPlaintext = null;
      return false;
    }
    throw err;
  }
}

export function getUserProvider(): AIProvider {
  const k = getUserApiKey();
  if (!k) return "unknown";
  return detectProvider(k);
}

/**
 * Setear la API key. Si la app tiene passcode + master key → cifra y guarda
 * en CIPHER_KEY. Si no, fallback a plain (legacy compat).
 *
 * IMPORTANTE: esta función es async ahora, pero la mayoría de callsites la
 * llaman fire-and-forget desde un onClick — no esperan el resultado.
 * Mantenemos retorno void para no romper a esos callers.
 */
export function setUserApiKey(key: string | null): void {
  if (typeof localStorage === "undefined") return;

  if (!key || !key.trim()) {
    // Borrar todo (plain + cipher + cache).
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_KEY);
    localStorage.removeItem(CIPHER_KEY);
    cachedPlaintext = null;
    window.dispatchEvent(new Event("travel-os-anthropic-key-change"));
    return;
  }

  const trimmed = key.trim();
  const masterKey = getMasterKey();

  if (masterKey) {
    // Camino seguro: cifrar y persistir cipher. Borrar plain.
    cachedPlaintext = trimmed; // disponible inmediatamente para callers sync
    encryptString(masterKey, trimmed, API_KEY_AAD)
      .then(cipher => {
        try {
          localStorage.setItem(CIPHER_KEY, cipher);
          // Borrar plain SOLO después de que el cipher se haya escrito OK,
          // sino podríamos quedar sin nada en caso de error.
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(LEGACY_KEY);
        } catch (err) {
          console.warn("[user-key] no se pudo escribir cipher:", err);
        }
        window.dispatchEvent(new Event("travel-os-anthropic-key-change"));
      })
      .catch(err => {
        console.error("[user-key] cifrado falló — fallback a plain:", err);
        // Defensivo: si el cifrado falla, guardamos plain antes que perder
        // la key. El user puede re-migrar luego.
        try { localStorage.setItem(STORAGE_KEY, trimmed); } catch { /* ignore */ }
        window.dispatchEvent(new Event("travel-os-anthropic-key-change"));
      });
    return;
  }

  // Sin master key (usuario no configuró passcode todavía).
  // Guardar plain — el banner en /settings le va a recomendar configurar passcode.
  localStorage.setItem(STORAGE_KEY, trimmed);
  localStorage.removeItem(CIPHER_KEY);
  cachedPlaintext = trimmed;
  window.dispatchEvent(new Event("travel-os-anthropic-key-change"));
}

export function hasUserApiKey(): boolean {
  const k = getUserApiKey();
  if (!k) return false;
  const p = detectProvider(k);
  return p === "anthropic" || p === "gemini";
}

/**
 * ¿Hay una API key plana esperando ser migrada al esquema cifrado?
 * Usado por /settings para ofrecer el botón "Migrate to encrypted".
 */
export function hasLegacyPlainApiKey(): boolean {
  if (typeof localStorage === "undefined") return false;
  const plain = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
  return Boolean(plain && plain.trim());
}

/** ¿Hay un ciphertext de API key persistido? (es decir: ya migrado) */
export function hasEncryptedApiKey(): boolean {
  if (typeof localStorage === "undefined") return false;
  const cipher = localStorage.getItem(CIPHER_KEY);
  return Boolean(cipher && looksEncryptedB64(cipher));
}

/**
 * Migración: convertir la key plain a cipher. Requiere que la app esté
 * desbloqueada (master key viva). Idempotente — si ya está cifrada, no-op.
 */
export async function migrateLegacyApiKey(): Promise<{ migrated: boolean; reason?: string }> {
  if (typeof localStorage === "undefined") return { migrated: false, reason: "no-localstorage" };
  if (!(await hasPasscode())) return { migrated: false, reason: "no-passcode" };
  const masterKey = getMasterKey();
  if (!masterKey) return { migrated: false, reason: "locked" };

  const plain = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
  if (!plain || !plain.trim()) return { migrated: false, reason: "no-plain-key" };

  try {
    const cipher = await encryptString(masterKey, plain.trim(), API_KEY_AAD);
    localStorage.setItem(CIPHER_KEY, cipher);
    // Solo borramos plain después del write exitoso.
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_KEY);
    cachedPlaintext = plain.trim();
    return { migrated: true };
  } catch (err) {
    return { migrated: false, reason: (err as Error).message };
  }
}

/** Headers including the API key — sets `x-anthropic-key` or `x-gemini-key` based on prefix. */
export function withApiKeyHeaders(extra?: HeadersInit): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (extra) Object.assign(h, extra);
  const key = getUserApiKey();
  if (!key) return h;
  const p = detectProvider(key);
  if (p === "anthropic") h["x-anthropic-key"] = key;
  else if (p === "gemini") h["x-gemini-key"] = key;
  return h;
}
