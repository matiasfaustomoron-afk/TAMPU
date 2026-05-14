-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — WhatsApp ingestion: auto-insert al trip
--
-- El webhook ya parsea el mensaje con Haiku y guarda parsed_json. Esta
-- migration cierra el loop: agrega las columnas necesarias para que el
-- webhook pueda auto-insertar el item parseado a la tabla `reservations`
-- (en el schema actual, vuelos / hoteles / tours / transporte TODOS
-- viven en `reservations` con `type` enum — NO hay tabla flights aparte).
--
-- Columnas nuevas en `whatsapp_messages`:
--   - auto_insert_skipped_reason: si decidimos NO auto-insertar, el motivo.
--     Nullable. La UI lo usa para mostrar al user qué hacer.
--   - auto_inserted_item_id: si SÍ auto-insertamos, FK a reservations(id).
--     Nullable. Si la reserva se borra, se nullifica acá (set null).
--
-- Columnas nuevas en `reservations` (lightweight provenance):
--   - source: 'manual' | 'whatsapp_ingestion' | 'ai_plan' | 'email_inbox' | ...
--     Default 'manual' para que las filas existentes queden marcadas como
--     creadas por el user.
--   - created_by_automation: boolean (true cuando NO fue un click humano).
--   - metadata: jsonb con extras del origen (ej. whatsapp_message_id para
--     idempotencia, raw_location cuando no resolvimos la city).
--
-- Helpers SQL (security definer) — los usamos desde el webhook con
-- service_role, pero los dejamos security definer para que también funcionen
-- desde RLS-context si en el futuro queremos llamarlos desde otro flow.
-- ──────────────────────────────────────────────────────────────────────────

-- ─── whatsapp_messages: columnas de tracking del auto-insert ─────────────
alter table public.whatsapp_messages
  add column if not exists auto_insert_skipped_reason text,
  add column if not exists auto_inserted_item_id uuid
    references public.reservations(id) on delete set null;

comment on column public.whatsapp_messages.auto_insert_skipped_reason is
  'Razón por la que el item parseado NO se auto-insertó al trip. Valores: low_confidence, no_active_trip, multiple_trips_ambiguous, unknown_location, unsupported_type, missing_required_field, idempotent_skip, insert_failed. NULL si se insertó o si todavía no se procesó.';
comment on column public.whatsapp_messages.auto_inserted_item_id is
  'FK a la fila de reservations creada automáticamente por el webhook. NULL si no se auto-insertó.';

create index if not exists idx_whatsapp_msg_auto_inserted
  on public.whatsapp_messages(auto_inserted_item_id)
  where auto_inserted_item_id is not null;

-- ─── reservations: provenance (source / automation flag / metadata) ──────
-- Las migraciones existentes NO tienen estos campos. Los agregamos como
-- nullable / con default seguro para no romper las filas existentes.
alter table public.reservations
  add column if not exists source text default 'manual',
  add column if not exists created_by_automation boolean not null default false,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.reservations.source is
  'Origen de la fila. Valores conocidos: manual (default), whatsapp_ingestion, ai_plan, email_inbox.';
comment on column public.reservations.created_by_automation is
  'TRUE si la fila fue creada por un proceso automático (webhook / cron / LLM) y no por click del user.';
comment on column public.reservations.metadata is
  'JSON libre con metadatos del origen. Para whatsapp_ingestion guardamos { whatsapp_message_id, raw_location?, parser_confidence }.';

-- Índice parcial para idempotencia del webhook WhatsApp: buscar rápido si
-- ya insertamos una reserva para un message_id concreto.
create index if not exists idx_reservations_source_whatsapp
  on public.reservations((metadata->>'whatsapp_message_id'))
  where source = 'whatsapp_ingestion';

-- ─── Helper: find_active_trip(user_id, date) ─────────────────────────────
-- Devuelve el id del trip "activo" del user para una fecha dada.
--
-- Definición de "activo":
--   - status IN ('planning','active')  (NO archived ni completed)
--   - Si `p_date` se pasa: trip cuyo rango [start_date..end_date] contiene
--     esa fecha. Si más de uno, devolvemos NULL (ambigüedad explícita —
--     el caller decide qué hacer).
--   - Si `p_date` es NULL: si hay exactamente 1 trip activo, devolvemos su
--     id. Si hay >1, NULL.
create or replace function public.find_active_trip(
  p_user_id uuid,
  p_date date default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_trip_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  if p_date is not null then
    -- Match por fecha dentro del rango
    select count(*), max(id)
      into v_count, v_trip_id
    from public.trips
    where user_id = p_user_id
      and status in ('planning','active')
      and start_date <= p_date
      and end_date   >= p_date;
    if v_count = 1 then
      return v_trip_id;
    else
      return null; -- 0 o >1 → ambiguo
    end if;
  end if;

  -- Sin fecha: si hay exactamente 1 trip activo, devolvemos ese.
  select count(*), max(id)
    into v_count, v_trip_id
  from public.trips
  where user_id = p_user_id
    and status in ('planning','active');
  if v_count = 1 then
    return v_trip_id;
  else
    return null;
  end if;
end;
$$;

comment on function public.find_active_trip(uuid, date) is
  'Devuelve el trip activo del user para una fecha (o NULL si 0/ambiguo). Usado por whatsapp auto-insert.';

-- ─── Helper: find_city_by_name(trip_id, name) ─────────────────────────────
-- En el schema de Tampu, `cities` es per-trip (trip_id NOT NULL). NO hay
-- catálogo global de ciudades ni de airports. Este helper busca dentro de
-- las cities del trip por match fuzzy (ilike '%name%') case-insensitive.
-- Si hay match único devuelve el id, si no NULL.
create or replace function public.find_city_by_name(
  p_trip_id uuid,
  p_name text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_city_id uuid;
  v_pattern text;
begin
  if p_trip_id is null or p_name is null or length(trim(p_name)) = 0 then
    return null;
  end if;
  v_pattern := '%' || trim(p_name) || '%';
  select count(*), max(id)
    into v_count, v_city_id
  from public.cities
  where trip_id = p_trip_id
    and name ilike v_pattern;
  if v_count = 1 then
    return v_city_id;
  else
    return null; -- 0 o >1 — el caller decide qué hacer (probablemente caer
                 -- en city_name como texto libre).
  end if;
end;
$$;

comment on function public.find_city_by_name(uuid, text) is
  'Busca una city dentro de las cities del trip por fuzzy match (ilike). Devuelve UUID si match único, NULL si 0 o ambiguo.';

-- ─── NOTA sobre find_airport_by_iata ──────────────────────────────────────
-- El brief original mencionaba `find_airport_by_iata(p_code)`. NO existe
-- tabla `airports` en el schema actual (00001-00025) y la tabla `cities`
-- es per-trip, así que NO podemos resolver IATA → city_id de forma global.
-- En vez de crear una tabla nueva (fuera de scope), el webhook va a:
--   1. Tomar la to_city del flight (del parsed_json) si existe.
--   2. Si no, dejar city_id=NULL y city_name=from_iata||'→'||to_iata libre.
-- Si en el futuro se agrega un catálogo global de airports, este helper
-- se agrega entonces.
