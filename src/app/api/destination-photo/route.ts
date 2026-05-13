import { NextRequest, NextResponse } from "next/server";
import { resolveDestinationPhoto, slugify, type ResolvedPhoto } from "@/lib/photos/destination-resolver";
import { createSupabaseService } from "@/lib/supabase/service";

/**
 * GET /api/destination-photo?q=Buenos+Aires&locale=es
 *
 * Devuelve la foto resuelta del destino con cascada 4-tier.
 * Cachea en Supabase `destination_photos` table — siguiente request es instantáneo.
 *
 * Sin Supabase configurado: corre el resolver en cada request sin cache.
 *
 * TTL de cache: 30 días. Si el resolver falla y hay cache (aunque viejo), devolvemos el cache.
 */

export const runtime = "nodejs";
const CACHE_TTL_DAYS = 30;

interface CachedRow {
  slug: string;
  locale: string;
  tier: string;
  photo_url: string | null;
  photo_width: number | null;
  photo_height: number | null;
  attribution: string | null;
  source_page_url: string | null;
  caption: string | null;
  description: string | null;
  fetched_at: string;
  resolution_status: "ok" | "not-found" | "placeholder";
}

function rowToPhoto(row: CachedRow): ResolvedPhoto | null {
  if (row.resolution_status !== "ok" || !row.photo_url) return null;
  return {
    url: row.photo_url,
    width: row.photo_width ?? 1600,
    height: row.photo_height ?? 1067,
    attribution: row.attribution,
    sourcePageUrl: row.source_page_url,
    caption: row.caption,
    description: row.description,
    tier: row.tier as ResolvedPhoto["tier"],
  };
}

function isExpired(fetchedAt: string): boolean {
  const ageMs = Date.now() - Date.parse(fetchedAt);
  return ageMs > CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const locale = (url.searchParams.get("locale") || "es") as "es" | "en";

  if (!q) {
    return NextResponse.json({ error: "Missing `q` query param" }, { status: 400 });
  }

  const slug = slugify(q);
  const host = url.origin;

  // ─── 1. Check cache ──────────────────────────────────────────────────
  const sb = createSupabaseService();
  let cached: CachedRow | null = null;
  if (sb) {
    const { data } = await sb
      .from("destination_photos")
      .select("*")
      .eq("slug", slug)
      .eq("locale", locale)
      .maybeSingle();
    cached = data as CachedRow | null;

    // Cache hit + fresh → devolver inmediato
    if (cached && !isExpired(cached.fetched_at)) {
      const photo = rowToPhoto(cached);
      return NextResponse.json(
        { photo, slug, cached: true },
        { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } },
      );
    }
  }

  // ─── 2. Resolve fresh ─────────────────────────────────────────────────
  let photo: ResolvedPhoto | null = null;
  try {
    photo = await resolveDestinationPhoto(q, { locale, host });
  } catch (err) {
    console.warn("[destination-photo] resolver failed:", err);
  }

  // ─── 3. Si el resolver falló pero tenemos cache viejo, usar cache ─────
  if (!photo && cached) {
    const stale = rowToPhoto(cached);
    if (stale) {
      return NextResponse.json(
        { photo: stale, slug, cached: true, stale: true },
        { headers: { "Cache-Control": "public, max-age=3600" } },
      );
    }
  }

  // ─── 4. Persist new resolution (incluyendo "not-found" para evitar re-intentos) ─
  if (sb) {
    const row: Omit<CachedRow, "fetched_at"> = {
      slug,
      locale,
      tier: photo?.tier ?? "placeholder",
      photo_url: photo?.url ?? null,
      photo_width: photo?.width ?? null,
      photo_height: photo?.height ?? null,
      attribution: photo?.attribution ?? null,
      source_page_url: photo?.sourcePageUrl ?? null,
      caption: photo?.caption ?? null,
      description: photo?.description ?? null,
      resolution_status: photo ? "ok" : "not-found",
    };
    await sb.from("destination_photos").upsert({ ...row, fetched_at: new Date().toISOString() }).then(
      () => undefined,
      (err) => console.warn("[destination-photo] cache write failed:", err),
    );
  }

  return NextResponse.json(
    { photo, slug, cached: false },
    {
      headers: {
        "Cache-Control": photo
          ? "public, max-age=86400, s-maxage=86400"
          : "public, max-age=3600",
      },
    },
  );
}
