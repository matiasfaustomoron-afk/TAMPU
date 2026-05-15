-- ─── 00036_alert_dismissals.sql ──────────────────────────────────────────
-- Iter 4 (dominio funcionalidad): persistencia de "marcar como visto" para
-- alertas derivadas (useDynamicAlerts).
--
-- Las alertas no viven en una tabla — se computan en cliente a partir de
-- trips/tasks/reservations/docs/etc. Por eso "dismiss" se persiste con una
-- signature stable (severity + tipo + target_id) en lugar de un alert_id.
-- En el render, filtramos alertas cuya signature esté en esta tabla.

create table if not exists public.alert_dismissals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  alert_signature text not null,
  dismissed_at timestamptz default now(),
  unique(user_id, trip_id, alert_signature)
);

create index if not exists idx_alert_dismissals_user_trip on public.alert_dismissals(user_id, trip_id);

alter table public.alert_dismissals enable row level security;

create policy "alert_dismissals_own" on public.alert_dismissals
  for all
  using (user_id = auth.uid());
