-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — Per-trip email-in entries
--
-- Cada trip tiene su propia dirección `tampu+SHORTID@in.tampu.app` y los emails
-- que llegan a ese alias se persisten acá (no en `email_inbox`, que es la
-- bandeja global del user).
--
-- La diferencia con `email_inbox`: acá ya sabemos a qué trip pertenece la
-- reserva (lo dice el suffix del recipient), así que el commit es automático
-- en el sentido de "no hay que elegir trip" — el user solo aprueba o descarta.
--
-- PRIVACY: igual que email_inbox, NO guardamos el body crudo. Solo el shape
-- estructurado + metadata para auditoría.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists email_in_entries (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Short_id del trip (primeros 8 hex chars del UUID). Redundante con trip_id
  -- pero útil para auditoría: si en logs vemos un entry con short_id=abc12345,
  -- podés cross-referenciar con la address `tampu+abc12345@in.tampu.app`.
  short_id text not null,

  -- Quién mandó el email
  from_address text not null,
  from_name text,
  subject text,

  -- Provider del webhook
  provider text not null check (provider in ('email-ses', 'email-mailgun')),

  -- Status
  status text not null default 'parsed' check (status in ('pending', 'parsed', 'failed', 'committed', 'dismissed')),

  -- Parser output
  bookings_count integer not null default 0,
  carrier_hint text,
  languages text[],
  parsed_bookings jsonb not null default '[]'::jsonb,
  error_message text,

  -- Commit metadata
  committed_reservation_ids uuid[],
  committed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_email_in_entries_trip on email_in_entries(trip_id);
create index if not exists idx_email_in_entries_user on email_in_entries(user_id);
create index if not exists idx_email_in_entries_status on email_in_entries(status) where status in ('parsed', 'failed', 'pending');

alter table email_in_entries enable row level security;

drop policy if exists email_in_entries_select_own on email_in_entries;
create policy email_in_entries_select_own on email_in_entries for select using (user_id = auth.uid());

drop policy if exists email_in_entries_update_own on email_in_entries;
create policy email_in_entries_update_own on email_in_entries for update using (user_id = auth.uid());

drop policy if exists email_in_entries_delete_own on email_in_entries;
create policy email_in_entries_delete_own on email_in_entries for delete using (user_id = auth.uid());

-- INSERT lo hace el service-role desde el webhook /api/email-in. No habilitamos
-- política de insert para clients.

-- Purga automática: > 60 días sin commit
create or replace function tampu_purge_old_email_in_entries() returns void as $$
  delete from email_in_entries
   where status in ('parsed', 'failed', 'pending')
     and created_at < now() - interval '60 days';
$$ language sql security definer;
