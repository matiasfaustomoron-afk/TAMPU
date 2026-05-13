/**
 * Email-parser heurístico — Tampu.
 *
 * Esta es la red de seguridad cuando NO hay LLM key conectada (privacy mode) o
 * cuando el LLM falla. Usa regex multilingüe + detección de carrier por dominio
 * y palabras clave, y devuelve UNO O VARIOS bookings por texto.
 *
 * No reemplaza al LLM. Está diseñada para ser BARATA, RÁPIDA y DETERMINISTA.
 * Confidence siempre devuelve "low" a menos que coincidan los 4 campos clave.
 */

export type BookingType =
  | "flight"
  | "accommodation"
  | "train"
  | "bus"
  | "tour"
  | "insurance"
  | "connectivity"
  | "transfer"
  | "other";

export type BookingStatus = "pending" | "booked" | "confirmed" | "paid";

export interface ParsedBooking {
  type: BookingType;
  provider: string;
  city_name: string | null;
  description: string;
  use_date: string | null;
  use_end_date: string | null;
  payment_deadline: string | null;
  original_amount: number;
  original_currency: string;
  status: BookingStatus;
  locator: string | null;
  contact: string | null;
  is_cancellable: boolean | null;
  cancellation_policy: string | null;
  notes: string;
  confidence: "high" | "medium" | "low";
}

export interface HeuristicResult {
  bookings: ParsedBooking[];
  languages: string[];
  carrier_hint: string | null;
}

// ─── Detectores ─────────────────────────────────────────────────────────────

// ORDEN IMPORTA: OTAs primero porque son el "owner" del email cuando empaquetan
// vuelo + hotel de varios proveedores. Si el email tiene "Almundo" + "Aerolineas
// Argentinas", el carrier_hint correcto es Almundo (es Almundo quien te vendió
// el paquete), no la aerolínea operadora.
const CARRIER_PATTERNS: Array<{ name: string; re: RegExp }> = [
  // OTAs / agregadores — prioridad máxima
  { name: "Despegar",              re: /\bdespegar\b|\bdespegar\.com\b/i },
  { name: "Decolar",               re: /\bdecolar\b|\bdecolar\.com\b/i },
  { name: "Almundo",               re: /\balmundo\b|\balmundo\.com\b/i },
  { name: "Expedia",               re: /\bexpedia\b/i },
  { name: "Booking.com",           re: /\bbooking\.com\b/i },
  { name: "Airbnb",                re: /\bairbnb\b|\bairbnb\.com\b/i },
  // Airlines LatAm
  { name: "LATAM Airlines",        re: /\blatam(\s+airlines)?\b|\blatam\.com\b/i },
  { name: "Aerolineas Argentinas", re: /\baerol[ií]neas\s+argentinas\b|\baerolineas\.com\.ar\b/i },
  { name: "Gol",                   re: /\bgol\s+linhas?\b|\bvoegol\.com\.br\b|^gol\b/im },
  { name: "Azul",                  re: /\bazul\s+linhas?\b|\bvoeazul\.com\.br\b/i },
  { name: "Avianca",               re: /\bavianca\b|\bavianca\.com\b/i },
  { name: "Copa Airlines",         re: /\bcopa\s+airlines?\b|\bcopaair\.com\b/i },
  { name: "JetSmart",              re: /\bjetsmart\b|\bjetsmart\.com\b/i },
  { name: "Sky Airline",           re: /\bsky\s+airline\b|\bskyairline\.com\b/i },
  // Airlines globales
  { name: "Iberia",                re: /\biberia\b/i },
  { name: "American Airlines",     re: /\bamerican\s+airlines\b|\baa\.com\b/i },
  { name: "Delta",                 re: /\bdelta\s+air(?:\s+lines)?\b|\bdelta\.com\b/i },
  { name: "United",                re: /\bunited\s+airlines?\b/i },
  { name: "Lufthansa",             re: /\blufthansa\b/i },
];

function detectCarrier(text: string): string | null {
  for (const c of CARRIER_PATTERNS) if (c.re.test(text)) return c.name;
  return null;
}

function detectLanguages(text: string): string[] {
  const langs: string[] = [];
  // PT-BR specific
  if (/\b(voo|embarque|reserva|c[óo]digo|sa[ií]da|chegada|passageir|hospedagem|ap[óo]lice)\b/i.test(text)) langs.push("pt");
  // ES — incluye dominio seguros/asistencia/transfer/traslado (no solo aviación)
  if (/\b(vuelo|reserva|c[óo]digo|llegada|salida|pasajero|aerol[ií]nea|p[óo]liza|cobertura|asistencia|traslado|aeropuerto|hu[ée]sped|hotel|huesped|pagado|chofer|seguro)\b/i.test(text)) langs.push("es");
  // EN
  if (/\b(flight|departure|arrival|boarding|confirmation|passenger|reservation|policy|coverage|transfer|airport|check[-\s]?in|guest|host|paid)\b/i.test(text)) langs.push("en");
  // FR
  if (/\b(vol|réservation|d[ée]part|arriv[ée]e|passager|police|assurance)\b/i.test(text)) langs.push("fr");
  // IT
  if (/\b(volo|prenotazione|partenza|arrivo|passeggero|polizza|copertura)\b/i.test(text)) langs.push("it");
  return langs.length > 0 ? Array.from(new Set(langs)) : ["unknown"];
}

// ORDEN IMPORTA: patrones MÁS específicos arriba.
// - connectivity arriba de insurance porque emails de eSIM mencionan "Coverage" (zonas)
//   pero NO son seguros. La palabra connectivity-specific (esim/airalo) gana primero.
// - transfer y connectivity y insurance arriba de flight porque emails de traslado
//   al aeropuerto mencionan "vuelo" como referencia y emails de eSIM mencionan paises
//   con códigos IATA — pero no son vuelos en sí mismos.
// - insurance ya NO matchea "cover/coverage" suelto (era muy ambiguo, generaba
//   falsos positivos en eSIM y carrier coverage descriptions).
const TYPE_KEYWORDS: Array<{ type: BookingType; re: RegExp }> = [
  { type: "transfer",     re: /\btransfer|traslado|shuttle|chauffeur|remis|chofer\b/i },
  { type: "connectivity", re: /\besim|sim\s*card|airalo|holafly|connectivity|datos|roaming\b/i },
  { type: "insurance",    re: /\binsurance|seguro|p[óo]liza|assist\s*card|assistcard|heymondo|iati|asistencia\s+24|cover\s+(your|us|me)\b/i },
  { type: "tour",         re: /\btour|excursion|excursi[óo]n|safari|passeio\b/i },
  { type: "train",        re: /\btrain|tren|trem|amtrak|renfe|trenitalia|sncf\b/i },
  { type: "bus",          re: /\bbus|[óo]mnibus|micro|colectivo|onibus|coach\b/i },
  { type: "flight",       re: /\bflight|vuelo|voo|vol\b|volo|airline|gate|boarding|embarque|board(?:ing)?\s*pass\b/i },
  { type: "accommodation",re: /\bhotel|airbnb|hostal|hostel|alojamiento|hospedagem|hospedaje|check[-\s]?in|check[-\s]?out|noche|noites|nights?\b/i },
];

function detectType(segment: string): BookingType {
  for (const t of TYPE_KEYWORDS) if (t.re.test(segment)) return t.type;
  return "other";
}

// ─── Field extractors ──────────────────────────────────────────────────────

function extractLocator(text: string): string | null {
  return (
    text.match(
      /(?:booking|pnr|locator|localizador|c[óo]digo(?:\s+de)?\s*(?:reserva|reservaci[óo]n|confirma[çc][ãa]o)|reference|ref[: #]+)[: \-#]*([A-Z0-9]{5,10})\b/i
    )?.[1] || null
  );
}

function extractCurrency(text: string): string {
  return (
    text.match(/\b(USD|EUR|ARS|BRL|CLP|COP|MXN|PEN|UYU|PYG|KRW|PGK|PHP|AED|GBP|JPY|CHF|CAD|AUD)\b/)?.[0] ||
    "USD"
  );
}

function extractAmount(text: string): number {
  // Prefer "total: $X" patterns over loose number matches
  const m =
    text.match(
      /(?:total|amount|importe|monto|valor|pre[çc]o|precio)[\s:]*[A-Z]{0,3}\s*[$€£R]*\s*([\d.,]+)/i
    ) || text.match(/(?:USD|EUR|ARS|BRL|R\$|\$|€|£)\s*([\d.,]+)/);
  if (!m) return 0;
  const raw = m[1].replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = parseFloat(raw);
  return isFinite(n) ? n : 0;
}

function extractDate(segment: string): string | null {
  // ISO first
  const iso = segment.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  if (iso) return iso;

  // DD/MM/YYYY or MM/DD/YYYY — assume DD/MM (LatAm/EU bias)
  const ddmm = segment.match(/\b(\d{2})[/\-.](\d{2})[/\-.](\d{2,4})\b/);
  if (ddmm) {
    const dd = ddmm[1].padStart(2, "0");
    const mm = ddmm[2].padStart(2, "0");
    let yyyy = ddmm[3];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${yyyy}-${mm}-${dd}`;
  }

  // "15 ago 2026" / "15 aug 2026" / "ago 15, 2026"
  const monthMap: Record<string, string> = {
    ene: "01", jan: "01", feb: "02", mar: "03", abr: "04", apr: "04",
    may: "05", jun: "06", jul: "07", ago: "08", aug: "08",
    sep: "09", oct: "10", nov: "11", dic: "12", dec: "12",
  };
  const named = segment.match(/\b(\d{1,2})\s+([a-z]{3,4})\.?\s+(\d{4})\b/i);
  if (named) {
    const mm = monthMap[named[2].toLowerCase().slice(0, 3)];
    if (mm) return `${named[3]}-${mm}-${named[1].padStart(2, "0")}`;
  }
  const named2 = segment.match(/\b([a-z]{3,4})\.?\s+(\d{1,2}),?\s+(\d{4})\b/i);
  if (named2) {
    const mm = monthMap[named2[1].toLowerCase().slice(0, 3)];
    if (mm) return `${named2[3]}-${mm}-${named2[2].padStart(2, "0")}`;
  }
  return null;
}

// ─── Segment splitter ──────────────────────────────────────────────────────

/**
 * Heurística para detectar emails con varios bookings. Despegar y Decolar usan
 * separadores como "VUELO 1 / VUELO 2", "Tramo 1 / Tramo 2", "Item N", "Booking N".
 * Si no hay separadores claros, devolvemos un solo segmento.
 */
function splitIntoSegments(text: string): string[] {
  const lines = text.split(/\r?\n/);

  // Detect explicit numbered separators
  const sepRegex =
    /^\s*(?:vuelo|voo|flight|tramo|trecho|leg|booking|ítem|item|reserva|reservaci[óo]n)\s*[#nN°]?\s*\d+/i;

  const idxs: number[] = [];
  lines.forEach((l, i) => {
    if (sepRegex.test(l)) idxs.push(i);
  });

  if (idxs.length >= 2) {
    const segments: string[] = [];
    for (let i = 0; i < idxs.length; i++) {
      const start = idxs[i];
      const end = i + 1 < idxs.length ? idxs[i + 1] : lines.length;
      segments.push(lines.slice(start, end).join("\n"));
    }
    return segments;
  }
  return [text];
}

// ─── Main heuristic ────────────────────────────────────────────────────────

function parseSegment(segment: string, fallbackProvider: string | null): ParsedBooking {
  const type = detectType(segment);
  const date = extractDate(segment);
  const locator = extractLocator(segment);
  const currency = extractCurrency(segment);
  const amount = extractAmount(segment);
  const lower = segment.toLowerCase();
  const status: BookingStatus =
    /\b(paid|pagad|charged|cobrad|debited)/i.test(lower)
      ? "paid"
      : /\b(confirmed|confirmad|booked|reservad|prenotad)/i.test(lower)
      ? "confirmed"
      : "pending";

  const provider =
    fallbackProvider ||
    segment
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /^[A-Z][A-Za-zÀ-ÿ0-9 &]+$/.test(l))
      ?.slice(0, 50) ||
    "Unknown";

  const description =
    segment
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 10 && !sepLineLooksLikeHeader(l))
      ?.slice(0, 100) || `${type} ${provider}`;

  // Confidence: minimum is "low". Promote to medium/high based on field completeness.
  let confidence: ParsedBooking["confidence"] = "low";
  const filled = [date, locator, amount > 0 ? "x" : null, type !== "other" ? "x" : null].filter(
    Boolean
  ).length;
  if (filled >= 4) confidence = "high";
  else if (filled >= 2) confidence = "medium";

  return {
    type,
    provider,
    city_name: null,
    description,
    use_date: date,
    use_end_date: null,
    payment_deadline: null,
    original_amount: amount,
    original_currency: currency,
    status,
    locator,
    contact: null,
    is_cancellable: null,
    cancellation_policy: null,
    notes: "Parseado por heurística local. Sin envío a IA.",
    confidence,
  };
}

function sepLineLooksLikeHeader(l: string): boolean {
  return /^(from:|de:|para:|to:|asunto:|subject:|fecha:|date:)/i.test(l);
}

export function heuristicMultiParse(text: string): HeuristicResult {
  const carrier = detectCarrier(text);
  const languages = detectLanguages(text);
  const segments = splitIntoSegments(text);

  const bookings = segments
    .map((seg) => parseSegment(seg, carrier))
    .filter((b) => b.type !== "other" || b.original_amount > 0 || b.locator !== null);

  return {
    bookings,
    languages,
    carrier_hint: carrier,
  };
}
