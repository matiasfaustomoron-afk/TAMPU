-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — Defensa en profundidad: default auth.uid() para user_id
--
-- BUG en prod (mayo 2026): el cliente insertaba en `trips` sin pasar user_id,
-- esperando que la RLS lo rechazara con un error claro. PERO el constraint
-- NOT NULL de la columna dispara primero y arroja un error genérico
-- ("null value in column user_id..."). El frontend, sin catch, fallaba
-- silenciosamente → el viaje "desaparecía" desde la perspectiva del user.
--
-- FIX en código (commit aparte): insertTrip ahora obtiene auth.uid() y lo
-- pasa explícitamente. Pero esto deja vulnerables OTROS call sites futuros.
--
-- DEFENSA EN PROFUNDIDAD: setear `default auth.uid()` en las columnas
-- `user_id` de TODAS las tablas que tienen RLS user-scoped. Postgres llama
-- a auth.uid() automáticamente en cada INSERT que no incluya user_id,
-- garantizando que NUNCA se inserte un NULL. La RLS sigue validando
-- (with check user_id = auth.uid()), así que un attacker no puede insertar
-- con user_id falso.
--
-- Tablas afectadas (todas las que tienen `user_id uuid references auth.users`
-- o references profiles.id donde profiles.id viene de auth.users):
--   - trips
--   - attachments
--   - notifications
--   - device_subscriptions
--   - print_book_orders
--   - whatsapp_links
--   - whatsapp_messages
--   - email_in_entries
--
-- NOT modificadas:
--   - ai_proxy_usage.user_id (nullable a propósito — anonymous logging)
--   - tampu_plus_lifetime.user_id (nullable — pre-signup checkout)
--   - email_inbox (no tiene user_id, usa recipient_email)
--   - trip_members (user_id viene de invitación, no de auth.uid())
-- ──────────────────────────────────────────────────────────────────────────

alter table public.trips
  alter column user_id set default auth.uid();

alter table public.attachments
  alter column user_id set default auth.uid();

alter table public.notifications
  alter column user_id set default auth.uid();

alter table public.device_subscriptions
  alter column user_id set default auth.uid();

alter table public.print_book_orders
  alter column user_id set default auth.uid();

alter table public.whatsapp_links
  alter column user_id set default auth.uid();

alter table public.whatsapp_messages
  alter column user_id set default auth.uid();

alter table public.email_in_entries
  alter column user_id set default auth.uid();

comment on column public.trips.user_id is
  'Auto-set a auth.uid() en INSERT si no se pasa explícitamente. La RLS sigue validando que user_id = auth.uid() en with check.';
