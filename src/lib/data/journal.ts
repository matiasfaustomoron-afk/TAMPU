"use client";

/**
 * Journal author/profile helpers — resuelven el display name + avatar de
 * un journal entry o comment según el contexto:
 *
 *  - Demo (sin login):       siempre "Tú" + initial fallback.
 *  - Online (current user):  user_metadata.full_name → email user → "Tú".
 *  - Online (otros users):   lookup contra el Map de `useProfilesBatch`
 *                            (nickname > full_name > snapshot).
 *
 * `resolveAuthor` es pure (no es un hook): el component caller llama
 * `useProfilesBatch(userIds)` y le pasa el `data` Map como argumento opcional.
 * Así mantenemos esta función sin ataduras a React y la podemos usar en
 * tests / código server-side si hace falta.
 */

import type { User } from "@supabase/supabase-js";
import type { ProfilePublic } from "@/lib/data/profiles";

export interface JournalAuthor {
  /** Supabase auth user id si el comment/entry es de un user logueado. null en demo o legacy entries. */
  user_id: string | null;
  /** Nombre a mostrar en el feed/comment. Nunca vacío. */
  display_name: string;
  /** URL del avatar si está disponible. Null = mostrar initial fallback. */
  avatar_url: string | null;
  /** Inicial mayúscula para el fallback (1 carácter). */
  initial: string;
}

/**
 * Deriva el display name desde un Supabase User object.
 * Fallback chain: user_metadata.full_name → email username → "Tú".
 */
export function displayNameForUser(user: User | null, fallback = "Tú"): string {
  if (!user) return fallback;
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const fromMeta = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  if (fromMeta) return fromMeta;
  const fromNickname = typeof meta.nickname === "string" ? meta.nickname.trim() : "";
  if (fromNickname) return fromNickname;
  if (user.email) {
    const head = user.email.split("@")[0];
    if (head) return head;
  }
  return fallback;
}

/**
 * Deriva el avatar_url desde un Supabase User object.
 * Busca user_metadata.avatar_url (estándar Supabase Auth) o picture (Google OAuth).
 */
export function avatarUrlForUser(user: User | null): string | null {
  if (!user) return null;
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  if (typeof meta.avatar_url === "string" && meta.avatar_url) return meta.avatar_url;
  if (typeof meta.picture === "string" && meta.picture) return meta.picture;
  return null;
}

/**
 * Resuelve el autor de un comment/entry. Orden de resolución:
 *
 *   1. user_id === currentUser.id → datos completos de auth (avatar_url de
 *      OAuth provider + full_name/email).
 *   2. user_id en `profilesMap` (resultado de `useProfilesBatch`) → nickname
 *      o full_name + avatar_url del registro public.
 *   3. user_id existe pero sin match en map (loading, no profile registrado,
 *      o legacy) → fallback al author snapshot.
 *   4. user_id null (demo / legacy localStorage) → "Tú".
 *
 * `profilesMap` es opcional para no romper callers que no necesitan lookup
 * remoto (ej. tests, componentes en demo mode). El caller que ya llamó
 * `useProfilesBatch(userIds)` simplemente pasa `data` acá.
 */
export function resolveAuthor(
  user_id: string | null,
  fallbackAuthorName: string | undefined,
  currentUser: User | null,
  profilesMap?: Map<string, ProfilePublic>,
): JournalAuthor {
  // Caso 1: es el current user → datos completos de auth.
  if (user_id && currentUser && currentUser.id === user_id) {
    const name = displayNameForUser(currentUser);
    return {
      user_id,
      display_name: name,
      avatar_url: avatarUrlForUser(currentUser),
      initial: initialOf(name),
    };
  }
  // Caso 2: hay user_id y match en el batch lookup (community / shared trip).
  if (user_id && profilesMap) {
    const profile = profilesMap.get(user_id);
    if (profile) {
      // Display name: priorizamos @nickname (Twitter-style), después
      // full_name si el user lo decidió compartir, después el snapshot.
      const candidate =
        (profile.nickname && profile.nickname.trim()) ||
        (profile.full_name && profile.full_name.trim()) ||
        fallbackAuthorName?.trim() ||
        "Viajero";
      return {
        user_id,
        display_name: candidate,
        avatar_url: profile.avatar_url,
        initial: initialOf(candidate),
      };
    }
  }
  // Caso 3: hay user_id pero no es el current user y no hay match en el
  // map (loading o profile incompleto). Caemos al snapshot del comment
  // o un placeholder.
  if (user_id) {
    const name = fallbackAuthorName?.trim() || "Viajero";
    return { user_id, display_name: name, avatar_url: null, initial: initialOf(name) };
  }
  // Caso 4: no hay user_id (entry de demo / legacy localStorage).
  const name = fallbackAuthorName?.trim() || "Tú";
  return { user_id: null, display_name: name, avatar_url: null, initial: initialOf(name) };
}

function initialOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

/**
 * Render-helper para mostrar "hace Xh" / "hace 3d" en feed/comments.
 * Mantiene paridad ES/EN sin pasar por t() (uso interno del journal).
 */
export function formatAgo(ts: number, locale: "es" | "en" = "es"): string {
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return locale === "es" ? "ahora" : "now";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return locale === "es" ? "ahora" : "now";
  const min = Math.floor(sec / 60);
  if (min < 60) return locale === "es" ? `hace ${min}m` : `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return locale === "es" ? `hace ${hr}h` : `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return locale === "es" ? `hace ${day}d` : `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return locale === "es" ? `hace ${wk}sem` : `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return locale === "es" ? `hace ${mo}mes` : `${mo}mo ago`;
  const yr = Math.floor(day / 365);
  return locale === "es" ? `hace ${yr}a` : `${yr}y ago`;
}
