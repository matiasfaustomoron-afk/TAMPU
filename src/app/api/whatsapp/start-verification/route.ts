// ─── POST /api/whatsapp/start-verification ─────────────────────────────────
//
// Inicia el flow de vinculación de un número WhatsApp con la cuenta Tampu
// del user autenticado.
//
// Body: { phone_raw: string }  // el user puede mandar con espacios/guiones
//
// Flow:
//   1. Valida que haya sesión Supabase
//   2. Normaliza el phone a E.164 + valida regex
//   3. Genera código numérico de 6 dígitos
//   4. Upsert en whatsapp_links (verification_code + expires_at = now + 10min)
//   5. Manda WhatsApp con instrucciones via Twilio
//   6. Returns { ok, expires_in }
//
// Rate-limit: máximo 3 intentos por hora por user. Lo enforce-amos contando
// rows recientes con verified_at null y verification_expires_at en la última
// hora — si hay 3, devolvemos 429.

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseService } from "@/lib/supabase/service";
import {
  formatPhoneForWhatsApp,
  toE164,
  isValidE164,
  sendWhatsAppMessage,
  generateVerificationCode,
} from "@/lib/whatsapp/twilio";

export const runtime = "nodejs";

const VERIFICATION_EXPIRY_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS_PER_HOUR = 3;

export async function POST(req: NextRequest) {
  // 1. Auth
  const supa = await createSupabaseServer();
  if (!supa) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  }
  const { data: userData, error: userErr } = await supa.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const userId = userData.user.id;

  // 2. Parse body
  let phoneRaw: string;
  try {
    const body = await req.json();
    phoneRaw = String(body?.phone_raw ?? body?.phone_e164 ?? "").trim();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!phoneRaw) {
    return NextResponse.json({ error: "missing_phone" }, { status: 400 });
  }

  const phoneE164 = toE164(phoneRaw);
  if (!isValidE164(phoneE164)) {
    return NextResponse.json({ error: "invalid_phone_format", hint: "Usá formato internacional, ej +5491140404040" }, { status: 400 });
  }

  // 3. Service client (necesario para upsert + para chequear unique(phone))
  const sb = createSupabaseService();
  if (!sb) {
    return NextResponse.json({ error: "supabase_service_not_configured" }, { status: 503 });
  }

  // Rate-limit por user: ¿cuántos intentos de verification arrancó en la
  // última hora? Counter por created_at de los rows sin verified_at.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentCount } = await sb
    .from("whatsapp_links")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("verified_at", null)
    .gte("created_at", oneHourAgo);
  if ((recentCount ?? 0) >= MAX_ATTEMPTS_PER_HOUR) {
    return NextResponse.json({ error: "too_many_attempts", retry_after_minutes: 60 }, { status: 429 });
  }

  // 4. Chequear si el phone ya está vinculado a OTRO user
  const { data: existing } = await sb
    .from("whatsapp_links")
    .select("user_id, verified_at")
    .eq("phone_e164", phoneE164)
    .maybeSingle();
  if (existing && existing.user_id !== userId && existing.verified_at) {
    return NextResponse.json({ error: "phone_already_linked_to_other_user" }, { status: 409 });
  }

  // 5. Generar código + expiry
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + VERIFICATION_EXPIRY_MS).toISOString();

  // 6. Upsert. Conflict por user_id (unique). Si existe, sobrescribimos
  //    code + expiry; si no, creamos.
  const { error: upsertErr } = await sb
    .from("whatsapp_links")
    .upsert(
      {
        user_id: userId,
        phone_e164: phoneE164,
        verification_code: code,
        verification_expires_at: expiresAt,
        verified_at: null,
        failed_attempts: 0,
      },
      { onConflict: "user_id" },
    );
  if (upsertErr) {
    // eslint-disable-next-line no-console
    console.error("[whatsapp.start-verification] upsert failed:", upsertErr.message);
    if (upsertErr.code === "23505") {
      return NextResponse.json({ error: "phone_already_linked_to_other_user" }, { status: 409 });
    }
    return NextResponse.json({ error: "db_error", detail: upsertErr.message }, { status: 500 });
  }

  // 7. Mandar WhatsApp con el código
  const waTo = formatPhoneForWhatsApp(phoneE164);
  const messageBody = `Tampu · vinculación de WhatsApp
Para confirmar que este número es tuyo, respondé este mensaje con el código:

${code}

Vence en 10 minutos. Si vos no iniciaste esta vinculación, ignorá el mensaje.`;
  const sendResult = await sendWhatsAppMessage(waTo, messageBody);
  if (!sendResult.ok) {
    // No bloqueamos al user — el row está creado y vence solo. Pero le
    // devolvemos un hint para que sepa qué pasó.
    // eslint-disable-next-line no-console
    console.error("[whatsapp.start-verification] sendWhatsApp failed:", sendResult.error);
    return NextResponse.json(
      {
        ok: false,
        error: "whatsapp_send_failed",
        hint: sendResult.error === "twilio_not_configured"
          ? "Twilio no está configurado en este deploy. Avisale al admin."
          : "No pudimos enviar el WhatsApp. Verificá el número.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    phone_e164: phoneE164,
    expires_in: Math.floor(VERIFICATION_EXPIRY_MS / 1000),
  });
}
