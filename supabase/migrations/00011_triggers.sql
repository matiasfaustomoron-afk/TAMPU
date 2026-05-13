create or replace function update_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger tr_profiles_updated before update on profiles for each row execute function update_updated_at();
create trigger tr_trips_updated before update on trips for each row execute function update_updated_at();
create trigger tr_tasks_updated before update on tasks for each row execute function update_updated_at();
create trigger tr_reservations_updated before update on reservations for each row execute function update_updated_at();
create trigger tr_documents_updated before update on documents for each row execute function update_updated_at();
