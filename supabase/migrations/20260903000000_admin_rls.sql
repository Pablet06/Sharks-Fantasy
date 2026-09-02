-- Migration: admin_rls
-- Replaces the client-side-only "admin panel" (SHA-256 password check baked into
-- the public JS bundle) with real server-enforced RLS. Writes to jugadores/historial
-- were previously blocked for anon/authenticated entirely (read-only policies only),
-- so the old admin panel could not actually write anyway. This migration adds an
-- is_admin flag on usuarios and grants INSERT/UPDATE on jugadores + historial only
-- to authenticated users whose usuarios row has is_admin = true. The scraper writes
-- via the service role key, which bypasses RLS unconditionally, so it is unaffected.

-- 1. Admin flag on usuarios, defaulting closed.
ALTER TABLE usuarios ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

-- Grant admin to Pablo (existing account). Everyone else stays non-admin by default.
UPDATE usuarios SET is_admin = true WHERE id = '6d917fce-3a1a-4b4d-abb1-f1f8cc61c8a3';

-- 2. usuarios had two functionally-duplicate INSERT policies (one scoped to role
-- `public`, one to `authenticated`, same auth.uid() = id check). Drop the public one,
-- keep usuarios_insert_own.
DROP POLICY IF EXISTS "Users can insert own profile" ON usuarios;

-- 3. jugadores: public read stays as-is (jugadores_read). Add admin-only writes.
CREATE POLICY "jugadores_admin_insert" ON jugadores
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.is_admin)
  );

CREATE POLICY "jugadores_admin_update" ON jugadores
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.is_admin)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.is_admin)
  );

-- 4. historial: same shape, public read stays as-is (historial_read).
CREATE POLICY "historial_admin_insert" ON historial
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.is_admin)
  );

CREATE POLICY "historial_admin_update" ON historial
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.is_admin)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.is_admin)
  );
