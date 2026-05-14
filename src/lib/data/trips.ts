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
  // CRITICAL: la columna `user_id` es NOT NULL + RLS exige user_id = auth.uid().
  // Tenemos que obtenerlo de la sesión antes de insertar. Sin esto el insert
  // fallaba silenciosamente con "null value in column user_id violates not-null
  // constraint" y el viaje "desaparecía" desde la perspectiva del user.
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("No hay sesión activa — no se puede crear el viaje. Volvé a hacer login.");

  // Insert FIRST (más importante). Después desactivamos los otros — si falla el
  // insert, el user no queda sin trip activo (rollback implícito por orden).
  const { data, error } = await db.from("trips")
    .insert({ ...trip, user_id: user.id, is_active: true })
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Insert ok pero la DB no devolvió la fila — race condition o RLS bloqueando el select.");

  // Now safe to deactivate previous active trips (solo los del user).
  await db.from("trips").update({ is_active: false })
    .eq("user_id", user.id)
    .neq("id", data.id);

  return data;
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
