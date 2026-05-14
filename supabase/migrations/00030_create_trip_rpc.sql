-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — Función RPC create_trip (security definer + atomic)
--
-- PROBLEMA: el insert client-side de trips fallaba con 42501 (RLS violation)
-- aunque el código pasaba user_id = auth.getUser().id. Causas posibles:
--   1. auth.uid() en el contexto del INSERT no resolvía igual que en getUser()
--   2. La nueva key format sb_publishable_ tiene quirks con @supabase/ssr 0.10
--   3. Race condition de sesión refresh
--   4. RLS evaluación con search_path no-public
--
-- FIX DEFINITIVO: encapsular el insert en una función `security definer`
-- server-side que:
--   - Valida auth.uid() del contexto (siempre confiable cuando el JWT está OK)
--   - Hace el insert con user_id = auth.uid() (NO trust client input)
--   - Desactiva otros trips activos del user (atómico)
--   - Devuelve el trip completo
--
-- Esto elimina toda categoría de bugs RLS sobre INSERT de trips.
-- El client llama `db.rpc('create_trip', { trip_data })` en vez de .insert().
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.create_trip(trip_data jsonb)
returns trips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  new_trip trips;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'No hay sesión activa. Volvé a hacer login.' using errcode = '42501';
  end if;

  -- Validación de campos mínimos
  if trip_data->>'name' is null or length(trim(trip_data->>'name')) = 0 then
    raise exception 'El nombre del viaje es obligatorio.' using errcode = '23502';
  end if;
  if trip_data->>'destination' is null or length(trim(trip_data->>'destination')) = 0 then
    raise exception 'El destino es obligatorio.' using errcode = '23502';
  end if;
  if trip_data->>'start_date' is null or trip_data->>'end_date' is null then
    raise exception 'Las fechas de inicio y fin son obligatorias.' using errcode = '23502';
  end if;

  -- Insert con user_id del contexto (NO confiamos en el JSON)
  insert into trips (
    name, description, destination, status, start_date, end_date,
    base_currency, total_budget, contingency_percent, contingency_amount,
    alert_days_warning, alert_days_critical,
    budget_warning_threshold, budget_danger_threshold,
    user_id, is_active
  ) values (
    trim(trip_data->>'name'),
    nullif(trim(coalesce(trip_data->>'description', '')), ''),
    trim(trip_data->>'destination'),
    coalesce(trip_data->>'status', 'planning'),
    (trip_data->>'start_date')::date,
    (trip_data->>'end_date')::date,
    coalesce(trip_data->>'base_currency', 'USD'),
    coalesce((trip_data->>'total_budget')::numeric, 0),
    coalesce((trip_data->>'contingency_percent')::numeric, 10),
    coalesce((trip_data->>'contingency_amount')::numeric, 0),
    coalesce((trip_data->>'alert_days_warning')::int, 7),
    coalesce((trip_data->>'alert_days_critical')::int, 3),
    coalesce((trip_data->>'budget_warning_threshold')::int, 80),
    coalesce((trip_data->>'budget_danger_threshold')::int, 95),
    v_user_id,
    true
  ) returning * into new_trip;

  -- Desactivar otros trips del user (mantener uno activo a la vez)
  update trips
    set is_active = false
    where user_id = v_user_id
      and id != new_trip.id
      and is_active = true;

  -- El trigger tampu_add_owner_membership ya creó la fila en trip_members
  -- automáticamente al insert. No hace falta tocarlo acá.

  return new_trip;
end;
$$;

comment on function public.create_trip(jsonb) is
  'Crea un trip atómicamente: valida auth, inserta con user_id del JWT, desactiva otros trips activos. Reemplaza el flow client-side .insert() que fallaba con RLS quirks.';

revoke all on function public.create_trip(jsonb) from public, anon;
grant execute on function public.create_trip(jsonb) to authenticated, service_role;
