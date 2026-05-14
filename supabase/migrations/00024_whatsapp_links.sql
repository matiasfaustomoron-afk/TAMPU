-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — WhatsApp links (vinculación de número del user con su cuenta)
--
-- Diferenciador estratégico confirmado por research: ninguno de los 5
-- competidores LatAm (TripIt, Wanderlog, Tripsy, Polarsteps, AwardWallet)
-- tiene WhatsApp ingestion. La mitad de las confirmaciones de viaje en LatAm
-- llegan por WhatsApp (host de Airbnb local, agencia boutique, transfer,
-- tours). Por eso vinculamos el número de WhatsApp del user a su cuenta
-- Tampu y le permitimos reenviar cualquier mensaje a un número Tampu.
--
-- Flow:
--   1. User en /settings hace click "Vincular WhatsApp" + ingresa su número
--   2. Backend genera un código numérico de 6 dígitos, lo persiste acá
--      junto al `verification_expires_at` (now() + 10 min) y dispara un
--      mensaje WhatsApp al user con instrucciones.
--   3. User responde el código por WhatsApp. El webhook
--      `/api/webhooks/whatsapp` busca el link pending y setea
--      `verified_at = now()`.
--   4. UI hace polling cada 3s a `/api/whatsapp/status` hasta detectar el
--      cambio.
--
-- MVP: 1 phone por user (unique user_id) y 1 user por phone (unique
-- phone_e164). En la iteración siguiente vemos si vale la pena multi-phone.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.whatsapp_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Phone en formato canónico E.164, ej '+5491140404040'. Lo normalizamos
  -- antes de insertar (helper formatPhoneForWhatsApp en src/lib/whatsapp/twilio.ts).
  phone_e164 text not null,
  -- Null hasta que el user manda el código por WhatsApp y el webhook lo
  -- valida. Mientras esté null, el número NO se considera vinculado y
  -- ningún mensaje entrante se asocia al user.
  verified_at timestamptz,
  -- Código numérico de 6 dígitos generado server-side. Se limpia (null)
  -- cuando se verifica con éxito. Se mantiene si falla para que el user
  -- pueda reintentar dentro de la ventana de 10 min.
  verification_code text,
  verification_expires_at timestamptz,
  -- Anti brute-force: si llegamos a 5 intentos fallidos, el row se borra
  -- y el user tiene que arrancar de cero.
  failed_attempts integer not null default 0,
  created_at timestamptz not null default now(),

  -- 1 phone por user en MVP
  unique(user_id),
  -- 1 user por phone (no compartido). Si otro user intenta vincular el
  -- mismo número, debe primero desvincularse el dueño actual.
  unique(phone_e164),

  constraint whatsapp_links_phone_e164_format
    check (phone_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  constraint whatsapp_links_failed_attempts_nonneg
    check (failed_attempts >= 0)
);

comment on table public.whatsapp_links is
  'Vinculación de un número WhatsApp con una cuenta Tampu. MVP: 1 phone por user, 1 user por phone.';
comment on column public.whatsapp_links.phone_e164 is
  'Formato E.164 canónico (ej +5491140404040). Normalizado server-side antes del insert.';
comment on column public.whatsapp_links.verified_at is
  'Null hasta que el user manda el código por WhatsApp. Solo links con verified_at != null reciben ingestion.';
comment on column public.whatsapp_links.verification_code is
  '6 dígitos numéricos. Generado por el endpoint start-verification y limpiado al confirmar. Vence en 10 min.';

-- ──────────────────────────────────────────────────────────────────────────
-- Índices
-- ──────────────────────────────────────────────────────────────────────────

-- Hot path: el webhook hace lookup por phone para identificar al user.
-- Filtrado por verified_at no nulo para que solo entren los links válidos.
create index if not exists idx_whatsapp_links_phone
  on public.whatsapp_links(phone_e164)
  where verified_at is not null;

-- Para buscar verificaciones pending cuando el user responde con el código.
create index if not exists idx_whatsapp_links_pending
  on public.whatsapp_links(phone_e164, verification_expires_at)
  where verified_at is null and verification_code is not null;

-- ──────────────────────────────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────────────────────────────

alter table public.whatsapp_links enable row level security;

drop policy if exists whatsapp_links_select_own on public.whatsapp_links;
create policy whatsapp_links_select_own on public.whatsapp_links
  for select
  using (user_id = auth.uid());

drop policy if exists whatsapp_links_insert_own on public.whatsapp_links;
create policy whatsapp_links_insert_own on public.whatsapp_links
  for insert
  with check (user_id = auth.uid());

drop policy if exists whatsapp_links_update_own on public.whatsapp_links;
create policy whatsapp_links_update_own on public.whatsapp_links
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists whatsapp_links_delete_own on public.whatsapp_links;
create policy whatsapp_links_delete_own on public.whatsapp_links
  for delete
  using (user_id = auth.uid());

-- service_role bypassa RLS — el webhook lo usa para flippear verified_at.

-- ──────────────────────────────────────────────────────────────────────────
-- Helper: find_user_by_phone(p_phone text) -> uuid
--
-- security definer para que el webhook (que corre con service_role pero
-- igual queremos centralizar la query) y futuros endpoints puedan resolver
-- "phone -> user" sin lidiar con RLS. Devuelve el user_id sólo si el link
-- está verificado.
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.find_user_by_phone(p_phone text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select user_id
  from public.whatsapp_links
  where phone_e164 = p_phone
    and verified_at is not null
  limit 1;
$$;

comment on function public.find_user_by_phone(text) is
  'Devuelve el user_id Tampu asociado a un número WhatsApp verificado, o null. Usado por el webhook para identificar al sender.';

revoke all on function public.find_user_by_phone(text) from public;
grant execute on function public.find_user_by_phone(text) to service_role, authenticated;
