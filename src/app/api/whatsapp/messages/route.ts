// ─── GET /api/whatsapp/messages ───────────────────────────────────────────
//
// Devuelve la lista de mensajes WhatsApp del user autenticado, ordenados
// por received_at desc. Soporta filtro por status via query param.
//
// Query:
//   ?status=parsed|received|failed|ignored|verification|all  (default: all)
//   ?limit=50  (default 50, max 200)

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const VALID_STATUS = new Set(["parsed", "received", "failed", "ignored", "verification", "outbound", "all"]);

export async function GET(req: NextRequest) {
  const supa = await createSupabaseServer();
  if (!supa) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data: userData, error: userErr } = await supa.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const statusFilter = (url.searchParams.get("status") || "all").toLowerCase();
  const limitRaw = Number(url.searchParams.get("limit") || 50);
  const limit = Math.max(1, Math.min(200, isFinite(limitRaw) ? limitRaw : 50));

  if (!VALID_STATUS.has(statusFilter)) {
    return NextResponse.json({ error: "invalid_status_filter" }, { status: 400 });
  }

  let query = supa
    .from("whatsapp_messages")
    .select("id, twilio_message_sid, direction, phone_e164, body, status, trip_id, parsed_json, parser_provider, cost_usd, error_message, received_at, parsed_at, media_count, auto_inserted_item_id, auto_insert_skipped_reason")
    .eq("user_id", userData.user.id)
    .order("received_at", { ascending: false })
    .limit(limit);

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, messages: data ?? [] });
}
