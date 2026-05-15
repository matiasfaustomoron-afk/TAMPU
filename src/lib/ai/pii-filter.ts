// ─── PII filter pre-LLM ─────────────────────────────────────────────────
//
// Sanitiza el texto que mandamos a los providers IA (Anthropic/Gemini) ANTES
// de salir de nuestra infra. Reemplaza patrones sensibles típicos en emails
// de confirmación / boarding passes / fotos de pasaporte por placeholders.
//
// Cuándo aplicar:
//   - `/api/parse-booking` y `/api/parse-email-confirmation`: el user pega
//     emails crudos que suelen incluir el número de pasaporte, CVV, DNI/CUIT.
//   - `/api/classify-document`: el texto del filename y los hints OCR pueden
//     traer IDs. La imagen NO se filtra (la mandamos full al modelo, es feature).
//
// Cuándo NO aplicar:
//   - `/api/assistant`, `/api/generate-itinerary`: el contexto viene de la DB
//     del user, donde los IDs ya están en columnas dedicadas (passport_number,
//     etc) y no son texto libre.
//
// Las regex priorizan recall sobre precision — preferimos enmascarar de más
// que filtrar de menos. False positives (un número de 13 dígitos que NO es
// tarjeta) solo arruinan la respuesta del LLM, no exfiltran data.

const PATTERNS = [
  // Tarjeta de crédito — formato con separators (4-4-4-4) SIEMPRE matchea.
  // Cubre "1234 5678 9012 3456" o "1234-5678-9012-3456".
  { regex: /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, replacement: "[CARD]" },
  // Tarjeta de crédito sin separators — REQUIERE label precedente (card,
  // tarjeta, visa, mastercard, amex, credit, debito, debit) para no
  // over-maskear order IDs largos / totals / IATA timestamps que también
  // tienen 13-16 dígitos. Antes el regex `\b\d{13,16}\b` matcheaba cualquier
  // número largo y rompía la extracción de "Reserva 1234567890123".
  { regex: /(?<=\b(?:card|tarjeta|visa|mastercard|amex|credit|cr[eé]dito|debito|d[eé]bito|debit)\b[\s:#]*)\d{13,16}\b/gi, replacement: "[CARD]" },
  // CVV — solo cuando viene precedido del label.
  { regex: /CVV[:\s]*\d{3,4}/gi, replacement: "CVV: [CVV]" },
  // DNI argentino — con label, formato con puntos opcionales (35.123.456) o sin (35123456).
  { regex: /\bDNI\s*[Nn]?[°º]?[:\s]*\d{1,3}\.?\d{3}\.?\d{3,4}\b/g, replacement: "DNI: [DNI]" },
  // CUIT argentino — formato XX-XXXXXXXX-X con prefijos válidos AFIP
  // (20, 23, 24, 27 = personas físicas; 30, 33, 34 = personas jurídicas).
  // Antes el regex aceptaba cualquier prefijo de 2 dígitos, lo que enmascaraba
  // números aleatorios con shape similar (ej. "99-12345678-9").
  { regex: /\b(?:20|23|24|27|30|33|34)-\d{8}-\d\b/g, replacement: "[CUIT]" },
  // Pasaporte / DNI extranjero — exige label precedente (passport, pasaporte,
  // documento, etc) para no over-maskear PNRs/locators de booking que tienen
  // shape similar (ABC123456). El patrón sin label rompía la extracción de
  // confirmation codes en parse-booking / parse-email-confirmation.
  { regex: /\b(?:passport|pasaporte|pasap\.?|documento)[:\s]+[A-Z]{1,3}\d{6,9}\b/gi, replacement: "[ID]" },
  // CBU argentino — 22 dígitos consecutivos. Si vienen con label
  // (`CBU 1234...` / `alias CBU: ...`), matcheamos primero el label-form para
  // no comerse el label. El bare 22-digit lo cubre el segundo regex (preceded
  // por word boundary). Recall > precision: si hay 22 dígitos seguidos en un
  // email de booking, casi seguro es CBU.
  { regex: /\b(?:cbu|alias\s*cbu)\b[:\s#]*\d{22}\b/gi, replacement: "[CBU]" },
  { regex: /\b\d{22}\b/g, replacement: "[CBU]" },
  // IBAN europeo — 2 letras país + 2 dígitos check + 11..30 alphanumerics
  // (sin spaces; el patrón con spaces tipo `ES12 3456 7890` lo dejamos
  // afuera por simplicidad — la mayoría de los emails lo traen sin spaces o
  // con separadores cada 4 chars, que normalizamos en el parser).
  { regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, replacement: "[IBAN]" },
] as const;

/**
 * Reemplaza patrones PII conocidos por placeholders. Devuelve string nuevo
 * (no muta). Si el texto está vacío o es null, devuelve "".
 *
 * Idempotente: aplicar 2 veces el mismo texto da el mismo resultado.
 */
export function maskPII(text: string | null | undefined): string {
  if (!text) return "";
  let out = text;
  for (const { regex, replacement } of PATTERNS) {
    out = out.replace(regex, replacement);
  }
  return out;
}

/**
 * Devuelve true si el texto contiene al menos un patrón PII. Útil para
 * logging / telemetría (no mostrar texto del user al operator).
 *
 * Nota: NO usamos `regex.test()` porque las patterns tienen flag /g que
 * preserva lastIndex entre calls. Usamos `String.match()` que es state-less.
 */
export function containsPII(text: string | null | undefined): boolean {
  if (!text) return false;
  return PATTERNS.some(({ regex }) => text.match(regex) !== null);
}
