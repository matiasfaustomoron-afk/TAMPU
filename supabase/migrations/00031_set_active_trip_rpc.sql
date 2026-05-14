-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — Función RPC set_active_trip (atómico, security definer)
--
-- PROBLEMA: el "activar trip" client-side hacía dos updates separados:
--   1. UPDATE trips SET is_active = false WHERE id != p_trip_id
--   2. UPDATE trips SET is_active = true WHERE id = p_trip_id
-- Entre ambos había una ventana donde el user no tenía ningún trip activo;
-- si el segundo update fallaba (RLS, conexión perdida, etc.) el state quedaba
-- inconsistente. Además NO validaba ownership: un user podía intentar activar
-- un trip de otro user (RLS lo bloqueaba, pero el primer UPDATE ya había
-- desactivado los suyos).
--
-- FIX DEFINITIVO: RPC atómica server-side que:
--   - Valida auth.uid()
--   - Valida ownership del trip target (raise si no es del user)
--   - Hace los dos updates en la misma transacción implícita de la función
--   - Devuelve el trip activado
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.set_active_trip(p_trip_id uuid)
returns trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_trip trips;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'No hay sesión activa. Volvé a hacer login.' using errcode = '42501';
  end if;

  -- Validar ownership ANTES de tocar nada
  select * into v_trip from trips where id = p_trip_id and user_id = v_user_id;
  if v_trip.id is null then
    raise exception 'Trip no encontrado o no pertenece al usuario.' using errcode = 'P0002';
  end if;

  -- Atómico dentro de la función: desactivar todos los demás del user
  update trips
    set is_active = false
    where user_id = v_user_id
      and id != p_trip_id
      and is_active = true;

  -- Activar el target (incluso si ya estaba activo, hace no-op pero devuelve la row actualizada)
  update trips
    set is_active = true
    where id = p_trip_id
      and user_id = v_user_id
    returning * into v_trip;

  return v_trip;
end;
$$;

comment on function public.set_active_trip(uuid) is
  'Activa un trip atómicamente: valida auth y ownership, desactiva los demás trips del user, activa el target. Reemplaza el flow client-side .update() doble que dejaba state inconsistente si el segundo update fallaba.';

revoke all on function public.set_active_trip(uuid) from public, anon;
grant execute on function public.set_active_trip(uuid) to authenticated, service_role;
