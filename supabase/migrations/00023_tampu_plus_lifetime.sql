-- ──────────────────────────────────────────────────────────────────────────
-- Tampu+ Lifetime — registro de compras one-time (USD 29 lifetime upgrade)
--
-- Modelo de negocio: Tampu es free + affiliate honesto. Lifetime es el
-- "founder-supported" tier: USD 29 una sola vez (NO renovación, NO subscription)
-- que desbloquea:
--   - Proxy IA gestionado (200 calls/mes sin BYOK)
--   - Badge "Supporter" cosmético
--   - Themes custom
--   - Priority support (email matiasfaustomoron@gmail.com prefijo [Tampu+])
--   - Future marketplace credits (USD 5)
--
-- Cada row es una purchase. Idempotencia por `stripe_session_id` (unique).
-- El user puede estar NO logueado al momento de la compra → guardamos email
-- siempre y user_id sólo si está disponible. Al loguearse después podemos
-- backfill el user_id matcheando por email.
--
-- Status:
--   - 'active'    → comprado, válido
--   - 'refunded'  → Stripe procesó refund, el user ya no es Tampu+
--   - 'disputed'  → chargeback en curso, suspendido hasta resolución
--
-- RLS:
--   SELECT: el user ve sus filas (match por user_id O por email del JWT)
--   INSERT / UPDATE: solo service_role (webhook server-side)
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.tampu_plus_lifetime (
  id uuid primary key default gen_random_uuid(),

  -- Identidad del comprador. user_id puede estar null si compró sin login;
  -- email SIEMPRE está (Stripe Checkout lo exige). Backfill posterior posible.
  user_id uuid references auth.users(id) on delete set null,
  email text not null,

  -- Refs Stripe (todas únicas por compra)
  stripe_session_id text unique not null,
  stripe_customer_id text,
  stripe_payment_intent_id text,

  -- Monto efectivamente cobrado. En USD para no perdernos en conversiones —
  -- si el user pagó en ARS/BRL, Stripe nos confirma el USD equivalente.
  amount_usd numeric(10,2) not null,
  currency text not null default 'USD',

  -- Estado de la compra. Default 'active'; el webhook puede flipear a
  -- 'refunded' o 'disputed' si Stripe nos avisa.
  status text not null default 'active',

  purchased_at timestamptz not null default now(),

  -- Espacio para extras (raw event Stripe, notas internas, etc.)
  metadata jsonb default '{}'::jsonb,

  constraint tampu_plus_lifetime_status_check
    check (status in ('active', 'refunded', 'disputed')),
  constraint tampu_plus_lifetime_amount_nonneg
    check (amount_usd >= 0)
);

comment on table public.tampu_plus_lifetime is
  'Registro append-style de compras Tampu+ lifetime (USD 29 one-time). Una row = una purchase. Idempotencia por stripe_session_id.';
comment on column public.tampu_plus_lifetime.user_id is
  'Nullable: la compra puede iniciar sin login. Backfill al loguearse matcheando por email.';
comment on column public.tampu_plus_lifetime.email is
  'Siempre presente (Stripe Checkout lo exige). Source of truth para resolver Tampu+ si el user_id está null.';
comment on column public.tampu_plus_lifetime.amount_usd is
  'Monto en USD. Si el user pagó en moneda local, Stripe nos confirma el USD equivalente — guardamos eso.';
comment on column public.tampu_plus_lifetime.status is
  'active/refunded/disputed. Solo el webhook con service_role puede cambiar.';

-- ──────────────────────────────────────────────────────────────────────────
-- Índices
-- ──────────────────────────────────────────────────────────────────────────

create index if not exists idx_tplife_email
  on public.tampu_plus_lifetime(email);

create index if not exists idx_tplife_user
  on public.tampu_plus_lifetime(user_id)
  where user_id is not null;

create index if not exists idx_tplife_status
  on public.tampu_plus_lifetime(status);

comment on index public.idx_tplife_email is
  'Hot path: is_tampu_plus() chequea por email del JWT cuando no hay user_id.';
comment on index public.idx_tplife_user is
  'Hot path: is_tampu_plus() chequea por user_id cuando hay sesión.';

-- ──────────────────────────────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────────────────────────────

alter table public.tampu_plus_lifetime enable row level security;

drop policy if exists tampu_plus_lifetime_select_own on public.tampu_plus_lifetime;
create policy tampu_plus_lifetime_select_own on public.tampu_plus_lifetime
  for select
  using (
    (user_id is not null and user_id = auth.uid())
    or (email is not null and email = (auth.jwt() ->> 'email'))
  );

-- INSERT / UPDATE / DELETE: sin policy → denied para roles autenticados y
-- anon. Solo service_role (que bypassea RLS) puede escribir desde el webhook.

-- ──────────────────────────────────────────────────────────────────────────
-- Helper: is_tampu_plus(user_id) → boolean
--
-- Devuelve true si existe al menos una row 'active' que matchee por user_id
-- O por email del JWT. Security definer para que el chequeo funcione aunque
-- la RLS bloquearía la lectura directa (caso: user nuevo que aún no se
-- backfilleó el user_id en la row de su compra anonymous).
--
-- Uso desde cliente:
--   const { data } = await supabase.rpc('is_tampu_plus', { p_user_id: user.id });
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.is_tampu_plus(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.tampu_plus_lifetime
    where status = 'active'
      and (
        (p_user_id is not null and user_id = p_user_id)
        or (auth.jwt() ->> 'email' is not null and email = (auth.jwt() ->> 'email'))
      )
  );
$$;

comment on function public.is_tampu_plus(uuid) is
  'Devuelve true si el user tiene al menos una compra Tampu+ activa (matchea por user_id O por email del JWT). Security definer para cubrir el caso de compras anonymous backfilled más tarde.';

revoke all on function public.is_tampu_plus(uuid) from public;
grant execute on function public.is_tampu_plus(uuid) to authenticated, service_role, anon;
