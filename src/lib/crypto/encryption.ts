"use client";

/**
 * Tampu — AES-GCM(256) wrapper sobre WebCrypto.
 *
 * Audit finding (mayo 2026): API key y vault blobs viajan plain at-rest.
 * Esto los cifra con una master key derivada del passcode del user (ver passcode.ts).
 *
 * Diseño:
 *  - AES-GCM con IV random de 96 bits per ciphertext.
 *  - Output framing: base64(version || iv(12) || ciphertext+tag(16))
 *  - version = 0x01 — primer release del esquema. Si cambiamos el algoritmo
 *    en el futuro (ej. XChaCha20 si arriba un plugin nativo), bumpeamos.
 *  - AAD opcional como "purpose tag" — domain separation entre la api-key y
 *    cada blob del vault, así un ciphertext no puede ser interpretado en otro
 *    contexto (defense-in-depth si alguien jugara a swappear keys del KV).
 *  - Sin libs externas. WebCrypto API es nativa en browser + Capacitor WebView
 *    iOS 15+ (confirmado). Bundle size: 0 KB extra.
 *
 * Lo que NO hace este módulo:
 *  - Derivación de la master key — vive en passcode.ts (PBKDF2).
 *  - Storage — solo cifra/descifra. El caller decide dónde poner el ciphertext.
 *  - Key rotation — out of scope para v1. Si el user cambia el passcode, los
 *    datos se re-cifran on-the-fly (ver passcode.ts → changePasscode).
 */

const SCHEME_VERSION = 0x01;
const IV_BYTES = 12; // 96 bits, GCM standard
const TAG_BITS = 128; // GCM auth tag length

/** Errores que el caller puede atrapar para mostrar UI específica. */
export class DecryptError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "DecryptError";
  }
}

function getCrypto(): Crypto {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("WebCrypto no disponible — navegador o WebView muy viejo");
  }
  return crypto;
}

/** base64 ↔ Uint8Array (browser native, sin deps). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Cifra arbitrary bytes. AAD opcional para domain separation. */
export async function encryptBytes(
  key: CryptoKey,
  plaintext: Uint8Array,
  aad?: string,
): Promise<Uint8Array> {
  const c = getCrypto();
  const iv = c.getRandomValues(new Uint8Array(IV_BYTES));
  const params: AesGcmParams = {
    name: "AES-GCM",
    iv,
    tagLength: TAG_BITS,
  };
  if (aad) params.additionalData = new TextEncoder().encode(aad);

  const ct = new Uint8Array(await c.subtle.encrypt(params, key, plaintext as BufferSource));
  // Output: [version(1) || iv(12) || ciphertext+tag]
  const out = new Uint8Array(1 + IV_BYTES + ct.length);
  out[0] = SCHEME_VERSION;
  out.set(iv, 1);
  out.set(ct, 1 + IV_BYTES);
  return out;
}

/** Descifra bytes producidos por encryptBytes. AAD debe matchear bit-a-bit. */
export async function decryptBytes(
  key: CryptoKey,
  framed: Uint8Array,
  aad?: string,
): Promise<Uint8Array> {
  if (framed.length < 1 + IV_BYTES + 16) {
    throw new DecryptError("ciphertext demasiado corto");
  }
  const version = framed[0];
  if (version !== SCHEME_VERSION) {
    throw new DecryptError(`scheme version desconocida: ${version}`);
  }
  // Copiamos a buffers nuevos para evitar el roce TS estricto con `Uint8Array<ArrayBufferLike>` vs `ArrayBuffer`.
  // En runtime es no-op de performance — los buffers son pequeños (IV=12, ct = blob size).
  const iv = new Uint8Array(framed.subarray(1, 1 + IV_BYTES));
  const ct = new Uint8Array(framed.subarray(1 + IV_BYTES));

  const params: AesGcmParams = {
    name: "AES-GCM",
    iv: iv as BufferSource,
    tagLength: TAG_BITS,
  };
  if (aad) params.additionalData = new TextEncoder().encode(aad);

  try {
    const c = getCrypto();
    const pt = await c.subtle.decrypt(params, key, ct as BufferSource);
    return new Uint8Array(pt);
  } catch (err) {
    // WebCrypto throws OperationError on tag mismatch (auth failed) — no info leak.
    throw new DecryptError("descifrado falló · tag o key incorrectos: " + (err as Error).message);
  }
}

/** Conveniencia: cifra un string UTF-8 → base64 framed ciphertext. */
export async function encryptString(key: CryptoKey, plain: string, aad?: string): Promise<string> {
  const bytes = new TextEncoder().encode(plain);
  const ct = await encryptBytes(key, bytes, aad);
  return bytesToBase64(ct);
}

/** Conveniencia: descifra base64 framed ciphertext → string UTF-8. */
export async function decryptString(key: CryptoKey, b64: string, aad?: string): Promise<string> {
  const framed = base64ToBytes(b64);
  const pt = await decryptBytes(key, framed, aad);
  return new TextDecoder().decode(pt);
}

/** Cifra un Blob completo (vault). Devuelve Uint8Array para que el caller lo guarde donde quiera. */
export async function encryptBlob(key: CryptoKey, blob: Blob, aad?: string): Promise<Uint8Array> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  return encryptBytes(key, buf, aad);
}

/** Descifra bytes producidos por encryptBlob y reconstruye un Blob con el mime que pase el caller. */
export async function decryptToBlob(
  key: CryptoKey,
  framed: Uint8Array,
  mimeType: string,
  aad?: string,
): Promise<Blob> {
  const pt = await decryptBytes(key, framed, aad);
  // TS estricto: Uint8Array<ArrayBufferLike> no satisface BlobPart por differencia de buffer type.
  // Pasamos el ArrayBuffer subyacente que sí es asignable.
  return new Blob([pt.buffer as ArrayBuffer], { type: mimeType });
}

/** Detección rápida: ¿estos bytes tienen el framing de Tampu? Útil para migration paths. */
export function looksEncrypted(framed: Uint8Array): boolean {
  return framed.length >= 1 + IV_BYTES + 16 && framed[0] === SCHEME_VERSION;
}

/** Versión string: mismo cheque pero sobre un base64 (lo usamos en localStorage). */
export function looksEncryptedB64(b64: string): boolean {
  // Cheap structural check sin decodear todo. Sirve para detectar si una key
  // ya está cifrada vs. plain "sk-ant-..." / "AIza...".
  if (!b64 || b64.length < 40) return false;
  if (b64.startsWith("sk-") || b64.startsWith("AIza")) return false; // plain api keys
  try {
    const bytes = base64ToBytes(b64);
    return looksEncrypted(bytes);
  } catch {
    return false;
  }
}
