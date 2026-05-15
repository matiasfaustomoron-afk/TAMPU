import { NextRequest, NextResponse } from "next/server";
import { createSupabaseService } from "@/lib/supabase/service";

/**
 * GET /api/curated-destinations
 *
 * Devuelve el catálogo de destinos curados editorialmente por Tampu.
 * Filtros: country, category, premium_level, vibe_tags.
 *
 * Es el endpoint que el AI agentic + Discover UI + MCP server consumen.
 *
 * Read-only desde client. Writes son via Supabase admin (CMS manual o
 * futura UI de admin).
 */

// Edge runtime: el endpoint sólo hace `fetch` a Supabase REST (vía @supabase/supabase-js,
// que es fetch-based y edge-safe) y devuelve JSON. No usa libs Node-only.
// Beneficio: cold start ~10x más rápido + edge-region routing → menor TTFB global.
export const runtime = "edge";

// Columnas que efectivamente consume el client (AI agentic + Discover UI + MCP).
// `select("*")` traía 30+ columnas internas (audit, embeddings, internal_notes)
// inflando el payload. Tighten para reducir egress + serialize cost.
const SELECT_COLUMNS = [
  "id",
  "slug",
  "name",
  "country",
  "category",
  "premium_level",
  "vibe_tags",
  "hero_photo_url",
  "summary",
  "view_count",
  "best_months",
  "created_at",
].join(",");

export async function GET(req: NextRequest) {
  const sb = createSupabaseService();
  if (!sb) return NextResponse.json({ destinations: [] });

  const url = new URL(req.url);
  const country = url.searchParams.get("country");
  const category = url.searchParams.get("category");
  const premium = url.searchParams.get("premium_level");
  const limit = Math.min(50, parseInt(url.searchParams.get("limit") || "20", 10));

  let query = sb
    .from("curated_destinations")
    .select(SELECT_COLUMNS)
    .order("view_count", { ascending: false });

  if (country) query = query.eq("country", country);
  if (category) query = query.eq("category", category);
  if (premium) query = query.eq("premium_level", premium);

  const { data, error } = await query.limit(limit);
  if (error) return NextResponse.json({ destinations: [], error: error.message }, { status: 500 });

  return NextResponse.json(
    { destinations: data || [] },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } },
  );
}
