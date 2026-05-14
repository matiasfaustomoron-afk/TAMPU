
-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00001_extensions.sql
-- ╚═══════════════════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00002_profiles.sql
-- ╚═══════════════════════════════════════════════════════════════════

create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  timezone text default 'America/Argentina/Buenos_Aires',
  preferred_currency text default 'USD',
  date_format text default 'MM/dd/yyyy',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create or replace function handle_new_user() returns trigger as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00003_trips.sql
-- ╚═══════════════════════════════════════════════════════════════════

create table if not exists trips (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  name text not null, description text, destination text not null,
  status text default 'planning' check (status in ('planning','active','completed','archived')),
  start_date date not null, end_date date not null,
  base_currency text default 'USD',
  total_budget numeric(12,2) default 0, contingency_percent numeric(5,2) default 10, contingency_amount numeric(12,2) default 0,
  alert_days_warning int default 7, alert_days_critical int default 3,
  budget_warning_threshold int default 80, budget_danger_threshold int default 95,
  is_active boolean default true,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index idx_trips_user on trips(user_id);
create index idx_trips_active on trips(user_id, is_active);

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00004_cities.sql
-- ╚═══════════════════════════════════════════════════════════════════

create table if not exists cities (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  name text not null, country text not null,
  arrival_date date, departure_date date, nights int default 0, order_index int default 0, notes text
);
create index idx_cities_trip on cities(trip_id);

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00005_reservations.sql
-- ╚═══════════════════════════════════════════════════════════════════

create table if not exists reservations (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  type text not null check (type in ('flight','accommodation','train','bus','tour','insurance','connectivity','other')),
  criticality text default 'important' check (criticality in ('nice_to_have','important','essential','blocker')),
  provider text not null, city_id uuid references cities(id) on delete set null, city_name text,
  description text not null, purchase_date date, use_date date, use_end_date date, payment_deadline date,
  original_amount numeric(12,2) default 0, original_currency text default 'USD',
  exchange_rate numeric(10,4) default 1, base_amount numeric(12,2) default 0,
  status text default 'pending' check (status in ('pending','booked','confirmed','paid','cancelled','expired')),
  confirmation_received boolean default false, locator text, link text, contact text,
  cancellation_policy text, is_cancellable boolean default true, notes text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index idx_reservations_trip on reservations(trip_id);
create index idx_reservations_status on reservations(trip_id, status);

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00006_documents.sql
-- ╚═══════════════════════════════════════════════════════════════════

create table if not exists documents (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  type text not null, name text not null,
  criticality text default 'important' check (criticality in ('nice_to_have','important','essential','blocker')),
  expiry_date date, status text default 'pending' check (status in ('pending','ready','expired','not_applicable')),
  has_digital_copy boolean default false, has_offline_copy boolean default false, is_validated boolean default false,
  action_required text, notes text, attachment_url text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index idx_documents_trip on documents(trip_id);

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00007_tasks.sql
-- ╚═══════════════════════════════════════════════════════════════════

create table if not exists tasks (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  title text not null, description text, stage text, category text not null, subcategory text,
  priority text default 'medium' check (priority in ('low','medium','high','critical')),
  criticality text default 'important' check (criticality in ('nice_to_have','important','essential','blocker')),
  responsible text, created_at timestamptz default now(),
  start_date date, due_date date,
  status text default 'pending' check (status in ('pending','in_progress','waiting','done','cancelled')),
  progress int default 0 check (progress >= 0 and progress <= 100),
  is_blocker boolean default false, dependency_id uuid references tasks(id) on delete set null,
  next_action text, requires_payment boolean default false,
  estimated_amount numeric(10,2), actual_amount numeric(10,2),
  reservation_id uuid references reservations(id) on delete set null,
  document_id uuid references documents(id) on delete set null,
  city_id uuid references cities(id) on delete set null, city_name text, notes text,
  updated_at timestamptz default now()
);
create index idx_tasks_trip on tasks(trip_id);
create index idx_tasks_status on tasks(trip_id, status);
create index idx_tasks_due on tasks(trip_id, due_date);

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00008_trip_days.sql
-- ╚═══════════════════════════════════════════════════════════════════

create table if not exists trip_days (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  date date not null, day_number int not null,
  city_id uuid references cities(id) on delete set null, city_name text, zone text,
  accommodation text, accommodation_reservation_id uuid references reservations(id) on delete set null,
  check_in boolean default false, check_out boolean default false,
  main_activity text, secondary_activity text, main_transport text,
  estimated_cost numeric(10,2) default 0, actual_cost numeric(10,2) default 0,
  notes text, status text default 'empty' check (status in ('empty','partial','planned','confirmed'))
);
create index idx_trip_days_trip on trip_days(trip_id);
create unique index idx_trip_days_date on trip_days(trip_id, date);

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00009_budget_expenses.sql
-- ╚═══════════════════════════════════════════════════════════════════

create table if not exists budget_categories (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  category text not null, label text not null, budgeted_amount numeric(12,2) default 0, order_index int default 0
);
create index idx_budget_cat_trip on budget_categories(trip_id);

create table if not exists expenses (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  date date not null, city_id uuid references cities(id) on delete set null, city_name text,
  category text not null, subcategory text, description text not null, payment_method text,
  original_currency text default 'USD', original_amount numeric(12,2) not null,
  exchange_rate numeric(10,4) default 1, base_amount numeric(12,2) not null,
  is_fixed boolean default false, is_budgeted boolean default true,
  reservation_id uuid references reservations(id) on delete set null,
  attachment_url text, notes text, created_at timestamptz default now()
);
create index idx_expenses_trip on expenses(trip_id);
create index idx_expenses_date on expenses(trip_id, date);

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00010_packing_alerts.sql
-- ╚═══════════════════════════════════════════════════════════════════

create table if not exists packing_items (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  category text not null, subcategory text, item text not null,
  quantity_target int default 1, quantity_current int default 0,
  is_essential boolean default false, is_purchased boolean default true, needs_purchase boolean default false,
  assigned_bag text, priority text default 'medium' check (priority in ('low','medium','high','critical')),
  status text default 'pending' check (status in ('pending','packed','not_needed')),
  deadline date, notes text
);
create index idx_packing_trip on packing_items(trip_id);

create table if not exists alerts (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  type text not null, severity text default 'warning' check (severity in ('info','warning','critical')),
  module text not null, origin_id uuid,
  title text not null, description text not null,
  detected_at timestamptz default now(), target_date date,
  status text default 'active' check (status in ('active','acknowledged','resolved','dismissed')),
  suggested_action text, deep_link text, created_at timestamptz default now()
);
create index idx_alerts_trip on alerts(trip_id);
create index idx_alerts_status on alerts(trip_id, status);

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00011_triggers.sql
-- ╚═══════════════════════════════════════════════════════════════════

create or replace function update_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger tr_profiles_updated before update on profiles for each row execute function update_updated_at();
create trigger tr_trips_updated before update on trips for each row execute function update_updated_at();
create trigger tr_tasks_updated before update on tasks for each row execute function update_updated_at();
create trigger tr_reservations_updated before update on reservations for each row execute function update_updated_at();
create trigger tr_documents_updated before update on documents for each row execute function update_updated_at();

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00012_rls.sql
-- ╚═══════════════════════════════════════════════════════════════════

alter table profiles enable row level security;
alter table trips enable row level security;
alter table cities enable row level security;
alter table trip_days enable row level security;
alter table tasks enable row level security;
alter table reservations enable row level security;
alter table budget_categories enable row level security;
alter table expenses enable row level security;
alter table documents enable row level security;
alter table packing_items enable row level security;
alter table alerts enable row level security;

create policy "profiles_select" on profiles for select using (auth.uid() = id);
create policy "profiles_update" on profiles for update using (auth.uid() = id);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);

create policy "trips_select" on trips for select using (user_id = auth.uid());
create policy "trips_insert" on trips for insert with check (user_id = auth.uid());
create policy "trips_update" on trips for update using (user_id = auth.uid());
create policy "trips_delete" on trips for delete using (user_id = auth.uid());

create or replace function user_owns_trip(trip_uuid uuid) returns boolean as $$
  select exists(select 1 from trips where id = trip_uuid and user_id = auth.uid());
$$ language sql security definer;

create policy "cities_all" on cities for all using (user_owns_trip(trip_id));
create policy "trip_days_all" on trip_days for all using (user_owns_trip(trip_id));
create policy "tasks_all" on tasks for all using (user_owns_trip(trip_id));
create policy "reservations_all" on reservations for all using (user_owns_trip(trip_id));
create policy "budget_categories_all" on budget_categories for all using (user_owns_trip(trip_id));
create policy "expenses_all" on expenses for all using (user_owns_trip(trip_id));
create policy "documents_all" on documents for all using (user_owns_trip(trip_id));
create policy "packing_items_all" on packing_items for all using (user_owns_trip(trip_id));
create policy "alerts_all" on alerts for all using (user_owns_trip(trip_id));

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00013_attachments.sql
-- ╚═══════════════════════════════════════════════════════════════════

-- Attachments / Document Vault
create table if not exists attachments (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  entity_type text not null check (entity_type in ('trip','reservation','document','expense','task','packing_item','other')),
  entity_id uuid,
  category text default 'other' check (category in ('insurance','boarding_pass','identity','reservation','transport','health','receipt','other')),
  file_name text not null,
  file_type text not null,
  file_size int not null,
  storage_path text not null,
  is_favorite boolean default false,
  is_critical boolean default false,
  available_offline boolean default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_attachments_trip on attachments(trip_id);
create index idx_attachments_entity on attachments(entity_type, entity_id);
create index idx_attachments_user on attachments(user_id);

alter table attachments enable row level security;
create policy "attachments_all" on attachments for all using (user_id = auth.uid());

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00014_notifications.sql
-- ╚═══════════════════════════════════════════════════════════════════

-- Notifications
create table if not exists notifications (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  trip_id uuid references trips(id) on delete set null,
  type text not null,
  title text not null,
  body text not null,
  severity text default 'info' check (severity in ('info','warning','critical')),
  deep_link text,
  read boolean default false,
  created_at timestamptz default now()
);
create index idx_notifications_user on notifications(user_id);
create index idx_notifications_read on notifications(user_id, read);

-- Device subscriptions for push
create table if not exists device_subscriptions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz default now()
);
create index idx_device_subs_user on device_subscriptions(user_id);

-- Notification preferences
alter table profiles add column if not exists push_enabled boolean default true;
alter table profiles add column if not exists push_min_severity text default 'warning';
alter table profiles add column if not exists quiet_hours_start time;
alter table profiles add column if not exists quiet_hours_end time;

alter table notifications enable row level security;
alter table device_subscriptions enable row level security;
create policy "notifications_all" on notifications for all using (user_id = auth.uid());
create policy "device_subs_all" on device_subscriptions for all using (user_id = auth.uid());

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00015_trip_members.sql
-- ╚═══════════════════════════════════════════════════════════════════

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

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00016_email_inbox.sql
-- ╚═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — Email + WhatsApp inbox
--
-- Cuando un user reenvía un email de confirmación a `plans@tampu.app` o
-- forwardea un WhatsApp del host, los endpoints `email-inbound` y
-- `whatsapp-inbound` parsean el contenido y persisten el resultado en esta
-- tabla. El user luego ve la bandeja en /import y hace tap → commit a su
-- viaje activo.
--
-- PRIVACY: NUNCA guardamos el body original del email/mensaje. Solo el
-- shape estructurado (bookings detectadas + metadata mínima del sender).
-- Después de N días sin commit se purga automáticamente.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists email_inbox (
  id uuid default uuid_generate_v4() primary key,
  -- Identidad del recipient (a quién le llegó el email). Matchea
  -- auth.users.email cuando el user existe; si no, queda pending hasta que
  -- el user se registre con ese email.
  recipient_email text not null,
  -- Provider del payload: 'email-ses' | 'email-mailgun' | 'whatsapp-twilio' | 'whatsapp-meta'
  source text not null check (source in ('email-ses', 'email-mailgun', 'whatsapp-twilio', 'whatsapp-meta')),
  -- Quién mandó (mostrado al user en la bandeja)
  sender text,
  sender_name text,
  subject text,
  -- Hints del parser (mostrados como chips: "LATAM · 3 vuelos · español")
  carrier_hint text,
  languages text[],
  -- El payload parseado completo. Esto va al UI cuando el user abre la entrada
  -- y se transforma en `reservations` cuando confirma el commit. Shape =
  -- `ParseEmailResult` de `src/lib/parsing/email-parser.ts`.
  parsed_payload jsonb not null,
  bookings_count integer not null default 0,
  -- Estado del item en la bandeja
  status text not null default 'pending' check (status in ('pending', 'committed', 'dismissed')),
  -- Cuando el user confirma el commit, dejamos referencia al trip donde
  -- aterrizaron las reservas (para mostrar "Ya importado a Viaje Papua").
  committed_to_trip_id uuid references trips(id) on delete set null,
  committed_at timestamptz,
  created_at timestamptz default now()
);

create index idx_email_inbox_recipient on email_inbox(recipient_email);
create index idx_email_inbox_status on email_inbox(status) where status = 'pending';
create index idx_email_inbox_created on email_inbox(created_at);

alter table email_inbox enable row level security;

-- Cada user solo ve su propia bandeja (matched por email).
drop policy if exists email_inbox_select_own on email_inbox;
create policy email_inbox_select_own on email_inbox for select using (
  recipient_email = (select email from auth.users where id = auth.uid())
);

drop policy if exists email_inbox_update_own on email_inbox;
create policy email_inbox_update_own on email_inbox for update using (
  recipient_email = (select email from auth.users where id = auth.uid())
);

drop policy if exists email_inbox_delete_own on email_inbox;
create policy email_inbox_delete_own on email_inbox for delete using (
  recipient_email = (select email from auth.users where id = auth.uid())
);

-- INSERT lo hace el service-role-key desde los endpoints webhook (server-side
-- bypass RLS). No habilitamos política de insert para clients porque los
-- usuarios no deberían poder fabricar entradas en su propia bandeja.

-- Purga automática: items con > 30 días sin commit, se borran.
create or replace function tampu_purge_old_email_inbox() returns void as $$
  delete from email_inbox
   where status = 'pending'
     and created_at < now() - interval '30 days';
$$ language sql security definer;

-- ──────────────────────────────────────────────────────────────────────────
-- Profiles: agregar whatsapp_number (E.164) para resolver inbound WhatsApp
-- al user correcto.
-- ──────────────────────────────────────────────────────────────────────────

alter table profiles add column if not exists whatsapp_number text;
create index if not exists idx_profiles_whatsapp_number on profiles(whatsapp_number) where whatsapp_number is not null;

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00017_realtime_publication.sql
-- ╚═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — Habilitar Realtime para tablas del viaje
--
-- Para que `client.channel(...).on('postgres_changes', ...)` reciba eventos,
-- la tabla tiene que estar publicada en `supabase_realtime`. Esta migración
-- agrega las tablas que el frontend escucha via `useTripRealtime`.
--
-- Costo: cero adicional. Supabase Realtime usa el WAL ya existente.
-- Throughput: los eventos por trip son bajos (decenas/min), nada material.
-- ──────────────────────────────────────────────────────────────────────────

-- Crear la publicación si no existe (Supabase la crea por default, esto es defensivo)
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- Agregar tablas. Si ya están publicadas, ALTER PUBLICATION ... ADD TABLE
-- tira un error que ignoramos via DO/EXCEPTION.
do $$
begin
  alter publication supabase_realtime add table reservations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table expenses;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table tasks;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table cities;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table trip_days;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table budget_categories;
exception when duplicate_object then null;
end $$;

-- journal_likes y journal_comments (multi-user feed)
do $$
begin
  alter publication supabase_realtime add table journal_likes;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table journal_comments;
exception when duplicate_object then null;
end $$;

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00018_destination_photos.sql
-- ╚═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — Destination photo cache
--
-- Cache de resolutions de fotos por destino. Cada destination_slug se resuelve
-- a UNA foto principal en cascada de tiers (curated / wikipedia / unsplash / placeholder).
-- Una vez resuelto, cacheamos para siempre — las fotos icónicas de Wikipedia
-- son inmutables (mismo URL años después).
--
-- Refresh: TTL 30 días. Si refresh devuelve null o falla, mantenemos el cache existente
-- (degrade gracefully — mejor mostrar la foto vieja que un placeholder vacío).
--
-- Tabla pública: cualquier user de Tampu se beneficia del cache de otros users.
-- Las fotos son URLs públicas de Wikimedia/Unsplash; cachear no es PII.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists destination_photos (
  -- Slug normalizado del destino: "buenos aires" → "buenos-aires"
  -- "Papúa Nueva Guinea" → "papua-nueva-guinea"
  slug text not null,
  locale text not null default 'es' check (locale in ('es', 'en', 'pt')),

  -- Tier que ganó la cascada: 'curated' | 'wikipedia-es' | 'wikipedia-en' | 'unsplash' | 'placeholder'
  tier text not null,

  -- Foto principal del destino
  photo_url text,
  photo_width integer,
  photo_height integer,

  -- Atribución (obligatorio para Wikipedia CC, opcional Unsplash)
  attribution text,
  source_page_url text,

  -- Caption corto: "Avenida 9 de Julio, Buenos Aires" — útil para alt-text
  caption text,
  description text,

  fetched_at timestamptz default now(),
  -- Si el resolver falló (no encontró nada decente), guardamos un placeholder
  -- record para no re-intentar cada vez
  resolution_status text not null default 'ok' check (resolution_status in ('ok', 'not-found', 'placeholder')),

  primary key (slug, locale)
);

create index idx_destination_photos_status on destination_photos(resolution_status);
create index idx_destination_photos_fetched on destination_photos(fetched_at);

-- RLS: lectura pública (es un cache compartido de fotos públicas, sin PII).
-- Escritura solo desde server-side con service-role-key.
alter table destination_photos enable row level security;

drop policy if exists destination_photos_public_read on destination_photos;
create policy destination_photos_public_read on destination_photos for select using (true);

-- ──────────────────────────────────────────────────────────────────────────
-- Helper function: purgar entries antiguos para forzar refresh
-- ──────────────────────────────────────────────────────────────────────────

create or replace function tampu_purge_old_destination_photos() returns void as $$
  delete from destination_photos
   where fetched_at < now() - interval '90 days'
     and resolution_status = 'ok';
$$ language sql security definer;

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00019_print_book_orders.sql
-- ╚═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — Print book orders (modelo Polarsteps / Peecho)
--
-- Cada user puede pedir un libro físico de su viaje. La orden vive en
-- 'draft' hasta que confirma el pago, después pasa a 'submitted' (enviada
-- a Peecho), después 'printed', 'shipped', 'delivered'.
--
-- Snapshot inmutable del viaje al momento del request → el libro NO cambia
-- si el user después modifica el trip.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists print_book_orders (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,

  -- Configuración del libro
  binding text not null default 'hardcover' check (binding in ('softcover', 'hardcover', 'lay-flat-premium')),
  title text not null,
  cover_photo_id uuid,

  -- Estimaciones
  estimated_price_eur numeric(10,2) not null,
  estimated_pages integer not null,

  -- Pricing real una vez confirmado
  final_price_eur numeric(10,2),
  currency text default 'EUR',

  -- Estado del pedido
  status text not null default 'draft' check (status in (
    'draft',           -- creado, sin pagar
    'pending_payment', -- esperando confirmación de pago
    'paid',            -- pagado, generando PDF
    'submitted',       -- mandado a Peecho
    'printed',         -- impreso por Peecho
    'shipped',         -- enviado por courier
    'delivered',       -- entregado
    'cancelled',       -- cancelado
    'refunded'         -- refunded
  )),

  -- Peecho integration
  peecho_order_id text,
  pdf_url text,             -- URL del PDF generado (Supabase Storage)
  tracking_number text,
  shipping_address jsonb,

  -- Snapshot inmutable
  snapshot jsonb not null,

  created_at timestamptz default now(),
  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz default now()
);

create index idx_print_book_orders_user on print_book_orders(user_id);
create index idx_print_book_orders_trip on print_book_orders(trip_id);
create index idx_print_book_orders_status on print_book_orders(status);

-- RLS: cada user solo ve sus propias órdenes
alter table print_book_orders enable row level security;

drop policy if exists print_book_orders_own_select on print_book_orders;
create policy print_book_orders_own_select on print_book_orders for select using (auth.uid() = user_id);

drop policy if exists print_book_orders_own_modify on print_book_orders;
create policy print_book_orders_own_modify on print_book_orders for all using (auth.uid() = user_id);

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00020_curated_destinations.sql
-- ╚═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — Curated destinations (P2.12 infraestructura)
--
-- 50 destinos editoriales seed para Cono Sur (Argentina + Chile + Uruguay).
-- Cada destino tiene blurb editorial, mejores temporadas, spots top, nivel
-- premium suggested. Esto es el MOAT defendible 24 meses: contenido curado
-- que Wanderlog/Mindtrip/Layla NO tienen.
--
-- El user (founder) carga las primeras 5-10 manualmente con Claude como
-- copilot. Después: iterar contra real travelers.
--
-- RLS: read público (cualquiera ve el catálogo). Write: solo service-role.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists curated_destinations (
  slug text primary key,
  name text not null,
  country text not null check (country in ('AR', 'CL', 'UY', 'BR', 'PE', 'BO', 'CO', 'MX', 'EC')),
  region text,                          -- "Patagonia", "NOA", "Cuyo", "Cordillera", etc.
  category text not null check (category in ('city', 'wine', 'nature', 'beach', 'mountain', 'desert', 'cultural', 'adventure')),
  premium_level text not null check (premium_level in ('económico', 'medio', 'alto', 'premium')),

  -- Editorial content
  blurb text not null,                  -- 1-2 oraciones, el carácter del destino
  long_description text,                -- 2-4 párrafos editorial-quality
  best_season text[],                   -- ej ['Mar–May', 'Sep–Nov']
  duration_suggested text,              -- ej "3-5 días"
  vibe_tags text[],                     -- ej ['quieto', 'adulto', 'gastronómico', 'paisajístico']

  -- POIs principales (5-10)
  spots jsonb,                          -- [{name, type, blurb, lat, lng}]

  -- Logística práctica
  arrival_options text[],               -- ej ['vuelo BUE-MZA 1h45', 'bus 14h']
  typical_cost_usd_per_day numeric(10, 2),

  -- Affiliate partnerships específicos del destino
  partner_hotels text[],                -- slugs de hoteles que tenemos en partnership
  partner_activities text[],            -- slugs de GetYourGuide/Viator que ya curamos

  -- Editorial metadata
  last_visited_at date,                 -- cuándo fue el último visit del editor (Tampu founder)
  author_notes text,                    -- notas personales del founder
  photo_credit text,
  hero_photo_url text,                  -- override del Wikipedia resolver

  -- Stats
  view_count integer default 0,
  added_to_trips_count integer default 0,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_curated_destinations_country on curated_destinations(country);
create index idx_curated_destinations_category on curated_destinations(category);
create index idx_curated_destinations_premium on curated_destinations(premium_level);

-- RLS: read público, write solo service-role
alter table curated_destinations enable row level security;

drop policy if exists curated_destinations_public_read on curated_destinations;
create policy curated_destinations_public_read on curated_destinations for select using (true);

-- ──────────────────────────────────────────────────────────────────────────
-- Seed inicial: 5 destinos del Cono Sur que el founder (Matías) puede
-- expandir manualmente o vía script.
-- ──────────────────────────────────────────────────────────────────────────

insert into curated_destinations (slug, name, country, region, category, premium_level, blurb, best_season, duration_suggested, vibe_tags, spots, arrival_options, typical_cost_usd_per_day)
values
  (
    'buenos-aires',
    'Buenos Aires',
    'AR',
    'Río de la Plata',
    'city',
    'alto',
    'Capital argentina. Barrios distintos como universos: Palermo gastronómico, San Telmo histórico, Recoleta museos, Chacarita vino natural emergente.',
    ARRAY['Mar–Jun', 'Sep–Nov'],
    '4-6 días',
    ARRAY['urbano', 'adulto', 'gastronómico', 'noctámbulo', 'cultural'],
    '[
      {"name":"Don Julio","type":"food","blurb":"Parrilla emblema de Palermo, reservar 60 días antes","lat":-34.586,"lng":-58.435},
      {"name":"MALBA","type":"sight","blurb":"Museo de arte latinoamericano siglo XX","lat":-34.577,"lng":-58.404},
      {"name":"Recoleta Cemetery","type":"sight","blurb":"Cementerio de la elite porteña, gratuito","lat":-34.587,"lng":-58.394},
      {"name":"Mercado de San Telmo","type":"food","blurb":"Domingos: feria + asado","lat":-34.621,"lng":-58.372},
      {"name":"Plaza Dorrego","type":"neighborhood","blurb":"Tango callejero, milonga al aire libre","lat":-34.620,"lng":-58.371}
    ]'::jsonb,
    ARRAY['vuelo MAD-EZE 13h directo', 'vuelo MIA-EZE 9h', 'vuelo GRU-EZE 3h'],
    180.00
  ),
  (
    'mendoza',
    'Mendoza',
    'AR',
    'Cuyo',
    'wine',
    'premium',
    'Cuna del malbec. Tres valles: Luján de Cuyo (clásico), Maipú (cerca + tradicional), Valle de Uco (premium altura 1200m+).',
    ARRAY['Mar–May (vendimia)', 'Oct–Nov (flor)'],
    '4-7 días',
    ARRAY['adulto', 'gastronómico', 'paisajístico', 'lujo silencioso'],
    '[
      {"name":"Catena Zapata","type":"sight","blurb":"Bodega pirámide de Adrianna Catena, tour + tasting","lat":-33.108,"lng":-68.890},
      {"name":"The Vines Resort","type":"neighborhood","blurb":"Villas en Valle de Uco + Siete Fuegos restaurant","lat":-33.731,"lng":-69.166},
      {"name":"Bodega Salentein","type":"sight","blurb":"Bodega-museo en Tupungato","lat":-33.452,"lng":-69.207},
      {"name":"Cerro Aconcagua","type":"sight","blurb":"Vista del techo de América, día completo","lat":-32.653,"lng":-70.011},
      {"name":"Cavas Wine Lodge","type":"neighborhood","blurb":"Cabañas con viña propia, spa, sunset terrace","lat":-33.020,"lng":-68.881}
    ]'::jsonb,
    ARRAY['vuelo EZE-MDZ 1h45', 'bus EZE-MDZ 14h'],
    230.00
  ),
  (
    'bariloche',
    'San Carlos de Bariloche',
    'AR',
    'Patagonia Norte',
    'mountain',
    'medio',
    'Lagos andinos, bosques de coihue, chocolate suizo legacy. Verano = trekking; invierno = ski Catedral.',
    ARRAY['Dec–Mar (verano)', 'Jul–Sep (ski)'],
    '5-7 días',
    ARRAY['paisajístico', 'familiar', 'adventura', 'romántico'],
    '[
      {"name":"Cerro Catedral","type":"sight","blurb":"Ski + verano cabalgatas + vista 360","lat":-41.171,"lng":-71.510},
      {"name":"Llao Llao Hotel","type":"neighborhood","blurb":"Hotel icónico años 30, golf, spa, lago","lat":-41.057,"lng":-71.554},
      {"name":"Circuito Chico","type":"sight","blurb":"Drive 25km lagos + miradores","lat":-41.108,"lng":-71.495},
      {"name":"Colonia Suiza","type":"food","blurb":"Domingos curanto comunitario","lat":-41.087,"lng":-71.530},
      {"name":"Cerro Tronador","type":"sight","blurb":"Glaciar negro, 90km de Bariloche","lat":-41.157,"lng":-71.880}
    ]'::jsonb,
    ARRAY['vuelo EZE-BRC 2h15', 'bus EZE-BRC 22h'],
    160.00
  ),
  (
    'san-pedro-de-atacama',
    'San Pedro de Atacama',
    'CL',
    'Norte Grande',
    'desert',
    'premium',
    'Desierto más seco del mundo. Geysers, salares, lagunas altiplánicas, observatorio astronómico clase mundial.',
    ARRAY['Apr–Jun', 'Sep–Nov'],
    '4-6 días',
    ARRAY['premium', 'paisajístico', 'astronómico', 'adulto'],
    '[
      {"name":"Geysers del Tatio","type":"sight","blurb":"Salida 5am, 4320m altitud, vapor + amanecer","lat":-22.330,"lng":-68.012},
      {"name":"Valle de la Luna","type":"sight","blurb":"Sunset entre dunas + sal","lat":-22.953,"lng":-68.255},
      {"name":"Laguna Cejar","type":"sight","blurb":"Flotación tipo Mar Muerto en cordillera","lat":-23.020,"lng":-68.156},
      {"name":"Tierra Atacama","type":"neighborhood","blurb":"Lodge premium, todo-incluido, excursiones guiadas","lat":-22.913,"lng":-68.197},
      {"name":"Observatorio Alma","type":"sight","blurb":"Tour gratis sábados, requiere reserva 60 días","lat":-23.024,"lng":-67.755}
    ]'::jsonb,
    ARRAY['vuelo SCL-CJC 2h + 100km auto', 'vuelo SCL-Calama via LATAM'],
    320.00
  ),
  (
    'montevideo',
    'Montevideo',
    'UY',
    'Costa Sur',
    'city',
    'alto',
    'Capital uruguaya: mate, parrilla, rambla 22km, candombe. Más quieta que BA, igual de literaria.',
    ARRAY['Nov–Apr'],
    '3-4 días',
    ARRAY['adulto', 'gastronómico', 'tranquilo', 'cultural'],
    '[
      {"name":"Mercado del Puerto","type":"food","blurb":"Parrillas tradicionales, sábados llenos","lat":-34.906,"lng":-56.214},
      {"name":"Rambla Sur","type":"sight","blurb":"22km costanera, atardecer mate","lat":-34.917,"lng":-56.157},
      {"name":"Ciudad Vieja","type":"neighborhood","blurb":"Bohemia + arquitectura art déco","lat":-34.906,"lng":-56.205},
      {"name":"Teatro Solís","type":"sight","blurb":"Teatro 1856, tours guiados","lat":-34.906,"lng":-56.198},
      {"name":"Punta Carretas Shopping","type":"shopping","blurb":"Ex-prisión, ahora mall premium","lat":-34.926,"lng":-56.158}
    ]'::jsonb,
    ARRAY['vuelo EZE-MVD 50min', 'buquebus EZE-COL 1h + bus 2h'],
    160.00
  )
on conflict (slug) do nothing;

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00021_email_in_entries.sql
-- ╚═══════════════════════════════════════════════════════════════════

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

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00022_ai_proxy_usage.sql
-- ╚═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — AI proxy usage (audit log + circuit breaker)
--
-- Toda llamada que sale por /api/ai/* se escribe acá ANTES de devolver al
-- cliente. Es la fuente de verdad para:
--
--   1) Rate-limit por user/device (cuántos requests/tokens en X minutos)
--   2) Budget cap mensual por user (USD)
--   3) Circuit breaker global (si el costo del día > $X, cortamos todo)
--   4) Analytics: qué endpoint quema más, qué provider conviene
--
-- Append-only: nadie hace update/delete. Si necesitamos corregir un cost
-- mal calculado, abrimos un row nuevo con metadata->correction_of.
--
-- Anonymous users: user_id es nullable; el rate-limit anonymous se hace por
-- device_fingerprint (FingerprintJS o equivalente del cliente).
--
-- Privacy: NO guardamos prompts/respuestas. Solo metadata + counts + cost.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.ai_proxy_usage (
  id uuid primary key default gen_random_uuid(),

  -- Quién hizo la llamada. user_id es nullable porque permitimos anonymous
  -- (free tier capeado por fingerprint).
  user_id uuid references auth.users(id) on delete set null,
  device_fingerprint text not null,

  -- Qué llamó y a qué proveedor
  endpoint text not null,
  provider text not null,
  model text,

  -- Consumo
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_usd numeric(10,6) not null default 0,

  -- Resultado
  status text not null default 'ok',
  error_message text,

  -- Espacio para extras (request_id del provider, retries, etc.)
  metadata jsonb default '{}'::jsonb,

  created_at timestamptz not null default now(),

  -- Validaciones: nada de números negativos ni status/provider random
  constraint ai_proxy_usage_cost_nonneg check (cost_usd >= 0),
  constraint ai_proxy_usage_tokens_in_nonneg check (tokens_in >= 0),
  constraint ai_proxy_usage_tokens_out_nonneg check (tokens_out >= 0),
  constraint ai_proxy_usage_status_check check (status in ('ok', 'rate_limited', 'budget_exceeded', 'error')),
  constraint ai_proxy_usage_provider_check check (provider in ('anthropic', 'gemini', 'tampu'))
);

comment on table public.ai_proxy_usage is
  'Audit log append-only de cada llamada a /api/ai/*. Fuente de verdad para rate-limit, budget cap y circuit breaker global.';
comment on column public.ai_proxy_usage.user_id is
  'Nullable a propósito: anonymous users (sin login) también consumen el proxy y necesitan cuota.';
comment on column public.ai_proxy_usage.device_fingerprint is
  'Cuota anonymous se enforça por fingerprint, no por IP (NAT corporativo arruinaría a usuarios legítimos).';
comment on column public.ai_proxy_usage.cost_usd is
  '6 decimales porque una llamada con 100 tokens de Haiku puede valer 0.000025 USD; necesitamos precisión.';
comment on column public.ai_proxy_usage.status is
  'rate_limited y budget_exceeded se loguean igual que ok para tener visibilidad de cuánta gente está chocando contra los límites.';
comment on column public.ai_proxy_usage.metadata is
  'Espacio libre para request_id del provider, número de retries, modelo de fallback, etc.';

-- ──────────────────────────────────────────────────────────────────────────
-- Índices
--
-- Los índices con date_trunc requieren expresión IMMUTABLE. date_trunc('day',
-- timestamptz) es STABLE (depende de la TZ de sesión); el wrapper
-- `(created_at AT TIME ZONE 'UTC')::date` es IMMUTABLE porque convierte
-- timestamptz → timestamp en UTC (constante) y casta a date. Las queries
-- deben usar el MISMO expression para que el planner aproveche el índice.
-- ──────────────────────────────────────────────────────────────────────────

create index if not exists idx_aipu_user_day
  on public.ai_proxy_usage (user_id, ((created_at at time zone 'UTC')::date));

create index if not exists idx_aipu_fingerprint_day
  on public.ai_proxy_usage (device_fingerprint, ((created_at at time zone 'UTC')::date));

create index if not exists idx_aipu_endpoint_day
  on public.ai_proxy_usage (endpoint, ((created_at at time zone 'UTC')::date));

create index if not exists idx_aipu_created_at
  on public.ai_proxy_usage (created_at desc);

create index if not exists idx_aipu_global_day_cost
  on public.ai_proxy_usage (((created_at at time zone 'UTC')::date), cost_usd);

comment on index public.idx_aipu_user_day is
  'Para "cuántos tokens consumió el user X hoy/este mes". Hot path del rate-limit.';
comment on index public.idx_aipu_fingerprint_day is
  'Mismo caso que idx_aipu_user_day pero para anonymous (sin user_id).';
comment on index public.idx_aipu_global_day_cost is
  'Para el circuit breaker: sum(cost_usd) del día. Si pasa el cap global, devolvemos 503.';

-- ──────────────────────────────────────────────────────────────────────────
-- RLS
--
-- Read-only audit log desde el lado del cliente:
--   SELECT: el user ve solo sus filas. Anonymous (sin auth.uid()) no ve nada.
--   INSERT: solo service_role (el route handler del backend).
--   UPDATE / DELETE: nadie. Si necesitás corregir, insertás un row nuevo.
-- ──────────────────────────────────────────────────────────────────────────

alter table public.ai_proxy_usage enable row level security;

drop policy if exists ai_proxy_usage_select_own on public.ai_proxy_usage;
create policy ai_proxy_usage_select_own on public.ai_proxy_usage
  for select
  using (user_id is not null and user_id = auth.uid());

-- No definimos políticas de INSERT, UPDATE ni DELETE para roles autenticados
-- ni anon: con RLS habilitada y sin policy, la operación queda denegada.
-- El service_role bypassea RLS, así que el backend puede insertar normalmente.

-- ──────────────────────────────────────────────────────────────────────────
-- View: ai_proxy_daily_cost
--
-- Lectura agregada del día. La usa el circuit breaker para decidir si
-- corta el servicio global cuando el gasto del día se va al carajo.
-- ──────────────────────────────────────────────────────────────────────────

create or replace view public.ai_proxy_daily_cost as
select
  date_trunc('day', created_at) as day,
  sum(cost_usd) as total_cost_usd,
  count(*) as total_requests,
  count(distinct device_fingerprint) as unique_devices,
  count(distinct user_id) filter (where user_id is not null) as unique_users
from public.ai_proxy_usage
group by date_trunc('day', created_at)
order by day desc;

comment on view public.ai_proxy_daily_cost is
  'Agregado diario para circuit breaker y dashboards. Devuelve costo total, requests, devices y users únicos por día.';

grant select on public.ai_proxy_daily_cost to authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- Funciones helper (security definer)
--
-- Se usan desde el backend para resolver rápido "¿este user ya pasó su
-- budget mensual?" sin tener que escribir la query a mano en cada lugar.
--
-- security definer porque queremos que devuelvan agregados aun cuando
-- la RLS bloquearía las filas individuales (el backend chequea cuota
-- del user actual con su service_role, pero igual queremos un solo
-- punto de verdad).
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.get_user_monthly_tokens(p_user_id uuid)
returns table(tokens_in bigint, tokens_out bigint, cost_usd numeric, requests bigint)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(sum(tokens_in), 0)::bigint,
    coalesce(sum(tokens_out), 0)::bigint,
    coalesce(sum(cost_usd), 0)::numeric,
    count(*)::bigint
  from public.ai_proxy_usage
  where user_id = p_user_id
    and created_at >= date_trunc('month', now());
$$;

comment on function public.get_user_monthly_tokens(uuid) is
  'Suma del mes en curso para un user. La usa el budget cap antes de aceptar una nueva llamada.';

create or replace function public.get_anonymous_monthly_tokens(p_fingerprint text)
returns table(tokens_in bigint, tokens_out bigint, cost_usd numeric, requests bigint)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(sum(tokens_in), 0)::bigint,
    coalesce(sum(tokens_out), 0)::bigint,
    coalesce(sum(cost_usd), 0)::numeric,
    count(*)::bigint
  from public.ai_proxy_usage
  where device_fingerprint = p_fingerprint
    and user_id is null
    and created_at >= date_trunc('month', now());
$$;

comment on function public.get_anonymous_monthly_tokens(text) is
  'Mismo agregado mensual pero para anonymous (matchea por fingerprint y exige user_id null para no mezclar con consumo logueado).';

-- Las funciones son security definer: el owner debe ser un rol con SELECT
-- sobre la tabla. En Supabase eso es el postgres role por default, así que
-- no hace falta tocar nada. Limitamos quién puede ejecutarlas:
revoke all on function public.get_user_monthly_tokens(uuid) from public;
revoke all on function public.get_anonymous_monthly_tokens(text) from public;
grant execute on function public.get_user_monthly_tokens(uuid) to authenticated, service_role;
grant execute on function public.get_anonymous_monthly_tokens(text) to service_role;

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00023_tampu_plus_lifetime.sql
-- ╚═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- Tampu+ Lifetime — registro de compras one-time (USD 29 lifetime upgrade)
--
-- Modelo de negocio: Tampu es free + affiliate honesto. Lifetime es el
-- "founder-supported" tier: USD 29 una sola vez (NO renovación, NO subscription)
-- que desbloquea:
--   - Proxy IA gestionado (200 calls/mes sin BYOK)
--   - Badge "Supporter" cosmético
--   - Themes custom
--   - Priority support (email matiasfaustomoron@gmail.com prefijo [Tampu+])
--   - Future marketplace credits (USD 5)
--
-- Cada row es una purchase. Idempotencia por `stripe_session_id` (unique).
-- El user puede estar NO logueado al momento de la compra → guardamos email
-- siempre y user_id sólo si está disponible. Al loguearse después podemos
-- backfill el user_id matcheando por email.
--
-- Status:
--   - 'active'    → comprado, válido
--   - 'refunded'  → Stripe procesó refund, el user ya no es Tampu+
--   - 'disputed'  → chargeback en curso, suspendido hasta resolución
--
-- RLS:
--   SELECT: el user ve sus filas (match por user_id O por email del JWT)
--   INSERT / UPDATE: solo service_role (webhook server-side)
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.tampu_plus_lifetime (
  id uuid primary key default gen_random_uuid(),

  -- Identidad del comprador. user_id puede estar null si compró sin login;
  -- email SIEMPRE está (Stripe Checkout lo exige). Backfill posterior posible.
  user_id uuid references auth.users(id) on delete set null,
  email text not null,

  -- Refs Stripe (todas únicas por compra)
  stripe_session_id text unique not null,
  stripe_customer_id text,
  stripe_payment_intent_id text,

  -- Monto efectivamente cobrado. En USD para no perdernos en conversiones —
  -- si el user pagó en ARS/BRL, Stripe nos confirma el USD equivalente.
  amount_usd numeric(10,2) not null,
  currency text not null default 'USD',

  -- Estado de la compra. Default 'active'; el webhook puede flipear a
  -- 'refunded' o 'disputed' si Stripe nos avisa.
  status text not null default 'active',

  purchased_at timestamptz not null default now(),

  -- Espacio para extras (raw event Stripe, notas internas, etc.)
  metadata jsonb default '{}'::jsonb,

  constraint tampu_plus_lifetime_status_check
    check (status in ('active', 'refunded', 'disputed')),
  constraint tampu_plus_lifetime_amount_nonneg
    check (amount_usd >= 0)
);

comment on table public.tampu_plus_lifetime is
  'Registro append-style de compras Tampu+ lifetime (USD 29 one-time). Una row = una purchase. Idempotencia por stripe_session_id.';
comment on column public.tampu_plus_lifetime.user_id is
  'Nullable: la compra puede iniciar sin login. Backfill al loguearse matcheando por email.';
comment on column public.tampu_plus_lifetime.email is
  'Siempre presente (Stripe Checkout lo exige). Source of truth para resolver Tampu+ si el user_id está null.';
comment on column public.tampu_plus_lifetime.amount_usd is
  'Monto en USD. Si el user pagó en moneda local, Stripe nos confirma el USD equivalente — guardamos eso.';
comment on column public.tampu_plus_lifetime.status is
  'active/refunded/disputed. Solo el webhook con service_role puede cambiar.';

-- ──────────────────────────────────────────────────────────────────────────
-- Índices
-- ──────────────────────────────────────────────────────────────────────────

create index if not exists idx_tplife_email
  on public.tampu_plus_lifetime(email);

create index if not exists idx_tplife_user
  on public.tampu_plus_lifetime(user_id)
  where user_id is not null;

create index if not exists idx_tplife_status
  on public.tampu_plus_lifetime(status);

comment on index public.idx_tplife_email is
  'Hot path: is_tampu_plus() chequea por email del JWT cuando no hay user_id.';
comment on index public.idx_tplife_user is
  'Hot path: is_tampu_plus() chequea por user_id cuando hay sesión.';

-- ──────────────────────────────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────────────────────────────

alter table public.tampu_plus_lifetime enable row level security;

drop policy if exists tampu_plus_lifetime_select_own on public.tampu_plus_lifetime;
create policy tampu_plus_lifetime_select_own on public.tampu_plus_lifetime
  for select
  using (
    (user_id is not null and user_id = auth.uid())
    or (email is not null and email = (auth.jwt() ->> 'email'))
  );

-- INSERT / UPDATE / DELETE: sin policy → denied para roles autenticados y
-- anon. Solo service_role (que bypassea RLS) puede escribir desde el webhook.

-- ──────────────────────────────────────────────────────────────────────────
-- Helper: is_tampu_plus(user_id) → boolean
--
-- Devuelve true si existe al menos una row 'active' que matchee por user_id
-- O por email del JWT. Security definer para que el chequeo funcione aunque
-- la RLS bloquearía la lectura directa (caso: user nuevo que aún no se
-- backfilleó el user_id en la row de su compra anonymous).
--
-- Uso desde cliente:
--   const { data } = await supabase.rpc('is_tampu_plus', { p_user_id: user.id });
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.is_tampu_plus(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.tampu_plus_lifetime
    where status = 'active'
      and (
        (p_user_id is not null and user_id = p_user_id)
        or (auth.jwt() ->> 'email' is not null and email = (auth.jwt() ->> 'email'))
      )
  );
$$;

comment on function public.is_tampu_plus(uuid) is
  'Devuelve true si el user tiene al menos una compra Tampu+ activa (matchea por user_id O por email del JWT). Security definer para cubrir el caso de compras anonymous backfilled más tarde.';

revoke all on function public.is_tampu_plus(uuid) from public;
grant execute on function public.is_tampu_plus(uuid) to authenticated, service_role, anon;

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00024_whatsapp_links.sql
-- ╚═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — WhatsApp links (vinculación de número del user con su cuenta)
--
-- Diferenciador estratégico confirmado por research: ninguno de los 5
-- competidores LatAm (TripIt, Wanderlog, Tripsy, Polarsteps, AwardWallet)
-- tiene WhatsApp ingestion. La mitad de las confirmaciones de viaje en LatAm
-- llegan por WhatsApp (host de Airbnb local, agencia boutique, transfer,
-- tours). Por eso vinculamos el número de WhatsApp del user a su cuenta
-- Tampu y le permitimos reenviar cualquier mensaje a un número Tampu.
--
-- Flow:
--   1. User en /settings hace click "Vincular WhatsApp" + ingresa su número
--   2. Backend genera un código numérico de 6 dígitos, lo persiste acá
--      junto al `verification_expires_at` (now() + 10 min) y dispara un
--      mensaje WhatsApp al user con instrucciones.
--   3. User responde el código por WhatsApp. El webhook
--      `/api/webhooks/whatsapp` busca el link pending y setea
--      `verified_at = now()`.
--   4. UI hace polling cada 3s a `/api/whatsapp/status` hasta detectar el
--      cambio.
--
-- MVP: 1 phone por user (unique user_id) y 1 user por phone (unique
-- phone_e164). En la iteración siguiente vemos si vale la pena multi-phone.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.whatsapp_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Phone en formato canónico E.164, ej '+5491140404040'. Lo normalizamos
  -- antes de insertar (helper formatPhoneForWhatsApp en src/lib/whatsapp/twilio.ts).
  phone_e164 text not null,
  -- Null hasta que el user manda el código por WhatsApp y el webhook lo
  -- valida. Mientras esté null, el número NO se considera vinculado y
  -- ningún mensaje entrante se asocia al user.
  verified_at timestamptz,
  -- Código numérico de 6 dígitos generado server-side. Se limpia (null)
  -- cuando se verifica con éxito. Se mantiene si falla para que el user
  -- pueda reintentar dentro de la ventana de 10 min.
  verification_code text,
  verification_expires_at timestamptz,
  -- Anti brute-force: si llegamos a 5 intentos fallidos, el row se borra
  -- y el user tiene que arrancar de cero.
  failed_attempts integer not null default 0,
  created_at timestamptz not null default now(),

  -- 1 phone por user en MVP
  unique(user_id),
  -- 1 user por phone (no compartido). Si otro user intenta vincular el
  -- mismo número, debe primero desvincularse el dueño actual.
  unique(phone_e164),

  constraint whatsapp_links_phone_e164_format
    check (phone_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  constraint whatsapp_links_failed_attempts_nonneg
    check (failed_attempts >= 0)
);

comment on table public.whatsapp_links is
  'Vinculación de un número WhatsApp con una cuenta Tampu. MVP: 1 phone por user, 1 user por phone.';
comment on column public.whatsapp_links.phone_e164 is
  'Formato E.164 canónico (ej +5491140404040). Normalizado server-side antes del insert.';
comment on column public.whatsapp_links.verified_at is
  'Null hasta que el user manda el código por WhatsApp. Solo links con verified_at != null reciben ingestion.';
comment on column public.whatsapp_links.verification_code is
  '6 dígitos numéricos. Generado por el endpoint start-verification y limpiado al confirmar. Vence en 10 min.';

-- ──────────────────────────────────────────────────────────────────────────
-- Índices
-- ──────────────────────────────────────────────────────────────────────────

-- Hot path: el webhook hace lookup por phone para identificar al user.
-- Filtrado por verified_at no nulo para que solo entren los links válidos.
create index if not exists idx_whatsapp_links_phone
  on public.whatsapp_links(phone_e164)
  where verified_at is not null;

-- Para buscar verificaciones pending cuando el user responde con el código.
create index if not exists idx_whatsapp_links_pending
  on public.whatsapp_links(phone_e164, verification_expires_at)
  where verified_at is null and verification_code is not null;

-- ──────────────────────────────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────────────────────────────

alter table public.whatsapp_links enable row level security;

drop policy if exists whatsapp_links_select_own on public.whatsapp_links;
create policy whatsapp_links_select_own on public.whatsapp_links
  for select
  using (user_id = auth.uid());

drop policy if exists whatsapp_links_insert_own on public.whatsapp_links;
create policy whatsapp_links_insert_own on public.whatsapp_links
  for insert
  with check (user_id = auth.uid());

drop policy if exists whatsapp_links_update_own on public.whatsapp_links;
create policy whatsapp_links_update_own on public.whatsapp_links
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists whatsapp_links_delete_own on public.whatsapp_links;
create policy whatsapp_links_delete_own on public.whatsapp_links
  for delete
  using (user_id = auth.uid());

-- service_role bypassa RLS — el webhook lo usa para flippear verified_at.

-- ──────────────────────────────────────────────────────────────────────────
-- Helper: find_user_by_phone(p_phone text) -> uuid
--
-- security definer para que el webhook (que corre con service_role pero
-- igual queremos centralizar la query) y futuros endpoints puedan resolver
-- "phone -> user" sin lidiar con RLS. Devuelve el user_id sólo si el link
-- está verificado.
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.find_user_by_phone(p_phone text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select user_id
  from public.whatsapp_links
  where phone_e164 = p_phone
    and verified_at is not null
  limit 1;
$$;

comment on function public.find_user_by_phone(text) is
  'Devuelve el user_id Tampu asociado a un número WhatsApp verificado, o null. Usado por el webhook para identificar al sender.';

revoke all on function public.find_user_by_phone(text) from public;
grant execute on function public.find_user_by_phone(text) to service_role, authenticated;

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00025_whatsapp_messages.sql
-- ╚═══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — WhatsApp messages (audit log + parsed payload)
--
-- Cada mensaje recibido del webhook Twilio queda persistido acá:
--   - audit trail completo (qué se recibió, qué se parseó, cuánto costó)
--   - idempotencia por twilio_message_sid (Twilio reintenta 5 veces si no
--     respondemos 200 dentro de 15s)
--   - input para la UI /whatsapp (inbox de WhatsApp del user)
--
-- Privacy: el body se guarda en texto plano para que el user pueda revisarlo
-- en /whatsapp si el parseo falla. Si el user borra su vinculación, los
-- mensajes asociados quedan (porque `user_id` queda intacto vía FK), pero
-- el user los puede borrar manualmente desde la UI (futuro). RLS solo le
-- permite leer los propios.
--
-- Status workflow:
--   received → parsed (éxito del LLM)
--           → failed (LLM rate-limit / error)
--           → ignored (mensaje con media en MVP, o user sin vinculación)
--           → verification (mensaje que era un código de verificación, no
--                          se parsea con LLM ni se cobra al budget)
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Idempotencia: Twilio garantiza que MessageSid es único globalmente.
  -- Si recibimos el mismo SID dos veces (reintento), tomamos el primero.
  twilio_message_sid text unique not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  phone_e164 text not null,
  -- Texto del mensaje. Puede ser null si fue solo media.
  body text,
  -- Para tracking de iteración futura (MVP solo procesa texto).
  media_count integer not null default 0,
  media_types text[],
  status text not null default 'received',
  -- Si el parser asoció el mensaje a un viaje, queda acá. Nullable para
  -- mensajes que no se pudieron asociar (sin viaje activo, parseo failed).
  trip_id uuid references public.trips(id) on delete set null,
  -- Output crudo del LLM. Shape definido en src/lib/whatsapp/parser.ts:
  -- { type, confidence, data, reasoning? }
  parsed_json jsonb,
  parser_provider text,
  parser_model text,
  cost_usd numeric(10,6),
  error_message text,
  metadata jsonb default '{}'::jsonb,
  received_at timestamptz not null default now(),
  parsed_at timestamptz,

  constraint whatsapp_messages_status_check
    check (status in ('received', 'parsed', 'failed', 'ignored', 'verification', 'outbound')),
  constraint whatsapp_messages_media_count_nonneg
    check (media_count >= 0),
  constraint whatsapp_messages_cost_nonneg
    check (cost_usd is null or cost_usd >= 0)
);

comment on table public.whatsapp_messages is
  'Audit log de mensajes WhatsApp (entrada y salida) + payload parseado por el LLM. Idempotencia por twilio_message_sid.';
comment on column public.whatsapp_messages.body is
  'Texto crudo del mensaje. Guardamos en plano para que el user pueda revisar en /whatsapp si el parseo falla.';
comment on column public.whatsapp_messages.status is
  'received (recién entró), parsed (LLM ok), failed (LLM error), ignored (media en MVP / sin link), verification (era un código), outbound (mensaje saliente).';
comment on column public.whatsapp_messages.parsed_json is
  'Output del LLM parser. Shape: { type, confidence, data, reasoning? }. Ver src/lib/whatsapp/parser.ts.';

-- ──────────────────────────────────────────────────────────────────────────
-- Índices
-- ──────────────────────────────────────────────────────────────────────────

-- Hot path para la UI /whatsapp (lista por user, más recientes primero).
create index if not exists idx_whatsapp_msg_user_received
  on public.whatsapp_messages(user_id, received_at desc);

-- Para mostrar todos los mensajes asociados a un viaje en /trips/[id].
create index if not exists idx_whatsapp_msg_trip
  on public.whatsapp_messages(trip_id)
  where trip_id is not null;

-- Filtro por status (chips "Parseados / Pendientes / Ignorados").
create index if not exists idx_whatsapp_msg_status
  on public.whatsapp_messages(user_id, status, received_at desc);

-- ──────────────────────────────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────────────────────────────

alter table public.whatsapp_messages enable row level security;

drop policy if exists whatsapp_messages_select_own on public.whatsapp_messages;
create policy whatsapp_messages_select_own on public.whatsapp_messages
  for select
  using (user_id = auth.uid());

-- INSERT / UPDATE / DELETE: sin policy. Solo service_role escribe (desde
-- el webhook). El user puede borrar via endpoint dedicado si lo agregamos
-- en una iteración futura.

-- ╔═══════════════════════════════════════════════════════════════════
-- ║ 00026_whatsapp_auto_insert.sql
-- ╚═══════════════════════════════════════════════════════════════════

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
