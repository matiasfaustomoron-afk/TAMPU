# Supabase Storage Setup — `travel-vault`

Configuración manual del bucket privado donde guardamos PDFs cifrados y
adjuntos del usuario (Vault feature). El bucket NO se puede crear desde
una migration SQL — hay que crearlo desde el Supabase Dashboard, y
después aplicar las políticas RLS abajo.

## 1. Crear el bucket

1. Entrar al Supabase Dashboard → **Storage** → **New bucket**.
2. **Name**: `travel-vault`
3. **Public bucket**: **NO** (privado, solo accesible via signed URLs).
4. **File size limit**: 25 MB (suficiente para PDFs de boarding pass + JPGs).
5. **Allowed MIME types**: dejar vacío (queremos aceptar PDF, JPG, PNG, HEIC).
6. Click **Save**.

## 2. Convención de paths

Cada archivo se sube con el path:

```
<user_id>/<trip_id>/<uuid>.<ext>
```

Esto permite que las políticas RLS chequeen `auth.uid()::text` contra el
primer segmento del path (`storage.foldername(name)[1]`).

## 3. Aplicar las políticas RLS (multi-user, Iter 3)

> **Nota Iter 3 (2026-05-15)**: las políticas originales `vault_*_own` basadas
> solo en `storage.foldername(name)[1] = auth.uid()::text` rompían el flow
> multi-user. La migration `00034_attachments_rls_multi_user.sql` permite que
> editores invitados creen filas en `public.attachments`, pero el bucket
> Storage usa policies **propias** sobre `storage.objects` que seguían
> single-user — resultado: `createSignedUrl` devolvía 403/404 al co-owner.
>
> El SQL de abajo refleja la migration `00035_storage_policies_multi_user.sql`.
> Si ya aplicaste las viejas, los `drop policy if exists` se encargan.

Ir a **SQL Editor** → **New query** y pegar:

```sql
-- Drop viejas policies single-user (si existen)
drop policy if exists "vault_select_own" on storage.objects;
drop policy if exists "vault_insert_own" on storage.objects;
drop policy if exists "vault_update_own" on storage.objects;
drop policy if exists "vault_delete_own" on storage.objects;

-- ─── SELECT: cualquier miembro activo del trip que dueña ese attachment ───
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

-- ─── INSERT: owner/editor del trip suben bajo su propio folder ────────────
create policy "vault_insert_member" on storage.objects
  for insert with check (
    bucket_id = 'travel-vault'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── UPDATE: solo el uploader original ────────────────────────────────────
create policy "vault_update_own_uploader" on storage.objects
  for update using (
    bucket_id = 'travel-vault'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── DELETE: solo el uploader original ────────────────────────────────────
create policy "vault_delete_own_uploader" on storage.objects
  for delete using (
    bucket_id = 'travel-vault'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

Hacer click en **Run**. Las 4 policies se aplican inmediatamente.

## 4. Verificar

En **Storage → travel-vault → Policies** deberían aparecer las 4 políticas
con prefijo `vault_`. Si no aparecen, recargá la página.

## 5. Smoke test

Desde la app (modo online), probar:

1. Subir un PDF en `/vault`. Debe aparecer en el bucket bajo `<user_id>/...`.
2. Login con otro user → ese user **no** debe ver el PDF del primer user
   (ni en list ni con un signed URL forzado).
3. Borrar el PDF desde la UI. Debe desaparecer del bucket.

## 6. Encryption at rest

Los blobs que subimos al bucket ya vienen **cifrados client-side** con
AES-GCM(256) (la master key vive en RAM, derivada del passcode del user vía
PBKDF2-SHA256 con 600.000 iteraciones). Esto significa que aunque alguien
con acceso al bucket descargue un archivo, ve bytes opacos — no puede
abrir el PDF sin el passcode.

Ver `src/lib/vault/storage.ts` y `src/lib/crypto/aes.ts` para el flow.

## 7. Recuperación

**No tenemos recovery del passcode**. Si el user lo pierde, los archivos
del Vault son irrecuperables. Esto es by-design: la app no puede
descifrarlos por él. Documentar este límite en el onboarding del Vault.

---

**Última revisión**: 2026-05-14 · auditoría D-track
