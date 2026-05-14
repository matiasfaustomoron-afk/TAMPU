-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — Polls (decisiones grupales A vs B vs C con deadline)
--
-- Antes los polls vivían solo en localStorage (demo mode). Esta migración
-- les da persistence en Supabase para que un grupo de viajeros pueda votar
-- desde sus dispositivos respectivos y compartir el resultado.
--
-- Shape mínimo: cada poll tiene una pregunta, 2-6 opciones (jsonb), y un
-- map de votos { userId: optionId }. El creator puede cerrarlo manualmente
-- o por deadline.
--
-- RLS: cualquier member del trip puede SELECT/UPDATE (para votar);
-- solo el creator puede DELETE; el creator de un poll debe poder editar
-- el trip (chequea tampu_user_can_edit_trip).
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question text not null,
  -- Array de { id: string, label: string, description?: string }
  options jsonb not null,
  -- Map { userId: optionId }. Default vacío; se actualiza con cada voto.
  votes jsonb not null default '{}'::jsonb,
  -- Opcional: nombres de cada votante para mostrar sin un JOIN extra a profiles.
  voter_names jsonb not null default '{}'::jsonb,
  -- ISO timestamp del deadline. null = sin deadline.
  deadline timestamptz,
  -- Si el creator lo cerró manualmente. (NULL si sigue abierto.)
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check (length(question) > 0),
  check (jsonb_typeof(options) = 'array'),
  check (jsonb_array_length(options) between 2 and 6)
);

create index if not exists idx_polls_trip on public.polls(trip_id);
create index if not exists idx_polls_created_at on public.polls(created_at desc);

alter table public.polls enable row level security;

-- SELECT: cualquier member del trip ve los polls.
drop policy if exists polls_select on public.polls;
create policy polls_select on public.polls
  for select using (tampu_user_in_trip(trip_id));

-- INSERT: el creator debe ser el caller y tener permiso de edit del trip.
drop policy if exists polls_insert on public.polls;
create policy polls_insert on public.polls
  for insert with check (
    auth.uid() = created_by
    and tampu_user_can_edit_trip(trip_id)
  );

-- UPDATE: el creator puede cerrar/editar; cualquier member puede VOTAR
-- (modificar el campo votes). RLS no distingue per-column, así que dejamos
-- update abierto a cualquier member del trip — la lógica de "solo voto, no
-- cambio la pregunta" se hace en el client/server. Si más adelante esto
-- abusa, restringimos con un trigger BEFORE UPDATE.
drop policy if exists polls_update on public.polls;
create policy polls_update on public.polls
  for update using (
    auth.uid() = created_by
    or tampu_user_in_trip(trip_id)
  );

-- DELETE: solo el creator.
drop policy if exists polls_delete on public.polls;
create policy polls_delete on public.polls
  for delete using (auth.uid() = created_by);

comment on table public.polls is
  'Polls grupales por trip (A vs B vs C). Cualquier member vota, solo creator borra.';
comment on column public.polls.votes is
  'Map { userId(uuid as text): optionId(string del array options) }';
