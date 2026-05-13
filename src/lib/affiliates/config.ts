/**
 * Tampu — Affiliate configuration.
 *
 * Single source of truth para cada partner: tracking ID (vía ENV), rate de comisión,
 * conditions, y builder de URL final.
 *
 * REGLA HONESTA: el badge "Tampu gana $X" solo aparece si `process.env.NEXT_PUBLIC_AFFILIATE_<PARTNER>_ID`
 * está seteado en runtime. Sin ENV = sin badge. Sin badge = link directo sin trackeo, sin ganancia,
 * sin mentir al usuario.
 *
 * Activación por partner:
 *  - Booking.com: aplicar a Booking Partner Hub → recibir `aid` (advertiser ID) → `NEXT_PUBLIC_AFFILIATE_BOOKING_ID`
 *  - GetYourGuide: aplicar a GYG Partner → `partner_id` → `NEXT_PUBLIC_AFFILIATE_GYG_ID`
 *  - Viator: TripAdvisor Affiliate Network → `pid` → `NEXT_PUBLIC_AFFILIATE_VIATOR_ID`
 *  - Heymondo: enviar email a partners@heymondo.com → afiliado ID → `NEXT_PUBLIC_AFFILIATE_HEYMONDO_ID`
 *  - Airalo: Airalo Partner Program (sandbox abierto) → `partner_id` → `NEXT_PUBLIC_AFFILIATE_AIRALO_ID`
 *  - Holafly: aplicar email partners@holafly.com → código → `NEXT_PUBLIC_AFFILIATE_HOLAFLY_ID`
 *  - Hostelworld: HW Affiliate Hub → `affid` → `NEXT_PUBLIC_AFFILIATE_HOSTELWORLD_ID`
 *  - IATI Seguros: aplicar email afiliados@iati.com → código → `NEXT_PUBLIC_AFFILIATE_IATI_ID`
 *  - Trainline: aplicar a Trainline Affiliate → `aff` → `NEXT_PUBLIC_AFFILIATE_TRAINLINE_ID`
 *
 * Si el partner NO acepta a Tampu (algunos requieren tráfico mínimo previo),
 * dejamos el link directo sin trackeo. El usuario sigue ganando: ve la app, puede
 * comprar. No tiene que perder esa opción solo porque no nos pagan.
 */

export type Partner =
  | "booking"
  | "airbnb"
  | "hostelworld"
  | "getyourguide"
  | "viator"
  | "trainline"
  | "heymondo"
  | "iati"
  | "assistcard"
  | "airalo"
  | "holafly"
  | "skyscanner"
  | "google-flights"
  | "kayak";

interface PartnerSpec {
  /** Display name */
  name: string;
  /** Base domain for the affiliate link */
  baseUrl: string;
  /** Tracking param key (ej. "aid", "partner_id"). Null si el partner no tiene programa. */
  trackingParam: string | null;
  /**
   * Si el partner tiene programa de afiliados pero ENV no está seteada,
   * usamos este placeholder rate como info al user (badge dice "puede ganar $4 si activamos").
   * Si null → sin programa público.
   */
  expectedRate: { amount: number; currency: string; conditions: string } | null;
  /** Env var que activa la afiliación real */
  envKey: string | null;
}

export const PARTNER_CONFIG: Record<Partner, PartnerSpec> = {
  // ─── Vuelos — los más grandes no tienen CPA público abierto ───
  "skyscanner": {
    name: "Skyscanner",
    baseUrl: "https://www.skyscanner.net/transport/flights-to/",
    trackingParam: null,
    expectedRate: null,
    envKey: null,
  },
  "google-flights": {
    name: "Google Flights",
    baseUrl: "https://www.google.com/travel/flights",
    trackingParam: null,
    expectedRate: null,
    envKey: null,
  },
  "kayak": {
    name: "Kayak",
    baseUrl: "https://www.kayak.com/flights/destination/",
    trackingParam: null,
    expectedRate: null,
    envKey: null,
  },

  // ─── Hoteles ───
  "booking": {
    name: "Booking.com",
    baseUrl: "https://www.booking.com/searchresults.html",
    trackingParam: "aid",
    expectedRate: { amount: 4.0, currency: "USD", conditions: "por estadía completada" },
    envKey: "NEXT_PUBLIC_AFFILIATE_BOOKING_ID",
  },
  "airbnb": {
    name: "Airbnb",
    baseUrl: "https://www.airbnb.com/s/",
    trackingParam: null, // Airbnb cerró su programa de afiliados público en 2021
    expectedRate: null,
    envKey: null,
  },
  "hostelworld": {
    name: "Hostelworld",
    baseUrl: "https://www.hostelworld.com/findabed.php",
    trackingParam: "affid",
    expectedRate: { amount: 1.5, currency: "USD", conditions: "por reserva confirmada" },
    envKey: "NEXT_PUBLIC_AFFILIATE_HOSTELWORLD_ID",
  },

  // ─── Experiencias ───
  "getyourguide": {
    name: "GetYourGuide",
    baseUrl: "https://www.getyourguide.com/s/",
    trackingParam: "partner_id",
    expectedRate: { amount: 2.5, currency: "USD", conditions: "por experiencia reservada" },
    envKey: "NEXT_PUBLIC_AFFILIATE_GYG_ID",
  },
  "viator": {
    name: "Viator",
    baseUrl: "https://www.viator.com/search/",
    trackingParam: "pid",
    expectedRate: { amount: 3.0, currency: "USD", conditions: "por tour reservado" },
    envKey: "NEXT_PUBLIC_AFFILIATE_VIATOR_ID",
  },

  // ─── Trenes ───
  "trainline": {
    name: "Trainline",
    baseUrl: "https://www.thetrainline.com/trains/",
    trackingParam: "aff",
    expectedRate: { amount: 0.5, currency: "USD", conditions: "por billete" },
    envKey: "NEXT_PUBLIC_AFFILIATE_TRAINLINE_ID",
  },

  // ─── Seguros ───
  "heymondo": {
    name: "Heymondo",
    baseUrl: "https://www.heymondo.com/",
    trackingParam: "agencyid",
    expectedRate: { amount: 8.0, currency: "USD", conditions: "por póliza comprada" },
    envKey: "NEXT_PUBLIC_AFFILIATE_HEYMONDO_ID",
  },
  "iati": {
    name: "IATI Seguros",
    baseUrl: "https://www.iatiseguros.com/",
    trackingParam: "iframe_id",
    expectedRate: { amount: 6.0, currency: "USD", conditions: "por póliza comprada" },
    envKey: "NEXT_PUBLIC_AFFILIATE_IATI_ID",
  },
  "assistcard": {
    name: "Assist Card",
    baseUrl: "https://www.assistcard.com/",
    trackingParam: null,
    expectedRate: null,
    envKey: null,
  },

  // ─── eSIM ───
  "airalo": {
    name: "Airalo",
    baseUrl: "https://www.airalo.com/",
    trackingParam: "ref",
    expectedRate: { amount: 1.0, currency: "USD", conditions: "por eSIM activada" },
    envKey: "NEXT_PUBLIC_AFFILIATE_AIRALO_ID",
  },
  "holafly": {
    name: "Holafly",
    baseUrl: "https://esim.holafly.com/",
    trackingParam: "ref",
    expectedRate: { amount: 1.5, currency: "USD", conditions: "por plan activado" },
    envKey: "NEXT_PUBLIC_AFFILIATE_HOLAFLY_ID",
  },
};

/**
 * Construye la URL final para un partner. Si tiene `envKey` y la env está seteada,
 * agrega el tracking param. Si no, devuelve la URL pura.
 *
 * @param partner — clave del partner
 * @param path — path/query a appendear (depende de cada partner; ej "Cancun" para
 *               Booking searchresults o "?q=Buenos+Aires" para GYG)
 */
export function buildAffiliateUrl(partner: Partner, path: string): string {
  const spec = PARTNER_CONFIG[partner];
  const trackingId =
    spec.envKey && typeof process !== "undefined" ? process.env[spec.envKey] : undefined;

  // URL base + path
  let url = spec.baseUrl;
  if (path) {
    // Si baseUrl termina en `/` y path no empieza con `?`, append path. Si path empieza
    // con `?`, append como query.
    if (path.startsWith("?")) url += path;
    else url += encodeURIComponent(path);
  }

  // Si hay tracking ID real, agregarlo
  if (trackingId && spec.trackingParam) {
    const sep = url.includes("?") ? "&" : "?";
    url += `${sep}${spec.trackingParam}=${encodeURIComponent(trackingId)}`;
  }

  return url;
}

/**
 * Devuelve true si el partner está REALMENTE activado (tracking ID en ENV).
 * El badge "Tampu gana $X" solo se muestra cuando esto es true.
 */
export function isPartnerActive(partner: Partner): boolean {
  const spec = PARTNER_CONFIG[partner];
  if (!spec.envKey) return false;
  const trackingId = typeof process !== "undefined" ? process.env[spec.envKey] : undefined;
  return !!trackingId;
}

/**
 * Conteo de partners realmente activos. Usado por el footer del BookingLinks.
 */
export function countActivePartners(): number {
  return (Object.keys(PARTNER_CONFIG) as Partner[]).filter(isPartnerActive).length;
}
