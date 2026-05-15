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

// NOTA: Iter 7 quiso tighten select a columnas específicas para reducir egress,
// pero las columnas reales de `curated_destinations` no se verificaron contra
// migration → "column id does not exist" en prod. Reverted to `*` por seguridad.
// TODO Iter 8: auditar el shape real de la tabla y migrar a SELECT_COLUMNS.
const SELECT_COLUMNS = "*";

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
