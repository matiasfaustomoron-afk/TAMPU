-- ─── 00037_attachment_expiry.sql ────────────────────────────────────────────
--
-- Iter 5 — `attachments.expires_at` para attachments con fecha de vencimiento.
--
-- CONTEXTO:
--   Algunos attachments son temporales por naturaleza: visa con validity window,
--   boarding pass que solo sirve para el día del vuelo, seguro de viaje con
--   fecha de fin de cobertura, e-tickets que vencen, etc. Hoy `documents` ya
--   tiene `expiry_date` para el "documento lógico", pero la copia digital
--   subida como `attachments` no tiene su propio campo de expiración —
--   forzando consultas join + lógica de UI dispersa.
--
-- RESOLUCIÓN:
--   Agregamos `expires_at timestamptz NULL` a `attachments`. Nullable porque
--   la mayoría de archivos (ID, pasaporte escaneado, fotos) no expiran. El
--   client lo usa para:
--     - Mostrar un badge "Vence en 3 días" en el vault.
--     - Auto-archivar attachments expirados (no borrar — el user puede
--       querer el histórico).
--     - Disparar notificaciones cuando un attachment crítico vencerá pronto.
--
-- TODO Iter 6+:
--   - Job cron diario que marca attachments con `expires_at < now()` como
--     `is_critical = false` o los mueve a un bucket "archived".
--   - UI en /vault con filtros "vigente / por vencer / vencido".

ALTER TABLE attachments ADD COLUMN IF NOT EXISTS expires_at timestamptz NULL;

COMMENT ON COLUMN attachments.expires_at IS
  'Fecha/hora de expiración del adjunto (visa, boarding pass, seguro). NULL = no expira. Iter 5.';

CREATE INDEX IF NOT EXISTS idx_attachments_expires_at
  ON attachments(expires_at)
  WHERE expires_at IS NOT NULL;
