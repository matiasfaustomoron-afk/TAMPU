-- ─── 00039_profiles_community.sql ──────────────────────────────────────────
--
-- Iter 7+ — Community profile fields para que la app funcione como blog/feed:
-- cada user tiene nickname único (handle público), avatar y bio. Esto permite
-- que /journal muestre comments/likes con avatar + @nick en vez de UUIDs.
--
-- CONTEXTO:
--   La tabla `profiles` (migration 00002) tenía solo id/email/full_name/timezone/
--   preferred_currency/date_format. No había forma de identificar al autor de
--   un comment ni del journal compartido sin filtrar email (que es PII).
--
-- COLUMNAS NUEVAS:
--   - nickname       text  — handle único (lowercase, unique parcial). Generado
--                            automáticamente desde el email en el trigger
--                            handle_new_user para users nuevos; para users
--                            existentes backfill al final del archivo.
--   - avatar_url     text  — URL pública del avatar. Iter 8 agrega upload a
--                            Supabase Storage; por ahora cualquier URL.
--   - bio            text  — bio cortita (UI limita a ~280 chars en el form).
--   - share_name     bool  — opt-in para mostrar full_name en lugares públicos
--                            (comments del journal, feeds). Default false:
--                            si lo dejás apagado solo se ve @nickname.
--
-- RLS:
--   La policy original `profiles_select` solo permitía SELECT a auth.uid()=id
--   (cada user solo veía SU propio profile). Eso rompe la funcionalidad de
--   community: para renderizar el feed necesitamos leer los profiles de OTROS
--   users (avatar + nickname). Solución:
--     - DROP la policy restrictiva.
--     - Nueva policy `profiles_public_read` que permite SELECT a todos.
--     - El filtrado de qué campos exponer (ej email NUNCA, full_name solo si
--       share_name=true) se hace APP-SIDE en los SELECTs explícitos
--       (ver src/lib/data/profiles.ts). RLS en Postgres no soporta column-level
--       filtering trivial, así que la disciplina queda en el data layer.
--   La policy de UPDATE existente (`profiles_update`, auth.uid()=id) se mantiene.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS share_name boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.nickname IS
  'Handle público único (case-insensitive). Auto-generado desde email en signup; editable luego desde /settings.';
COMMENT ON COLUMN profiles.avatar_url IS
  'URL del avatar. Iter 8 va a soportar upload a Storage; por ahora cualquier URL pública.';
COMMENT ON COLUMN profiles.bio IS
  'Bio corta del user (~280 chars). Visible en perfil público.';
COMMENT ON COLUMN profiles.share_name IS
  'Si true, full_name se muestra junto a @nickname en lugares públicos (comments, feed). Default false.';

-- Índice único parcial: nickname es CI-unique cuando NO es NULL. Permite que
-- profiles existentes (pre-backfill) tengan NULL sin colisionar.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_nickname_unique
  ON profiles (lower(nickname))
  WHERE nickname IS NOT NULL;

-- ─── Trigger update: handle_new_user con auto-generated nickname ──────────
--
-- La versión previa (migration 00027) ya tenía search_path + on conflict + grants
-- + exception handler. Acá la extendemos para que TAMBIÉN genere un nickname
-- candidate desde el local-part del email y reintente con sufijo numérico hasta
-- 100 veces en caso de collision. Si después de 100 intentos sigue chocando,
-- inserta sin nickname (NULL) y el user lo elige manualmente desde /settings.
--
-- Ej: matias@gmail.com → "matias"; si ya existe → "matias1"; "matias2"; …

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_nick text;
  candidate text;
  counter   int := 0;
BEGIN
  -- Local-part del email, sanitizado: solo [a-z0-9], lowercase. Si quedaba vacío
  -- (email tipo "...@...") fallback a 'user'.
  base_nick := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9]', '', 'gi'));
  IF base_nick = '' OR base_nick IS NULL THEN
    base_nick := 'user';
  END IF;
  candidate := base_nick;

  WHILE EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(nickname) = lower(candidate)
  ) AND counter < 100 LOOP
    counter := counter + 1;
    candidate := base_nick || counter::text;
  END LOOP;

  -- Si después de 100 intentos sigue chocando (caso degenerado, casi imposible),
  -- caemos a NULL y que el user elija manualmente.
  IF counter >= 100 THEN
    candidate := NULL;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, nickname)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    candidate
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user trigger failed: % (%)', sqlerrm, sqlstate;
    RETURN new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Re-crear el trigger por consistencia con migration 00027.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Backfill de nicknames para users existentes ──────────────────────────
--
-- Recorre uno por uno los profiles con nickname IS NULL y les genera un
-- candidate único. Como es un loop plpgsql con SELECT FOR UPDATE no escala a
-- millones de rows, pero hoy estamos en decenas: OK.

DO $$
DECLARE
  r         record;
  base_nick text;
  candidate text;
  counter   int;
BEGIN
  FOR r IN SELECT id, email FROM public.profiles WHERE nickname IS NULL LOOP
    base_nick := lower(regexp_replace(split_part(r.email, '@', 1), '[^a-z0-9]', '', 'gi'));
    IF base_nick = '' OR base_nick IS NULL THEN
      base_nick := 'user';
    END IF;
    candidate := base_nick;
    counter := 0;
    WHILE EXISTS (
      SELECT 1 FROM public.profiles WHERE lower(nickname) = lower(candidate)
    ) AND counter < 100 LOOP
      counter := counter + 1;
      candidate := base_nick || counter::text;
    END LOOP;
    IF counter < 100 THEN
      UPDATE public.profiles SET nickname = candidate WHERE id = r.id;
    END IF;
  END LOOP;
END$$;

-- ─── RLS: SELECT público de profiles ──────────────────────────────────────
--
-- Antes solo el dueño podía SELECT. Ahora cualquiera autenticado puede leer
-- la fila (necesario para /journal feed que muestra avatares de OTHER users).
-- El filtrado de columnas sensibles (email, full_name si share_name=false) se
-- hace en el data layer mediante SELECT explícito de columnas.

DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_public_read" ON profiles
  FOR SELECT
  USING (true);

-- La policy de INSERT y UPDATE existentes (auth.uid() = id) se mantienen tal cual.
