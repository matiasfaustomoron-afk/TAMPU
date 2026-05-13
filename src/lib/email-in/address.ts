// ─── Email-in per-trip address ───
//
// Cada Trip tiene una dirección estable a la que el user puede forwardear
// emails (vuelos, hoteles, traslados). El "+suffix" se mapea al trip_id.
//
// Ej. tampu+abc12345@in.tampu.app  → trip cuyo short_id = "abc12345"
//
// El short_id se deriva determinísticamente del UUID del trip (primeros 8
// chars del UUID sin guiones, en lowercase). Es público porque la dirección
// va en la firma del email — un atacante que la conozca solo puede MANDAR
// reservas falsas, no leer las que están adentro. La protección real es:
//   - shared secret en el header del webhook (SES/Mailgun)
//   - rate-limit (TODO)
//   - el user tiene que aprobar cada parseo en /inbox antes de commitear

export const EMAIL_IN_DOMAIN = process.env.NEXT_PUBLIC_EMAIL_IN_DOMAIN || "in.tampu.app";
export const EMAIL_IN_LOCAL = process.env.NEXT_PUBLIC_EMAIL_IN_LOCAL || "tampu";

/**
 * Deriva el short_id de un trip UUID. 8 chars hex en lowercase.
 *
 * Determinístico: el mismo trip_id siempre da el mismo short_id, así que la
 * address es estable en la vida del trip y se puede imprimir/forwardear sin
 * miedo a que cambie.
 */
export function tripShortId(tripId: string): string {
  return tripId.replace(/-/g, "").slice(0, 8).toLowerCase();
}

/** Construye la address completa: `tampu+abc12345@in.tampu.app`. */
export function emailInAddress(tripId: string): string {
  return `${EMAIL_IN_LOCAL}+${tripShortId(tripId)}@${EMAIL_IN_DOMAIN}`;
}

/**
 * Extrae el short_id del recipient en un payload de webhook.
 *
 * Soporta variaciones:
 *   tampu+abc12345@in.tampu.app
 *   "Travel OS" <tampu+abc12345@in.tampu.app>
 *   tampu+abc12345+otra@in.tampu.app  (toma solo el primer suffix)
 *
 * Devuelve null si no encuentra un suffix válido (8 hex chars).
 */
export function extractTripShortIdFromAddress(addr: string): string | null {
  if (!addr) return null;
  // Si viene como "Nombre <addr>", quedate con lo de adentro
  const bracket = addr.match(/<([^>]+)>/);
  const clean = (bracket ? bracket[1] : addr).trim().toLowerCase();
  // Match: local+SUFFIX@domain — capturamos SUFFIX antes del próximo + o @
  const m = clean.match(/^[a-z0-9._-]+\+([a-f0-9]{6,16})(?:\+[^@]*)?@/);
  if (!m) return null;
  return m[1].slice(0, 8); // siempre 8 chars hex
}

/**
 * Match: dado un short_id devuelto por el parser, busca el trip cuyo UUID empieza
 * con esos chars. Usa `like` SQL en Supabase.
 *
 * Hay un riesgo teórico de colisión (2 trips con mismo prefijo de 8 hex), pero
 * con 16^8 = 4.3 billones de combinaciones es despreciable para un user que
 * no va a tener más de ~50 trips.
 */
export function buildTripIdLikePattern(shortId: string): string {
  // UUIDs en Postgres son comparables como text con LIKE. Insertamos el guión
  // en posición 8 para matchear el formato canónico.
  if (shortId.length < 8) return `${shortId}%`;
  return `${shortId.slice(0, 8)}-%`;
}

// ─── Spec-friendly aliases ─────────────────────────────────────────────────
//
// Nombres más legibles para uso externo. Son thin wrappers de las funciones de
// arriba para no romper backward-compat con el resto del repo, que ya consume
// `emailInAddress` / `extractTripShortIdFromAddress`.

/** Alias de `emailInAddress(tripId)`. Devuelve `tampu+<shortId>@in.tampu.app`. */
export function getInboxAddress(tripId: string): string {
  return emailInAddress(tripId);
}

/**
 * Parsea una address de inbox y devuelve `{ tripShortId }` o `null` si no matchea.
 * Wrapper de `extractTripShortIdFromAddress` con shape de objeto.
 */
export function parseInboxAddress(toAddress: string): { tripShortId: string } | null {
  const sid = extractTripShortIdFromAddress(toAddress);
  return sid ? { tripShortId: sid } : null;
}
