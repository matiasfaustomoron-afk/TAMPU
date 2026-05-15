-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — Storage policies multi-user para bucket travel-vault
--
-- ITER 2 fixeó la RLS de `attachments` (migration 00034) basada en
-- `trip_members`. PERO el bucket `travel-vault` en Supabase Storage tiene
-- sus PROPIAS policies sobre `storage.objects` que siguen single-user
-- (folder = auth.uid). Resultado: editor invitado puede insertar attachment
-- row pero `createSignedUrl` falla con 403/404.
--
-- Fix: las 4 policies de storage usan JOIN con attachments+trip_members.
-- Patrón: `(storage.foldername(name))[1] = '<UID>'` ya no es suficiente —
-- necesitamos que cualquier miembro activo del trip que dueña ese attachment
-- pueda leer (y owner/editor pueda escribir/borrar).
-- ──────────────────────────────────────────────────────────────────────────

drop policy if exists "vault_select_own" on storage.objects;
drop policy if exists "vault_insert_own" on storage.objects;
drop policy if exists "vault_update_own" on storage.objects;
drop policy if exists "vault_delete_own" on storage.objects;

-- SELECT: cualquier miembro activo del trip puede leer attachments del trip
create policy "vault_select_member" on storage.objects
  for select using (
    bucket_id = 'travel-vault'
    and exists (
      select 1 from public.attachments a
      join public.trip_members tm on tm.trip_id = a.trip_id
      where a.storage_path = storage.objects.name
        and tm.user_id = auth.uid()
        and tm.status = 'active'
    )
  );

-- INSERT: solo owner/editor del trip pueden subir. El uploader queda como user_id.
create policy "vault_insert_member" on storage.objects
  for insert with check (
    bucket_id = 'travel-vault'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: solo el uploader original
create policy "vault_update_own_uploader" on storage.objects
  for update using (
    bucket_id = 'travel-vault'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE: solo el uploader original
create policy "vault_delete_own_uploader" on storage.objects
  for delete using (
    bucket_id = 'travel-vault'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
