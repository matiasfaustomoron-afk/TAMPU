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
