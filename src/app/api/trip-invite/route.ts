import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sendEmail } from "@/lib/email/send";

/**
 * POST /api/trip-invite
 * Body: { trip_id, email, role: 'editor' | 'viewer' }
 *
 * Crea una fila en trip_members con status='pending' e invited_email.
 * El usuario invitado, al hacer login con ese email, ve la invitación y la acepta.
 *
 * Después de insertar la membership, mandamos un email transaccional con Resend.
 * Si Resend no está configurado (env missing), la invitación queda creada igual y
 * el destinatario puede aceptarla logueándose normalmente — el email es asistido,
 * no la fuente de verdad.
 *
 * Solo el owner del trip puede invitar (RLS lo enforza).
 */
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  }

  const body = (await req.json()) as { trip_id?: string; email?: string; role?: "editor" | "viewer" };
  if (!body.trip_id || !body.email) {
    return NextResponse.json({ error: "trip_id y email requeridos" }, { status: 400 });
  }
  const role = body.role === "viewer" ? "viewer" : "editor";

  const cookieStore = await cookies();
  const sb = createServerClient(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // Email normalizado (lowercase + trim) — match con RLS y con el accept flow,
  // que también compara contra `user.email?.toLowerCase().trim()`.
  const normalizedEmail = body.email.toLowerCase().trim();

  // ─── Self-invite check ──────────────────────────────────────────────────
  // El owner ya es miembro del trip — invitarse a sí mismo crea una fila
  // duplicada pendiente que confunde la UI y rompe el accept flow (porque
  // el constraint email-unique-per-trip dispara 23505 más tarde).
  const callerEmail = user.email?.toLowerCase().trim();
  if (callerEmail && normalizedEmail === callerEmail) {
    return NextResponse.json({ error: "No podés invitarte a vos mismo" }, { status: 400 });
  }

  // RLS verifica que el caller sea owner del trip.
  const { data, error } = await sb
    .from("trip_members")
    .insert({
      trip_id: body.trip_id,
      invited_email: normalizedEmail,
      role,
      status: "pending",
      invited_by: user.id,
    })
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // ─── Mandar email de invitación (best-effort) ─────────────────────────
  // No bloqueamos la respuesta a un fallo de Resend — la membership ya
  // está creada, el invitado igual puede aceptar desde la app.
  let emailDelivered = false;
  try {
    // Lookup trip name para el copy del email.
    const { data: trip } = await sb
      .from("trips")
      .select("name, destination")
      .eq("id", body.trip_id)
      .maybeSingle();

    const tripName = trip?.name ?? "un viaje";
    const tripDest = trip?.destination ? ` (${trip.destination})` : "";
    const inviterName = user.email ?? "Un amigo";

    // Build accept URL — usamos NEXT_PUBLIC_SITE_URL si está, sino fallback
    // a un origin razonable. El destinatario hace login con el mismo email
    // que recibió y la app detecta la invitación pendiente.
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
      `${req.headers.get("x-forwarded-proto") ?? "https"}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "tampu.app"}`;
    const acceptUrl = `${origin}/members?invite=${data?.id ?? ""}`;

    const html = `
      <!doctype html>
      <html lang="es">
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f3ef; padding: 24px;">
        <div style="max-width: 520px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
          <h1 style="font-size: 22px; margin: 0 0 16px; color: #1a1a1a;">
            Te invitaron a Tampu
          </h1>
          <p style="font-size: 15px; line-height: 1.5; color: #444; margin: 0 0 12px;">
            <strong>${escapeHtml(inviterName)}</strong> te sumó a <strong>${escapeHtml(tripName)}</strong>${escapeHtml(tripDest)}
            con rol <em>${role}</em>.
          </p>
          <p style="font-size: 14px; line-height: 1.5; color: #666; margin: 0 0 24px;">
            Tampu es la app que tu amigo está usando para organizar el viaje — itinerario,
            reservas, gastos compartidos, todo en un lugar.
          </p>
          <a href="${acceptUrl}" style="display: inline-block; padding: 12px 24px; background: #c4794a; color: #fff; text-decoration: none; border-radius: 999px; font-weight: 600; font-size: 14px;">
            Aceptar invitación
          </a>
          <p style="font-size: 12px; color: #999; margin-top: 24px;">
            Si no esperabas esta invitación, podés ignorar el email. Tu cuenta solo se vincula al viaje cuando aceptás explícitamente.
          </p>
        </div>
      </body>
      </html>
    `;

    emailDelivered = await sendEmail({
      to: normalizedEmail,
      subject: `Te invitaron a ${tripName} en Tampu`,
      html,
      replyTo: user.email ?? undefined,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[trip-invite] email send threw, continuing:", (err as Error).message);
  }

  return NextResponse.json({ ok: true, membership: data, email_delivered: emailDelivered });
}

/**
 * Escapa caracteres HTML en input dinámico del template del mail.
 * Evita que un nombre con `<script>` salga en el HTML del email.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * PATCH /api/trip-invite
 * Body: { invitation_id }
 *
 * El usuario autenticado acepta una invitación que matchea su email. Antes
 * del update validamos explícitamente la ownership: la invitación debe
 * estar dirigida al email del user logueado y en status='pending'. RLS
 * ya nos cubre, pero el check explícito permite devolver un 403 con
 * mensaje claro en lugar de un genérico 400 de Supabase.
 */
export async function PATCH(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  }

  const body = (await req.json()) as { invitation_id?: string };
  if (!body.invitation_id) {
    return NextResponse.json({ error: "invitation_id requerido" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const sb = createServerClient(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const userEmail = user.email?.toLowerCase().trim() ?? "";

  // ─── Ownership check explícito (auditoría 05/2026) ────────────────────
  // Antes de mutar, leemos la invitación y validamos que esté addressed
  // al email del caller. RLS ya bloquea inserts maliciosos, pero esto
  // nos da error messages limpios para el client.
  const { data: inv } = await sb
    .from("trip_members")
    .select("id, invited_email, status")
    .eq("id", body.invitation_id)
    .maybeSingle();

  if (!inv) {
    return NextResponse.json({ error: "Invitación no encontrada" }, { status: 404 });
  }
  if ((inv.invited_email ?? "").toLowerCase() !== userEmail) {
    return NextResponse.json({ error: "Esta invitación no es para tu email" }, { status: 403 });
  }
  if (inv.status !== "pending") {
    return NextResponse.json({ error: "Invitación ya aceptada o cancelada" }, { status: 409 });
  }

  const { data, error } = await sb
    .from("trip_members")
    .update({
      user_id: user.id,
      status: "active",
      accepted_at: new Date().toISOString(),
    })
    .eq("id", body.invitation_id)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, membership: data });
}
