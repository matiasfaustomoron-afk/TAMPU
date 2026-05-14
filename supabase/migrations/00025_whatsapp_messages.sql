-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — WhatsApp messages (audit log + parsed payload)
--
-- Cada mensaje recibido del webhook Twilio queda persistido acá:
--   - audit trail completo (qué se recibió, qué se parseó, cuánto costó)
--   - idempotencia por twilio_message_sid (Twilio reintenta 5 veces si no
--     respondemos 200 dentro de 15s)
--   - input para la UI /whatsapp (inbox de WhatsApp del user)
--
-- Privacy: el body se guarda en texto plano para que el user pueda revisarlo
-- en /whatsapp si el parseo falla. Si el user borra su vinculación, los
-- mensajes asociados quedan (porque `user_id` queda intacto vía FK), pero
-- el user los puede borrar manualmente desde la UI (futuro). RLS solo le
-- permite leer los propios.
--
-- Status workflow:
--   received → parsed (éxito del LLM)
--           → failed (LLM rate-limit / error)
--           → ignored (mensaje con media en MVP, o user sin vinculación)
--           → verification (mensaje que era un código de verificación, no
--                          se parsea con LLM ni se cobra al budget)
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Idempotencia: Twilio garantiza que MessageSid es único globalmente.
  -- Si recibimos el mismo SID dos veces (reintento), tomamos el primero.
  twilio_message_sid text unique not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  phone_e164 text not null,
  -- Texto del mensaje. Puede ser null si fue solo media.
  body text,
  -- Para tracking de iteración futura (MVP solo procesa texto).
  media_count integer not null default 0,
  media_types text[],
  status text not null default 'received',
  -- Si el parser asoció el mensaje a un viaje, queda acá. Nullable para
  -- mensajes que no se pudieron asociar (sin viaje activo, parseo failed).
  trip_id uuid references public.trips(id) on delete set null,
  -- Output crudo del LLM. Shape definido en src/lib/whatsapp/parser.ts:
  -- { type, confidence, data, reasoning? }
  parsed_json jsonb,
  parser_provider text,
  parser_model text,
  cost_usd numeric(10,6),
  error_message text,
  metadata jsonb default '{}'::jsonb,
  received_at timestamptz not null default now(),
  parsed_at timestamptz,

  constraint whatsapp_messages_status_check
    check (status in ('received', 'parsed', 'failed', 'ignored', 'verification', 'outbound')),
  constraint whatsapp_messages_media_count_nonneg
    check (media_count >= 0),
  constraint whatsapp_messages_cost_nonneg
    check (cost_usd is null or cost_usd >= 0)
);

comment on table public.whatsapp_messages is
  'Audit log de mensajes WhatsApp (entrada y salida) + payload parseado por el LLM. Idempotencia por twilio_message_sid.';
comment on column public.whatsapp_messages.body is
  'Texto crudo del mensaje. Guardamos en plano para que el user pueda revisar en /whatsapp si el parseo falla.';
comment on column public.whatsapp_messages.status is
  'received (recién entró), parsed (LLM ok), failed (LLM error), ignored (media en MVP / sin link), verification (era un código), outbound (mensaje saliente).';
comment on column public.whatsapp_messages.parsed_json is
  'Output del LLM parser. Shape: { type, confidence, data, reasoning? }. Ver src/lib/whatsapp/parser.ts.';

-- ──────────────────────────────────────────────────────────────────────────
-- Índices
-- ──────────────────────────────────────────────────────────────────────────

-- Hot path para la UI /whatsapp (lista por user, más recientes primero).
create index if not exists idx_whatsapp_msg_user_received
  on public.whatsapp_messages(user_id, received_at desc);

-- Para mostrar todos los mensajes asociados a un viaje en /trips/[id].
create index if not exists idx_whatsapp_msg_trip
  on public.whatsapp_messages(trip_id)
  where trip_id is not null;

-- Filtro por status (chips "Parseados / Pendientes / Ignorados").
create index if not exists idx_whatsapp_msg_status
  on public.whatsapp_messages(user_id, status, received_at desc);

-- ──────────────────────────────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────────────────────────────

alter table public.whatsapp_messages enable row level security;

drop policy if exists whatsapp_messages_select_own on public.whatsapp_messages;
create policy whatsapp_messages_select_own on public.whatsapp_messages
  for select
  using (user_id = auth.uid());

-- INSERT / UPDATE / DELETE: sin policy. Solo service_role escribe (desde
-- el webhook). El user puede borrar via endpoint dedicado si lo agregamos
-- en una iteración futura.
