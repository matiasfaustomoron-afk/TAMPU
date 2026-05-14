-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — Fix `handle_new_user` trigger
--
-- PROBLEMA en producción (mayo 2026): el signup fallaba con "database error
-- saving new user". El trigger se disparaba pero el INSERT en `profiles`
-- fallaba silenciosamente desde el contexto de supabase_auth_admin.
--
-- CAUSA: Supabase corre triggers en auth.users con search_path vacío como
-- best practice de seguridad. La función original NO declaraba search_path
-- ni usaba el nombre fully-qualified `public.profiles`, así que el INSERT
-- no podía resolver la tabla → fallaba con "relation profiles does not exist"
-- (suprimido en logs públicos, pero ese era el error).
--
-- FIX (5 cambios):
--   1. set search_path = public dentro de la función
--   2. INSERT con `public.profiles` fully qualified
--   3. on conflict (id) do nothing — idempotencia si Supabase reintenta
--   4. exception handler que loguea warning pero NO rompe el signup
--      (mejor tener user sin profile que rechazar signup; profile se puede
--       crear después manualmente o con un cleanup job)
--   5. grants explícitos a supabase_auth_admin, authenticated, service_role
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
exception
  when others then
    raise warning 'handle_new_user trigger failed: % (%)', sqlerrm, sqlstate;
    return new;
end;
$$;

grant execute on function public.handle_new_user() to supabase_auth_admin;
grant execute on function public.handle_new_user() to authenticated;
grant execute on function public.handle_new_user() to service_role;

-- Re-crear el trigger por si la versión vieja quedó cacheada.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
