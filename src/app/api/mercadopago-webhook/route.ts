import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { fetchMercadoPagoPayment } from "@/lib/payments/mercadopago";
import { createSupabaseService } from "@/lib/supabase/service";

/**
 * POST /api/mercadopago-webhook — IPN endpoint para MercadoPago.
 *
 * MP manda notificaciones a este URL cuando cambia el estado de un pago.
 * Nuestra responsabilidad:
 *  1. Verificar que el request viene de MP (header x-signature opcional 2025+)
 *  2. Consultar el resource vía API para obtener el estado real
 *  3. Actualizar la order interna correspondiente (print_book_orders.status, etc)
 *
 * Idempotencia: MP puede mandar la misma notificación 3-5 veces. Acá
 * upsert por payment_id en lugar de insert siempre.
 *
 * Setup en MP Dashboard:
 *   Webhook URL: https://tampu.app/api/mercadopago-webhook
 *   Eventos: payment
 *
 * ENV:
 *   MERCADOPAGO_WEBHOOK_SECRET — para validar x-signature (opcional 2025+)
 */

export const runtime = "nodejs";

interface WebhookBody {
  id?: number | string;
  type?: string;
  action?: string;
  data?: { id?: string };
}

/**
 * Verificá la firma `x-signature` de MP cuando hay secret configurado.
 *
 * MP firma con `ts=<unix>,v1=<hmac_sha256(secret, dataID + ts + request-id)>`.
 * Si el secret NO está seteado, dejamos pasar (back-compat con setups viejos).
 * Si está seteado y la firma falla, 401.
 *
 * Spec: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks#editor_2
 */
function verifyMercadoPagoSignature(
  req: NextRequest,
  dataId: string | null,
): { ok: boolean; reason?: string } {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return { ok: true, reason: "no-secret" };

  const sigHeader = req.headers.get("x-signature");
  const requestId = req.headers.get("x-request-id");
  if (!sigHeader || !dataId) return { ok: false, reason: "missing-headers" };

  // Parse "ts=...,v1=..."
  const parts = sigHeader.split(",").map((s) => s.trim());
  const ts = parts.find((p) => p.startsWith("ts="))?.slice(3);
  const v1 = parts.find((p) => p.startsWith("v1="))?.slice(3);
  if (!ts || !v1) return { ok: false, reason: "malformed-signature" };

  const manifest = `id:${dataId};request-id:${requestId ?? ""};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    const a = Buffer.from(v1, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return { ok: false, reason: "length-mismatch" };
    if (!timingSafeEqual(a, b)) return { ok: false, reason: "hmac-mismatch" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "compare-failed" };
  }
}

export async function POST(req: NextRequest) {
  let body: WebhookBody;
  try {
    body = (await req.json()) as WebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  // MP también manda algunas notifs via query params solamente
  const url = new URL(req.url);
  const queryType = url.searchParams.get("type");
  const queryId = url.searchParams.get("data.id") || url.searchParams.get("id");

  const eventType = body.type || queryType;
  const paymentId = body.data?.id || queryId;

  // ─── Signature verification (opcional pero recomendado) ───
  const sig = verifyMercadoPagoSignature(req, paymentId ? String(paymentId) : null);
  if (!sig.ok) {
    console.warn("[mp-webhook] signature verification failed:", sig.reason);
    return NextResponse.json({ error: "invalid-signature", reason: sig.reason }, { status: 401 });
  }

  if (eventType !== "payment" || !paymentId) {
    // MP también manda "test" durante setup — ack OK pero no procesamos
    return NextResponse.json({ ok: true, ignored: true });
  }

  // 1) Fetch payment desde MP API (NUNCA confiar en el payload del webhook)
  const payment = await fetchMercadoPagoPayment(String(paymentId));
  if (!payment) {
    return NextResponse.json({ error: "payment-not-found" }, { status: 404 });
  }

  // 2) Actualizar nuestra orden interna
  const sb = createSupabaseService();
  if (!sb) {
    console.warn("[mp-webhook] supabase service role not configured — cannot update order");
    return NextResponse.json({ ok: true, warning: "supabase-not-wired" });
  }

  // external_reference es el id de nuestra orden (definido por nosotros al crear preference)
  const orderId = payment.external_reference;

  // Decidir nuevo status basado en MP status
  let newStatus: string | null = null;
  if (payment.status === "approved") newStatus = "paid";
  else if (payment.status === "pending" || payment.status === "in_process") newStatus = "pending_payment";
  else if (payment.status === "rejected" || payment.status === "cancelled") newStatus = "cancelled";
  else if (payment.status === "refunded") newStatus = "refunded";

  if (newStatus && orderId) {
    const updates: Record<string, unknown> = {
      status: newStatus,
      final_price_eur: payment.currency_id === "EUR" ? payment.transaction_amount : null,
      currency: payment.currency_id,
      updated_at: new Date().toISOString(),
    };
    if (newStatus === "paid") {
      updates.paid_at = payment.date_approved ?? new Date().toISOString();
    }

    await sb
      .from("print_book_orders")
      .update(updates)
      .eq("id", orderId)
      .then(
        () => undefined,
        (err) => console.warn("[mp-webhook] order update failed:", err),
      );
  }

  return NextResponse.json({
    ok: true,
    processed: true,
    payment_status: payment.status,
    order_status: newStatus,
  });
}
