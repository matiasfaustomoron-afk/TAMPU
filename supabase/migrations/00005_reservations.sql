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
