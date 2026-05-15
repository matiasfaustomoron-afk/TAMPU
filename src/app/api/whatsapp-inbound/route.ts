import { NextRequest, NextResponse } from "next/server";
import { heuristicMultiParse } from "@/lib/parsing/email-parser";
import { createSupabaseService } from "@/lib/supabase/service";
import { ackBookingsParsed, sendWhatsAppMessage } from "@/lib/whatsapp/outbound";

/**
 * WhatsApp inbound webhook — UNIQUE en el mercado de travel apps (mayo 2026).
 *
 * Soporta:
 *  1. Twilio WhatsApp Business API → POST form-data
 *  2. Meta Cloud API for WhatsApp Business → POST JSON
 *
 * Casos de uso reales:
 *  - Host de Airbnb manda check-in instructions por WhatsApp → forward al número Tampu
 *  - Conductor de transfer aeropuerto manda hora/punto de encuentro → forward
 *  - Hotel boutique LatAm confirma reserva por WhatsApp (no email) → forward
 *  - Tour operator manda voucher en imagen → forward (la imagen se procesa con classify-document)
 *
 * SETUP — Twilio WhatsApp Business (recomendado, $0.005/msg inbound):
 *   1. Crear Twilio account, comprar número WhatsApp Business.
 *   2. En Twilio Console → Messaging → WhatsApp → Sandbox/Sender:
 *      configurar webhook "When a message comes in" = POST este endpoint.
 *   3. Set `TAMPU_WHATSAPP_SECRET` y `TWILIO_AUTH_TOKEN`.
 *
 * SETUP — Meta Cloud API (alternativa, $0.0042/msg, requiere Meta Business):
 *   1. Crear app en Meta Developers, configurar WhatsApp.
 *   2. Webhook subscription → POST este endpoint con verify_token.
 *
 * PRIVACY: NO persistimos el mensaje WhatsApp. Solo el resultado parseado entra al DB.
 * El número del sender se usa para resolver identidad pero NO se guarda en logs.
 */

interface TwilioPayload {
  From: string;        // "whatsapp:+5491155512345"
  To: string;          // "whatsapp:+15558005400" (el número de Tampu)
  Body: string;
  ProfileName?: string;
  NumMedia?: string;   // "0" o "1"
  MediaUrl0?: string;
  MediaContentType0?: string;
}

interface MetaCloudPayload {
  object: "whatsapp_business_account";
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messages?: Array<{
          from: string;
          text?: { body: string };
          image?: { id: string; mime_type: string };
          type: string;
        }>;
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
      };
      field: string;
    }>;
  }>;
}

interface NormalizedWhatsApp {
  from: string;
  to: string;
  body: string;
  profileName?: string;
  mediaUrl?: string;
  mediaType?: string;
  provider: "twilio" | "meta";
}

function normalizeTwilio(form: FormData): NormalizedWhatsApp {
  const from = String(form.get("From") || "").replace(/^whatsapp:/, "");
  const to = String(form.get("To") || "").replace(/^whatsapp:/, "");
  return {
    from,
    to,
    body: String(form.get("Body") || ""),
    profileName: String(form.get("ProfileName") || "") || undefined,
    mediaUrl: String(form.get("MediaUrl0") || "") || undefined,
    mediaType: String(form.get("MediaContentType0") || "") || undefined,
    provider: "twilio",
  };
}

function normalizeMeta(payload: MetaCloudPayload): NormalizedWhatsApp | null {
  try {
    const change = payload.entry?.[0]?.changes?.[0];
    const msg = change?.value?.messages?.[0];
    const contact = change?.value?.contacts?.[0];
    if (!msg) return null;
    return {
      from: msg.from,
      to: "",
      body: msg.text?.body || "",
      profileName: contact?.profile?.name,
      mediaUrl: msg.image?.id ? `meta-media:${msg.image.id}` : undefined,
      mediaType: msg.image?.mime_type,
      provider: "meta",
    };
  } catch {
    return null;
  }
}

/**
 * Meta exige verificación inicial con GET request + verify_token.
 * Twilio no requiere verificación.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  // ─── DEPRECATED ───
  // Reemplazado por `/api/webhooks/whatsapp` (con signature verification).
  // En producción rechazamos con 410 Gone para forzar la migración. En
  // dev/test seguimos respondiendo para no romper fixtures locales.
  console.warn("[whatsapp-inbound] DEPRECATED — use /api/webhooks/whatsapp");
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error: "gone",
        moved_to: "/api/webhooks/whatsapp",
        message: "Este endpoint fue reemplazado. Actualizá el webhook URL del provider.",
      },
      { status: 410 },
    );
  }

  // 1) Detectar provider y normalizar
  const contentType = req.headers.get("content-type") || "";
  let msg: NormalizedWhatsApp | null = null;

  try {
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      // Twilio
      const form = await req.formData();
      msg = normalizeTwilio(form);
    } else if (contentType.includes("application/json")) {
      // Meta Cloud
      const payload = (await req.json()) as MetaCloudPayload;
      msg = normalizeMeta(payload);
    }
  } catch (err) {
    console.error("[whatsapp-inbound] payload parse failed:", err);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!msg || !msg.body || msg.body.length < 10) {
    // Empty or media-only message — devolvemos OK para que el provider no reintente
    return NextResponse.json({ ok: true, stored: false, reason: "empty-or-media-only" });
  }

  // 2) Parsear con la heurística multilingüe — funciona igual de bien con WhatsApp
  // (de hecho mejor, porque los WhatsApps son más cortos que emails y la heurística
  // gana sin ruido HTML).
  const parsed = heuristicMultiParse(msg.body);

  if (parsed.bookings.length === 0) {
    // No es una confirmación. Respondemos suave para que el user sepa que llegó.
    await ackBookingsParsed(msg.from, 0, null).catch((err) =>
      console.warn("[whatsapp-inbound] ack send failed:", err),
    );
    return NextResponse.json({
      ok: true,
      stored: false,
      reason: "no-bookings-detected",
      from_masked: msg.from.slice(0, 6) + "...",
    });
  }

  // 3) Persistir en `email_inbox` (compartida con email).
  //
  // ¿A quién atribuimos el WhatsApp? El user tiene que haber registrado su
  // número en su profile (`profiles.whatsapp_number`). Si no podemos
  // resolver, archivamos por `from` (número) y el user lo reclama cuando
  // hace el setup del WhatsApp en su perfil.
  //
  // Por privacidad NO almacenamos números completos en la entrada — solo
  // ponemos un alias en `sender` con los últimos 4 dígitos.
  const masked = msg.from.slice(0, 4) + "***" + msg.from.slice(-4);
  const provider: "whatsapp-twilio" | "whatsapp-meta" = msg.provider === "twilio" ? "whatsapp-twilio" : "whatsapp-meta";

  // Resolve recipient_email: lookup profile by whatsapp_number
  const svc = createSupabaseService();
  let recipientEmail: string | null = null;
  if (svc) {
    const { data: profile } = await svc
      .from("profiles")
      .select("email,whatsapp_number")
      .eq("whatsapp_number", msg.from)
      .maybeSingle();
    recipientEmail = (profile as { email?: string } | null)?.email ?? null;

    if (recipientEmail) {
      const { error: insertError } = await svc.from("email_inbox").insert({
        recipient_email: recipientEmail,
        source: provider,
        sender: masked,
        sender_name: msg.profileName || null,
        subject: "WhatsApp",
        carrier_hint: parsed.carrier_hint,
        languages: parsed.languages,
        parsed_payload: parsed,
        bookings_count: parsed.bookings.length,
        status: "pending",
      });
      if (insertError) {
        console.error("[whatsapp-inbound] insert failed:", insertError);
      }
      // Responder al user que su forward fue procesado
      await ackBookingsParsed(msg.from, parsed.bookings.length, parsed.carrier_hint).catch((err) =>
        console.warn("[whatsapp-inbound] ack send failed:", err),
      );
    } else {
      console.warn("[whatsapp-inbound] no profile matched whatsapp_number — entry NOT persisted");
      // Aún así avisamos al user que registre su número en su perfil para que la próxima funcione
      await sendWhatsAppMessage({
        to: msg.from,
        body:
          "👋 Detectamos tu reserva pero tu número no está vinculado a una cuenta Tampu. " +
          "Andá a Tampu → Más → Perfil y agregá este número de WhatsApp para que tus próximos reenvíos lleguen automático.",
      }).catch(() => undefined);
    }
  } else {
    console.warn("[whatsapp-inbound] Supabase service role NOT configured — entry NOT persisted.");
  }

  return NextResponse.json({
    ok: true,
    stored: !!(svc && recipientEmail),
    provider,
    from_masked: masked,
    profile_name: msg.profileName,
    has_media: !!msg.mediaUrl,
    bookings_count: parsed.bookings.length,
    carrier_hint: parsed.carrier_hint,
    languages: parsed.languages,
  });
}
