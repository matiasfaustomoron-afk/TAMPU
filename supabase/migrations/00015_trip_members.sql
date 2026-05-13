-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — Multi-user trip sharing
--
-- Hasta acá un trip pertenecía a UN user_id (RLS por user_id). Para soportar
-- "comparto el viaje con mi pareja con sus propios likes y comments", agregamos
-- una tabla `trip_members` que asocia (trip_id, user_id, role) y refactoreamos
-- las policies para usar membership en lugar de ownership.
--
-- Roles:
--   - owner:  creador, puede borrar el viaje, modificar todo, invitar/expulsar miembros
--   - editor: puede agregar/editar reservas, gastos, fotos, comments
--   - viewer: solo lectura. Útil para "le muestro a mi mamá el itinerario"
--
-- Invitaciones se hacen por email (la creamos como `pending`, el invitado
-- la acepta cuando hace login y matchea el email).
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists trip_members (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text,                       -- usado mientras `user_id` es null (pending)
  role text not null check (role in ('owner', 'editor', 'viewer')),
  status text not null default 'active' check (status in ('pending', 'active', 'revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz default now(),
  accepted_at timestamptz,
  created_at timestamptz default now(),
  -- Un email puede ser invitado UNA vez por trip (no spamear)
  unique(trip_id, invited_email),
  -- Un user_id puede ser miembro UNA vez por trip (no duplicar)
  unique(trip_id, user_id)
);

create index idx_trip_members_trip on trip_members(trip_id);
create index idx_trip_members_user on trip_members(user_id) where user_id is not null;
create index idx_trip_members_email on trip_members(invited_email) where invited_email is not null;

-- Auto-add el creador del trip como owner cuando se inserta una fila en `trips`.
create or replace function tampu_add_owner_membership() returns trigger as $$
begin
  insert into trip_members (trip_id, user_id, role, status, invited_by, accepted_at)
  values (new.id, new.user_id, 'owner', 'active', new.user_id, now())
  on conflict (trip_id, user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_tampu_add_owner_membership on trips;
create trigger trg_tampu_add_owner_membership
  after insert on trips
  for each row execute function tampu_add_owner_membership();

-- Cuando un user acepta una invitación pending (vía /api/accept-invite o UI),
-- el endpoint hace UPDATE: status='active', user_id=auth.uid(), accepted_at=now().

-- ──────────────────────────────────────────────────────────────────────────
-- RLS — refactorizar policies de `trips` y entidades hijas para usar membership.
-- ──────────────────────────────────────────────────────────────────────────

alter table trip_members enable row level security;

-- Cualquier miembro activo del trip puede LEER la membership list (saber quién más
-- está en el viaje). Solo owner puede INSERT/UPDATE/DELETE.
drop policy if exists trip_members_select on trip_members;
create policy trip_members_select on trip_members for select using (
  exists (
    select 1 from trip_members tm
    where tm.trip_id = trip_members.trip_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
  )
);

drop policy if exists trip_members_owner_write on trip_members;
create policy trip_members_owner_write on trip_members for all using (
  exists (
    select 1 from trip_members tm
    where tm.trip_id = trip_members.trip_id
      and tm.user_id = auth.uid()
      and tm.role = 'owner'
      and tm.status = 'active'
  )
);

-- Helper function: ¿este usuario tiene membership activa en este trip?
create or replace function tampu_user_in_trip(p_trip_id uuid) returns boolean as $$
  select exists (
    select 1 from trip_members
    where trip_id = p_trip_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$ language sql stable security definer;

-- Helper: ¿este usuario tiene rol >= editor en este trip?
create or replace function tampu_user_can_edit_trip(p_trip_id uuid) returns boolean as $$
  select exists (
    select 1 from trip_members
    where trip_id = p_trip_id
      and user_id = auth.uid()
      and role in ('owner', 'editor')
      and status = 'active'
  );
$$ language sql stable security definer;

-- ──────────────────────────────────────────────────────────────────────────
-- Refactor policies de `trips`. Antes: WHERE user_id = auth.uid(). Ahora: membership.
-- (Mantenemos `user_id` como FK pero ya no es el único criterio de acceso.)
-- ──────────────────────────────────────────────────────────────────────────

drop policy if exists trips_select on trips;
create policy trips_select on trips for select using (tampu_user_in_trip(id));

drop policy if exists trips_insert on trips;
create policy trips_insert on trips for insert with check (auth.uid() = user_id);

drop policy if exists trips_update on trips;
create policy trips_update on trips for update using (tampu_user_can_edit_trip(id));

drop policy if exists trips_delete on trips;
create policy trips_delete on trips for delete using (
  exists (
    select 1 from trip_members
    where trip_id = trips.id
      and user_id = auth.uid()
      and role = 'owner'
      and status = 'active'
  )
);

-- ──────────────────────────────────────────────────────────────────────────
-- Refactor entidades hijas (reservations, expenses, tasks, etc.):
-- viewer puede leer, editor puede modificar, owner puede borrar.
-- Por brevedad acá solo refactoreamos las 3 que ven más cambios.
-- ──────────────────────────────────────────────────────────────────────────

drop policy if exists reservations_select on reservations;
create policy reservations_select on reservations for select using (tampu_user_in_trip(trip_id));

drop policy if exists reservations_modify on reservations;
create policy reservations_modify on reservations for all using (tampu_user_can_edit_trip(trip_id));

drop policy if exists expenses_select on expenses;
create policy expenses_select on expenses for select using (tampu_user_in_trip(trip_id));

drop policy if exists expenses_modify on expenses;
create policy expenses_modify on expenses for all using (tampu_user_can_edit_trip(trip_id));

drop policy if exists tasks_select on tasks;
create policy tasks_select on tasks for select using (tampu_user_in_trip(trip_id));

drop policy if exists tasks_modify on tasks;
create policy tasks_modify on tasks for all using (tampu_user_can_edit_trip(trip_id));

-- ──────────────────────────────────────────────────────────────────────────
-- Tabla de likes (en /journal). Multi-user real.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists journal_likes (
  id uuid default uuid_generate_v4() primary key,
  journal_entry_id uuid not null,
  trip_id uuid references trips(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(journal_entry_id, user_id)
);

create index idx_journal_likes_entry on journal_likes(journal_entry_id);

alter table journal_likes enable row level security;

drop policy if exists journal_likes_select on journal_likes;
create policy journal_likes_select on journal_likes for select using (tampu_user_in_trip(trip_id));

drop policy if exists journal_likes_self_insert on journal_likes;
create policy journal_likes_self_insert on journal_likes for insert with check (
  auth.uid() = user_id and tampu_user_in_trip(trip_id)
);

drop policy if exists journal_likes_self_delete on journal_likes;
create policy journal_likes_self_delete on journal_likes for delete using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────
-- Tabla de comments (en /journal). Multi-user real.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists journal_comments (
  id uuid default uuid_generate_v4() primary key,
  journal_entry_id uuid not null,
  trip_id uuid references trips(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  body text not null,
  created_at timestamptz default now()
);

create index idx_journal_comments_entry on journal_comments(journal_entry_id);

alter table journal_comments enable row level security;

drop policy if exists journal_comments_select on journal_comments;
create policy journal_comments_select on journal_comments for select using (tampu_user_in_trip(trip_id));

drop policy if exists journal_comments_self_insert on journal_comments;
create policy journal_comments_self_insert on journal_comments for insert with check (
  auth.uid() = user_id and tampu_user_in_trip(trip_id)
);

drop policy if exists journal_comments_self_modify on journal_comments;
create policy journal_comments_self_modify on journal_comments for update using (auth.uid() = user_id);

drop policy if exists journal_comments_self_delete on journal_comments;
create policy journal_comments_self_delete on journal_comments for delete using (auth.uid() = user_id);
