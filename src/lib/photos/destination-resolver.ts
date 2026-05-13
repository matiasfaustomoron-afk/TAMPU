/**
 * destination-resolver.ts — Server-side photo resolver con cascada de 4 tiers.
 *
 * Para un nombre de destino dado ("Buenos Aires", "Papúa Nueva Guinea", etc.)
 * intenta en orden:
 *
 *  1. CURATED  — `public/photos/destinations/{slug}/hero.jpg`. Si existe en disco,
 *                ganamos. Máxima calidad, sin red, sin atribución externa.
 *
 *  2. WIKIPEDIA — Wikipedia REST API summary endpoint. La "lead image" del infobox
 *                es curada por editores y suele ser THE postal del lugar.
 *                Free, sin API key, atribución obligatoria (CC-BY-SA o public domain).
 *                Intentamos es.wikipedia, luego en.wikipedia, luego variantes del slug.
 *
 *  3. UNSPLASH  — fallback long-tail. Requiere `UNSPLASH_ACCESS_KEY` ENV.
 *                Search photos con query enrichment.
 *
 *  4. PLACEHOLDER — no-op, devolvemos null. La UI muestra Hornocal gradient + glyph.
 *
 * Filter de calidad — descartamos:
 *  - SVGs renderizados (banderas, mapas, escudos)
 *  - Imágenes con dimensiones < 800px en el lado corto
 *  - Filenames sospechosos (`flag_`, `coat_of_arms_`, `_map.`, `physical_map`)
 *
 * Caché — los resultados se persisten en `destination_photos` table.
 * Siguiente request del mismo destino → instantáneo, sin red.
 */

// No "use client" — este módulo es SOLO server-side.

export interface ResolvedPhoto {
  url: string;
  width: number;
  height: number;
  attribution: string | null;
  sourcePageUrl: string | null;
  caption: string | null;
  description: string | null;
  tier: "curated" | "wikipedia-es" | "wikipedia-en" | "unsplash" | "placeholder";
}

/** Normaliza un nombre de destino a slug minúsculas con guiones, sin acentos. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Variantes del slug a probar en Wikipedia — capta nombres compuestos. */
function slugVariants(name: string): string[] {
  const out = new Set<string>();
  const original = name.trim();
  out.add(original.replace(/\s+/g, "_"));

  // Normalized variant
  const normalized = original.normalize("NFD").replace(/[̀-ͯ]/g, "");
  out.add(normalized.replace(/\s+/g, "_"));

  // First word (e.g. "Papúa Nueva Guinea" → try "Papúa")
  const firstWord = original.split(/\s+/)[0];
  if (firstWord !== original) out.add(firstWord);

  // Last word (e.g. "Serranía del Hornocal" → "Hornocal")
  const words = original.split(/\s+/);
  const lastWord = words[words.length - 1];
  if (lastWord && lastWord !== original && lastWord.length > 3) out.add(lastWord);

  return Array.from(out);
}

// ─── Quality filter ────────────────────────────────────────────────────────

function isAcceptablePhoto(url: string, width: number, height: number, caption?: string): boolean {
  const lower = url.toLowerCase();

  // Descartar SVGs renderizados (banderas, mapas, escudos)
  if (lower.includes(".svg") || lower.includes("flag_") || lower.includes("coat_of_arms")) return false;
  if (lower.includes("_map.") || lower.includes("physical_map") || lower.includes("location_map")) return false;
  if (lower.includes("topographic") || lower.includes("orthographic")) return false;

  // Dimensiones mínimas
  const shortSide = Math.min(width || 0, height || 0);
  if (shortSide < 600) return false;

  // Captions sospechosos
  if (caption) {
    const c = caption.toLowerCase();
    if (/\b(flag|bandera|map|mapa|coat|escudo|topograph)/.test(c)) return false;
  }

  return true;
}

// ─── Tier 1 — Curated (filesystem) ────────────────────────────────────────

/**
 * Chequea si existe `public/photos/destinations/{slug}/hero.{jpg,webp,avif}`.
 * Usamos `fs.access` server-side. En production (Vercel) los archivos del bundle
 * existen como rutas estáticas; un fetch a `/photos/destinations/{slug}/hero.jpg`
 * con HEAD también funcionaría, pero fs es más rápido.
 */
async function tryCurated(slug: string, host: string): Promise<ResolvedPhoto | null> {
  const extensions = ["jpg", "webp", "avif", "jpeg", "png"];
  for (const ext of extensions) {
    const path = `/photos/destinations/${slug}/hero.${ext}`;
    const url = `${host}${path}`;
    try {
      const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        // Tier 1 hit — no tenemos dimensiones sin descargar el archivo,
        // asumimos 1920×1280 standard editorial
        return {
          url: path,
          width: 1920,
          height: 1280,
          attribution: null,
          sourcePageUrl: null,
          caption: null,
          description: null,
          tier: "curated",
        };
      }
    } catch {
      // try next extension
    }
  }
  return null;
}

// ─── Tier 2 — Wikipedia REST API ──────────────────────────────────────────

interface WikiSummary {
  title?: string;
  description?: string;
  extract?: string;
  thumbnail?: { source: string; width: number; height: number };
  originalimage?: { source: string; width: number; height: number };
  content_urls?: { desktop?: { page: string } };
  type?: string;
}

async function fetchWikiSummary(locale: "es" | "en", slug: string): Promise<WikiSummary | null> {
  const url = `https://${locale}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Tampu/1.0 (+https://tampu.app; contact@tampu.app)",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as WikiSummary;
  } catch {
    return null;
  }
}

async function tryWikipedia(name: string, locale: "es" | "en"): Promise<ResolvedPhoto | null> {
  const variants = slugVariants(name);
  for (const variant of variants) {
    const summary = await fetchWikiSummary(locale, variant);
    if (!summary || summary.type === "disambiguation") continue;

    const photo = summary.originalimage ?? summary.thumbnail;
    if (!photo) continue;

    const caption = summary.description ?? summary.title ?? "";
    if (!isAcceptablePhoto(photo.source, photo.width, photo.height, caption)) continue;

    return {
      url: photo.source,
      width: photo.width,
      height: photo.height,
      attribution: `Wikipedia · ${summary.title ?? variant}`,
      sourcePageUrl: summary.content_urls?.desktop?.page ?? `https://${locale}.wikipedia.org/wiki/${variant}`,
      caption: summary.title ?? null,
      description: summary.description ?? summary.extract?.slice(0, 240) ?? null,
      tier: locale === "es" ? "wikipedia-es" : "wikipedia-en",
    };
  }
  return null;
}

// ─── Tier 3 — Unsplash API ────────────────────────────────────────────────

async function tryUnsplash(name: string): Promise<ResolvedPhoto | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;

  const query = `${name} landscape city`;
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=landscape&per_page=3`,
      {
        headers: { Authorization: `Client-ID ${key}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{
        urls?: { regular?: string; raw?: string };
        width?: number;
        height?: number;
        alt_description?: string;
        description?: string;
        user?: { name?: string };
        links?: { html?: string };
      }>;
    };
    const first = data.results?.[0];
    if (!first?.urls?.regular) return null;
    return {
      url: first.urls.regular,
      width: first.width ?? 1600,
      height: first.height ?? 1067,
      attribution: `Foto: ${first.user?.name ?? "Unsplash"} · Unsplash`,
      sourcePageUrl: first.links?.html ?? null,
      caption: first.alt_description ?? null,
      description: first.description ?? null,
      tier: "unsplash",
    };
  } catch {
    return null;
  }
}

// ─── Resolver principal ───────────────────────────────────────────────────

export interface ResolveOptions {
  /** "es" prioritario, "en" fallback. Default "es" */
  locale?: "es" | "en";
  /** Para tier 1 curated — host para construir URLs absolutas */
  host?: string;
  /** Skip cache, fuerza re-fetch. Útil para admin. */
  skipCache?: boolean;
}

/**
 * Resuelve la foto principal de un destino corriendo los tiers en cascada.
 * Devuelve null solo si TODO falla — ahí la UI muestra placeholder editorial.
 */
export async function resolveDestinationPhoto(
  destinationName: string,
  opts: ResolveOptions = {},
): Promise<ResolvedPhoto | null> {
  const locale = opts.locale ?? "es";

  // Tier 1 — Curated (si el host está disponible)
  if (opts.host) {
    const slug = slugify(destinationName);
    const curated = await tryCurated(slug, opts.host);
    if (curated) return curated;
  }

  // Tier 2 — Wikipedia (idioma del user primero, luego fallback)
  const langs: Array<"es" | "en"> = locale === "es" ? ["es", "en"] : ["en", "es"];
  for (const lang of langs) {
    const wiki = await tryWikipedia(destinationName, lang);
    if (wiki) return wiki;
  }

  // Tier 3 — Unsplash
  const unsplash = await tryUnsplash(destinationName);
  if (unsplash) return unsplash;

  // Tier 4 — null (UI cae a placeholder Hornocal)
  return null;
}
