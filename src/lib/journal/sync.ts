"use client";

/**
 * Journal social sync — espeja likes/comments locales del diario a Supabase
 * cuando hay sesión. En demo mode todo queda local.
 *
 * El UI sigue usando localStorage como source of truth para velocidad y
 * funcionamiento offline; estas funciones son fire-and-forget que persisten
 * en `journal_likes` y `journal_comments` para que cuando se comparte el
 * viaje (multi-user) la pareja vea los likes/comments del otro.
 *
 * Privacy: NUNCA persistimos la foto, solo metadata del like/comment.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordSyncSuccess, recordSyncError } from "@/lib/sync/status";

interface RemoteCtx {
  client: SupabaseClient;
  tripId: string;
  entryId: string;
  userId: string;
}

export async function toggleLikeRemote(ctx: RemoteCtx, nextLiked: boolean): Promise<void> {
  try {
    if (nextLiked) {
      const { error } = await ctx.client.from("journal_likes").insert({
        journal_entry_id: ctx.entryId,
        trip_id: ctx.tripId,
        user_id: ctx.userId,
      });
      if (error && error.code !== "23505") throw error; // 23505 = unique violation, idempotent
    } else {
      const { error } = await ctx.client
        .from("journal_likes")
        .delete()
        .eq("journal_entry_id", ctx.entryId)
        .eq("user_id", ctx.userId);
      if (error) throw error;
    }
    recordSyncSuccess();
  } catch (err) {
    console.warn("[journal-sync] toggleLike failed:", err);
    recordSyncError(err);
  }
}

export async function insertCommentRemote(
  ctx: RemoteCtx,
  comment: { id: string; body: string; ts: number },
): Promise<void> {
  try {
    const { error } = await ctx.client.from("journal_comments").insert({
      id: comment.id,
      journal_entry_id: ctx.entryId,
      trip_id: ctx.tripId,
      user_id: ctx.userId,
      body: comment.body,
      created_at: new Date(comment.ts).toISOString(),
    });
    if (error) throw error;
    recordSyncSuccess();
  } catch (err) {
    console.warn("[journal-sync] insertComment failed:", err);
    recordSyncError(err);
  }
}

export async function deleteCommentRemote(ctx: Omit<RemoteCtx, "entryId">, commentId: string): Promise<void> {
  try {
    const { error } = await ctx.client.from("journal_comments").delete().eq("id", commentId);
    if (error) throw error;
    recordSyncSuccess();
  } catch (err) {
    console.warn("[journal-sync] deleteComment failed:", err);
    recordSyncError(err);
  }
}
