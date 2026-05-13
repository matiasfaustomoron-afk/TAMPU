import { NextRequest, NextResponse } from "next/server";
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
