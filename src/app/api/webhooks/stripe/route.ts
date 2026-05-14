// ─── POST /api/webhooks/stripe ──────────────────────────────────────────
//
// Webhook endpoint para eventos de Stripe. Lo único que procesamos hoy:
//
//   - `checkout.session.completed` → cliente terminó la Checkout Session
//     y el pago quedó marcado como `paid`. Insertamos la row en
//     `tampu_plus_lifetime`.
//
//   - `charge.refunded` / `charge.dispute.created` → flip de status a
//     'refunded' o 'disputed' (best effort: match por payment_intent).
//
// SEGURIDAD:
//   1. Stripe firma cada request con el secret `STRIPE_WEBHOOK_SECRET`.
//      Si la firma no valida, devolvemos 400 SIN procesar — NUNCA aceptar
//      requests sin firma (eso permitiría a un atacante regalarse Tampu+).
//   2. Idempotencia: el handler de `checkout.session.completed` upsertea
//      por `stripe_session_id` (unique). Si el mismo evento llega 5 veces
//      (Stripe reintenta), solo el primero crea la row.
//   3. Service-role: escribimos con `createSupabaseService()` (bypassa RLS).
//      Si la dep o el env no están, devolvemos 503 y NO ack-eamos el evento
//      — Stripe va a reintentar.
//
// Setup en Stripe Dashboard:
//   Endpoint URL: https://tampu.app/api/webhooks/stripe
//   Eventos a escuchar:
//     - checkout.session.completed
//     - charge.refunded
//     - charge.dispute.created
//   Copiá el "Signing secret" (whsec_...) y ponelo en STRIPE_WEBHOOK_SECRET.

import { NextResponse, type NextRequest } from "next/server";
import { getStripeServer } from "@/lib/billing/stripe";
import { createSupabaseService } from "@/lib/supabase/service";
import { captureException } from "@/lib/observability/sentry";

export const runtime = "nodejs";

// Types laxos: el SDK de Stripe no está importado vía `import type` para
// que el archivo compile aunque la dep no esté instalada (mismo patrón que
// `src/lib/billing/stripe.ts`). Si necesitás autocomplete, instalá la dep
// y los `any` se vuelven `Stripe.X` por inferencia.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StripeEvent = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StripeCheckoutSession = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StripeCharge = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StripeDispute = any;

// IMPORTANTE: el body crudo es necesario para validar la firma. Next 16
// App Router → leemos como `req.text()` antes de parsear JSON. No usar
// `req.json()` porque mutaría/normalizaría el body y romperíamos la firma.

export async function POST(req: NextRequest) {
  const stripe = getStripeServer();
  if (!stripe) {
    // eslint-disable-next-line no-console
    console.warn("[stripe-webhook] stripe SDK no disponible — ignorando evento");
    return NextResponse.json(
      { error: "stripe_not_configured" },
      { status: 503 },
    );
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // eslint-disable-next-line no-console
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET no seteado — rechazando request");
    return NextResponse.json(
      { error: "webhook_secret_not_configured" },
      { status: 503 },
    );
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "missing_signature" },
      { status: 400 },
    );
  }

  const rawBody = await req.text();

  // Verificación de firma — si falla, ABORTAR.
  let event: StripeEvent;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[stripe-webhook] invalid signature:", (err as Error).message);
    return NextResponse.json(
      { error: "invalid_signature", detail: (err as Error).message },
      { status: 400 },
    );
  }

  // eslint-disable-next-line no-console
  console.log(`[stripe-webhook] event=${event.type} id=${event.id}`);

  const sb = createSupabaseService();
  if (!sb) {
    // eslint-disable-next-line no-console
    console.error("[stripe-webhook] supabase service no configurado — Stripe va a reintentar");
    return NextResponse.json(
      { error: "supabase_not_configured" },
      { status: 503 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as StripeCheckoutSession;

        // Solo procesamos si:
        //   - es nuestro producto Tampu+ (metadata.tampu_product)
        //   - el payment_status es 'paid' (no 'unpaid' ni 'no_payment_required')
        const isOurProduct = session.metadata?.tampu_product === "plus_lifetime";
        const isPaid = session.payment_status === "paid";

        if (!isOurProduct) {
          // eslint-disable-next-line no-console
          console.log(`[stripe-webhook] session ${session.id} no es Tampu+, ignorando`);
          return NextResponse.json({ ok: true, ignored: "not_tampu_product" });
        }

        if (!isPaid) {
          // eslint-disable-next-line no-console
          console.log(`[stripe-webhook] session ${session.id} no paid (${session.payment_status}), ignorando`);
          return NextResponse.json({ ok: true, ignored: "not_paid" });
        }

        // Idempotencia: chequeamos si ya procesamos este session.id
        const { data: existing, error: selErr } = await sb
          .from("tampu_plus_lifetime")
          .select("id")
          .eq("stripe_session_id", session.id)
          .maybeSingle();

        if (selErr) {
          // eslint-disable-next-line no-console
          console.warn("[stripe-webhook] select check failed:", selErr.message);
        }

        if (existing) {
          // eslint-disable-next-line no-console
          console.log(`[stripe-webhook] session ${session.id} ya procesado, skipping`);
          return NextResponse.json({ ok: true, idempotent: true });
        }

        const email = session.customer_email
          ?? session.customer_details?.email
          ?? session.metadata?.email_hint
          ?? null;

        if (!email) {
          // eslint-disable-next-line no-console
          console.error(`[stripe-webhook] session ${session.id} sin email — no podemos backfillear`);
          return NextResponse.json(
            { error: "no_email" },
            { status: 400 },
          );
        }

        // amount_total viene en cents; convertimos a USD.
        const amountUsd = (session.amount_total ?? 0) / 100;
        const userId = session.metadata?.user_id || null;
        const paymentIntentId = typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;
        const customerId = typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? null;

        const { error: insErr } = await sb
          .from("tampu_plus_lifetime")
          .insert({
            user_id: userId || null,
            email,
            stripe_session_id: session.id,
            stripe_customer_id: customerId,
            stripe_payment_intent_id: paymentIntentId,
            amount_usd: amountUsd,
            currency: (session.currency ?? "usd").toUpperCase(),
            status: "active",
            metadata: {
              stripe_event_id: event.id,
              checkout_locale: session.locale,
              payment_status: session.payment_status,
            },
          });

        if (insErr) {
          // Si choca por unique violation, alguien más insertó en paralelo —
          // tratar como éxito idempotente.
          if (insErr.code === "23505") {
            return NextResponse.json({ ok: true, idempotent_race: true });
          }
          // eslint-disable-next-line no-console
          console.error("[stripe-webhook] insert failed:", insErr.message);
          captureException(new Error(`tampu_plus insert failed: ${insErr.message}`), {
            tag: "stripe-webhook",
            extra: { session_id: session.id, code: insErr.code },
          });
          return NextResponse.json(
            { error: "db_insert_failed", detail: insErr.message },
            { status: 500 },
          );
        }

        // eslint-disable-next-line no-console
        console.log(`[stripe-webhook] tampu+ activado para ${email} (session ${session.id})`);
        return NextResponse.json({ ok: true, activated: true });
      }

      case "charge.refunded": {
        const charge = event.data.object as StripeCharge;
        const piId = typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;

        if (piId) {
          const { error } = await sb
            .from("tampu_plus_lifetime")
            .update({ status: "refunded", metadata: { last_event: event.id } })
            .eq("stripe_payment_intent_id", piId)
            .eq("status", "active");
          if (error) {
            // eslint-disable-next-line no-console
            console.warn("[stripe-webhook] refund update failed:", error.message);
          }
        }
        return NextResponse.json({ ok: true, refund_processed: true });
      }

      case "charge.dispute.created": {
        const dispute = event.data.object as StripeDispute;
        const piId = typeof dispute.payment_intent === "string"
          ? dispute.payment_intent
          : dispute.payment_intent?.id;

        if (piId) {
          const { error } = await sb
            .from("tampu_plus_lifetime")
            .update({ status: "disputed", metadata: { last_event: event.id } })
            .eq("stripe_payment_intent_id", piId)
            .eq("status", "active");
          if (error) {
            // eslint-disable-next-line no-console
            console.warn("[stripe-webhook] dispute update failed:", error.message);
          }
        }
        return NextResponse.json({ ok: true, dispute_processed: true });
      }

      default: {
        // Eventos que no manejamos — ack OK para que Stripe deje de reintentar.
        return NextResponse.json({ ok: true, ignored: event.type });
      }
    }
  } catch (err) {
    captureException(err, { tag: "stripe-webhook", extra: { event_type: event.type, event_id: event.id } });
    // eslint-disable-next-line no-console
    console.error("[stripe-webhook] handler crashed:", (err as Error).message);
    return NextResponse.json(
      { error: "handler_error", detail: (err as Error).message },
      { status: 500 },
    );
  }
}
