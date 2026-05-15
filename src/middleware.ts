import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Páginas públicas (landing + legal + auth flow).
const PUBLIC_PATHS = [
  "/",        // Root — app/page.tsx decide si redirige a /welcome (anon) o /today (auth)
  "/login",
  "/auth/callback",
  "/privacy",
  "/terms",
  "/welcome", // Landing — anon users tienen que verlo para signup
  "/share",   // Invite landing — anon users que llegan vía link de invitación
  "/recap",   // Tampu Recap — página pública con og:image para share en WA/Twitter
];

// API routes que son llamadas por sistemas externos (webhooks, cron) o
// son catálogos públicos. NO requieren auth porque el caller NO es un user.
// Cada uno valida su propia auth (firma HMAC, bearer token, etc.).
const PUBLIC_API_PREFIXES = [
  "/api/webhooks/",       // Stripe, WhatsApp/Twilio
  "/api/cron/",           // Vercel Cron (Bearer CRON_SECRET)
  "/api/email-inbound",   // SES/Mailgun webhook
  "/api/whatsapp-inbound", // Twilio legacy alias
  "/api/email-in",        // Per-trip email-in webhook
  "/api/mercadopago-webhook",
  "/api/curated-destinations", // Catálogo público read-only
  "/api/destination-photo",    // Cache público de fotos
  "/api/airport-info",         // Read público de aeropuertos
  "/api/recap/",               // Recap OG image — público para crawlers (WhatsApp/Twitter)
  "/api/verify-turnstile",     // Llamado pre-auth (signup/setup)
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths always
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // Allow public API prefixes (webhooks, cron, public catalogs)
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Allow static assets
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.includes(".")) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase not configured, allow access (demo mode)
  if (!url || !key) {
    return NextResponse.next();
  }

  // Supabase auth check
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  // Not authenticated → redirect to login
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
