-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — Attachments RLS: vault multi-user
--
-- Hasta acá la policy era `user_id = auth.uid()` (single-user). Bloqueaba a
-- los miembros invitados del trip (editores) que necesitaban subir y leer
-- pases de embarque, seguros, reservas. P0 reportado del vault editor: el
-- co-owner del viaje no podía ver el vault. Ahora:
--
--   SELECT: cualquier trip_member activo (owner/editor/viewer).
--   INSERT: owner/editor activos; `user_id` debe ser el caller (no spoofing).
--   UPDATE/DELETE: solo el uploader (user_id = auth.uid()) — proteger contra
--     editors borrando archivos ajenos. El owner ya tiene cascade en `attachments`
--     via FK on `trip_id` si necesita limpiar todo.
-- ──────────────────────────────────────────────────────────────────────────

drop policy if exists "attachments_all" on public.attachments;

create policy "attachments_select_member" on public.attachments
  for select using (
    exists (
      select 1 from public.trip_members
      where trip_id = attachments.trip_id
        and user_id = auth.uid()
        and status = 'active'
    )
  );

create policy "attachments_insert_member" on public.attachments
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.trip_members
      where trip_id = attachments.trip_id
        and user_id = auth.uid()
        and role in ('owner', 'editor')
        and status = 'active'
    )
  );

create policy "attachments_update_own" on public.attachments
  for update using (user_id = auth.uid());

create policy "attachments_delete_own" on public.attachments
  for delete using (user_id = auth.uid());
