import { NextRequest, NextResponse } from "next/server";
import { heuristicMultiParse, type ParsedBooking } from "@/lib/parsing/email-parser";
import { createSupabaseService } from "@/lib/supabase/service";
import { extractTripShortIdFromAddress, buildTripIdLikePattern } from "@/lib/email-in/address";
import { selectProvider, callLLM } from "@/lib/ai/providers";

/**
 * Per-trip email-in webhook — `tampu+<SHORTID>@in.tampu.app`.
 *
 * Diferencia vs `/api/email-inbound`:
 *  - email-inbound es la bandeja "global del user" (un single address por user,
 *    ej. plans@tampu.app, que necesita auth Supabase para mostrarse a quien
 *    corresponde).
 *  - email-in es PER-TRIP. Cada Trip tiene su propia address con un suffix.
 *    El user puede forwardear un Booking.com directamente al alias de su
 *    trip de Seúl y aparece ya asignado a ese trip — no hace falta el paso
 *    manual de "elegí a qué trip mandarlo".
 *
 * Soporta dos providers (auto-detect por shape del payload):
 *   1. AWS SES (JSON event con `mail.destination` y `content` MIME base64)
 *   2. Mailgun (form-data con `recipient`, `sender`, `subject`, `body-plain`)
 *
 * Flow:
 *   1. Verificar shared secret (header `x-tampu-webhook-secret`).
 *   2. Normalizar payload → {from, to, subject, bodyText}.
 *   3. Extraer SHORTID del `to` con `extractTripShortIdFromAddress`.
 *   4. Buscar el trip en Supabase cuyo UUID empiece con SHORTID.
 *   5. Parsear el body con `heuristicMultiParse` (no llamamos al LLM en webhook
 *      por costo — la UI puede re-parsear con LLM si hace falta).
 *   6. Insertar en `email_in_entries` con status=parsed.
 *
 * PRIVACY: igual que email-inbound, NO persistimos el body crudo, solo el
 * resultado parseado + metadata para auditoría.
 *
 * SETUP:
 *   - DNS MX para `in.tampu.app` apuntando a SES (o Mailgun MX)
 *   - SES Rule: para *@in.tampu.app → Lambda que POSTea a este endpoint
 *   - ENV: TAMPU_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY
 *   - Supabase: tabla `email_in_entries` (migración pendiente)
 */

interface SESPayload {
  mail: {
    source: string;
    destination: string[];
    commonHeaders?: { from?: string[]; to?: string[]; subject?: string };
  };
  content: string;
}

interface MailgunPayload {
  recipient: string;
  sender: string;
  subject: string;
  "body-plain": string;
  "body-html"?: string;
  "stripped-text"?: string;
}

interface NormalizedEmail {
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  provider: "email-ses" | "email-mailgun";
}

function decodeBase64(b64: string): string {
  try { return Buffer.from(b64, "base64").toString("utf-8"); }
  catch { return ""; }
}

function extractPlainText(raw: string): string {
  const lower = raw.toLowerCase();
  const boundaryMatch = raw.match(/boundary="?([^";\r\n]+)"?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = raw.split(`--${boundary}`);
    for (const part of parts) {
      if (part.toLowerCase().includes("content-type: text/plain")) {
        const idx = part.indexOf("\r\n\r\n");
        if (idx >= 0) return part.slice(idx + 4).trim();
      }
    }
  }
  const headerEnd = lower.indexOf("\r\n\r\n");
  if (headerEnd >= 0) return raw.slice(headerEnd + 4).trim();
  return raw;
}

function normalizeSES(p: SESPayload): NormalizedEmail | null {
  if (!p.mail || !p.content) return null;
  const raw = decodeBase64(p.content);
  if (!raw) return null;
  return {
    from: p.mail.source || p.mail.commonHeaders?.from?.[0] || "",
    to: p.mail.destination?.[0] || p.mail.commonHeaders?.to?.[0] || "",
    subject: p.mail.commonHeaders?.subject || "",
    bodyText: extractPlainText(raw).slice(0, 30_000),
    provider: "email-ses",
  };
}

function normalizeMailgun(p: MailgunPayload): NormalizedEmail {
  return {
    from: p.sender || "",
    to: p.recipient || "",
    subject: p.subject || "",
    bodyText: (p["stripped-text"] || p["body-plain"] || "").slice(0, 30_000),
    provider: "email-mailgun",
  };
}

function extractAddressFromHeader(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim().toLowerCase();
}

function extractDisplayName(raw: string): string | null {
  const m = raw.match(/^"?([^"<]+?)"?\s*</);
  return m ? m[1].trim() : null;
}

// ─── Simple-JSON payload (spec) ─────────────────────────────────────────────
//
// El endpoint también acepta una llamada directa con el shape:
//   { to, from, subject, text, html?, attachments? }
//
// Este modo NO requiere `TAMPU_WEBHOOK_SECRET` — se pensó para clientes
// internos / integraciones tipo Make / Zapier / Cloudflare Email Worker que ya
// hacen su propia autenticación a nivel de transport (ej. firma del webhook
// del provider antes de re-emitir a este endpoint). El operador puede activar
// auth opcional con `TAMPU_EMAIL_IN_SECRET` (header `x-email-in-secret`).
//
// Pasos del happy-path:
//   1. Parsear short_id del `to`.
//   2. Llamar al LLM con la key del header (`x-anthropic-key` / `x-gemini-key`).
//      Si no hay key → 503 con mensaje explícito.
//   3. Si el modelo falla, caer a `heuristicMultiParse` y devolver 200 con
//      `source=heuristic` (no es un error de cliente).
//   4. Persistir en Supabase (`email_in_entries`) si está configurado.
//

interface SimpleInboundJSON {
  to: string;
  from: string;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  attachments?: Array<{ filename?: string; content_type?: string }>;
}

function isSimpleJSON(p: unknown): p is SimpleInboundJSON {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return typeof o.to === "string" && typeof o.from === "string"
    && (typeof o.text === "string" || typeof o.html === "string");
}

function stripHtml(html: string): string {
  // Mínimo viable: removemos tags y entities comunes. No pretende ser un parser
  // HTML completo — para eso ya tenemos PDF/image flow aparte.
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

interface LLMParseResponse {
  bookings: ParsedBooking[];
  language?: string;
  carrier_hint?: string | null;
}

/**
 * Chequea el cap diario de email-in por usuario. Cap de 50 emails/día —
 * protege contra forwards masivos accidentales (ej. un script que reenvía
 * la inbox entera) y contra abuse intencional. Devuelve `{ ok: false }` si
 * el cap se superó, con un `count` para que el caller pueda logear.
 *
 * Si Supabase está mal configurado o la query falla, devolvemos `ok: true`
 * (fail-open) — preferimos aceptar el email a perderlo por un error transit.
 */
async function checkEmailInRateLimit(
  svc: ReturnType<typeof createSupabaseService>,
  userId: string,
): Promise<{ ok: boolean; count: number }> {
  if (!svc) return { ok: true, count: 0 };
  const dayStart = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").toISOString();
  try {
    const { count, error } = await svc
      .from("email_in_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", dayStart);
    if (error) return { ok: true, count: 0 };
    const n = count ?? 0;
    return { ok: n < EMAIL_IN_DAILY_CAP_PER_USER, count: n };
  } catch {
    return { ok: true, count: 0 };
  }
}

const EMAIL_IN_DAILY_CAP_PER_USER = 50;

function safeParseLLM(raw: string): LLMParseResponse | null {
  try {
    let txt = raw.trim();
    const fence = txt.match(/```(?:json)?\s*([\s\S]+?)```/);
    if (fence) txt = fence[1].trim();
    const first = txt.indexOf("{");
    const last = txt.lastIndexOf("}");
    if (first >= 0 && last > first) txt = txt.slice(first, last + 1);
    const j = JSON.parse(txt) as LLMParseResponse;
    if (!Array.isArray(j.bookings)) return null;
    return j;
  } catch { return null; }
}

const EMAIL_PARSE_SYSTEM = `Sos un parser de emails de confirmación de viaje LatAm. Recibís texto y devolvés JSON puro con shape:
{ "bookings": [...], "language": "es"|"pt"|"en"|"fr"|"it"|null, "carrier_hint": string|null }
Cada booking: { type, provider, city_name, description, use_date (YYYY-MM-DD|null), use_end_date, payment_deadline, original_amount (number), original_currency (ISO 4217), status, locator, contact, is_cancellable, cancellation_policy, notes, confidence: "high"|"medium"|"low" }.
Si el email contiene múltiples reservas (ida+vuelta, vuelo+hotel+seguro), separá cada una. Soportá carriers LatAm (LATAM, Aerolineas Argentinas, Gol, Azul, Avianca, Copa, Despegar, Decolar, Almundo, Airbnb, Booking) e idiomas mezclados es/pt-BR/en. NO incluyas markdown ni texto fuera del JSON.`;

async function handleSimpleJSON(
  req: NextRequest,
  body: SimpleInboundJSON,
  origin: string | null,
): Promise<NextResponse> {
  // Auth opcional para llamadas server-to-server
  const optionalSecret = process.env.TAMPU_EMAIL_IN_SECRET;
  if (optionalSecret) {
    const provided = req.headers.get("x-email-in-secret");
    if (provided !== optionalSecret) {
      return withCors(NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }), origin);
    }
  }

  const shortId = extractTripShortIdFromAddress(body.to);
  if (!shortId) {
    return withCors(NextResponse.json({
      ok: false,
      error: "Recipient address has no trip suffix",
      to: body.to,
    }, { status: 400 }), origin);
  }

  const text = (body.text || stripHtml(body.html || "")).slice(0, 30_000);
  if (!text || text.length < 20) {
    return withCors(NextResponse.json({ ok: false, error: "Email body too short or empty" }, { status: 422 }), origin);
  }

  // LLM key check — si no hay key configurada → 503 (spec)
  const { provider, key } = selectProvider(req);
  if (!provider || !key) {
    return withCors(NextResponse.json({
      ok: false,
      error: "AI provider not configured. Conectá tu key en /settings o seteá ANTHROPIC_API_KEY / GEMINI_API_KEY en el server.",
      hint: "Mandá header `x-anthropic-key` o `x-gemini-key`.",
    }, { status: 503 }), origin);
  }

  let llm: LLMParseResponse | null = null;
  const raw = await callLLM(provider, key, {
    system: EMAIL_PARSE_SYSTEM,
    userMessage: `EMAIL:\nFrom: ${body.from}\nSubject: ${body.subject || ""}\n\n${text}`,
    maxTokens: 2048,
    timeoutMs: 30_000,
  });
  if (raw) llm = safeParseLLM(raw);

  // Si LLM falló, intentamos heurística como red de seguridad (no 422 — el operador
  // del webhook ya nos confió el email, queremos al menos guardar el "failed" para
  // que el user pueda revisar).
  let bookings: ParsedBooking[] = llm?.bookings ?? [];
  let carrierHint: string | null = llm?.carrier_hint ?? null;
  let languages: string[] = llm?.language ? [llm.language] : [];
  let source: "llm" | "heuristic" = "llm";
  if (bookings.length === 0) {
    const h = heuristicMultiParse(text);
    if (h.bookings.length > 0) {
      bookings = h.bookings;
      carrierHint = carrierHint || h.carrier_hint;
      languages = languages.length ? languages : h.languages;
      source = "heuristic";
    }
  }

  // Persistir si hay Supabase
  const svc = createSupabaseService();
  if (svc) {
    const { data: trips } = await svc
      .from("trips")
      .select("id, user_id")
      .like("id", buildTripIdLikePattern(shortId))
      .limit(2);
    if (trips && trips.length === 1) {
      const trip = trips[0];
      // Rate-limit antes del insert: máximo 50 emails/día/user.
      const rl = await checkEmailInRateLimit(svc, trip.user_id);
      if (!rl.ok) {
        return withCors(NextResponse.json({
          ok: false,
          error: "Rate limit reached (50 emails/day for this trip's owner)",
          short_id: shortId,
          count_today: rl.count,
        }, { status: 429 }), origin);
      }
      await svc.from("email_in_entries").insert({
        trip_id: trip.id,
        user_id: trip.user_id,
        short_id: shortId,
        from_address: extractAddressFromHeader(body.from),
        from_name: extractDisplayName(body.from),
        subject: body.subject || null,
        provider: "email-direct",
        status: bookings.length > 0 ? "parsed" : "failed",
        bookings_count: bookings.length,
        carrier_hint: carrierHint,
        languages,
        parsed_bookings: bookings,
        error_message: bookings.length === 0 ? "No bookings detected" : null,
      });
    }
  }

  if (bookings.length === 0) {
    return withCors(NextResponse.json({
      ok: false,
      error: "No bookings detected in this email",
      short_id: shortId,
      source,
    }, { status: 422 }), origin);
  }

  return withCors(NextResponse.json({
    ok: true,
    short_id: shortId,
    bookings_count: bookings.length,
    bookings,
    carrier_hint: carrierHint,
    languages,
    source,
  }), origin);
}

// ─── CORS (también para el flow simple-JSON desde el browser) ──────────────
const ALLOWED_ORIGINS = ["capacitor://localhost", "ionic://localhost"];

function withCors(res: NextResponse, origin: string | null): NextResponse {
  const ok =
    !origin ||
    ALLOWED_ORIGINS.includes(origin) ||
    origin.startsWith("http://localhost") ||
    origin.endsWith(".vercel.app");
  if (ok && origin) res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, x-anthropic-key, x-gemini-key, x-email-in-secret, x-tampu-webhook-secret"
  );
  res.headers.set("Vary", "Origin");
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return withCors(new NextResponse(null, { status: 204 }), req.headers.get("origin"));
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const contentType = req.headers.get("content-type") || "";

  // Branch 1: Simple-JSON (spec). Lo identificamos por shape — el body tiene
  // `text` o `html` y NO tiene `mail.content` (eso es SES).
  if (contentType.includes("application/json")) {
    // Necesitamos clonar el request porque vamos a leer body en una o en la otra branch.
    let payload: unknown = null;
    try {
      payload = await req.json();
    } catch {
      return withCors(NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }), origin);
    }

    if (isSimpleJSON(payload)) {
      return handleSimpleJSON(req, payload, origin);
    }

    // Es JSON pero no es simple-JSON → fall through a la branch SES.
    // Re-construimos un request "mockeado" para la lógica de webhook.
    const sesPayload = payload as SESPayload;
    return handleWebhookFromSES(req, sesPayload, origin);
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    return handleWebhookFromMailgun(req, origin);
  }

  return withCors(NextResponse.json({ ok: false, error: "Unsupported content-type" }, { status: 415 }), origin);
}

// ─── Webhook branches (SES / Mailgun) — sigue requiriendo TAMPU_WEBHOOK_SECRET ──

async function handleWebhookFromSES(req: NextRequest, payload: SESPayload, origin: string | null): Promise<NextResponse> {
  const secretCheck = checkWebhookSecret(req);
  if (secretCheck) return withCors(secretCheck, origin);
  const email = normalizeSES(payload);
  return commonWebhookFinalize(email, origin);
}

async function handleWebhookFromMailgun(req: NextRequest, origin: string | null): Promise<NextResponse> {
  const secretCheck = checkWebhookSecret(req);
  if (secretCheck) return withCors(secretCheck, origin);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return withCors(NextResponse.json({ ok: false, error: "Invalid form payload" }, { status: 400 }), origin);
  }
  const payload: MailgunPayload = {
    recipient: String(form.get("recipient") || ""),
    sender: String(form.get("sender") || ""),
    subject: String(form.get("subject") || ""),
    "body-plain": String(form.get("body-plain") || ""),
    "body-html": String(form.get("body-html") || ""),
    "stripped-text": String(form.get("stripped-text") || ""),
  };
  return commonWebhookFinalize(normalizeMailgun(payload), origin);
}

function checkWebhookSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.TAMPU_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[email-in] TAMPU_WEBHOOK_SECRET not configured — refusing webhook.");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }
  if (req.headers.get("x-tampu-webhook-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

async function commonWebhookFinalize(email: NormalizedEmail | null, origin: string | null): Promise<NextResponse> {
  if (!email || !email.bodyText || email.bodyText.length < 20) {
    return withCors(NextResponse.json({ error: "Email too short or empty" }, { status: 400 }), origin);
  }

  const shortId = extractTripShortIdFromAddress(email.to);
  if (!shortId) {
    return withCors(NextResponse.json({
      error: "Recipient address has no trip suffix",
      to: email.to,
    }, { status: 400 }), origin);
  }

  const svc = createSupabaseService();
  if (!svc) {
    return withCors(NextResponse.json({
      ok: false,
      error: "Supabase service role not configured",
    }, { status: 503 }), origin);
  }

  const { data: trips, error: tripErr } = await svc
    .from("trips")
    .select("id, user_id")
    .like("id", buildTripIdLikePattern(shortId))
    .limit(2);

  if (tripErr) {
    console.error("[email-in] trip lookup failed:", tripErr);
    return withCors(NextResponse.json({ error: "Trip lookup failed" }, { status: 500 }), origin);
  }
  if (!trips || trips.length === 0) {
    return withCors(NextResponse.json({ error: "No trip matches short_id", short_id: shortId }, { status: 404 }), origin);
  }
  if (trips.length > 1) {
    console.warn("[email-in] short_id collision", { shortId, ids: trips.map(t => t.id) });
    return withCors(NextResponse.json({ error: "Ambiguous trip short_id", short_id: shortId }, { status: 409 }), origin);
  }
  const trip = trips[0];

  const parsed = heuristicMultiParse(email.bodyText);
  const fromAddr = extractAddressFromHeader(email.from);
  const fromName = extractDisplayName(email.from);

  // Rate-limit antes del insert: máximo 50 emails/día/user. Si lo superó,
  // devolvemos 429 y NO insertamos — Mailgun/SES van a reintentar y el
  // operador ve el rebote en logs (no perdemos visibility silenciosa).
  const rl = await checkEmailInRateLimit(svc, trip.user_id);
  if (!rl.ok) {
    return withCors(NextResponse.json({
      error: "Rate limit reached (50 emails/day for this user)",
      short_id: shortId,
      count_today: rl.count,
    }, { status: 429 }), origin);
  }

  const { data: inserted, error: insertErr } = await svc
    .from("email_in_entries")
    .insert({
      trip_id: trip.id,
      user_id: trip.user_id,
      short_id: shortId,
      from_address: fromAddr,
      from_name: fromName,
      subject: email.subject || null,
      provider: email.provider,
      status: parsed.bookings.length > 0 ? "parsed" : "failed",
      bookings_count: parsed.bookings.length,
      carrier_hint: parsed.carrier_hint,
      languages: parsed.languages,
      parsed_bookings: parsed.bookings,
      error_message: parsed.bookings.length === 0 ? "No bookings detected" : null,
    })
    .select()
    .maybeSingle();

  if (insertErr) {
    console.error("[email-in] insert failed:", insertErr);
    return withCors(NextResponse.json({ error: "Insert failed", details: insertErr.message }, { status: 500 }), origin);
  }

  return withCors(NextResponse.json({
    ok: true,
    entry_id: inserted?.id,
    trip_id: trip.id,
    bookings_count: parsed.bookings.length,
    carrier_hint: parsed.carrier_hint,
    languages: parsed.languages,
  }), origin);
}

/**
 * GET /api/email-in?trip_id=... — lista los últimos 20 entries de ese trip.
 * Requiere auth (Supabase server client; RLS filtra por user_id).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tripId = url.searchParams.get("trip_id");
  if (!tripId) {
    return NextResponse.json({ error: "trip_id required" }, { status: 400 });
  }

  // Lazy import for createSupabaseServer to avoid pulling cookies() into the
  // top-level scope of a webhook that often doesn't need it.
  const { createSupabaseServer } = await import("@/lib/supabase/server");
  const sb = await createSupabaseServer();
  if (!sb) {
    return NextResponse.json({ ok: true, entries: [], reason: "supabase-not-configured" });
  }
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await sb
    .from("email_in_entries")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, entries: data || [] });
}
