// ─── Twilio WhatsApp integration ───
//
// MVP usa el **WhatsApp Sandbox** de Twilio (gratis, instant — los testers
// se unen mandando un código por SMS al número de sandbox). En producción
// migrá a un sender approved por Meta (review 24-48h). Ver
// docs/WHATSAPP-SETUP.md.
//
// Patrón de la dependencia: igual que Stripe (src/lib/billing/stripe.ts).
// La dep `twilio` es opcional. Si no está instalada o las env vars no
// están seteadas, todos los helpers devuelven `{ ok: false, error: ... }`
// sin tirar excepción. Esto permite que el código compile en deploys que
// todavía no tienen Twilio configurado.

import { createHmac } from "crypto";
import type { Twilio } from "twilio";

const TWILIO_SANDBOX_FROM_DEFAULT = "whatsapp:+14155238886";

// `undefined` = no se intentó cargar todavía; `null` = se intentó y falló (no
// reintentamos en este proceso). Una vez seteado a un `Twilio`, las siguientes
// invocaciones reusan la misma instancia.
let twilioClientCache: Twilio | null | undefined;

// El factory que devuelve `import("twilio")` no está bien tipado en el d.ts
// de la dep (mezcla `default` export con la function call), así que lo
// modelamos acá como narrow type sin recurrir a `any` afuera.
type TwilioFactory = (sid: string, token: string) => Twilio;
type TwilioModule = { default?: TwilioFactory } & TwilioFactory;

/**
 * Devuelve el cliente Twilio o null si no se puede instanciar.
 * Cacheado: solo intentamos cargar el módulo una vez por proceso.
 */
export async function getTwilioClient(): Promise<Twilio | null> {
  if (twilioClientCache !== undefined) return twilioClientCache;

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    // eslint-disable-next-line no-console
    console.warn("[twilio] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN no seteadas — WhatsApp deshabilitado");
    twilioClientCache = null;
    return null;
  }

  try {
    // Dynamic import: si la dep no está, cae al catch.
    // Mismo patrón que stripe / sentry.
    const mod = (await import("twilio").catch(() => null)) as TwilioModule | null;
    if (!mod) {
      // eslint-disable-next-line no-console
      console.warn("[twilio] paquete 'twilio' no instalado — corré `npm i twilio` para habilitar WhatsApp");
      twilioClientCache = null;
      return null;
    }
    const factory: TwilioFactory = mod.default ?? mod;
    twilioClientCache = factory(sid, token);
    return twilioClientCache;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[twilio] no se pudo instanciar el cliente:", (err as Error).message);
    twilioClientCache = null;
    return null;
  }
}

/**
 * Devuelve el "From" canónico para Twilio. Default sandbox si no hay env.
 */
export function getTwilioWhatsAppFrom(): string {
  return process.env.TWILIO_WHATSAPP_FROM || TWILIO_SANDBOX_FROM_DEFAULT;
}

/**
 * Normaliza un input del user (puede traer espacios, guiones, "00" en vez
 * de "+", etc) a formato `whatsapp:+E.164` que Twilio espera.
 *
 * Heurística simple:
 *   - sacamos todo lo que no sea dígito o '+'
 *   - si arranca con '00' lo convertimos a '+'
 *   - si no arranca con '+' (asumimos número argentino — el target principal)
 *     prefijamos '+54'
 *
 * Ejemplos:
 *   "11 4040 4040"      -> "whatsapp:+541140404040" (asume AR)
 *   "+54 9 11-4040-4040"-> "whatsapp:+5491140404040"
 *   "0054911..."        -> "whatsapp:+54911..."
 *
 * NOTA: en una iteración futura, agregar un selector de país en el UI
 * y pasarlo como argumento — la heurística de AR-default es buena para MVP
 * con testers conocidos pero rompe para usuarios brasileños/chilenos.
 */
export function formatPhoneForWhatsApp(rawPhone: string, defaultCountry = "54"): string {
  if (!rawPhone) return "";
  let cleaned = rawPhone.trim().replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("00")) {
    cleaned = "+" + cleaned.slice(2);
  }
  if (!cleaned.startsWith("+")) {
    // Si arranca con un código de país conocido (1 a 3 dígitos), no
    // prefijamos nada; si no, asumimos defaultCountry.
    // Heurística simple: si pasa de 10 dígitos asumimos que ya incluye país.
    if (cleaned.length > 10) {
      cleaned = "+" + cleaned;
    } else {
      cleaned = "+" + defaultCountry + cleaned;
    }
  }
  return "whatsapp:" + cleaned;
}

/**
 * Versión "just E.164" (sin el prefix whatsapp:) para guardar en la DB.
 */
export function toE164(rawPhone: string, defaultCountry = "54"): string {
  const wa = formatPhoneForWhatsApp(rawPhone, defaultCountry);
  return wa.replace(/^whatsapp:/, "");
}

/**
 * Extrae el E.164 de un "whatsapp:+5491140404040" que viene del webhook.
 */
export function parseWhatsAppFrom(rawFrom: string): string {
  if (!rawFrom) return "";
  return rawFrom.replace(/^whatsapp:/, "").trim();
}

/**
 * Valida que un string sea un E.164 razonable.
 */
export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone);
}

export interface SendWhatsAppResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Manda un mensaje WhatsApp. `to` puede venir como E.164 (+5491140404040)
 * o ya con prefix (whatsapp:+5491140404040). Normalizamos acá.
 */
export async function sendWhatsAppMessage(to: string, body: string): Promise<SendWhatsAppResult> {
  if (!to || !body) return { ok: false, error: "missing_to_or_body" };

  const client = await getTwilioClient();
  if (!client) return { ok: false, error: "twilio_not_configured" };

  const toFormatted = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const from = getTwilioWhatsAppFrom();

  try {
    const msg = await client.messages.create({ from, to: toFormatted, body });
    return { ok: true, messageId: msg.sid };
  } catch (err) {
    const message = (err as Error).message ?? "unknown";
    // eslint-disable-next-line no-console
    console.error("[twilio] sendWhatsAppMessage failed:", message);
    return { ok: false, error: message };
  }
}

// ─── Webhook signature validation ────────────────────────────────────
//
// Twilio firma cada webhook con HMAC-SHA1 sobre la URL completa concatenada
// con los params ordenados alfabéticamente. Documentación oficial:
//   https://www.twilio.com/docs/usage/webhooks/webhooks-security
//
// Si la firma no valida, el webhook devuelve 403. NO procesamos ni
// guardamos el mensaje.

/**
 * Valida la firma de un webhook Twilio.
 *
 * @param signature  Header X-Twilio-Signature
 * @param url        URL completa del webhook (con query string si aplica)
 * @param params     Parámetros del body parseado (de form-urlencoded)
 * @param authToken  TWILIO_AUTH_TOKEN
 */
export function validateTwilioSignature(
  signature: string | null,
  url: string,
  params: Record<string, string>,
  authToken: string,
): boolean {
  if (!signature || !authToken || !url) return false;
  try {
    // Twilio: la cadena a firmar es url + concatenación de cada (key + value)
    // con las keys ordenadas alfabéticamente.
    const sortedKeys = Object.keys(params).sort();
    const data = sortedKeys.reduce((acc, key) => acc + key + (params[key] ?? ""), url);

    const expected = createHmac("sha1", authToken)
      .update(Buffer.from(data, "utf-8"))
      .digest("base64");

    // Constant-time compare
    if (expected.length !== signature.length) return false;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return mismatch === 0;
  } catch {
    return false;
  }
}

/**
 * Construye una respuesta TwiML válida para el webhook. Twilio espera
 * `application/xml` con la estructura `<Response><Message>...</Message></Response>`.
 * Si `body` está vacío, devolvemos un `<Response/>` empty (ack sin reply).
 */
export function twimlResponse(body?: string): string {
  if (!body) return '<?xml version="1.0" encoding="UTF-8"?><Response/>';
  // XML-escape básico para los caracteres que rompen el parseo.
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}

/**
 * Genera un código numérico de 6 dígitos para verificación. Usa
 * crypto.randomInt si está disponible (Node), si no Math.random como
 * fallback (no debería pasar en el server pero por las dudas).
 */
export function generateVerificationCode(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { randomInt } = require("crypto");
    const n = randomInt(0, 1_000_000);
    return n.toString().padStart(6, "0");
  } catch {
    return Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
  }
}

/**
 * Detecta si un mensaje entrante es probablemente un código de verificación.
 * Aceptamos:
 *   - "123456"
 *   - "Tampu 123456"
 *   - "código 123456"
 *   - "el código es 123456"
 *   - "123-456" / "123 456"
 *
 * Devuelve el código en formato canónico (6 dígitos) o null.
 */
export function extractVerificationCode(body: string): string | null {
  if (!body) return null;
  // Permitimos espacios / guiones internos.
  const cleaned = body.replace(/[\s\-]/g, "");
  const match = cleaned.match(/(?<!\d)(\d{6})(?!\d)/);
  return match ? match[1] : null;
}
