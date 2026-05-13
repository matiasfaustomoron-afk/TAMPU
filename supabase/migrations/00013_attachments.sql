-- Attachments / Document Vault
create table if not exists attachments (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  entity_type text not null check (entity_type in ('trip','reservation','document','expense','task','packing_item','other')),
  entity_id uuid,
  category text default 'other' check (category in ('insurance','boarding_pass','identity','reservation','transport','health','receipt','other')),
  file_name text not null,
  file_type text not null,
  file_size int not null,
  storage_path text not null,
  is_favorite boolean default false,
  is_critical boolean default false,
  available_offline boolean default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_attachments_trip on attachments(trip_id);
create index idx_attachments_entity on attachments(entity_type, entity_id);
create index idx_attachments_user on attachments(user_id);

alter table attachments enable row level security;
create policy "attachments_all" on attachments for all using (user_id = auth.uid());
