-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — AI proxy usage (audit log + circuit breaker)
--
-- Toda llamada que sale por /api/ai/* se escribe acá ANTES de devolver al
-- cliente. Es la fuente de verdad para:
--
--   1) Rate-limit por user/device (cuántos requests/tokens en X minutos)
--   2) Budget cap mensual por user (USD)
--   3) Circuit breaker global (si el costo del día > $X, cortamos todo)
--   4) Analytics: qué endpoint quema más, qué provider conviene
--
-- Append-only: nadie hace update/delete. Si necesitamos corregir un cost
-- mal calculado, abrimos un row nuevo con metadata->correction_of.
--
-- Anonymous users: user_id es nullable; el rate-limit anonymous se hace por
-- device_fingerprint (FingerprintJS o equivalente del cliente).
--
-- Privacy: NO guardamos prompts/respuestas. Solo metadata + counts + cost.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.ai_proxy_usage (
  id uuid primary key default gen_random_uuid(),

  -- Quién hizo la llamada. user_id es nullable porque permitimos anonymous
  -- (free tier capeado por fingerprint).
  user_id uuid references auth.users(id) on delete set null,
  device_fingerprint text not null,

  -- Qué llamó y a qué proveedor
  endpoint text not null,
  provider text not null,
  model text,

  -- Consumo
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_usd numeric(10,6) not null default 0,

  -- Resultado
  status text not null default 'ok',
  error_message text,

  -- Espacio para extras (request_id del provider, retries, etc.)
  metadata jsonb default '{}'::jsonb,

  created_at timestamptz not null default now(),

  -- Validaciones: nada de números negativos ni status/provider random
  constraint ai_proxy_usage_cost_nonneg check (cost_usd >= 0),
  constraint ai_proxy_usage_tokens_in_nonneg check (tokens_in >= 0),
  constraint ai_proxy_usage_tokens_out_nonneg check (tokens_out >= 0),
  constraint ai_proxy_usage_status_check check (status in ('ok', 'rate_limited', 'budget_exceeded', 'error')),
  constraint ai_proxy_usage_provider_check check (provider in ('anthropic', 'gemini', 'tampu'))
);

comment on table public.ai_proxy_usage is
  'Audit log append-only de cada llamada a /api/ai/*. Fuente de verdad para rate-limit, budget cap y circuit breaker global.';
comment on column public.ai_proxy_usage.user_id is
  'Nullable a propósito: anonymous users (sin login) también consumen el proxy y necesitan cuota.';
comment on column public.ai_proxy_usage.device_fingerprint is
  'Cuota anonymous se enforça por fingerprint, no por IP (NAT corporativo arruinaría a usuarios legítimos).';
comment on column public.ai_proxy_usage.cost_usd is
  '6 decimales porque una llamada con 100 tokens de Haiku puede valer 0.000025 USD; necesitamos precisión.';
comment on column public.ai_proxy_usage.status is
  'rate_limited y budget_exceeded se loguean igual que ok para tener visibilidad de cuánta gente está chocando contra los límites.';
comment on column public.ai_proxy_usage.metadata is
  'Espacio libre para request_id del provider, número de retries, modelo de fallback, etc.';

-- ──────────────────────────────────────────────────────────────────────────
-- Índices
--
-- Los índices con date_trunc requieren expresión IMMUTABLE. date_trunc('day',
-- timestamptz) es STABLE (depende de la TZ de sesión); el wrapper
-- `(created_at AT TIME ZONE 'UTC')::date` es IMMUTABLE porque convierte
-- timestamptz → timestamp en UTC (constante) y casta a date. Las queries
-- deben usar el MISMO expression para que el planner aproveche el índice.
-- ──────────────────────────────────────────────────────────────────────────

create index if not exists idx_aipu_user_day
  on public.ai_proxy_usage (user_id, ((created_at at time zone 'UTC')::date));

create index if not exists idx_aipu_fingerprint_day
  on public.ai_proxy_usage (device_fingerprint, ((created_at at time zone 'UTC')::date));

create index if not exists idx_aipu_endpoint_day
  on public.ai_proxy_usage (endpoint, ((created_at at time zone 'UTC')::date));

create index if not exists idx_aipu_created_at
  on public.ai_proxy_usage (created_at desc);

create index if not exists idx_aipu_global_day_cost
  on public.ai_proxy_usage (((created_at at time zone 'UTC')::date), cost_usd);

comment on index public.idx_aipu_user_day is
  'Para "cuántos tokens consumió el user X hoy/este mes". Hot path del rate-limit.';
comment on index public.idx_aipu_fingerprint_day is
  'Mismo caso que idx_aipu_user_day pero para anonymous (sin user_id).';
comment on index public.idx_aipu_global_day_cost is
  'Para el circuit breaker: sum(cost_usd) del día. Si pasa el cap global, devolvemos 503.';

-- ──────────────────────────────────────────────────────────────────────────
-- RLS
--
-- Read-only audit log desde el lado del cliente:
--   SELECT: el user ve solo sus filas. Anonymous (sin auth.uid()) no ve nada.
--   INSERT: solo service_role (el route handler del backend).
--   UPDATE / DELETE: nadie. Si necesitás corregir, insertás un row nuevo.
-- ──────────────────────────────────────────────────────────────────────────

alter table public.ai_proxy_usage enable row level security;

drop policy if exists ai_proxy_usage_select_own on public.ai_proxy_usage;
create policy ai_proxy_usage_select_own on public.ai_proxy_usage
  for select
  using (user_id is not null and user_id = auth.uid());

-- No definimos políticas de INSERT, UPDATE ni DELETE para roles autenticados
-- ni anon: con RLS habilitada y sin policy, la operación queda denegada.
-- El service_role bypassea RLS, así que el backend puede insertar normalmente.

-- ──────────────────────────────────────────────────────────────────────────
-- View: ai_proxy_daily_cost
--
-- Lectura agregada del día. La usa el circuit breaker para decidir si
-- corta el servicio global cuando el gasto del día se va al carajo.
-- ──────────────────────────────────────────────────────────────────────────

create or replace view public.ai_proxy_daily_cost as
select
  date_trunc('day', created_at) as day,
  sum(cost_usd) as total_cost_usd,
  count(*) as total_requests,
  count(distinct device_fingerprint) as unique_devices,
  count(distinct user_id) filter (where user_id is not null) as unique_users
from public.ai_proxy_usage
group by date_trunc('day', created_at)
order by day desc;

comment on view public.ai_proxy_daily_cost is
  'Agregado diario para circuit breaker y dashboards. Devuelve costo total, requests, devices y users únicos por día.';

grant select on public.ai_proxy_daily_cost to authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- Funciones helper (security definer)
--
-- Se usan desde el backend para resolver rápido "¿este user ya pasó su
-- budget mensual?" sin tener que escribir la query a mano en cada lugar.
--
-- security definer porque queremos que devuelvan agregados aun cuando
-- la RLS bloquearía las filas individuales (el backend chequea cuota
-- del user actual con su service_role, pero igual queremos un solo
-- punto de verdad).
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.get_user_monthly_tokens(p_user_id uuid)
returns table(tokens_in bigint, tokens_out bigint, cost_usd numeric, requests bigint)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(sum(tokens_in), 0)::bigint,
    coalesce(sum(tokens_out), 0)::bigint,
    coalesce(sum(cost_usd), 0)::numeric,
    count(*)::bigint
  from public.ai_proxy_usage
  where user_id = p_user_id
    and created_at >= date_trunc('month', now());
$$;

comment on function public.get_user_monthly_tokens(uuid) is
  'Suma del mes en curso para un user. La usa el budget cap antes de aceptar una nueva llamada.';

create or replace function public.get_anonymous_monthly_tokens(p_fingerprint text)
returns table(tokens_in bigint, tokens_out bigint, cost_usd numeric, requests bigint)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(sum(tokens_in), 0)::bigint,
    coalesce(sum(tokens_out), 0)::bigint,
    coalesce(sum(cost_usd), 0)::numeric,
    count(*)::bigint
  from public.ai_proxy_usage
  where device_fingerprint = p_fingerprint
    and user_id is null
    and created_at >= date_trunc('month', now());
$$;

comment on function public.get_anonymous_monthly_tokens(text) is
  'Mismo agregado mensual pero para anonymous (matchea por fingerprint y exige user_id null para no mezclar con consumo logueado).';

-- Las funciones son security definer: el owner debe ser un rol con SELECT
-- sobre la tabla. En Supabase eso es el postgres role por default, así que
-- no hace falta tocar nada. Limitamos quién puede ejecutarlas:
revoke all on function public.get_user_monthly_tokens(uuid) from public;
revoke all on function public.get_anonymous_monthly_tokens(text) from public;
grant execute on function public.get_user_monthly_tokens(uuid) to authenticated, service_role;
grant execute on function public.get_anonymous_monthly_tokens(text) to service_role;
