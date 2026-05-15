-- ─── 00038_recap_public.sql ─────────────────────────────────────────────────
--
-- Iter 5 — `recap_public` flag para opt-in en `/api/recap/[tripId]`.
--
-- CONTEXTO:
--   El endpoint `/api/recap/[tripId]/route.tsx` renderiza un PNG estilo
--   "Spotify Wrapped" del viaje y se sirve como `og:image` para que WhatsApp,
--   Twitter, etc. muestren un preview cuando alguien comparte el link
--   `/recap/[tripId]`. Hasta hoy ese endpoint era público sin filtro: cualquier
--   UUID guessable exponía nombre del viaje, destino, fechas y conteos via
--   service_role bypassing RLS.
--
-- RESOLUCIÓN (Iter 5):
--   - Agregamos `recap_public boolean default false` a `trips`.
--   - El endpoint chequea `trip.recap_public === true` antes de renderizar.
--     Si es `false` (default), devuelve 404 — preserva privacy by default.
--   - El owner puede activarlo desde Ajustes del viaje (UI pendiente — Iter 6+).
--
-- TODO Iter 6+:
--   - Alternativa con signed tokens corta-vida (HMAC) para "compartí este link
--     hasta el 1ro de junio" sin tener que togglear un flag persistente.
--   - UI en /trips/[id]/settings para togglear `recap_public` y copiar link.

ALTER TABLE trips ADD COLUMN IF NOT EXISTS recap_public boolean NOT NULL DEFAULT false;

-- Comentario en la columna para que cualquier migration tool / DB-explorer
-- explique la semántica sin tener que ir al código.
COMMENT ON COLUMN trips.recap_public IS
  'Si true, el endpoint /api/recap/[tripId] sirve un PNG público para uso como og:image. Default false — privacy by default.';
