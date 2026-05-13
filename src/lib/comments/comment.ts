// ─── Item-level threaded comments ───
//
// Cada item del trip (flight, hotel, day, expense, task) puede tener un thread
// de comentarios. Threading 1-level: cada comment puede tener replies, pero
// los replies no tienen sub-replies (evita los hilos de Reddit-style que se
// vuelven ilegibles en mobile).
//
// Storage:
//   - localStorage bajo `tampu.comments.<trip_id>` (todos los items en un blob)
//   - Supabase opcional vía `syncCommentToSupabase()` — si la tabla `comments`
//     existe (futura migración 00022) escribimos; si no, fallback silencioso.
//
// Mentions: si el body contiene "@nombre", el parseo lo extrae a `mentions[]`.
// Por ahora no resolvemos a userId — solo guardamos el handle textual. La UI
// muestra autocomplete contra los `trip_members` del trip activo.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ItemType =
  | "reservation"
  | "trip_day"
  | "expense"
  | "task"
  | "document"
  | "packing_item";

export interface Comment {
  id: string;
  trip_id: string;
  item_type: ItemType;
  item_id: string;
  /** ID del comment padre. null = root de un thread. */
  parent_id: string | null;
  author_id: string;
  author_name: string;
  body: string;
  /** Handles extraídos del body ("@maria"). */
  mentions: string[];
  created_at: string;
  /** Soft-delete: el comment queda pero el body se reemplaza por "Mensaje eliminado". */
  deleted_at: string | null;
  /** QW5: thread resuelto. Solo aplica a comments root (parent_id=null). */
  resolved_at?: string | null;
  resolved_by?: string | null;
  resolved_by_name?: string | null;
  /** QW5: emoji → array de userIds que reaccionaron. Ej: { "👍": ["u1","u2"], "❤️": ["u3"] } */
  reactions?: Record<string, string[]>;
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const LS_PREFIX = "tampu.comments.";

function lsKey(tripId: string): string {
  return `${LS_PREFIX}${tripId}`;
}

export function getLocalComments(tripId: string): Comment[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(lsKey(tripId));
    if (!raw) return [];
    return JSON.parse(raw) as Comment[];
  } catch { return []; }
}

function saveLocalComments(tripId: string, comments: Comment[]): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(lsKey(tripId), JSON.stringify(comments)); }
  catch { /* quota */ }
  // Notify same-tab listeners (storage event only fires across tabs).
  if (typeof window !== "undefined") {
    try { window.dispatchEvent(new CustomEvent("tampu:comments-changed", { detail: { tripId } })); }
    catch { /* old browsers */ }
  }
}

export function getComments(tripId: string, itemType: ItemType, itemId: string): Comment[] {
  return getLocalComments(tripId)
    .filter(c => c.item_type === itemType && c.item_id === itemId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function countComments(tripId: string, itemType: ItemType, itemId: string): number {
  return getComments(tripId, itemType, itemId).filter(c => !c.deleted_at).length;
}

/** Extrae @mentions del body (handles sin @, en lowercase). */
export function extractMentions(body: string): string[] {
  const re = /@([a-z0-9_.-]{2,30})/gi;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    set.add(m[1].toLowerCase());
  }
  return Array.from(set);
}

export function addComment(input: {
  tripId: string;
  itemType: ItemType;
  itemId: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  body: string;
}): Comment {
  const c: Comment = {
    id: newId(),
    trip_id: input.tripId,
    item_type: input.itemType,
    item_id: input.itemId,
    parent_id: input.parentId,
    author_id: input.authorId,
    author_name: input.authorName,
    body: input.body.trim(),
    mentions: extractMentions(input.body),
    created_at: new Date().toISOString(),
    deleted_at: null,
  };
  const all = getLocalComments(input.tripId);
  all.push(c);
  saveLocalComments(input.tripId, all);
  return c;
}

export function deleteComment(tripId: string, commentId: string, soft = true): void {
  const all = getLocalComments(tripId);
  const idx = all.findIndex(c => c.id === commentId);
  if (idx === -1) return;
  if (soft) {
    all[idx] = { ...all[idx], deleted_at: new Date().toISOString(), body: "Mensaje eliminado" };
  } else {
    all.splice(idx, 1);
  }
  saveLocalComments(tripId, all);
}

// ─── QW5: Resolve threads + Emoji reactions ────────────────────────────────

/** Marca un thread root como resuelto. Solo top-level (parent_id=null). */
export function resolveComment(
  tripId: string,
  commentId: string,
  user: { id: string; displayName: string }
): Comment | null {
  const all = getLocalComments(tripId);
  const idx = all.findIndex(c => c.id === commentId);
  if (idx === -1) return null;
  if (all[idx].parent_id !== null) return null; // solo roots
  all[idx] = {
    ...all[idx],
    resolved_at: new Date().toISOString(),
    resolved_by: user.id,
    resolved_by_name: user.displayName,
  };
  saveLocalComments(tripId, all);
  return all[idx];
}

/** Re-abre un thread previamente resuelto. */
export function unresolveComment(tripId: string, commentId: string): Comment | null {
  const all = getLocalComments(tripId);
  const idx = all.findIndex(c => c.id === commentId);
  if (idx === -1) return null;
  all[idx] = {
    ...all[idx],
    resolved_at: null,
    resolved_by: null,
    resolved_by_name: null,
  };
  saveLocalComments(tripId, all);
  return all[idx];
}

/** Toggle de reaction: si el user ya reaccionó con ese emoji, la quita. Si no, la agrega. */
export function toggleReaction(
  tripId: string,
  commentId: string,
  emoji: string,
  userId: string
): Comment | null {
  const all = getLocalComments(tripId);
  const idx = all.findIndex(c => c.id === commentId);
  if (idx === -1) return null;
  const reactions = { ...(all[idx].reactions || {}) };
  const current = reactions[emoji] || [];
  if (current.includes(userId)) {
    const next = current.filter(u => u !== userId);
    if (next.length === 0) delete reactions[emoji];
    else reactions[emoji] = next;
  } else {
    reactions[emoji] = [...current, userId];
  }
  all[idx] = { ...all[idx], reactions };
  saveLocalComments(tripId, all);
  return all[idx];
}

/** Lista comments de un item filtrando los root resueltos (configurable). */
export function listOpenComments(
  tripId: string, itemType: ItemType, itemId: string,
  opts: { includeResolved?: boolean } = {}
): Comment[] {
  const all = getComments(tripId, itemType, itemId);
  if (opts.includeResolved) return all;
  // Excluir roots resueltos. Sus replies también se ocultan (thread cerrado).
  const resolvedRootIds = new Set(
    all.filter(c => !c.parent_id && c.resolved_at).map(c => c.id)
  );
  return all.filter(c => {
    if (!c.parent_id && c.resolved_at) return false;
    if (c.parent_id && resolvedRootIds.has(c.parent_id)) return false;
    return true;
  });
}

/** Count para badge "💬 N comentarios" — excluye resueltos por default. */
export function countOpenComments(tripId: string, itemType: ItemType, itemId: string): number {
  return listOpenComments(tripId, itemType, itemId).filter(c => !c.deleted_at).length;
}

/** Set canónico de emojis para el picker (corto y consensual). */
export const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "🤔", "😮"] as const;

/**
 * Agrupa comentarios en estructura threaded (root → replies).
 * Threading 1-level: si un comment tiene `parent_id`, lo metemos como reply
 * del root. Si el parent_id apunta a un comment que a su vez es reply (anidación
 * mayor a 1), lo flatten-eamos al root original.
 */
export interface ThreadedComment {
  root: Comment;
  replies: Comment[];
}

export function buildThread(comments: Comment[]): ThreadedComment[] {
  const byId = new Map(comments.map(c => [c.id, c]));
  const roots = comments.filter(c => !c.parent_id);
  return roots.map(root => {
    const replies: Comment[] = [];
    for (const c of comments) {
      if (!c.parent_id) continue;
      // Walk hasta encontrar el root real (max 5 saltos para no inf-loop)
      let cur: Comment | undefined = c;
      let hops = 0;
      while (cur?.parent_id && hops < 5) {
        const parent: Comment | undefined = byId.get(cur.parent_id);
        if (!parent) break;
        cur = parent;
        hops++;
      }
      if (cur?.id === root.id) replies.push(c);
    }
    return {
      root,
      replies: replies.sort((a, b) => a.created_at.localeCompare(b.created_at)),
    };
  });
}

/** Texto "hace X" sin date-fns. */
export function commentAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

// ─── Spec API aliases ──────────────────────────────────────────────────────
// Nombres pedidos por la spec: createComment / listCommentsForItem /
// editComment / deleteComment / countCommentsForItem. Mapean a la API legacy.

export const createComment = addComment;

export function listCommentsForItem(tripId: string, itemType: ItemType, itemId: string): Comment[] {
  return getComments(tripId, itemType, itemId);
}

export function countCommentsForItem(tripId: string, itemType: ItemType, itemId: string): number {
  return countComments(tripId, itemType, itemId);
}

/**
 * Edita el body de un comment existente. Solo cambia body + mentions + editedAt-equivalente
 * (usamos created_at-unchanged + un campo virtual de update timestamp en notes futuro).
 * Por ahora, simplemente re-escribimos body + mentions.
 */
export function editComment(tripId: string, commentId: string, newBody: string): Comment | null {
  const all = getLocalComments(tripId);
  const idx = all.findIndex(c => c.id === commentId);
  if (idx === -1) return null;
  const updated: Comment = {
    ...all[idx],
    body: newBody.trim(),
    mentions: extractMentions(newBody),
  };
  all[idx] = updated;
  saveLocalComments(tripId, all);
  return updated;
}

/**
 * Resuelve un handle `@maria` (lowercase, sin @) contra una lista de members
 * del trip. Devuelve los user IDs match-eados. La UI los puede usar para
 * disparar notificaciones in-app.
 */
export function resolveMentionsToUserIds(
  handles: string[],
  members: Array<{ id: string; display_name: string; handle?: string }>
): string[] {
  const lookup = new Map<string, string>();
  for (const m of members) {
    if (m.handle) lookup.set(m.handle.toLowerCase(), m.id);
    lookup.set(m.display_name.toLowerCase().replace(/\s+/g, ""), m.id);
  }
  const out = new Set<string>();
  for (const h of handles) {
    const id = lookup.get(h.toLowerCase());
    if (id) out.add(id);
  }
  return Array.from(out);
}

// ─── Supabase optional persistence ─────────────────────────────────────────
//
// Si la tabla `comments` existe en Supabase, intentamos también persistir ahí
// (en paralelo a localStorage para offline-first). Si la tabla no existe
// (error code 42P01 — "relation does not exist"), caemos a solo localStorage
// silenciosamente. La migración 00022 va a crear la tabla; mientras tanto el
// código funciona sin romper UX.

interface SupabaseCommentRow {
  id: string;
  trip_id: string;
  item_type: ItemType;
  item_id: string;
  parent_id: string | null;
  author_id: string;
  author_name: string;
  body: string;
  mentions: string[];
  created_at: string;
  deleted_at: string | null;
}

/**
 * Intenta insertar un comment en Supabase. Si la tabla no existe (42P01),
 * devuelve null sin error — el caller ya tiene el comment guardado localmente.
 */
export async function syncCommentToSupabase(
  client: SupabaseClient | null,
  comment: Comment
): Promise<SupabaseCommentRow | null> {
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("comments")
      .insert(comment as unknown as SupabaseCommentRow)
      .select()
      .single();
    if (error) {
      if (error.code === "42P01") return null; // table missing — graceful
      console.warn("[comments] supabase insert failed", error.code, error.message);
      return null;
    }
    return data as SupabaseCommentRow | null;
  } catch (err) {
    console.warn("[comments] supabase sync threw", err);
    return null;
  }
}
