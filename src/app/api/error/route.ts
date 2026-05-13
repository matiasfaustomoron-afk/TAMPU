import { NextRequest, NextResponse } from "next/server";

// Crash reports sink. Privacy-friendly: we log to stdout (Vercel logs) only.
// You can later route to Sentry / Logtail / your own DB without changing clients.

const ALLOWED_ORIGINS = ["capacitor://localhost", "ionic://localhost"];

function withCors(res: NextResponse, origin: string | null): NextResponse {
  const ok = !origin || ALLOWED_ORIGINS.includes(origin) || origin.startsWith("http://localhost") || origin.endsWith(".vercel.app");
  if (ok && origin) res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  res.headers.set("Vary", "Origin");
  return res;
}

export async function OPTIONS(req: NextRequest) {
  return withCors(new NextResponse(null, { status: 204 }), req.headers.get("origin"));
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  try {
    const body = await req.json();
    // Keep bounded; truncate any oversized payloads
    const safe = JSON.stringify(body).slice(0, 8 * 1024);
    console.error("[TravelOS:client-error]", safe);
  } catch {
    /* ignore parse errors — never throw */
  }
  return withCors(NextResponse.json({ received: true }), origin);
}
