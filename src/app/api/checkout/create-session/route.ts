// ─── POST /api/checkout/create-session ──────────────────────────────────
//
// Crea una Stripe Checkout Session para la compra one-time de Tampu+
// lifetime (USD 29). Devuelve `{ url }` con el redirect URL que el client
// debe abrir.
//
// Body (JSON):
//   { user_id?: string, email?: string, locale?: 'es' | 'en' | 'pt' }
//
// - user_id es opcional (compra puede iniciar sin login). Si está, lo
//   guardamos en metadata para que el webhook backfilleé la row con el
//   user_id correcto.
// - email es opcional pero si lo mandás, Stripe Checkout precompleta el
//   campo y lo usa para el receipt. Si no, Stripe lo pide.
//
// Response:
//   200 { url: string }
//   400 { error: 'invalid_body' | 'no_email_no_user' }
//   503 { error: 'stripe_not_configured' }
//   502 { error: 'stripe_error', detail: string }
//
// IMPORTANTE: ningún campo viene del cliente que no esté validado por
// Stripe. El precio se setea server-side desde TAMPU_PLUS_LIFETIME_PRICE_USD.
// El client NO puede inyectar precio.

import { NextResponse, type NextRequest } from "next/server";
import {
  getStripeServer,
  TAMPU_PLUS_LIFETIME_PRICE_USD,
  TAMPU_PLUS_PRODUCT_KEY,
} from "@/lib/billing/stripe";
import { captureException } from "@/lib/observability/sentry";

export const runtime = "nodejs";

interface CreateSessionBody {
  user_id?: string;
  email?: string;
  locale?: string;
}

function resolveOrigin(req: NextRequest): string {
  // Stripe necesita success/cancel URLs absolutos. Resolvemos primero por
  // env (canonical en prod), después por headers (preview/dev).
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

export async function POST(req: NextRequest) {
  let body: CreateSessionBody;
  try {
    body = (await req.json()) as CreateSessionBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const stripe = getStripeServer();
  if (!stripe) {
    return NextResponse.json(
      {
        error: "stripe_not_configured",
        hint: "Set STRIPE_SECRET_KEY in Vercel env and `npm i stripe`.",
      },
      { status: 503 },
    );
  }

  const origin = resolveOrigin(req);
  const successUrl = `${origin}/settings?upgrade=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/settings?upgrade=cancelled`;

  // Stripe acepta ['es', 'es-419', 'en', 'pt-BR', ...]. Mapeamos el locale
  // simple del client a algo que Stripe entienda; default es 'es-419' para
  // el público LatAm.
  const stripeLocale: "es-419" | "en" | "pt-BR" = (() => {
    const l = (body.locale ?? "").toLowerCase();
    if (l.startsWith("en")) return "en";
    if (l.startsWith("pt")) return "pt-BR";
    return "es-419";
  })();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment", // ONE-TIME, NO subscription
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: TAMPU_PLUS_LIFETIME_PRICE_USD * 100, // cents
            product_data: {
              name: "Tampu+ Lifetime",
              description:
                "Acceso de por vida al proxy IA gestionado de Tampu, badge Supporter, themes adicionales y crédito futuro de marketplace. Pago único, sin renovación.",
            },
          },
        },
      ],
      // Si el client mandó email, pre-completamos. Si no, Stripe lo pide.
      customer_email: body.email && /\S+@\S+\.\S+/.test(body.email) ? body.email : undefined,

      // Metadata: lo usa el webhook para backfill del user_id y trazabilidad.
      metadata: {
        tampu_product: TAMPU_PLUS_PRODUCT_KEY,
        user_id: body.user_id ?? "",
        email_hint: body.email ?? "",
      },
      payment_intent_data: {
        metadata: {
          tampu_product: TAMPU_PLUS_PRODUCT_KEY,
          user_id: body.user_id ?? "",
        },
      },

      // Aceptamos tarjeta. (Otros métodos los habilitamos desde el
      // Dashboard cuando estén configurados.)
      payment_method_types: ["card"],

      // UX:
      allow_promotion_codes: true,
      locale: stripeLocale,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "stripe_no_url", detail: "Stripe no devolvió un checkout URL" },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: session.url, id: session.id });
  } catch (err) {
    captureException(err, { tag: "checkout-create-session" });
    return NextResponse.json(
      { error: "stripe_error", detail: (err as Error).message },
      { status: 502 },
    );
  }
}
