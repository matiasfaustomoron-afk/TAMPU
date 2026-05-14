import type { SupabaseClient } from "@supabase/supabase-js";
import type { Trip, City } from "@/lib/types/database";

export async function fetchTrips(db: SupabaseClient): Promise<Trip[]> {
  const { data, error } = await db.from("trips").select("*").order("is_active", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchActiveTrip(db: SupabaseClient): Promise<Trip | null> {
  const { data, error } = await db.from("trips").select("*").eq("is_active", true).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchTrip(db: SupabaseClient, id: string): Promise<Trip | null> {
  const { data, error } = await db.from("trips").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchCities(db: SupabaseClient, tripId: string): Promise<City[]> {
  const { data, error } = await db.from("cities").select("*").eq("trip_id", tripId).order("order_index");
  if (error) throw error;
  return data ?? [];
}

export async function insertTrip(db: SupabaseClient, trip: Omit<Trip, "id" | "user_id" | "created_at" | "updated_at" | "is_active">): Promise<Trip | null> {
  // FIX DEFINITIVO: usar la RPC create_trip (migration 00030) en lugar de
  // .insert() client-side. La RPC corre security definer server-side:
  //   - auth.uid() del JWT (siempre confiable, sin race conditions)
  //   - user_id = auth.uid() (no se confía en input del client)
  //   - desactiva otros trips activos atómicamente
  //   - el trigger tampu_add_owner_membership crea la membership automáticamente
  //
  // Reemplaza el flow anterior .insert() que fallaba con RLS quirks (error 42501)
  // por motivos que no pudimos diagnosticar 100% (probablemente cookies stale o
  // mismatch con el nuevo formato sb_publishable_ de Supabase keys).
  const { data, error } = await db.rpc("create_trip", { trip_data: trip });
  if (error) throw error;
  if (!data) throw new Error("RPC create_trip no devolvió data — debug en Postgres logs");

  // La RPC devuelve un single row (returns trips, no setof). Supabase RPC
  // envuelve scalar returns en un array de 1 elemento solo si la función es
  // marked como `returns setof`. En este caso es `returns trips` (single),
  // así que `data` es el row directo.
  return data as Trip;
}

export async function setActiveTrip(db: SupabaseClient, tripId: string): Promise<Trip | null> {
  await db.from("trips").update({ is_active: false }).neq("id", tripId);
  const { data, error } = await db.from("trips").update({ is_active: true }).eq("id", tripId).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function removeTrip(db: SupabaseClient, tripId: string): Promise<boolean> {
  const { error } = await db.from("trips").delete().eq("id", tripId);
  if (error) throw error;
  return true;
}

/**
 * Patch parcial de un viaje. Solo los campos pasados se actualizan; el resto queda igual.
 * Usado por la UI de "Presupuesto" en /expenses, edición de nombre desde /trips, etc.
 */
export async function patchTrip(
  db: SupabaseClient,
  tripId: string,
  patch: Partial<Omit<Trip, "id" | "user_id" | "created_at" | "is_active">>
): Promise<Trip | null> {
  const { data, error } = await db.from("trips").update(patch).eq("id", tripId).select().maybeSingle();
  if (error) throw error;
  return data;
}
