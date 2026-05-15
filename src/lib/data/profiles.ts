import type { SupabaseClient } from "@supabase/supabase-js";

// ─── PROFILES (community) ───────────────────────────────────────────────────
//
// Data layer canónico para la tabla `profiles` (migration 00002 + 00039).
// Centraliza lecturas/escrituras para que useProfile cachee via TanStack y
// se respete la disciplina de columnas (NUNCA seleccionamos email salvo en el
// fetch del MIO; full_name solo se expone cuando share_name=true).

/**
 * Shape pública de un profile — la que vemos para OTHER users en feed,
 * comments, journal. NO incluye email, timezone, preferences, ni date_format.
 * `full_name` solo lo populamos si `share_name === true`; si no queda null.
 */
export interface ProfilePublic {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
  full_name: string | null;
  bio: string | null;
  share_name: boolean;
}

/**
 * Shape completa del profile del user logueado. Incluye email y preferences,
 * solo se usa en /settings y context propio.
 */
export interface ProfileSelf extends ProfilePublic {
  email: string;
  timezone: string | null;
  preferred_currency: string | null;
  date_format: string | null;
}

// Columnas para reads públicos (other users): no incluye email/timezone/preferences.
const PUBLIC_COLS = "id,nickname,avatar_url,full_name,bio,share_name";

// Columnas para self: añade lo privado.
const SELF_COLS = "id,nickname,avatar_url,full_name,bio,share_name,email,timezone,preferred_currency,date_format";

/**
 * Sanea el shape público: si el user NO marcó share_name, ocultamos full_name.
 * Esto sucede APP-SIDE (no en RLS) porque Postgres RLS no soporta column-level
 * filter trivial — ver comentario en migration 00039.
 */
function applyShareNameMask(row: ProfilePublic): ProfilePublic {
  if (!row.share_name) return { ...row, full_name: null };
  return row;
}

/**
 * Fetch del perfil propio (incluye email/preferences). Usar SOLO para el user
 * logueado — para OTHER users usar fetchProfilePublic.
 */
export async function fetchMyProfile(
  client: SupabaseClient,
  userId: string
): Promise<ProfileSelf | null> {
  const { data, error } = await client
    .from("profiles")
    .select(SELF_COLS)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data as ProfileSelf;
}

/**
 * Fetch del perfil público de un user arbitrario. NUNCA expone email.
 * Aplica el share_name mask en cliente.
 */
export async function fetchProfilePublic(
  client: SupabaseClient,
  userId: string
): Promise<ProfilePublic | null> {
  const { data, error } = await client
    .from("profiles")
    .select(PUBLIC_COLS)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return applyShareNameMask(data as ProfilePublic);
}

/**
 * Batch fetch — una sola query con `IN (ids)` en vez de N+1. Crítico para
 * el feed de journal cuando hay muchos comments/likes de diferentes autores.
 * Devuelve un Map<userId, ProfilePublic> para lookup O(1) en el render.
 */
export async function fetchProfilesBatch(
  client: SupabaseClient,
  userIds: string[]
): Promise<Map<string, ProfilePublic>> {
  const result = new Map<string, ProfilePublic>();
  if (userIds.length === 0) return result;
  // Dedupe para evitar mandar 50 veces el mismo id si hay muchos comments del mismo user.
  const unique = Array.from(new Set(userIds));
  const { data, error } = await client
    .from("profiles")
    .select(PUBLIC_COLS)
    .in("id", unique);
  if (error) throw error;
  for (const row of (data as ProfilePublic[]) ?? []) {
    result.set(row.id, applyShareNameMask(row));
  }
  return result;
}

/**
 * Update parcial del perfil propio. Solo los campos pasados se modifican;
 * el resto queda igual. El UPDATE pasa por RLS `profiles_update` que valida
 * auth.uid() = id, así que un user no puede patchar el perfil de otro.
 *
 * El nickname se valida server-side por el unique index parcial: si el
 * candidate ya existe, Postgres devuelve error 23505 y lo mapeamos a un
 * código "nickname_taken" amigable.
 */
export interface UpdateProfilePatch {
  nickname?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  share_name?: boolean;
  full_name?: string | null;
}

export interface UpdateProfileResult {
  ok: boolean;
  /** 'nickname_taken' | 'nickname_invalid' | 'unknown' */
  error?: string;
  profile?: ProfileSelf | null;
}

const NICKNAME_RE = /^[a-z0-9_]{2,24}$/i;

export async function updateMyProfile(
  client: SupabaseClient,
  userId: string,
  patch: UpdateProfilePatch
): Promise<UpdateProfileResult> {
  // Validación local antes de tocar la red.
  if (typeof patch.nickname === "string") {
    const trimmed = patch.nickname.trim();
    if (trimmed.length === 0) {
      // Permitimos limpiar nickname seteando string vacío → NULL.
      patch.nickname = null;
    } else if (!NICKNAME_RE.test(trimmed)) {
      return { ok: false, error: "nickname_invalid" };
    } else {
      patch.nickname = trimmed.toLowerCase();
    }
  }

  const { data, error } = await client
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select(SELF_COLS)
    .maybeSingle();

  if (error) {
    // Postgres unique violation = nickname taken (23505).
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, error: "nickname_taken" };
    }
    return { ok: false, error: error.message || "unknown" };
  }
  return { ok: true, profile: (data as ProfileSelf) ?? null };
}

/**
 * Verifica si un nickname está disponible (para autocomplete en el form).
 * Si el caller pasa `selfUserId`, considera "disponible" cuando el único
 * dueño es el propio user (caso "no cambiar el handle" idempotente).
 */
export async function checkNicknameAvailable(
  client: SupabaseClient,
  nickname: string,
  selfUserId?: string
): Promise<boolean> {
  const candidate = nickname.trim().toLowerCase();
  if (!NICKNAME_RE.test(candidate)) return false;
  const { data, error } = await client
    .from("profiles")
    .select("id")
    // ilike emula case-insensitive sin tener que usar funciones server-side.
    // El unique index ya es case-insensitive (lower(nickname)) así que esto
    // matchea exactamente la semántica.
    .ilike("nickname", candidate)
    .limit(1);
  if (error) return false;
  const rows = (data as { id: string }[]) ?? [];
  if (rows.length === 0) return true;
  if (selfUserId && rows.every((r) => r.id === selfUserId)) return true;
  return false;
}
