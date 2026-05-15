import type { SupabaseClient } from "@supabase/supabase-js";
import type { Attachment } from "@/lib/types/database";

// ─── ATTACHMENTS ───
//
// Data layer canónico para la tabla `attachments`. Antes los call sites
// (vault, reservations, boarding-passes) ejecutaban `client.from("attachments")…`
// directo desde React. Eso forzaba lógica de fetching duplicada y bloqueaba
// invalidación coordinada. Ahora todos los lecturas/escrituras pasan por acá,
// y `useAttachments` en `use-trip-data.ts` cachea via TanStack.

const ATTACHMENT_LIST_COLUMNS =
  "id, trip_id, user_id, entity_type, entity_id, category, file_name, file_type, file_size, storage_path, is_favorite, is_critical, available_offline, notes, expires_at, created_at, updated_at";

export async function fetchAttachments(db: SupabaseClient, tripId: string): Promise<Attachment[]> {
  const { data, error } = await db
    .from("attachments")
    .select(ATTACHMENT_LIST_COLUMNS)
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as Attachment[] | null) ?? [];
}

export async function insertAttachment(
  db: SupabaseClient,
  attachment: Omit<Attachment, "id" | "created_at" | "updated_at">,
): Promise<Attachment | null> {
  const { data, error } = await db.from("attachments").insert(attachment).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateAttachment(
  db: SupabaseClient,
  id: string,
  updates: Partial<Attachment>,
): Promise<Attachment | null> {
  const { data, error } = await db.from("attachments").update(updates).eq("id", id).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteAttachment(db: SupabaseClient, id: string): Promise<boolean> {
  const { error } = await db.from("attachments").delete().eq("id", id);
  if (error) throw error;
  return true;
}
