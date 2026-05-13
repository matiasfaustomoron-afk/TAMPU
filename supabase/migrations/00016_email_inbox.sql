-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — Email + WhatsApp inbox
--
-- Cuando un user reenvía un email de confirmación a `plans@tampu.app` o
-- forwardea un WhatsApp del host, los endpoints `email-inbound` y
-- `whatsapp-inbound` parsean el contenido y persisten el resultado en esta
-- tabla. El user luego ve la bandeja en /import y hace tap → commit a su
-- viaje activo.
--
-- PRIVACY: NUNCA guardamos el body original del email/mensaje. Solo el
-- shape estructurado (bookings detectadas + metadata mínima del sender).
-- Después de N días sin commit se purga automáticamente.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists email_inbox (
  id uuid default uuid_generate_v4() primary key,
  -- Identidad del recipient (a quién le llegó el email). Matchea
  -- auth.users.email cuando el user existe; si no, queda pending hasta que
  -- el user se registre con ese email.
  recipient_email text not null,
  -- Provider del payload: 'email-ses' | 'email-mailgun' | 'whatsapp-twilio' | 'whatsapp-meta'
  source text not null check (source in ('email-ses', 'email-mailgun', 'whatsapp-twilio', 'whatsapp-meta')),
  -- Quién mandó (mostrado al user en la bandeja)
  sender text,
  sender_name text,
  subject text,
  -- Hints del parser (mostrados como chips: "LATAM · 3 vuelos · español")
  carrier_hint text,
  languages text[],
  -- El payload parseado completo. Esto va al UI cuando el user abre la entrada
  -- y se transforma en `reservations` cuando confirma el commit. Shape =
  -- `ParseEmailResult` de `src/lib/parsing/email-parser.ts`.
  parsed_payload jsonb not null,
  bookings_count integer not null default 0,
  -- Estado del item en la bandeja
  status text not null default 'pending' check (status in ('pending', 'committed', 'dismissed')),
  -- Cuando el user confirma el commit, dejamos referencia al trip donde
  -- aterrizaron las reservas (para mostrar "Ya importado a Viaje Papua").
  committed_to_trip_id uuid references trips(id) on delete set null,
  committed_at timestamptz,
  created_at timestamptz default now()
);

create index idx_email_inbox_recipient on email_inbox(recipient_email);
create index idx_email_inbox_status on email_inbox(status) where status = 'pending';
create index idx_email_inbox_created on email_inbox(created_at);

alter table email_inbox enable row level security;

-- Cada user solo ve su propia bandeja (matched por email).
drop policy if exists email_inbox_select_own on email_inbox;
create policy email_inbox_select_own on email_inbox for select using (
  recipient_email = (select email from auth.users where id = auth.uid())
);

drop policy if exists email_inbox_update_own on email_inbox;
create policy email_inbox_update_own on email_inbox for update using (
  recipient_email = (select email from auth.users where id = auth.uid())
);

drop policy if exists email_inbox_delete_own on email_inbox;
create policy email_inbox_delete_own on email_inbox for delete using (
  recipient_email = (select email from auth.users where id = auth.uid())
);

-- INSERT lo hace el service-role-key desde los endpoints webhook (server-side
-- bypass RLS). No habilitamos política de insert para clients porque los
-- usuarios no deberían poder fabricar entradas en su propia bandeja.

-- Purga automática: items con > 30 días sin commit, se borran.
create or replace function tampu_purge_old_email_inbox() returns void as $$
  delete from email_inbox
   where status = 'pending'
     and created_at < now() - interval '30 days';
$$ language sql security definer;

-- ──────────────────────────────────────────────────────────────────────────
-- Profiles: agregar whatsapp_number (E.164) para resolver inbound WhatsApp
-- al user correcto.
-- ──────────────────────────────────────────────────────────────────────────

alter table profiles add column if not exists whatsapp_number text;
create index if not exists idx_profiles_whatsapp_number on profiles(whatsapp_number) where whatsapp_number is not null;
