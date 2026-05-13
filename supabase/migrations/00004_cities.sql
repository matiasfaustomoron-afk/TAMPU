create table if not exists cities (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  name text not null, country text not null,
  arrival_date date, departure_date date, nights int default 0, order_index int default 0, notes text
);
create index idx_cities_trip on cities(trip_id);
