/**
 * MercadoPago + Modo + dLocal integration scaffold.
 *
 * Mercado Pago domina Argentina + Uruguay + México + Chile (parcial).
 * Modo es la wallet 2.0 de Argentina (bancos + tarjetas). dLocal es el
 * gateway multi-país LatAm (cuando expandamos más allá del Cono Sur).
 *
 * MVP scope: solo MercadoPago Checkout Pro porque cubre AR+UY+CL+MX con
 * un solo onboarding. Modo + dLocal vienen en v2 cuando lo necesitemos.
 *
 * Server-side ONLY. Las public keys de MP irían client-side, pero las
 * private (access_token) deben quedar en server.
 *
 * Flow Checkout Pro:
 *  1. Server → POST /v1/checkout/preferences a MP API
 *     body = {items, payer, back_urls, notification_url, auto_return}
 *  2. MP devuelve init_point (URL del checkout)
 *  3. Client redirige al init_point
 *  4. User paga
 *  5. MP redirige a back_url + notifica server via webhook
 *  6. Server confirma pago (con merchant_order ID)
 *  7. Server actualiza estado del print_book_orders / affiliate / etc
 *
 * ENV:
 *   MERCADOPAGO_ACCESS_TOKEN   — private, server-only
 *   MERCADOPAGO_PUBLIC_KEY     — public, OK en client
 *   MERCADOPAGO_WEBHOOK_SECRET — para validar webhooks de notificación
 */

export interface MPItem {
  title: string;
  quantity: number;
  unit_price: number;       // ej. 99.99
  currency_id: "ARS" | "UYU" | "CLP" | "MXN" | "USD";
  description?: string;
  picture_url?: string;
  category_id?: string;     // "art" | "travels" | "books" | "general" — afecta los SLAs MP
}

export interface MPPreferenceInput {
  items: MPItem[];
  payer?: {
    email?: string;
    name?: string;
    surname?: string;
    phone?: { area_code: string; number: string };
  };
  /** External reference para matchear con order interna */
  external_reference: string;
  /** Donde volvemos después del pago */
  back_urls?: {
    success?: string;
    failure?: string;
    pending?: string;
  };
  /** Webhook server-side para confirmar pago real */
  notification_url?: string;
  /** Si true, MP redirige automáticamente; si false, user tiene que cliquear */
  auto_return?: "approved" | "all";
  /** Vencimiento de la preferencia */
  expiration_date_to?: string;  // ISO
}

export interface MPPreference {
  id: string;
  init_point: string;       // URL del checkout web
  sandbox_init_point: string; // URL del checkout sandbox
  collector_id: number;
  external_reference: string;
}

/**
 * Crea una checkout preference en MercadoPago. Retorna la URL al checkout
 * que el client puede usar para redirigir al user.
 */
export async function createMercadoPagoPreference(
  input: MPPreferenceInput,
): Promise<MPPreference | null> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    console.warn("[mercadopago] MERCADOPAGO_ACCESS_TOKEN not configured — cannot create preference");
    return null;
  }

  try {
    const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn("[mercadopago] preference creation failed:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = await res.json();
    return {
      id: json.id,
      init_point: json.init_point,
      sandbox_init_point: json.sandbox_init_point,
      collector_id: json.collector_id,
      external_reference: input.external_reference,
    };
  } catch (err) {
    console.warn("[mercadopago] exception:", err);
    return null;
  }
}

/**
 * Valida un webhook IPN de MercadoPago. MP manda notificaciones cuando
 * cambia el estado de un pago. Confirmar el pago consultando el resource
 * vía API (no confiar en el payload directo del webhook).
 */
export interface MPWebhookPayload {
  id: number;
  live_mode: boolean;
  type: "payment" | "merchant_order" | "subscription" | "test";
  date_created: string;
  user_id: number;
  api_version: string;
  action: string;
  data: { id: string };
}

export async function fetchMercadoPagoPayment(paymentId: string): Promise<MPPaymentDetail | null> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as MPPaymentDetail;
  } catch {
    return null;
  }
}

export interface MPPaymentDetail {
  id: number;
  status: "approved" | "pending" | "rejected" | "cancelled" | "refunded" | "in_process" | "in_mediation" | "charged_back";
  status_detail: string;
  transaction_amount: number;
  currency_id: string;
  external_reference: string;
  date_approved: string | null;
  payer: { email?: string };
  payment_method_id: string;
  payment_type_id: string;
}
