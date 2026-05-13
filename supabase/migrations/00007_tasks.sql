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
