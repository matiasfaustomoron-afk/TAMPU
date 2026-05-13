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

export const runtime = "nodejs";

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
    .select("*")
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
