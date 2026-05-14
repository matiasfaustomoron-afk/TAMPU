// ─── DELETE /api/whatsapp/unlink ──────────────────────────────────────────
//
// Borra la vinculación WhatsApp del user autenticado. Los mensajes ya
// recibidos (whatsapp_messages) permanecen para audit trail; solo se corta
// la asociación phone→user, así que mensajes nuevos del mismo phone no se
// asocian más.

import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE() {
  const supa = await createSupabaseServer();
  if (!supa) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data: userData, error: userErr } = await supa.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { error } = await supa
    .from("whatsapp_links")
    .delete()
    .eq("user_id", userData.user.id);

  if (error) {
    return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
