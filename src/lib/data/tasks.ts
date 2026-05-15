import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task } from "@/lib/types/database";

export async function fetchTasks(db: SupabaseClient, tripId: string): Promise<Task[]> {
  const { data, error } = await db.from("tasks").select("*").eq("trip_id", tripId).order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function mutateTask(db: SupabaseClient, id: string, updates: Partial<Task>): Promise<Task | null> {
  const { data, error } = await db.from("tasks").update(updates).eq("id", id).select().maybeSingle();
  if (error) throw error;
  return data;
}
