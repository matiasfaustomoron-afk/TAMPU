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
