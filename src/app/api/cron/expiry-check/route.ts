// ─── GET /api/cron/expiry-check ───
//
// Vercel Cron job — corre diario. Escanea `attachments.expires_at` (migration
// 00037) buscando attachments que vencerán dentro de los próximos 90 días.
// Cada match es un candidato a notificación / alerta proactiva ("Tu visa vence
// en 7 días", "Tu seguro de viaje vence mañana", etc).
//
// Iter 6: skeleton funcional. Devuelve el conteo y la lista de attachments
// vencidos pronto. El insert real en una tabla de alerts queda como TODO
// porque la estructura de notificación cross-user todavía no está confirmada
// (¿`notifications`? ¿push web? ¿webhook a WhatsApp?). NO inventamos tablas.
//
// Seguridad: `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron lo manda
// automático si está configurado en el dashboard).

import { NextResponse } from "next/server";
import { createSupabaseService } from "@/lib/supabase/service";

export const runtime = "nodejs";

interface ExpiringAttachmentRow {
  id: string;
  trip_id: string;
  file_name: string;
  expires_at: string;
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (!expected) {
    return NextResponse.json(
      { ok: false, reason: "cron_secret_not_configured" },
      { status: 503 },
    );
  }
  if (auth !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const sb = createSupabaseService();
  if (!sb) {
    return NextResponse.json(
      { ok: false, reason: "supabase_service_not_configured" },
      { status: 503 },
    );
  }

  const now = new Date();
  const cutoff90 = new Date(now.getTime() + 90 * 86_400_000).toISOString();

  const { data, error } = await sb
    .from("attachments")
    .select("id, trip_id, file_name, expires_at")
    .lte("expires_at", cutoff90)
    .gt("expires_at", now.toISOString());

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const items = (data ?? []) as ExpiringAttachmentRow[];

  // TODO Iter 7+: insertar filas en `notifications` (o equivalente) con
  // user_id derivado de trips.user_id por cada attachment. Hoy solo logueamos
  // el conteo para que el cron sea observable.
  return NextResponse.json({
    ok: true,
    count: items.length,
    items,
  });
}
