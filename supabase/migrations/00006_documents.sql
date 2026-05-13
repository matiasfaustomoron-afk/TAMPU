create table if not exists documents (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references trips(id) on delete cascade not null,
  type text not null, name text not null,
  criticality text default 'important' check (criticality in ('nice_to_have','important','essential','blocker')),
  expiry_date date, status text default 'pending' check (status in ('pending','ready','expired','not_applicable')),
  has_digital_copy boolean default false, has_offline_copy boolean default false, is_validated boolean default false,
  action_required text, notes text, attachment_url text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index idx_documents_trip on documents(trip_id);
