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
  // Tarjeta de crédito: 13-16 dígitos con o sin espacios/guiones.
  // Capturamos antes de IDs porque las CC suelen tener más dígitos.
  { regex: /\b(?:\d[ -]*?){13,16}\b/g, replacement: "[CARD]" },
  // CVV — solo cuando viene precedido del label.
  { regex: /CVV[:\s]*\d{3,4}/gi, replacement: "CVV: [CVV]" },
  // DNI argentino — 7-8 dígitos con label.
  { regex: /\bDNI[:\s]*\d{7,8}\b/gi, replacement: "DNI: [DNI]" },
  // CUIT argentino — formato XX-XXXXXXXX-X.
  { regex: /\b\d{2}-\d{8}-\d\b/g, replacement: "[CUIT]" },
  // Pasaporte / DNI extranjero — patron genérico: 1-3 letras + 6-9 dígitos.
  // Esto puede tener falsos positivos (locators tipo "ABC123456"), pero los
  // locators no son sensibles igual.
  { regex: /\b[A-Z]{1,3}\d{6,9}\b/g, replacement: "[ID]" },
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
