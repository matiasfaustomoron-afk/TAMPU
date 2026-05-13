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
