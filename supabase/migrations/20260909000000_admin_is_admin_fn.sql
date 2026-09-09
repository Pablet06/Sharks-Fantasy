-- Migration: admin_is_admin_fn
-- A policy on `usuarios` that does `EXISTS (SELECT 1 FROM usuarios …)` recurses.
-- Move the admin check into one SECURITY DEFINER function (runs as owner, skips
-- RLS on its own SELECT) and route every admin policy through it. Also add the
-- DELETE policies Phase B needs and an admin-wide policy on `usuarios`.

CREATE OR REPLACE FUNCTION is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT u.is_admin FROM usuarios u WHERE u.id = uid), false);
$$;

REVOKE ALL ON FUNCTION is_admin(uuid) FROM public;
GRANT EXECUTE ON FUNCTION is_admin(uuid) TO anon, authenticated;

-- jugadores: rewrite insert/update, add delete
DROP POLICY IF EXISTS "jugadores_admin_insert" ON jugadores;
DROP POLICY IF EXISTS "jugadores_admin_update" ON jugadores;
CREATE POLICY "jugadores_admin_insert" ON jugadores
  FOR INSERT TO authenticated
  WITH CHECK (is_admin((SELECT auth.uid())));
CREATE POLICY "jugadores_admin_update" ON jugadores
  FOR UPDATE TO authenticated
  USING (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));
CREATE POLICY "jugadores_admin_delete" ON jugadores
  FOR DELETE TO authenticated
  USING (is_admin((SELECT auth.uid())));

-- historial: rewrite insert/update, add delete
DROP POLICY IF EXISTS "historial_admin_insert" ON historial;
DROP POLICY IF EXISTS "historial_admin_update" ON historial;
CREATE POLICY "historial_admin_insert" ON historial
  FOR INSERT TO authenticated
  WITH CHECK (is_admin((SELECT auth.uid())));
CREATE POLICY "historial_admin_update" ON historial
  FOR UPDATE TO authenticated
  USING (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));
CREATE POLICY "historial_admin_delete" ON historial
  FOR DELETE TO authenticated
  USING (is_admin((SELECT auth.uid())));

-- config: narrow FOR ALL -> INSERT + UPDATE, route through is_admin
DROP POLICY IF EXISTS config_admin_write ON config;
CREATE POLICY config_admin_insert ON config
  FOR INSERT TO authenticated
  WITH CHECK (is_admin((SELECT auth.uid())));
CREATE POLICY config_admin_update ON config
  FOR UPDATE TO authenticated
  USING (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));

-- usuarios: existing self-policies stay (users read/update/insert their own row).
-- Add an admin-wide policy so the panel can read/update/delete any row.
CREATE POLICY usuarios_admin_all ON usuarios
  FOR ALL TO authenticated
  USING (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));
