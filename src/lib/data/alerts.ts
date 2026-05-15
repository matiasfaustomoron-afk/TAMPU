import type { SupabaseClient } from "@supabase/supabase-js";

// ─── ALERT DISMISSALS ───
//
// Las alertas son derivadas (useDynamicAlerts), no rows. El "dismiss" se persiste
// en `public.alert_dismissals` (migration 00036) con `alert_signature` como clave
// stable (el id derivado de la alerta — typicamente "<severity>:<source_table>:<entity_id>").
//
// Estos helpers son fail-soft: ante un error de DB devuelven `{ ok: false }` para
// que la UI mantenga el estado in-memory como fallback (mejor UX que romper).

export async function fetchDismissedSignatures(
  client: SupabaseClient,
  tripId: string,
): Promise<Set<string>> {
  try {
    const { data, error } = await client
      .from("alert_dismissals")
      .select("alert_signature")
      .eq("trip_id", tripId);
    if (error) throw error;
    const rows = (data as Array<{ alert_signature: string }> | null) ?? [];
    return new Set(rows.map((r) => r.alert_signature));
  } catch {
    return new Set();
  }
}

export async function dismissAlertDB(
  client: SupabaseClient,
  tripId: string,
  signature: string,
): Promise<{ ok: boolean }> {
  try {
    // RLS exige user_id = auth.uid(); lo seteamos desde el client a partir de la
    // sesión actual. Si no hay user (debería ser imposible acá), abortamos.
    const { data: { user } } = await client.auth.getUser();
    if (!user) return { ok: false };
    // upsert sobre el unique (user_id, trip_id, alert_signature) — onConflict ignora
    // si ya existía. Evita un round-trip de check antes de insert.
    const { error } = await client
      .from("alert_dismissals")
      .upsert(
        { user_id: user.id, trip_id: tripId, alert_signature: signature },
        { onConflict: "user_id,trip_id,alert_signature", ignoreDuplicates: true },
      );
    if (error) throw error;
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function undismissAlertDB(
  client: SupabaseClient,
  tripId: string,
  signature: string,
): Promise<{ ok: boolean }> {
  try {
    const { error } = await client
      .from("alert_dismissals")
      .delete()
      .eq("trip_id", tripId)
      .eq("alert_signature", signature);
    if (error) throw error;
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
