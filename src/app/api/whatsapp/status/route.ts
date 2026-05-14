// ─── GET /api/whatsapp/status ─────────────────────────────────────────────
//
// Devuelve el estado de vinculación WhatsApp del user autenticado.
// La UI hace polling cada 3s mientras está en flow de verification para
// detectar cuando el user responde el código por WhatsApp.

import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supa = await createSupabaseServer();
  if (!supa) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const { data: userData, error: userErr } = await supa.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { data, error } = await supa
    .from("whatsapp_links")
    .select("phone_e164, verified_at, verification_expires_at, failed_attempts")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ linked: false, pending: false });
  }

  const verified = !!data.verified_at;
  // Pending = hay un row sin verified_at y todavía dentro de la ventana
  // de expiry.
  const pending = !verified
    && data.verification_expires_at
    && new Date(data.verification_expires_at).getTime() > Date.now();

  return NextResponse.json({
    linked: verified,
    pending,
    phone_e164: data.phone_e164,
    verified_at: data.verified_at,
    verification_expires_at: data.verification_expires_at,
    failed_attempts: data.failed_attempts,
  });
}
