import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * POST /api/trip-invite
 * Body: { trip_id, email, role: 'editor' | 'viewer' }
 *
 * Crea una fila en trip_members con status='pending' e invited_email.
 * El usuario invitado, al hacer login con ese email, ve la invitación y la acepta.
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

  // RLS verifica que el caller sea owner del trip.
  const { data, error } = await sb
    .from("trip_members")
    .insert({
      trip_id: body.trip_id,
      invited_email: body.email.toLowerCase().trim(),
      role,
      status: "pending",
      invited_by: user.id,
    })
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, membership: data });
}

/**
 * POST /api/trip-invite/accept
 * Body: { invitation_id }
 *
 * El usuario autenticado acepta una invitación que matchea su email.
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

  // Buscar la invitación (debe matchear el email del user)
  const { data: invitation } = await sb
    .from("trip_members")
    .select("*")
    .eq("id", body.invitation_id)
    .eq("invited_email", user.email?.toLowerCase().trim())
    .eq("status", "pending")
    .maybeSingle();

  if (!invitation) {
    return NextResponse.json({ error: "Invitación no encontrada o ya aceptada" }, { status: 404 });
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
