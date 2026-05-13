-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — Destination photo cache
--
-- Cache de resolutions de fotos por destino. Cada destination_slug se resuelve
-- a UNA foto principal en cascada de tiers (curated / wikipedia / unsplash / placeholder).
-- Una vez resuelto, cacheamos para siempre — las fotos icónicas de Wikipedia
-- son inmutables (mismo URL años después).
--
-- Refresh: TTL 30 días. Si refresh devuelve null o falla, mantenemos el cache existente
-- (degrade gracefully — mejor mostrar la foto vieja que un placeholder vacío).
--
-- Tabla pública: cualquier user de Tampu se beneficia del cache de otros users.
-- Las fotos son URLs públicas de Wikimedia/Unsplash; cachear no es PII.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists destination_photos (
  -- Slug normalizado del destino: "buenos aires" → "buenos-aires"
  -- "Papúa Nueva Guinea" → "papua-nueva-guinea"
  slug text not null,
  locale text not null default 'es' check (locale in ('es', 'en', 'pt')),

  -- Tier que ganó la cascada: 'curated' | 'wikipedia-es' | 'wikipedia-en' | 'unsplash' | 'placeholder'
  tier text not null,

  -- Foto principal del destino
  photo_url text,
  photo_width integer,
  photo_height integer,

  -- Atribución (obligatorio para Wikipedia CC, opcional Unsplash)
  attribution text,
  source_page_url text,

  -- Caption corto: "Avenida 9 de Julio, Buenos Aires" — útil para alt-text
  caption text,
  description text,

  fetched_at timestamptz default now(),
  -- Si el resolver falló (no encontró nada decente), guardamos un placeholder
  -- record para no re-intentar cada vez
  resolution_status text not null default 'ok' check (resolution_status in ('ok', 'not-found', 'placeholder')),

  primary key (slug, locale)
);

create index idx_destination_photos_status on destination_photos(resolution_status);
create index idx_destination_photos_fetched on destination_photos(fetched_at);

-- RLS: lectura pública (es un cache compartido de fotos públicas, sin PII).
-- Escritura solo desde server-side con service-role-key.
alter table destination_photos enable row level security;

drop policy if exists destination_photos_public_read on destination_photos;
create policy destination_photos_public_read on destination_photos for select using (true);

-- ──────────────────────────────────────────────────────────────────────────
-- Helper function: purgar entries antiguos para forzar refresh
-- ──────────────────────────────────────────────────────────────────────────

create or replace function tampu_purge_old_destination_photos() returns void as $$
  delete from destination_photos
   where fetched_at < now() - interval '90 days'
     and resolution_status = 'ok';
$$ language sql security definer;
