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
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface CreateSessionBody {
  // SECURITY: `user_id` se IGNORA si viene del body — siempre lo tomamos
  // del session Supabase server-side. Mantenemos el campo en el shape por
  // compat con clients existentes, pero NO se confía en él.
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

function isOriginAllowed(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  // Sin Origin header (curl, server-side fetch directo) → permitir, porque
  // el browser siempre lo manda en cross-origin fetches y la auth Supabase
  // ya nos cubre. Lo que estamos previniendo es CSRF cross-site.
  if (!origin) return true;
  const allowed = new Set<string>();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (siteUrl) allowed.add(siteUrl);
  allowed.add("http://localhost:3000");
  allowed.add("http://localhost:3001");
  allowed.add("capacitor://localhost");
  allowed.add("ionic://localhost");
  // Vercel preview deploys
  if (origin.endsWith(".vercel.app")) return true;
  return allowed.has(origin.replace(/\/$/, ""));
}

export async function POST(req: NextRequest) {
  // ─── Origin check (anti-CSRF) ───
  if (!isOriginAllowed(req)) {
    return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });
  }

  // ─── Auth server-side ───
  // Stripe metadata.user_id DEBE venir del session, no del body — un cliente
  // hostil podría inyectar user_id arbitrario para asignar la compra a otra cuenta.
  const sb = await createSupabaseServer();
  if (!sb) {
    return NextResponse.json(
      { error: "auth_not_configured" },
      { status: 503 },
    );
  }
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
      // Preferimos el email del session sobre el del body — el body es untrusted.
      customer_email: (() => {
        const fromSession = user.email;
        if (fromSession && /\S+@\S+\.\S+/.test(fromSession)) return fromSession;
        if (body.email && /\S+@\S+\.\S+/.test(body.email)) return body.email;
        return undefined;
      })(),

      // Metadata: lo usa el webhook para backfill del user_id y trazabilidad.
      // SECURITY: `user_id` viene del session Supabase, NO del body.
      metadata: {
        tampu_product: TAMPU_PLUS_PRODUCT_KEY,
        user_id: user.id,
        email_hint: body.email ?? "",
      },
      payment_intent_data: {
        metadata: {
          tampu_product: TAMPU_PLUS_PRODUCT_KEY,
          user_id: user.id,
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
