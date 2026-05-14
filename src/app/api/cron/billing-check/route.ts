// ─── GET /api/cron/billing-check ───
//
// Vercel Cron job — corre cada 6 horas (ver vercel.json). Suma el cost_usd
// del día y del mes de la tabla `ai_proxy_usage`. Si supera umbrales, manda
// una alerta:
//   - >= USD 50/día  → Sentry severity=error
//   - >= USD 200/mes → Sentry severity=error
// Si Resend está disponible (RESEND_API_KEY), también manda email a
// BILLING_ALERT_EMAIL (default matiasfaustomoron@gmail.com).
//
// Anthropic admin API: si ANTHROPIC_ADMIN_KEY está presente, consultamos
// también el usage report directo del workspace para detectar discrepancias
// (ej. requests que no logueamos en `ai_proxy_usage`). Sin la admin key,
// caemos al cálculo local.
//
// Seguridad: el endpoint requiere `Authorization: Bearer ${CRON_SECRET}`.
// Vercel Cron incluye automáticamente este header si configuraste CRON_SECRET
// en el dashboard.

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseService } from "@/lib/supabase/service";
import { captureMessage, captureException } from "@/lib/observability/sentry";

const DAILY_ALERT_USD = Number(process.env.AI_DAILY_BUDGET_USD || "50");
const MONTHLY_ALERT_USD = Number(process.env.AI_MONTHLY_BUDGET_USD || "200");
const ALERT_EMAIL = process.env.BILLING_ALERT_EMAIL || "matiasfaustomoron@gmail.com";

interface UsageRow {
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
}

async function getLocalUsage(): Promise<{ dayUsd: number; monthUsd: number; tokens: number }> {
  const supa = createSupabaseService();
  if (!supa) return { dayUsd: 0, monthUsd: 0, tokens: 0 };

  const now = new Date();
  const dayStart = `${now.toISOString().slice(0, 10)}T00:00:00Z`;
  const monthStart = `${now.toISOString().slice(0, 7)}-01T00:00:00Z`;

  const [dayRes, monthRes] = await Promise.all([
    supa.from("ai_proxy_usage").select("cost_usd, tokens_in, tokens_out").gte("created_at", dayStart),
    supa.from("ai_proxy_usage").select("cost_usd, tokens_in, tokens_out").gte("created_at", monthStart),
  ]);

  const day = (dayRes.data ?? []) as UsageRow[];
  const month = (monthRes.data ?? []) as UsageRow[];

  return {
    dayUsd: day.reduce((acc, r) => acc + Number(r.cost_usd ?? 0), 0),
    monthUsd: month.reduce((acc, r) => acc + Number(r.cost_usd ?? 0), 0),
    tokens: month.reduce((acc, r) => acc + Number(r.tokens_in ?? 0) + Number(r.tokens_out ?? 0), 0),
  };
}

async function fetchAnthropicAdmin(): Promise<{ monthUsd: number } | null> {
  const adminKey = process.env.ANTHROPIC_ADMIN_KEY;
  if (!adminKey) return null;
  try {
    // El usage API de Anthropic (oct 2024+) está documentado en
    // https://docs.anthropic.com/en/api/admin-api/usage-cost — endpoint
    // /v1/organizations/usage_report/messages. Schema puede cambiar; tratamos
    // todo como `unknown` y parseamos defensivamente.
    const now = new Date();
    const start = `${now.toISOString().slice(0, 7)}-01T00:00:00Z`;
    const url = `https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=${encodeURIComponent(start)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": adminKey,
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Array<{ cost?: { total?: number } }> };
    const total = (json.data ?? []).reduce((acc, row) => acc + Number(row.cost?.total ?? 0), 0);
    return { monthUsd: total };
  } catch (e) {
    captureException(e, { tag: "billing-check.anthropic-admin", level: "warning" });
    return null;
  }
}

async function sendResendAlert(subject: string, body: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "Tampu Billing <alerts@tampu.app>",
        to: [ALERT_EMAIL],
        subject,
        text: body,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch (e) {
    captureException(e, { tag: "billing-check.resend", level: "warning" });
    return false;
  }
}

export async function GET(req: NextRequest) {
  // Verificación del Authorization header (Vercel Cron lo manda automáticamente)
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (!expected) {
    return NextResponse.json(
      { ok: false, reason: "cron_secret_not_configured" },
      { status: 503 },
    );
  }
  if (auth !== expected) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const local = await getLocalUsage();
  const admin = await fetchAnthropicAdmin();
  const monthUsd = admin?.monthUsd ?? local.monthUsd;

  const alerts: string[] = [];
  if (local.dayUsd >= DAILY_ALERT_USD) {
    alerts.push(`Daily AI cost USD ${local.dayUsd.toFixed(2)} (cap USD ${DAILY_ALERT_USD})`);
  }
  if (monthUsd >= MONTHLY_ALERT_USD) {
    alerts.push(`Monthly AI cost USD ${monthUsd.toFixed(2)} (cap USD ${MONTHLY_ALERT_USD})`);
  }

  if (alerts.length > 0) {
    const summary = `Tampu billing alert: ${alerts.join("; ")}`;
    captureMessage(summary, {
      tag: "billing-check",
      level: "error",
      extra: {
        local_day_usd: local.dayUsd,
        local_month_usd: local.monthUsd,
        anthropic_admin_month_usd: admin?.monthUsd ?? null,
        tokens_month: local.tokens,
      },
    });
    const emailSent = await sendResendAlert(
      `[Tampu] Billing alert ${new Date().toISOString().slice(0, 10)}`,
      [
        "Tampu AI proxy billing alert.",
        "",
        ...alerts,
        "",
        `Local usage (ai_proxy_usage table):`,
        `  - Day cost USD ${local.dayUsd.toFixed(2)}`,
        `  - Month cost USD ${local.monthUsd.toFixed(2)}`,
        `  - Month tokens ${local.tokens}`,
        admin ? `Anthropic admin API month USD: ${admin.monthUsd.toFixed(2)}` : "Anthropic admin API: not configured",
      ].join("\n"),
    );
    return NextResponse.json({
      ok: true,
      alerts,
      emailSent,
      local,
      anthropic_admin: admin,
    });
  }

  return NextResponse.json({
    ok: true,
    alerts: [],
    local,
    anthropic_admin: admin,
  });
}
