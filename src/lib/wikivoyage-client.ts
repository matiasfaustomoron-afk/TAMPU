"use client";

// ─── Destination guide — traveler-curated content, no Wikipedia, no AI ───
// Sources:
//   1. Wikivoyage — practical traveler tips (eat / see / get in / stay safe)
//   2. OpenStreetMap — real named POIs (restaurants / attractions / cafes / historic)
//      via Nominatim (geocode) + Overpass API (places nearby)
// Free, CORS-friendly, no API key, no AI.

const CACHE_PREFIX = "travel-os-guide:";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface GuideSection {
  category: "transport" | "money" | "food" | "see" | "safety" | "stay" | "do" | "other";
  heading: string;
  paragraphs: string[];
  bullets: string[];
  source: "wikivoyage";
}

export interface POI {
  id: string;
  name: string;
  kind: "restaurant" | "attraction" | "cafe" | "historic" | "viewpoint";
  cuisine?: string;
  website?: string;
  hours?: string;            // opening_hours OSM tag (raw, e.g. "Mo-Fr 09:00-21:00")
  price_range?: string;      // "$", "$$", "$$$" if available
  stars?: string;            // hotel/historic stars
  wheelchair?: string;       // accessibility
  phone?: string;
  lat: number;
  lon: number;
}

export interface SourceLink {
  name: "Wikivoyage" | "OpenStreetMap";
  url: string;
  lang?: "es" | "en";
}

export interface DestinationGuide {
  destination: string;
  page_title: string;
  summary: string;
  sections: GuideSection[];
  pois: {
    restaurants: POI[];
    attractions: POI[];
    cafes: POI[];
    historic: POI[];
  };
  coords: { lat: number; lon: number } | null;
  sources: SourceLink[];
  fetched_at: string;
}

interface Cached { expires_at: number; guide: DestinationGuide }

const cacheKey = (d: string) => CACHE_PREFIX + d.toLowerCase().trim();

export function readCachedGuide(destination: string): DestinationGuide | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(destination));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (Date.now() > parsed.expires_at) {
      localStorage.removeItem(cacheKey(destination));
      return null;
    }
    return parsed.guide;
  } catch { return null; }
}

function writeCache(destination: string, guide: DestinationGuide): void {
  if (typeof localStorage === "undefined") return;
  try {
    const entry: Cached = { expires_at: Date.now() + CACHE_TTL_MS, guide };
    localStorage.setItem(cacheKey(destination), JSON.stringify(entry));
  } catch { /* quota */ }
}

// ─── Wikivoyage fetcher ───

interface OpenSearchResp { 0: string; 1: string[]; 2: string[]; 3: string[] }
interface ParseSectionItem { toclevel: number; level: string; line: string; index: string }
interface ParseResp { parse?: { title: string; sections: ParseSectionItem[]; text: { "*": string } } }

async function wvFindTitle(lang: "es" | "en", query: string): Promise<string | null> {
  try {
    const url = `https://${lang}.wikivoyage.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&namespace=0&format=json&origin=*`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json() as OpenSearchResp;
    return (data[1] && data[1][0]) || null;
  } catch { return null; }
}

async function wvParse(lang: "es" | "en", title: string): Promise<ParseResp["parse"] | null> {
  try {
    const url = `https://${lang}.wikivoyage.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&format=json&prop=text|sections&origin=*`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const data = await res.json() as ParseResp;
    return data.parse || null;
  } catch { return null; }
}

const SECTION_KEYWORDS: Record<GuideSection["category"], RegExp[]> = {
  transport: [/c[óo]mo llegar/i, /llegar/i, /c[óo]mo (moverse|desplazarse)/i, /transporte/i, /get in/i, /get around/i],
  money:     [/comprar/i, /dinero/i, /moneda/i, /cambio/i, /precios?/i, /buy/i, /money/i, /shopping/i, /costs?/i],
  food:      [/comer/i, /restaurantes/i, /gastronom/i, /cocina/i, /caf[eé]s/i, /bebida/i, /beber/i, /eat/i, /food/i, /drink/i, /cuisine/i],
  see:       [/ver/i, /qu[eé] hacer/i, /atracci/i, /visitar/i, /lugares de inter[eé]s/i, /turismo/i, /monumentos/i, /see/i, /\bdo\b/i, /sights?/i, /attractions?/i, /tourism/i],
  stay:      [/dormir/i, /alojamiento/i, /hotel/i, /sleep/i, /accommodation/i],
  do:        [/actividades/i, /aprende(r)?/i, /activities/i, /learn/i, /work/i],
  safety:    [/seguridad/i, /salud/i, /precauci/i, /stay safe/i, /stay healthy/i, /\bhealth\b/i, /\bsafe(ty)?\b/i],
  other:     [],
};

const SKIP_SECTION_RE = /^(referencias|navegar|enlaces externos|véase también|cf\.?|references|external links|notes?|see also|bibliography)$/i;

function classifySection(heading: string): GuideSection["category"] {
  for (const cat of ["food", "transport", "money", "see", "stay", "do", "safety"] as const) {
    if (SECTION_KEYWORDS[cat].some(re => re.test(heading))) return cat;
  }
  return "other";
}

function stripHtml(html: string): string {
  if (typeof DOMParser === "undefined") return html.replace(/<[^>]+>/g, "").trim();
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("sup.reference, sup.noprint, .mw-editsection, .navbox, .infobox, .ambox, .mbox-small, .hatnote, .thumbcaption, .toc, style, script, .reference, table.metadata").forEach(n => n.remove());
  return (doc.body.textContent || "").replace(/\[\d+\]/g, "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractSection(html: string, sectionIndex: string, nextIndex: string | null): { paragraphs: string[]; bullets: string[] } {
  if (typeof DOMParser === "undefined") return { paragraphs: [], bullets: [] };
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("sup.reference, sup.noprint, .mw-editsection, .navbox, .infobox, .ambox, .mbox-small, .hatnote, .toc, style, script, table.metadata").forEach(n => n.remove());

  const headings = Array.from(doc.querySelectorAll("h2, h3"));
  if (headings.length === 0) return { paragraphs: [], bullets: [] };

  const startIdx = parseInt(sectionIndex, 10) - 1;
  if (isNaN(startIdx) || startIdx < 0 || startIdx >= headings.length) return { paragraphs: [], bullets: [] };

  const startEl = headings[startIdx];
  const endEl = nextIndex !== null && headings[parseInt(nextIndex, 10) - 1] ? headings[parseInt(nextIndex, 10) - 1] : null;

  const paragraphs: string[] = [];
  const bullets: string[] = [];
  let node: Element | null = startEl.nextElementSibling;
  while (node && node !== endEl) {
    if (node.tagName === "P") {
      const txt = stripHtml(node.innerHTML);
      if (txt && txt.length > 20) paragraphs.push(txt);
    } else if (node.tagName === "UL" || node.tagName === "OL") {
      const items = Array.from(node.querySelectorAll(":scope > li"));
      for (const li of items) {
        const txt = stripHtml(li.innerHTML);
        if (txt && txt.length > 4 && txt.length < 500) bullets.push(txt);
      }
    } else if (node.tagName === "DL") {
      const dts = Array.from(node.querySelectorAll(":scope > dt, :scope > dd"));
      for (const dn of dts) {
        const txt = stripHtml(dn.innerHTML);
        if (txt && txt.length > 4 && txt.length < 500) bullets.push(txt);
      }
    } else if (node.tagName === "H3") {
      const txt = stripHtml(node.innerHTML);
      if (txt) bullets.push(`— ${txt} —`);
    }
    node = node.nextElementSibling;
  }
  return { paragraphs, bullets };
}

function extractSummary(html: string): string {
  if (typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("sup.reference, sup.noprint, .mw-editsection, .navbox, .infobox, .ambox, .mbox-small, .hatnote, table.metadata").forEach(n => n.remove());
  const paragraphs = Array.from(doc.querySelectorAll("p"));
  for (const p of paragraphs) {
    const txt = stripHtml(p.innerHTML);
    if (txt.length > 80) return txt.slice(0, 700);
  }
  return "";
}

interface WikivoyageGuide {
  lang: "es" | "en";
  page_title: string;
  url: string;
  summary: string;
  sections: GuideSection[];
}

async function fetchWikivoyage(destination: string): Promise<WikivoyageGuide | null> {
  for (const lang of ["es", "en"] as const) {
    const title = await wvFindTitle(lang, destination);
    if (!title) continue;

    const parse = await wvParse(lang, title);
    if (!parse) continue;

    const html = parse.text["*"];
    const summary = extractSummary(html);

    const sections: GuideSection[] = [];
    const tops = parse.sections.filter(s => s.toclevel === 1);
    for (let i = 0; i < tops.length; i++) {
      const s = tops[i];
      if (SKIP_SECTION_RE.test(s.line.trim())) continue;
      const next = tops[i + 1] || null;
      const cat = classifySection(s.line);
      if (cat === "other") continue;
      const { paragraphs, bullets } = extractSection(html, s.index, next ? next.index : null);
      if (paragraphs.length === 0 && bullets.length === 0) continue;
      sections.push({ category: cat, heading: s.line, paragraphs, bullets, source: "wikivoyage" });
    }

    if (sections.length === 0 && !summary) continue;

    return {
      lang, page_title: title,
      url: `https://${lang}.wikivoyage.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      summary, sections,
    };
  }
  return null;
}

// ─── OpenStreetMap — Nominatim (geocode) + Overpass (POIs) ───

async function geocode(query: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=0`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json() as Array<{ lat: string; lon: string }>;
    if (!data || data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  } catch { return null; }
}

interface OverpassNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassResp {
  elements: OverpassNode[];
}

async function fetchPOIs(lat: number, lon: number): Promise<{ restaurants: POI[]; attractions: POI[]; cafes: POI[]; historic: POI[] }> {
  const empty = { restaurants: [], attractions: [], cafes: [], historic: [] };
  const radius = 3500;
  // We require "name" tag so we only get named POIs (no anonymous nodes).
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"="restaurant"]["name"](around:${radius},${lat},${lon});
      node["amenity"="cafe"]["name"](around:${radius},${lat},${lon});
      node["tourism"="attraction"]["name"](around:${radius},${lat},${lon});
      node["tourism"="viewpoint"]["name"](around:${radius},${lat},${lon});
      node["historic"]["name"](around:${radius},${lat},${lon});
    );
    out body 80;
  `.trim();
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(query),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return empty;
    const data = await res.json() as OverpassResp;

    const restaurants: POI[] = [];
    const attractions: POI[] = [];
    const cafes: POI[] = [];
    const historic: POI[] = [];

    for (const n of data.elements || []) {
      const tags = n.tags || {};
      const name = tags.name;
      if (!name) continue;
      const base = {
        id: String(n.id),
        name,
        cuisine: tags.cuisine,
        website: tags.website || tags["contact:website"],
        hours: tags.opening_hours,
        price_range: tags["price:range"] || tags.price_range,
        stars: tags.stars,
        wheelchair: tags.wheelchair,
        phone: tags.phone || tags["contact:phone"],
        lat: n.lat,
        lon: n.lon,
      };
      if (tags.amenity === "restaurant") restaurants.push({ ...base, kind: "restaurant" });
      else if (tags.amenity === "cafe")    cafes.push({ ...base, kind: "cafe" });
      else if (tags.tourism === "attraction") attractions.push({ ...base, kind: "attraction" });
      else if (tags.tourism === "viewpoint")  attractions.push({ ...base, kind: "viewpoint" });
      else if (tags.historic) historic.push({ ...base, kind: "historic" });
    }

    // Dedup by name (case-insensitive); cap each bucket
    const dedup = (arr: POI[], cap: number) => {
      const seen = new Set<string>();
      const out: POI[] = [];
      for (const p of arr) {
        const k = p.name.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(p);
        if (out.length >= cap) break;
      }
      return out;
    };

    return {
      restaurants: dedup(restaurants, 20),
      attractions: dedup(attractions, 20),
      cafes: dedup(cafes, 12),
      historic: dedup(historic, 15),
    };
  } catch { return empty; }
}

// ─── Public API ───

export interface FetchGuideResult {
  guide: DestinationGuide | null;
  source: "cache" | "live" | "not-found" | "offline" | "error";
}

export async function fetchDestinationGuide(
  destination: string,
  options: { forceRefresh?: boolean } = {}
): Promise<FetchGuideResult> {
  if (!options.forceRefresh) {
    const cached = readCachedGuide(destination);
    if (cached) return { guide: cached, source: "cache" };
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { guide: null, source: "offline" };
  }

  try {
    // Geocode first; then Wikivoyage + POIs in parallel
    const coords = await geocode(destination);

    const [wv, pois] = await Promise.all([
      fetchWikivoyage(destination),
      coords ? fetchPOIs(coords.lat, coords.lon) : Promise.resolve({ restaurants: [], attractions: [], cafes: [], historic: [] }),
    ]);

    // No coverage at all? Tell the user.
    const hasWv = !!wv && wv.sections.length > 0;
    const totalPois = pois.restaurants.length + pois.attractions.length + pois.cafes.length + pois.historic.length;
    if (!hasWv && totalPois === 0) {
      return { guide: null, source: "not-found" };
    }

    const sources: SourceLink[] = [];
    if (wv) sources.push({ name: "Wikivoyage", url: wv.url, lang: wv.lang });
    if (totalPois > 0 && coords) {
      sources.push({
        name: "OpenStreetMap",
        url: `https://www.openstreetmap.org/#map=14/${coords.lat}/${coords.lon}`,
      });
    }

    const guide: DestinationGuide = {
      destination,
      page_title: wv?.page_title || destination,
      summary: wv?.summary || "",
      sections: wv?.sections || [],
      pois,
      coords,
      sources,
      fetched_at: new Date().toISOString(),
    };

    writeCache(destination, guide);
    return { guide, source: "live" };
  } catch {
    return { guide: null, source: "error" };
  }
}

export function prefetchDestinationGuide(destination: string): void {
  if (!destination || destination.trim().length < 2) return;
  if (readCachedGuide(destination)) return;
  fetchDestinationGuide(destination).catch(() => {});
}

export function groupedByTab(guide: DestinationGuide): Record<"transport" | "money" | "food" | "see" | "safety", GuideSection[]> {
  const result: Record<"transport" | "money" | "food" | "see" | "safety", GuideSection[]> = {
    transport: [], money: [], food: [], see: [], safety: [],
  };
  for (const s of guide.sections) {
    if (s.category === "transport") result.transport.push(s);
    else if (s.category === "money") result.money.push(s);
    else if (s.category === "food") result.food.push(s);
    else if (s.category === "see" || s.category === "do" || s.category === "stay") result.see.push(s);
    else if (s.category === "safety") result.safety.push(s);
  }
  return result;
}
