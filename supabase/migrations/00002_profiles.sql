create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  timezone text default 'America/Argentina/Buenos_Aires',
  preferred_currency text default 'USD',
  date_format text default 'MM/dd/yyyy',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create or replace function handle_new_user() returns trigger as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
