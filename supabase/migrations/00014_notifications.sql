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
