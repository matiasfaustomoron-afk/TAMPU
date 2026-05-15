-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — Realtime publication extras
--
-- 00017 publicó las 8 tablas más calientes (reservations, expenses, tasks,
-- cities, trip_days, budget_categories, journal_likes, journal_comments).
-- Faltaban 6 que también disparan UI live: attachments (vault upload entre
-- co-owners), trip_members (invitar/remover sin reload), email_in_entries
-- (forwarding feedback), polls (votos compartidos), documents (perfil del
-- viaje shared), packing_items (checklist colaborativa).
--
-- IDempotente: si la tabla ya está publicada, ALTER PUBLICATION ... ADD
-- TABLE dispara duplicate_object → swallowed.
-- ──────────────────────────────────────────────────────────────────────────

do $$ begin alter publication supabase_realtime add table public.attachments; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.trip_members; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.email_in_entries; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.polls; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.documents; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.packing_items; exception when duplicate_object then null; end $$;
