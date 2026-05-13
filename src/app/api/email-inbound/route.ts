import { NextRequest, NextResponse } from "next/server";
import { heuristicMultiParse } from "@/lib/parsing/email-parser";
import { createSupabaseService } from "@/lib/supabase/service";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Email inbound webhook — `plans@tampu.app`.
 *
 * Soporta dos providers (auto-detect por shape del payload):
 *  1. AWS SES → S3 + SNS event con `{ mail: { source, destination, ... }, content: base64 }`
 *  2. Mailgun → POST form-data con `recipient`, `sender`, `body-plain`, `body-html`, `stripped-text`
 *
 * Flow:
 *  1. Verificar shared secret (header `x-tampu-webhook-secret`).
 *  2. Extraer { from, subject, body, recipient }.
 *  3. Parsear el body con `heuristicMultiParse` (sin LLM, sin enviar a Anthropic).
 *  4. Persistir entrada en `email_inbox` (Supabase) con service-role-key.
 *  5. El user verá la bandeja en /import y hará tap → commit a su trip activo.
 *
 * PRIVACY: NO persistimos el body crudo. Solo el resultado parseado.
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
  try {
    return Buffer.from(b64, "base64").toString("utf-8");
  } catch {
    return "";
  }
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

function extractEmailFromHeader(raw: string): string {
  // "Pepe Ruiz <pepe@bar.com>" → "pepe@bar.com"
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim().toLowerCase();
}

export async function POST(req: NextRequest) {
  // 1) Shared secret
  const secret = process.env.TAMPU_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[email-inbound] TAMPU_WEBHOOK_SECRET not configured — refusing.");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }
  const provided = req.headers.get("x-tampu-webhook-secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2) Normalize payload
  const contentType = req.headers.get("content-type") || "";
  let email: NormalizedEmail | null = null;

  try {
    if (contentType.includes("application/json")) {
      const payload = (await req.json()) as SESPayload;
      email = normalizeSES(payload);
    } else if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const form = await req.formData();
      const payload: MailgunPayload = {
        recipient: String(form.get("recipient") || ""),
        sender: String(form.get("sender") || ""),
        subject: String(form.get("subject") || ""),
        "body-plain": String(form.get("body-plain") || ""),
        "body-html": String(form.get("body-html") || ""),
        "stripped-text": String(form.get("stripped-text") || ""),
      };
      email = normalizeMailgun(payload);
    }
  } catch (err) {
    console.error("[email-inbound] payload parse failed:", err);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!email || !email.bodyText || email.bodyText.length < 20) {
    return NextResponse.json({ error: "Email too short or empty" }, { status: 400 });
  }

  // 3) Parse bookings (heurística — sin LLM)
  const parsed = heuristicMultiParse(email.bodyText);

  // 4) Persistir en `email_inbox` (Supabase service role) si está configurado.
  const recipientEmail = extractEmailFromHeader(email.from);
  const senderName = (email.from.match(/^"?([^"<]+?)"?\s*</) || [])[1]?.trim();

  const svc = createSupabaseService();
  if (svc) {
    const { error: insertError } = await svc.from("email_inbox").insert({
      recipient_email: recipientEmail,
      source: email.provider,
      sender: recipientEmail,
      sender_name: senderName || null,
      subject: email.subject || null,
      carrier_hint: parsed.carrier_hint,
      languages: parsed.languages,
      parsed_payload: parsed,
      bookings_count: parsed.bookings.length,
      status: "pending",
    });
    if (insertError) {
      console.error("[email-inbound] insert failed:", insertError);
      // No abortamos — devolvemos al cliente igual para que pueda debugear.
    }
  } else {
    console.warn("[email-inbound] Supabase service role NOT configured — entry NOT persisted. Set SUPABASE_SERVICE_ROLE_KEY.");
  }

  return NextResponse.json({
    ok: true,
    stored: !!svc,
    from: email.from,
    to: email.to,
    subject: email.subject,
    bookings_count: parsed.bookings.length,
    carrier_hint: parsed.carrier_hint,
    languages: parsed.languages,
  });
}

/**
 * GET /api/email-inbound — devuelve la bandeja del user actual.
 *
 * Requiere auth Supabase (cookies). Filtra por `recipient_email = auth.users.email`
 * via RLS. Solo entries con status='pending'.
 */
export async function GET() {
  const sb = await createSupabaseServer();
  if (!sb) {
    return NextResponse.json({ ok: true, pending: [], reason: "supabase-not-configured" });
  }
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await sb
    .from("email_inbox")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[email-inbound:GET] query failed:", error);
    return NextResponse.json({ ok: false, error: "query-failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pending: data || [] });
}

/**
 * PATCH /api/email-inbound — marca una entrada como committed o dismissed.
 *
 * Body: { id: string, action: "commit" | "dismiss", trip_id?: string }
 */
export async function PATCH(req: NextRequest) {
  const sb = await createSupabaseServer();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase-not-configured" }, { status: 503 });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: { id?: string; action?: "commit" | "dismiss"; trip_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid-json" }, { status: 400 });
  }

  if (!body.id || !body.action) {
    return NextResponse.json({ ok: false, error: "missing-fields" }, { status: 400 });
  }

  if (body.action === "commit") {
    const { error } = await sb
      .from("email_inbox")
      .update({
        status: "committed",
        committed_to_trip_id: body.trip_id || null,
        committed_at: new Date().toISOString(),
      })
      .eq("id", body.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  } else if (body.action === "dismiss") {
    const { error } = await sb
      .from("email_inbox")
      .update({ status: "dismissed" })
      .eq("id", body.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
