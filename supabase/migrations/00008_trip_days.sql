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
