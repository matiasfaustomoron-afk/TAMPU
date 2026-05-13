-- ═══════════════════════════════════════════
-- TRAVEL OS — DATABASE SCHEMA v2
-- ═══════════════════════════════════════════
-- Run in Supabase SQL Editor. Tables ordered to avoid forward references.

create extension if not exists "uuid-ossp";

-- ─── 1. PROFILES ───
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

-- ─── 2. TRIPS ───
create table if not exists trips (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  description text,
  destination text not null,
  status text default 'planning' check (status in ('planning','active','completed','archived')),
  start_date date not null,
  end_date date not null,
  base_currency text default 'USD',
  total_budget numeric(12,2) default 0,
  contingency_percent numeric(5,2) default 10,
  contingency_amount numeric(12,2) default 0,
  alert_days_warning int default 7,
  alert_days_critical int default 3,
  budget_warning_threshold int default 80,
  budget_danger_threshold int default 95,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_trips_user on trips(user_id);
create index idx_trips_active on trips(user_id, is_active);

-- ─── 3. CITIES ───
create table if not exists cities (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  name text not null,
  country text not null,
  arrival_date date,
  departure_date date,
  nights int default 0,
  order_index int default 0,
  notes text
);
create index idx_cities_trip on cities(trip_id);

-- ─── 4. RESERVATIONS (before tasks, since tasks reference it) ───
create table if not exists reservations (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  type text not null check (type in ('flight','accommodation','train','bus','tour','insurance','connectivity','other')),
  criticality text default 'important' check (criticality in ('nice_to_have','important','essential','blocker')),
  provider text not null,
  city_id uuid references cities(id) on delete set null,
  city_name text,
  description text not null,
  purchase_date date,
  use_date date,
  use_end_date date,
  payment_deadline date,
  original_amount numeric(12,2) default 0,
  original_currency text default 'USD',
  exchange_rate numeric(10,4) default 1,
  base_amount numeric(12,2) default 0,
  status text default 'pending' check (status in ('pending','booked','confirmed','paid','cancelled','expired')),
  confirmation_received boolean default false,
  locator text,
  link text,
  contact text,
  cancellation_policy text,
  is_cancellable boolean default true,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_reservations_trip on reservations(trip_id);
create index idx_reservations_type on reservations(trip_id, type);
create index idx_reservations_status on reservations(trip_id, status);

-- ─── 5. DOCUMENTS ───
create table if not exists documents (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  type text not null,
  name text not null,
  criticality text default 'important' check (criticality in ('nice_to_have','important','essential','blocker')),
  expiry_date date,
  status text default 'pending' check (status in ('pending','ready','expired','not_applicable')),
  has_digital_copy boolean default false,
  has_offline_copy boolean default false,
  is_validated boolean default false,
  action_required text,
  notes text,
  attachment_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_documents_trip on documents(trip_id);

-- ─── 6. TASKS (now safe to reference reservations and documents) ───
create table if not exists tasks (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  title text not null,
  description text,
  stage text,
  category text not null,
  subcategory text,
  priority text default 'medium' check (priority in ('low','medium','high','critical')),
  criticality text default 'important' check (criticality in ('nice_to_have','important','essential','blocker')),
  responsible text,
  created_at timestamptz default now(),
  start_date date,
  due_date date,
  status text default 'pending' check (status in ('pending','in_progress','waiting','done','cancelled')),
  progress int default 0 check (progress >= 0 and progress <= 100),
  is_blocker boolean default false,
  dependency_id uuid references tasks(id) on delete set null,
  next_action text,
  requires_payment boolean default false,
  estimated_amount numeric(10,2),
  actual_amount numeric(10,2),
  reservation_id uuid references reservations(id) on delete set null,
  document_id uuid references documents(id) on delete set null,
  city_id uuid references cities(id) on delete set null,
  city_name text,
  notes text,
  updated_at timestamptz default now()
);
create index idx_tasks_trip on tasks(trip_id);
create index idx_tasks_status on tasks(trip_id, status);
create index idx_tasks_priority on tasks(trip_id, priority);
create index idx_tasks_due on tasks(trip_id, due_date);

-- ─── 7. TRIP DAYS ───
create table if not exists trip_days (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  date date not null,
  day_number int not null,
  city_id uuid references cities(id) on delete set null,
  city_name text,
  zone text,
  accommodation text,
  accommodation_reservation_id uuid references reservations(id) on delete set null,
  check_in boolean default false,
  check_out boolean default false,
  main_activity text,
  secondary_activity text,
  main_transport text,
  estimated_cost numeric(10,2) default 0,
  actual_cost numeric(10,2) default 0,
  notes text,
  status text default 'empty' check (status in ('empty','partial','planned','confirmed'))
);
create index idx_trip_days_trip on trip_days(trip_id);
create unique index idx_trip_days_date on trip_days(trip_id, date);

-- ─── 8. BUDGET CATEGORIES ───
create table if not exists budget_categories (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  category text not null,
  label text not null,
  budgeted_amount numeric(12,2) default 0,
  order_index int default 0
);
create index idx_budget_cat_trip on budget_categories(trip_id);

-- ─── 9. EXPENSES ───
create table if not exists expenses (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  date date not null,
  city_id uuid references cities(id) on delete set null,
  city_name text,
  category text not null,
  subcategory text,
  description text not null,
  payment_method text,
  original_currency text default 'USD',
  original_amount numeric(12,2) not null,
  exchange_rate numeric(10,4) default 1,
  base_amount numeric(12,2) not null,
  is_fixed boolean default false,
  is_budgeted boolean default true,
  reservation_id uuid references reservations(id) on delete set null,
  attachment_url text,
  notes text,
  created_at timestamptz default now()
);
create index idx_expenses_trip on expenses(trip_id);
create index idx_expenses_date on expenses(trip_id, date);
create index idx_expenses_category on expenses(trip_id, category);

-- ─── 10. PACKING ITEMS ───
create table if not exists packing_items (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  category text not null,
  subcategory text,
  item text not null,
  quantity_target int default 1,
  quantity_current int default 0,
  is_essential boolean default false,
  is_purchased boolean default true,
  needs_purchase boolean default false,
  assigned_bag text,
  priority text default 'medium' check (priority in ('low','medium','high','critical')),
  status text default 'pending' check (status in ('pending','packed','not_needed')),
  deadline date,
  notes text
);
create index idx_packing_trip on packing_items(trip_id);

-- ─── 11. ALERTS ───
create table if not exists alerts (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  type text not null,
  severity text default 'warning' check (severity in ('info','warning','critical')),
  module text not null,
  origin_id uuid,
  title text not null,
  description text not null,
  detected_at timestamptz default now(),
  target_date date,
  status text default 'active' check (status in ('active','acknowledged','resolved','dismissed')),
  suggested_action text,
  deep_link text,
  created_at timestamptz default now()
);
create index idx_alerts_trip on alerts(trip_id);
create index idx_alerts_status on alerts(trip_id, status);

-- ═══════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════

create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger tr_profiles_updated before update on profiles for each row execute function update_updated_at();
create trigger tr_trips_updated before update on trips for each row execute function update_updated_at();
create trigger tr_tasks_updated before update on tasks for each row execute function update_updated_at();
create trigger tr_reservations_updated before update on reservations for each row execute function update_updated_at();
create trigger tr_documents_updated before update on documents for each row execute function update_updated_at();

-- ═══════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════

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

-- Profiles
create policy "profiles_select" on profiles for select using (auth.uid() = id);
create policy "profiles_update" on profiles for update using (auth.uid() = id);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);

-- Trips
create policy "trips_select" on trips for select using (user_id = auth.uid());
create policy "trips_insert" on trips for insert with check (user_id = auth.uid());
create policy "trips_update" on trips for update using (user_id = auth.uid());
create policy "trips_delete" on trips for delete using (user_id = auth.uid());

-- Helper
create or replace function user_owns_trip(trip_uuid uuid)
returns boolean as $$
  select exists(select 1 from trips where id = trip_uuid and user_id = auth.uid());
$$ language sql security definer;

-- Child tables
create policy "cities_all" on cities for all using (user_owns_trip(trip_id));
create policy "trip_days_all" on trip_days for all using (user_owns_trip(trip_id));
create policy "tasks_all" on tasks for all using (user_owns_trip(trip_id));
create policy "reservations_all" on reservations for all using (user_owns_trip(trip_id));
create policy "budget_categories_all" on budget_categories for all using (user_owns_trip(trip_id));
create policy "expenses_all" on expenses for all using (user_owns_trip(trip_id));
create policy "documents_all" on documents for all using (user_owns_trip(trip_id));
create policy "packing_items_all" on packing_items for all using (user_owns_trip(trip_id));
create policy "alerts_all" on alerts for all using (user_owns_trip(trip_id));

-- ═══════════════════════════════════════════
-- AUTO-CREATE PROFILE ON SIGNUP
-- ═══════════════════════════════════════════

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
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
