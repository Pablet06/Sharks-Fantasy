-- Migration: admin_rls_perf
-- The admin_rls migration's policies call auth.uid() directly, which Postgres
-- re-evaluates per row (flagged by Supabase's performance advisor). Wrap it in
-- `(select auth.uid())` so the planner caches it once per statement instead.
-- No behavior change, just query-plan efficiency at scale.

DROP POLICY IF EXISTS "jugadores_admin_insert" ON jugadores;
DROP POLICY IF EXISTS "jugadores_admin_update" ON jugadores;
DROP POLICY IF EXISTS "historial_admin_insert" ON historial;
DROP POLICY IF EXISTS "historial_admin_update" ON historial;

CREATE POLICY "jugadores_admin_insert" ON jugadores
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.is_admin)
  );

CREATE POLICY "jugadores_admin_update" ON jugadores
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.is_admin)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.is_admin)
  );

CREATE POLICY "historial_admin_insert" ON historial
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.is_admin)
  );

CREATE POLICY "historial_admin_update" ON historial
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.is_admin)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.is_admin)
  );
