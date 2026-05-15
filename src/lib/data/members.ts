import type { SupabaseClient } from "@supabase/supabase-js";

// ─── TRIP MEMBERS ───
//
// Data layer canónico para la tabla `trip_members`. Antes los call sites
// (members page, share flows) ejecutaban `client.from("trip_members")…`
// directo desde React. Acá unificamos lecturas/escrituras para que
// `useTripMembers` cachee via TanStack y las invalidaciones sean coordinadas.

export interface TripMember {
  id: string;
  trip_id: string;
  user_id: string | null;
  invited_email: string | null;
  role: "owner" | "editor" | "viewer";
  status: "pending" | "active" | "revoked";
  invited_at: string;
  accepted_at: string | null;
}

const COLS = "id,trip_id,user_id,invited_email,role,status,invited_at,accepted_at";

export async function fetchTripMembers(client: SupabaseClient, tripId: string): Promise<TripMember[]> {
  const { data, error } = await client.from("trip_members").select(COLS).eq("trip_id", tripId);
  if (error) throw error;
  return (data as TripMember[]) || [];
}

export async function fetchPendingInvites(client: SupabaseClient, email: string) {
  const { data, error } = await client
    .from("trip_members")
    .select(`${COLS}, trip:trips(name, destination)`)
    .eq("invited_email", email.toLowerCase())
    .eq("status", "pending");
  if (error) throw error;
  return data || [];
}

export async function revokeMember(client: SupabaseClient, memberId: string) {
  const { error } = await client.from("trip_members").update({ status: "revoked" }).eq("id", memberId);
  if (error) throw error;
}

export async function removeMember(client: SupabaseClient, memberId: string) {
  const { error } = await client.from("trip_members").delete().eq("id", memberId);
  if (error) throw error;
}
