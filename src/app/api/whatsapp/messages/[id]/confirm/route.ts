// ─── POST /api/whatsapp/messages/[id]/confirm ──────────────────────────────
//
// Confirma manualmente la inserción de un whatsapp_message parseado al trip.
// Lo llama la UI /whatsapp cuando el auto-insert se skippeó (low_confidence,
// no_active_trip resuelto después, multiple_trips_ambiguous, etc.).
//
// Body: { trip_id: string }  (el user eligió en el dropdown)
//
// Usa la misma lógica que el webhook (autoInsertParsedItem en modo force)
// para mantener un solo path de inserción.

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseService } from "@/lib/supabase/service";
import { autoInsertParsedItem } from "@/lib/whatsapp/auto-insert";
import type { ParsedWhatsAppItem } from "@/lib/whatsapp/parser";

export const runtime = "nodejs";

interface RouteContext { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: RouteContext) {
  // 1. Autenticación: usamos createSupabaseServer (RLS) para verificar que el
  // mensaje es del user. Después usamos service para hacer el insert (que
  // pasa por algunos lookups via RPC security definer).
  const supa = await createSupabaseServer();
  if (!supa) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data: userData, error: userErr } = await supa.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const userId = userData.user.id;

  const { id: msgId } = await ctx.params;
  if (!msgId) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  let body: { trip_id?: string } = {};
  try {
    body = (await req.json()) as { trip_id?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const tripId = body.trip_id?.trim();
  if (!tripId) {
    return NextResponse.json({ error: "missing_trip_id" }, { status: 400 });
  }

  // 2. Verificar que el mensaje le pertenece al user y tiene parsed_json.
  const { data: msg, error: msgErr } = await supa
    .from("whatsapp_messages")
    .select("id, parsed_json, auto_inserted_item_id")
    .eq("id", msgId)
    .maybeSingle();
  if (msgErr) return NextResponse.json({ error: "db_error", detail: msgErr.message }, { status: 500 });
  if (!msg) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!msg.parsed_json) {
    return NextResponse.json({ error: "not_parsed_yet" }, { status: 400 });
  }
  if (msg.auto_inserted_item_id) {
    return NextResponse.json({
      ok: true,
      already_inserted: true,
      item_id: msg.auto_inserted_item_id,
    });
  }

  // 3. Verificar que el trip elegido es del user.
  const { data: trip, error: tripErr } = await supa
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .eq("user_id", userId)
    .maybeSingle();
  if (tripErr) return NextResponse.json({ error: "db_error", detail: tripErr.message }, { status: 500 });
  if (!trip) return NextResponse.json({ error: "trip_not_found_or_not_owned" }, { status: 403 });

  // 4. Service-role insert via autoInsertParsedItem(force=true, forceTripId).
  const sb = createSupabaseService();
  if (!sb) return NextResponse.json({ error: "service_not_configured" }, { status: 503 });

  const result = await autoInsertParsedItem(
    sb,
    msgId,
    userId,
    msg.parsed_json as ParsedWhatsAppItem,
    { force: true, forceTripId: tripId },
  );

  if (result.inserted && result.itemId) {
    await sb.from("whatsapp_messages").update({
      trip_id: tripId,
      auto_inserted_item_id: result.itemId,
      auto_insert_skipped_reason: null, // limpiar el skip previo
    }).eq("id", msgId);
    return NextResponse.json({
      ok: true,
      item_id: result.itemId,
      item_type: result.itemType,
      trip_id: tripId,
    });
  }

  return NextResponse.json({
    ok: false,
    error: result.error ?? "insert_failed",
    skipped_reason: result.skippedReason,
  }, { status: 400 });
}
