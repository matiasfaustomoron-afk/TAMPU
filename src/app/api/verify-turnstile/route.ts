// ─── POST /api/verify-turnstile ───
//
// Valida un token Turnstile contra Cloudflare. Llamado desde el cliente
// inmediatamente después de que el widget produzca un token (signup, BYOK,
// passcode setup). El client envía:
//   { token: string }
//
// Response:
//   200 { ok: true }
//   400 { ok: false, reason: "missing_token" | "verification_failed", errors?: string[] }
//   503 { ok: false, reason: "secret_not_configured" } — env var falta
//
// Env vars requeridos:
//   - TURNSTILE_SECRET_KEY (server-side)
//
// Sentinel "DISABLED":
//   En preview deploys sin sitekey configurado, el widget client devuelve
//   "DISABLED". Aceptamos ese token sólo si `ALLOW_DISABLED_TURNSTILE=true`
//   (útil para dev/preview). En production NO aceptar.

import { NextResponse, type NextRequest } from "next/server";
import { captureException } from "@/lib/observability/sentry";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface VerifyBody {
  token?: string;
}

interface CloudflareResp {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

export async function POST(req: NextRequest) {
  let body: VerifyBody;
  try {
    body = (await req.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  const token = body.token;
  if (!token) {
    return NextResponse.json({ ok: false, reason: "missing_token" }, { status: 400 });
  }

  // Sentinel para preview deploys sin sitekey configurado
  if (token === "DISABLED") {
    if (process.env.ALLOW_DISABLED_TURNSTILE === "true") {
      return NextResponse.json({ ok: true, note: "disabled_allowed_in_env" });
    }
    return NextResponse.json(
      { ok: false, reason: "verification_failed", errors: ["disabled_token_not_allowed"] },
      { status: 400 },
    );
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json(
      { ok: false, reason: "secret_not_configured", hint: "Set TURNSTILE_SECRET_KEY in Vercel env." },
      { status: 503 },
    );
  }

  // IP del cliente para el control extra anti-bot de Cloudflare
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    undefined;

  try {
    const form = new URLSearchParams();
    form.append("secret", secret);
    form.append("response", token);
    if (ip) form.append("remoteip", ip);

    const cf = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(10_000),
    });

    if (!cf.ok) {
      return NextResponse.json(
        { ok: false, reason: "verification_failed", upstream_status: cf.status },
        { status: 502 },
      );
    }

    const json = (await cf.json()) as CloudflareResp;
    if (!json.success) {
      return NextResponse.json(
        { ok: false, reason: "verification_failed", errors: json["error-codes"] ?? [] },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    captureException(e, { tag: "verify-turnstile" });
    return NextResponse.json(
      { ok: false, reason: "verification_failed", detail: (e as Error).message },
      { status: 502 },
    );
  }
}
