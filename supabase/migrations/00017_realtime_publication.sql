-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — Habilitar Realtime para tablas del viaje
--
-- Para que `client.channel(...).on('postgres_changes', ...)` reciba eventos,
-- la tabla tiene que estar publicada en `supabase_realtime`. Esta migración
-- agrega las tablas que el frontend escucha via `useTripRealtime`.
--
-- Costo: cero adicional. Supabase Realtime usa el WAL ya existente.
-- Throughput: los eventos por trip son bajos (decenas/min), nada material.
-- ──────────────────────────────────────────────────────────────────────────

-- Crear la publicación si no existe (Supabase la crea por default, esto es defensivo)
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- Agregar tablas. Si ya están publicadas, ALTER PUBLICATION ... ADD TABLE
-- tira un error que ignoramos via DO/EXCEPTION.
do $$
begin
  alter publication supabase_realtime add table reservations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table expenses;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table tasks;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table cities;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table trip_days;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table budget_categories;
exception when duplicate_object then null;
end $$;

-- journal_likes y journal_comments (multi-user feed)
do $$
begin
  alter publication supabase_realtime add table journal_likes;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table journal_comments;
exception when duplicate_object then null;
end $$;
