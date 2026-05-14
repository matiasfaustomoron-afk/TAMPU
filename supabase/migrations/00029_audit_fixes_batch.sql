-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — Audit MAX-DEPTH batch (5 agents paralelos identificaron estos bugs)
--
-- 1. email_in_entries.provider CHECK rechaza 'email-direct' que el código usa
-- 2. trip_members RLS: invitee no puede VER ni ACEPTAR su pending invitation
-- 3. budget_categories: upsert con onConflict requiere UNIQUE que NO existe
-- 4. Funciones security definer sin set search_path (hardening best practice)
--
-- Aplicado tras audit profundo. Migration adicional 00030+ vendría si tester
-- feedback identifica más issues.
-- ──────────────────────────────────────────────────────────────────────────

-- ─── FIX 1: email_in_entries.provider acepta 'email-direct' ────────────────
-- El código en /api/email-in/route.ts inserta provider='email-direct' pero el
-- CHECK constraint solo permite 'email-ses' o 'email-mailgun' → insert falla.
-- Expandimos el set para incluir el provider real usado.
alter table public.email_in_entries
  drop constraint if exists email_in_entries_provider_check;
alter table public.email_in_entries
  add constraint email_in_entries_provider_check
  check (provider in ('email-ses', 'email-mailgun', 'email-direct'));

-- ─── FIX 2: trip_members — invitee puede VER su pending invitation ─────────
-- BUG actual: SELECT policy requiere user_id = auth.uid() Y status='active'.
-- Pero las invitaciones pending tienen user_id=NULL y status='pending'.
-- Match es por invited_email. Resultado: invitee nunca ve su invite → flow
-- multi-user roto desde día 1.
drop policy if exists trip_members_pending_self_select on public.trip_members;
create policy trip_members_pending_self_select on public.trip_members
  for select
  using (
    invited_email = (auth.jwt() ->> 'email')
    and status = 'pending'
  );

-- ─── FIX 3: trip_members — invitee puede ACEPTAR su invitation ─────────────
-- BUG complementario: UPDATE policy solo permite a owners modificar. El
-- invitee no puede flipear su propia row de pending→active.
-- Esta policy permite UPDATE pero solo si: matchea el email del invitee Y
-- está en pending. with check garantiza que solo puede setear user_id =
-- auth.uid() y status = 'active' (no puede escalar a owner por ej).
drop policy if exists trip_members_pending_self_accept on public.trip_members;
create policy trip_members_pending_self_accept on public.trip_members
  for update
  using (
    invited_email = (auth.jwt() ->> 'email')
    and status = 'pending'
  )
  with check (
    user_id = auth.uid()
    and status = 'active'
  );

-- ─── FIX 4: budget_categories — UNIQUE para upsert ─────────────────────────
-- src/lib/data/entities.ts:upsertBudgetCategory usa onConflict: "trip_id,category"
-- pero la tabla NO tiene esa UNIQUE → Supabase devuelve 42P10 y falla.
create unique index if not exists uq_budget_categories_trip_cat
  on public.budget_categories(trip_id, category);

-- ─── FIX 5: Security definer functions sin set search_path ─────────────────
-- Best practice de Supabase: las funciones security definer deben fijar
-- search_path explícitamente para evitar schema injection si un schema
-- malicioso se anteponer al public en la búsqueda.
-- Aplicamos a TODAS las funciones security definer del proyecto que no lo tienen.
alter function public.user_owns_trip(uuid)            set search_path = public;
alter function public.tampu_user_in_trip(uuid)        set search_path = public;
alter function public.tampu_user_can_edit_trip(uuid)  set search_path = public;
alter function public.tampu_add_owner_membership()    set search_path = public;
alter function public.tampu_purge_old_email_inbox()        set search_path = public;
alter function public.tampu_purge_old_destination_photos() set search_path = public;
alter function public.tampu_purge_old_email_in_entries()   set search_path = public;

-- Las nuevas funciones de 00022, 00023, 00024, 00026, 00027 ya tienen set
-- search_path desde su creación. NO las re-alteramos.

-- ─── FIX 6: cities — CHECK arrival_date <= departure_date ──────────────────
-- Defensa contra UI bug: el wizard de cities puede grabar fechas inválidas
-- (departure antes que arrival) si el user las invierte. Mejor falla en DB
-- con mensaje claro que silent corrupt data.
alter table public.cities
  drop constraint if exists cities_dates_order;
alter table public.cities
  add constraint cities_dates_order
  check (
    arrival_date is null
    or departure_date is null
    or arrival_date <= departure_date
  );

-- ─── Verificación ──────────────────────────────────────────────────────────
-- Después de correr esto, deberías ver:
--   - email_in_entries acepta 'email-direct'
--   - trip_members con 2 policies nuevas (pending_self_select, pending_self_accept)
--   - budget_categories con índice único (trip_id, category)
--   - 7 funciones security definer con search_path=public
-- Sin errores.
