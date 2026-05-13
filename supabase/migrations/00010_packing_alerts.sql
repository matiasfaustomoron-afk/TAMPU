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
