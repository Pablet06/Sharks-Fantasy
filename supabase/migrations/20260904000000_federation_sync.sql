-- Migration: federation_sync
-- Supports the per-jornada scraper rework. Adds a stable federation player id,
-- a uniqueness constraint for idempotent per-jornada upserts, and a tiny
-- key/value config table (NOT a seasons table) holding the active federation
-- tournament id and sync bookkeeping.

-- 1. Stable Leverade player id, for matching federation rows to jugadores.
ALTER TABLE jugadores ADD COLUMN leverade_id bigint UNIQUE;

-- 2. One historial row per (player, jornada); lets the scraper upsert.
--    Existing prod data has at most one row per pair already.
ALTER TABLE historial ADD CONSTRAINT historial_jugador_jornada_uniq
  UNIQUE (jugador_id, jornada);

-- 3. Config: key/value, one row per setting.
CREATE TABLE config (
  key   text PRIMARY KEY,
  value text NOT NULL
);
INSERT INTO config (key, value) VALUES
  ('tournament_id', '1324114'),
  ('last_sync_at', ''),
  ('unmatched_players', '[]');

ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Public read (frontend shows sync status); admin-only write.
CREATE POLICY config_read ON config
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY config_admin_write ON config
  FOR ALL TO authenticated
  USING     (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.is_admin));
