"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSupabase } from "@/lib/context/supabase-provider";
import {
  fetchMyProfile,
  fetchProfilesBatch,
  updateMyProfile,
  checkNicknameAvailable,
  type ProfileSelf,
  type ProfilePublic,
  type UpdateProfilePatch,
  type UpdateProfileResult,
} from "@/lib/data/profiles";

// ─── useProfile hooks ──────────────────────────────────────────────────────
//
// Tres entries:
//   - useMyProfile():       perfil del user logueado (incluye email/timezone)
//   - useProfilesBatch():   batch lookup para feeds (avatar+@nick por id)
//   - useUpdateMyProfile(): mutation con cache invalidation
//
// Las keys de TanStack incluyen el userId para que el cache no haga leak
// cuando un user hace sign-out → otro user sign-in en la misma sesión
// (queryClient.clear() ya lo cubre, pero el namespacing extra no daña).

const qk = {
  myProfile: (userId: string | null) => ["myProfile", userId ?? "anon"] as const,
  profilesBatch: (sortedIds: string[]) => ["profilesBatch", sortedIds.join(",")] as const,
} as const;

/**
 * Perfil del user logueado. Devuelve null si no hay sesión o si Supabase no
 * está configurado (modo demo/unconfigured). En esos modos el caller debe
 * tener un fallback local (no implementado acá).
 */
export function useMyProfile(): {
  data: ProfileSelf | null;
  loading: boolean;
  refetch: () => void;
} {
  const { client, user, mode } = useSupabase();
  const enabled = mode === "online" && !!client && !!user?.id;
  const q = useQuery<ProfileSelf | null>({
    queryKey: qk.myProfile(user?.id ?? null),
    queryFn: async () => {
      if (!client || !user?.id) return null;
      return fetchMyProfile(client, user.id);
    },
    enabled,
  });
  return {
    data: (q.data as ProfileSelf | null) ?? null,
    loading: enabled && q.isLoading,
    refetch: () => {
      void q.refetch();
    },
  };
}

/**
 * Batch lookup de perfiles públicos por user IDs. Útil para el feed del
 * journal: comments, likes, etc. donde queremos pintar avatar+@nick de
 * múltiples authors en una sola query.
 *
 * Ordenamos los IDs antes de armar la queryKey para que dos llamadas con el
 * mismo set en orden diferente compartan cache.
 */
export function useProfilesBatch(userIds: string[]): {
  data: Map<string, ProfilePublic>;
  loading: boolean;
  refetch: () => void;
} {
  const { client, mode } = useSupabase();
  const sorted = Array.from(new Set(userIds)).sort();
  const enabled = mode === "online" && !!client && sorted.length > 0;
  const q = useQuery<Map<string, ProfilePublic>>({
    queryKey: qk.profilesBatch(sorted),
    queryFn: async () => {
      if (!client) return new Map();
      return fetchProfilesBatch(client, sorted);
    },
    enabled,
  });
  return {
    data: q.data ?? new Map(),
    loading: enabled && q.isLoading,
    refetch: () => {
      void q.refetch();
    },
  };
}

/**
 * Mutation para patchear el perfil propio. Invalida useMyProfile y
 * useProfilesBatch al éxito para que la UI vea cambios inmediatos.
 */
export function useUpdateMyProfile() {
  const { client, user } = useSupabase();
  const queryClient = useQueryClient();
  return useMutation<UpdateProfileResult, Error, UpdateProfilePatch>({
    mutationFn: async (patch: UpdateProfilePatch) => {
      if (!client || !user?.id) {
        return { ok: false, error: "not_authenticated" };
      }
      return updateMyProfile(client, user.id, patch);
    },
    onSuccess: (result) => {
      if (!result.ok) return;
      // Invalidamos myProfile + el batch genérico. Como las keys del batch
      // dependen del set de ids, invalidamos por prefijo.
      void queryClient.invalidateQueries({ queryKey: ["myProfile"] });
      void queryClient.invalidateQueries({ queryKey: ["profilesBatch"] });
    },
  });
}

/**
 * Helper directo para el form de settings: chequea disponibilidad realtime.
 * No usa cache de TanStack (el resultado es efímero, anti-stale).
 */
export async function isNicknameAvailable(
  client: NonNullable<ReturnType<typeof useSupabase>["client"]>,
  nickname: string,
  selfUserId?: string
): Promise<boolean> {
  return checkNicknameAvailable(client, nickname, selfUserId);
}
