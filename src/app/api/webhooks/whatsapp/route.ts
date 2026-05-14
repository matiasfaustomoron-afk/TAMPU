// ─── POST /api/webhooks/whatsapp ──────────────────────────────────────────
//
// Webhook que recibe mensajes inbound de Twilio (WhatsApp Sandbox o sender
// production). Twilio espera respuesta HTTP 200 dentro de 15s o reintenta —
// por eso el parsing con LLM se hace fire-and-forget DESPUÉS de devolver
// la respuesta TwiML inicial. Si tarda más, Twilio asume fail y reintenta
// el mismo MessageSid (idempotencia nos cubre).
//
// Flow:
//   1. Validar firma X-Twilio-Signature contra TWILIO_AUTH_TOKEN
//   2. Parsear body form-urlencoded (Twilio NO manda JSON)
//   3. Idempotencia: si twilio_message_sid ya existe → 200 OK sin re-procesar
//   4. Lookup del user por phone (whatsapp_links verified)
//      - Si no hay match y body parece código → flow de verification
//      - Si no hay match y no es código → reply "no estás vinculado"
//   5. Si hay match:
//      - Si tiene media → status=ignored, reply "solo texto por ahora"
//      - Si es texto → insert whatsapp_messages, llamar parser, reply resumen
//   6. Devolver TwiML con el reply
//
// Costo: ~USD 0.005 / mensaje target (Haiku) + ~USD 0.005 Twilio.

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseService } from "@/lib/supabase/service";
import { captureException, captureMessage } from "@/lib/observability/sentry";
import {
  validateTwilioSignature,
  parseWhatsAppFrom,
  twimlResponse,
  extractVerificationCode,
  sendWhatsAppMessage,
  formatPhoneForWhatsApp,
} from "@/lib/whatsapp/twilio";
import { parseWhatsAppText, summarizeParsedItem } from "@/lib/whatsapp/parser";
import { autoInsertParsedItem, skippedReasonToUserMessage } from "@/lib/whatsapp/auto-insert";
import { checkDailyBudget } from "@/lib/ai/rate-limit";

export const runtime = "nodejs";

// Límite mensual por user. Tampu+ (lifetime USD 29) lo desbloquea — chequeamos
// is_tampu_plus() vía RPC para usuarios autenticados antes del cap.
const MONTHLY_LIMIT_FREE = 200;

const WHATSAPP_INGESTION_BUDGET_USD = Number(
  // Default subido a 20 (audit 05/2026) — el budget de 5 era restrictivo
  // y bloqueaba el feature en testing real. Igual configurable por env.
  process.env.WHATSAPP_INGESTION_DAILY_BUDGET_USD || "20",
);

// Hard-coded per-user daily cap (audit 05/2026): nadie puede gastar más de
// USD 0.50/día por mí sin un upgrade explícito a Tampu+. Esto protege
// contra abuse de un usuario único que sature el budget global.
const WHATSAPP_PER_USER_DAILY_USD = 0.5;

/**
 * Parsea el body application/x-www-form-urlencoded de Twilio en un mapa
 * plano de strings (todos los params de Twilio son string).
 */
function parseFormUrlEncoded(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const params = new URLSearchParams(raw);
  params.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/**
 * Reconstruye la URL completa del webhook como la ve Twilio (necesario
 * para validar la firma). Twilio firma sobre la URL que el user puso en
 * el Twilio Console — si hay proxy / CDN delante, hay que tomar
 * X-Forwarded-Proto + Host. Usamos `WHATSAPP_WEBHOOK_PUBLIC_URL` si está
 * (override explícito), si no derivamos del request.
 */
function getWebhookUrl(req: NextRequest): string {
  const override = process.env.WHATSAPP_WEBHOOK_PUBLIC_URL;
  if (override) return override;
  // Tomamos host/proto del request original (Vercel los inyecta vía headers).
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  // Path absoluto del webhook (sin query, Twilio firma path sin query):
  return `${proto}://${host}/api/webhooks/whatsapp`;
}

export async function POST(req: NextRequest) {
  // 1. Leer body crudo (necesario para validar firma)
  const rawBody = await req.text();
  const params = parseFormUrlEncoded(rawBody);
  const signature = req.headers.get("x-twilio-signature");
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const url = getWebhookUrl(req);

  if (!authToken) {
    // eslint-disable-next-line no-console
    console.error("[wa-webhook] TWILIO_AUTH_TOKEN no seteado — rechazando request");
    return NextResponse.json({ error: "twilio_not_configured" }, { status: 503 });
  }

  // Skip signature validation si está habilitado en dev (NUNCA en prod).
  // Defaultea a "validar siempre".
  const skipSig = process.env.WHATSAPP_WEBHOOK_SKIP_SIGNATURE === "1"
    && process.env.NODE_ENV !== "production";
  if (!skipSig) {
    const ok = validateTwilioSignature(signature, url, params, authToken);
    if (!ok) {
      // eslint-disable-next-line no-console
      console.warn("[wa-webhook] invalid signature for url:", url);
      captureMessage("WhatsApp webhook: invalid signature", {
        tag: "wa-webhook",
        level: "warning",
        extra: { url, has_signature: !!signature },
      });
      return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
    }
  }

  // 2. Extraer params relevantes
  const messageSid = params.MessageSid ?? params.SmsMessageSid ?? "";
  const fromRaw = params.From ?? "";
  const body = (params.Body ?? "").trim();
  const numMedia = Number(params.NumMedia ?? "0") || 0;
  const phoneE164 = parseWhatsAppFrom(fromRaw);

  if (!messageSid || !phoneE164) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const mediaTypes: string[] = [];
  for (let i = 0; i < numMedia; i++) {
    const t = params[`MediaContentType${i}`];
    if (t) mediaTypes.push(t);
  }

  // 3. Service client
  const sb = createSupabaseService();
  if (!sb) {
    // eslint-disable-next-line no-console
    console.error("[wa-webhook] supabase service no configurado — Twilio reintentará");
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  // 4. Idempotencia
  const { data: existing } = await sb
    .from("whatsapp_messages")
    .select("id, status")
    .eq("twilio_message_sid", messageSid)
    .maybeSingle();
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`[wa-webhook] mensaje ${messageSid} ya procesado (status=${existing.status})`);
    return new NextResponse(twimlResponse(), {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });
  }

  // 5. Identificar al user (sólo links verified)
  const { data: link } = await sb
    .from("whatsapp_links")
    .select("user_id, verification_code, verification_expires_at, verified_at, failed_attempts")
    .eq("phone_e164", phoneE164)
    .maybeSingle();

  // ─── 5a. Si el body es un código y hay verification pending → completar ──
  const codeFromBody = extractVerificationCode(body);
  if (codeFromBody && link && !link.verified_at) {
    const expired = link.verification_expires_at
      ? new Date(link.verification_expires_at).getTime() < Date.now()
      : true;
    if (expired) {
      const reply = "El código expiró. Pedí uno nuevo desde la app (Ajustes → WhatsApp).";
      // No guardamos este mensaje (status verification fallida); no es spam.
      return new NextResponse(twimlResponse(reply), {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }
    if (link.verification_code === codeFromBody) {
      // Match — flippear verified_at
      const { error: updErr } = await sb
        .from("whatsapp_links")
        .update({
          verified_at: new Date().toISOString(),
          verification_code: null,
          verification_expires_at: null,
          failed_attempts: 0,
        })
        .eq("user_id", link.user_id);
      if (updErr) {
        // eslint-disable-next-line no-console
        console.error("[wa-webhook] no se pudo verificar link:", updErr.message);
      }
      // Audit log
      await sb.from("whatsapp_messages").insert({
        user_id: link.user_id,
        twilio_message_sid: messageSid,
        direction: "inbound",
        phone_e164: phoneE164,
        body,
        status: "verification",
        metadata: { kind: "verification_success" },
      });
      const reply = "Listo. Tu WhatsApp está vinculado a Tampu. Reenviame cualquier confirmación de viaje (vuelos, hoteles, tours, mensajes del host) y la agrego automáticamente. 🤝";
      return new NextResponse(twimlResponse(reply), {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    } else {
      // Código no matchea — incrementar failed_attempts
      const newAttempts = (link.failed_attempts ?? 0) + 1;
      if (newAttempts >= 5) {
        // Demasiados intentos — borrar el row para forzar restart desde la app
        await sb.from("whatsapp_links").delete().eq("user_id", link.user_id);
        const reply = "Demasiados intentos fallidos. Empezá la vinculación de cero desde la app (Ajustes → WhatsApp).";
        return new NextResponse(twimlResponse(reply), {
          status: 200,
          headers: { "Content-Type": "application/xml" },
        });
      }
      await sb.from("whatsapp_links")
        .update({ failed_attempts: newAttempts })
        .eq("user_id", link.user_id);
      const reply = `Código incorrecto. Te quedan ${5 - newAttempts} intentos. Revisá el código que mandamos desde la app.`;
      return new NextResponse(twimlResponse(reply), {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }
  }

  // ─── 5b. Si NO hay link verified → no guardamos, mandamos reply genérico ──
  if (!link || !link.verified_at) {
    const reply = "Hola. Este número no está vinculado a una cuenta Tampu. Vinculalo desde la app (Ajustes → WhatsApp) y te empiezo a agregar las confirmaciones de viaje automáticamente.";
    return new NextResponse(twimlResponse(reply), {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });
  }

  const userId = link.user_id;

  // ─── 6. Rate-limit mensual por user (Tampu+ unlimited) ──────────────────
  // Consultamos is_tampu_plus(user_id) — si el user pagó el lifetime, su
  // cap es Infinity. Si la RPC falla (función no existe en este deploy o
  // error transitorio), tratamos al user como free para no abrir la
  // puerta a abuso accidental.
  let isPlus = false;
  try {
    const { data: plusData } = await sb.rpc("is_tampu_plus", { p_user_id: userId });
    isPlus = plusData === true;
  } catch {
    isPlus = false;
  }
  const monthlyLimit = isPlus ? Number.POSITIVE_INFINITY : MONTHLY_LIMIT_FREE;

  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const { count: monthCount } = await sb
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("direction", "inbound")
    .in("status", ["parsed", "received", "failed"])
    .gte("received_at", monthStart);
  if ((monthCount ?? 0) >= monthlyLimit) {
    const reply = `Llegaste al límite mensual de ${MONTHLY_LIMIT_FREE} mensajes parseados. Se renueva el mes que viene. Si querés más, Tampu+ (lifetime USD 29) lo desbloquea.`;
    // Guardamos como ignored para tracking
    await sb.from("whatsapp_messages").insert({
      user_id: userId,
      twilio_message_sid: messageSid,
      direction: "inbound",
      phone_e164: phoneE164,
      body,
      status: "ignored",
      metadata: { kind: "monthly_cap_reached" },
    });
    return new NextResponse(twimlResponse(reply), {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });
  }

  // ─── 7. Circuit breaker: budget global y budget WhatsApp ────────────────
  const globalBudget = await checkDailyBudget();
  if (globalBudget.exceeded) {
    const reply = "Tampu se quedó sin presupuesto IA del día. Probá de nuevo mañana 🙏";
    await sb.from("whatsapp_messages").insert({
      user_id: userId,
      twilio_message_sid: messageSid,
      direction: "inbound",
      phone_e164: phoneE164,
      body,
      status: "ignored",
      metadata: { kind: "global_budget_exceeded" },
    });
    return new NextResponse(twimlResponse(reply), {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });
  }

  // Budget específico WhatsApp (subset del global) + per-user cap
  const dayStart = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").toISOString();
  const { data: waCostRows } = await sb
    .from("whatsapp_messages")
    .select("cost_usd, user_id")
    .gte("received_at", dayStart);
  const allRows = waCostRows ?? [];
  const waSpent = allRows.reduce((acc, r) => acc + Number((r as { cost_usd: number | null }).cost_usd ?? 0), 0);

  // Per-user cap (excepto Tampu+, que no tiene cap diario tampoco).
  if (!isPlus) {
    const userSpent = allRows
      .filter(r => (r as { user_id: string | null }).user_id === userId)
      .reduce((acc, r) => acc + Number((r as { cost_usd: number | null }).cost_usd ?? 0), 0);
    if (userSpent >= WHATSAPP_PER_USER_DAILY_USD) {
      const reply = `Llegaste a tu límite diario de costo IA (USD ${WHATSAPP_PER_USER_DAILY_USD.toFixed(2)}). Se resetea mañana. Si querés más, Tampu+ (USD 29 lifetime) lo desbloquea.`;
      await sb.from("whatsapp_messages").insert({
        user_id: userId,
        twilio_message_sid: messageSid,
        direction: "inbound",
        phone_e164: phoneE164,
        body,
        status: "ignored",
        metadata: { kind: "per_user_daily_cap_reached", spent_usd: userSpent },
      });
      return new NextResponse(twimlResponse(reply), {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }
  }

  if (waSpent >= WHATSAPP_INGESTION_BUDGET_USD) {
    const reply = "Tampu se quedó sin presupuesto del día para parsear WhatsApp. Probá mañana 🙏";
    await sb.from("whatsapp_messages").insert({
      user_id: userId,
      twilio_message_sid: messageSid,
      direction: "inbound",
      phone_e164: phoneE164,
      body,
      status: "ignored",
      metadata: { kind: "whatsapp_daily_budget_exceeded" },
    });
    return new NextResponse(twimlResponse(reply), {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });
  }

  // ─── 8. Media → status=ignored (MVP solo procesa texto) ────────────────
  if (numMedia > 0) {
    await sb.from("whatsapp_messages").insert({
      user_id: userId,
      twilio_message_sid: messageSid,
      direction: "inbound",
      phone_e164: phoneE164,
      body: body || null,
      media_count: numMedia,
      media_types: mediaTypes,
      status: "ignored",
      metadata: { kind: "media_not_supported_in_mvp" },
    });
    const reply = "Por ahora solo entiendo texto. Imágenes (boarding pass, screenshots) y PDFs los voy a parsear en la próxima versión 📸";
    return new NextResponse(twimlResponse(reply), {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });
  }

  // ─── 9. Body vacío → ignored ───────────────────────────────────────────
  if (!body) {
    await sb.from("whatsapp_messages").insert({
      user_id: userId,
      twilio_message_sid: messageSid,
      direction: "inbound",
      phone_e164: phoneE164,
      body: null,
      status: "ignored",
      metadata: { kind: "empty_body" },
    });
    return new NextResponse(twimlResponse("No recibí texto en el mensaje. Mandá la confirmación como texto y lo agrego al viaje."), {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });
  }

  // ─── 10. Insertar mensaje + lookup trip activo del user ────────────────
  const { data: msgRow, error: insErr } = await sb
    .from("whatsapp_messages")
    .insert({
      user_id: userId,
      twilio_message_sid: messageSid,
      direction: "inbound",
      phone_e164: phoneE164,
      body,
      status: "received",
    })
    .select("id")
    .single();
  if (insErr || !msgRow) {
    // eslint-disable-next-line no-console
    console.error("[wa-webhook] insert message failed:", insErr?.message);
    captureException(insErr, { tag: "wa-webhook.insert" });
    return new NextResponse(twimlResponse("Ups, falló algo de mi lado. Reintentá en unos minutos."), {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });
  }

  // Trip activo del user (más reciente con status=active, fallback al más
  // reciente con status=planning).
  const { data: activeTrip } = await sb
    .from("trips")
    .select("id, destination, start_date, end_date, status")
    .eq("user_id", userId)
    .in("status", ["active", "planning"])
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ─── 11. Parsear con LLM (await — necesitamos el resumen para el reply) ─
  // En production con muchos messages, considerá hacer esto fire-and-forget
  // y mandar el reply de confirmación en un mensaje separado vía Twilio API.
  // Pero el target latency de Twilio (<15s) acepta esto si Haiku responde
  // en <5s — que es lo normal.
  const parseResult = await parseWhatsAppText(body, {
    userId,
    tripContext: activeTrip
      ? { destination: activeTrip.destination, start_date: activeTrip.start_date, end_date: activeTrip.end_date }
      : undefined,
  });

  if (!parseResult.parsed) {
    await sb.from("whatsapp_messages").update({
      status: "failed",
      error_message: parseResult.error ?? "parser_returned_null",
      parsed_at: new Date().toISOString(),
    }).eq("id", msgRow.id);
    const reply = "No pude parsear el mensaje. Lo guardé igual — podés verlo en la app (sección WhatsApp).";
    return new NextResponse(twimlResponse(reply), {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });
  }

  // Update con el resultado del parser
  await sb.from("whatsapp_messages").update({
    status: "parsed",
    parsed_json: parseResult.parsed,
    parser_provider: parseResult.provider,
    parser_model: parseResult.model,
    cost_usd: parseResult.costUsd,
    trip_id: activeTrip?.id ?? null,
    parsed_at: new Date().toISOString(),
  }).eq("id", msgRow.id);

  // ─── 11b. Auto-insertar al trip si es seguro ────────────────────────────
  // El gate de auto-insert vive en auto-insert.ts. Si pasa, creamos una row
  // en `reservations` y linkeamos via auto_inserted_item_id. Si no, dejamos
  // el msg en status=parsed con auto_insert_skipped_reason para que el user
  // confirme manual desde /whatsapp.
  //
  // Sync (no fire-and-forget) — el insert es ~50-200ms y el target Twilio
  // es <15s. Si en testing real vemos timeouts (>10s), migramos a fire-and-
  // forget y mandamos un segundo WhatsApp con sendWhatsAppMessage().
  const autoInsert = await autoInsertParsedItem(
    sb,
    msgRow.id,
    userId,
    parseResult.parsed,
  );

  if (autoInsert.inserted && autoInsert.itemId && autoInsert.tripId) {
    await sb.from("whatsapp_messages").update({
      trip_id: autoInsert.tripId,
      auto_inserted_item_id: autoInsert.itemId,
    }).eq("id", msgRow.id);
  } else if (autoInsert.skippedReason) {
    await sb.from("whatsapp_messages").update({
      auto_insert_skipped_reason: autoInsert.skippedReason,
      // Si la razón fue idempotent_skip y autoInsert nos devolvió el itemId
      // existente, también lo guardamos.
      ...(autoInsert.itemId ? { auto_inserted_item_id: autoInsert.itemId } : {}),
    }).eq("id", msgRow.id);
    if (autoInsert.error) {
      captureException(new Error(autoInsert.error), {
        tag: "wa-webhook.auto-insert",
        level: "warning",
        extra: { reason: autoInsert.skippedReason, msgId: msgRow.id },
      });
    }
  }

  // ─── 12. Reply al user ─────────────────────────────────────────────────
  let reply: string;
  if (parseResult.parsed.type === "unknown") {
    reply = "Recibí tu mensaje pero no pude identificar info de viaje. Lo guardé igual — revisalo en la app (sección WhatsApp).";
  } else if (autoInsert.inserted) {
    reply = `✓ Agregué tu ${summarizeParsedItem(parseResult.parsed)} al viaje. Revisalo en la app.`;
  } else {
    const why = autoInsert.skippedReason
      ? ` ${skippedReasonToUserMessage(autoInsert.skippedReason)}`
      : "";
    reply = `Recibí tu ${summarizeParsedItem(parseResult.parsed)}.${why} Verlo en la app (sección WhatsApp).`;
  }

  // Log outbound (audit + tracking de costo Twilio futuro)
  // No mandamos por Twilio API: el TwiML response YA es el outbound del
  // sandbox. Igual lo registramos para análisis.
  await sb.from("whatsapp_messages").insert({
    user_id: userId,
    twilio_message_sid: `${messageSid}-reply`,
    direction: "outbound",
    phone_e164: phoneE164,
    body: reply,
    status: "outbound",
    metadata: { in_reply_to: messageSid },
  });

  return new NextResponse(twimlResponse(reply), {
    status: 200,
    headers: { "Content-Type": "application/xml" },
  });
}

// Twilio puede mandar un GET de health-check al setup del webhook.
export async function GET() {
  return NextResponse.json({ ok: true, service: "tampu-whatsapp-webhook" });
}

// Re-export para que sendWhatsAppMessage / formatPhoneForWhatsApp queden
// disponibles para futuros endpoints si los necesitamos (placeholder, evita
// que TS marque imports como unused durante desarrollo).
void sendWhatsAppMessage;
void formatPhoneForWhatsApp;
