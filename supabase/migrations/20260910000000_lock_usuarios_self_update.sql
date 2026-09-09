-- Migration: lock_usuarios_self_update
-- CRITICAL fix (Phase B final review): usuarios_update_own had
-- WITH CHECK (auth.uid() = id) with no column restriction, and `authenticated`
-- held a table-level UPDATE grant on usuarios — so any signed-in user could
--   supabase.from('usuarios').update({ is_admin: true }).eq('id', myId)
-- and self-promote. Phase B's admin policies (DELETE on jugadores/historial,
-- usuarios FOR ALL, recalc_puntos, delete-account target_user_id) turned that
-- into full takeover of the other user's account.
--
-- Fix, in two parts:
--   1. A non-admin's self-update may never leave is_admin true. Real admins
--      still edit any usuarios row (incl. is_admin) via usuarios_admin_all —
--      RLS policies are OR'd.
--   2. Drop the table-level UPDATE grant (a column-level REVOKE does not bite
--      a table grant) and re-grant only the columns a client legitimately
--      writes. `puntos` and `created_at` are then writable only by
--      recalc_puntos() (SECURITY DEFINER, runs as owner) and the scraper
--      (service_role). INSERT privileges are untouched, so createProfile()
--      still works.

DROP POLICY usuarios_update_own ON usuarios;

CREATE POLICY usuarios_update_own ON usuarios
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id AND is_admin = false);

REVOKE UPDATE ON usuarios FROM authenticated;
GRANT UPDATE (nombre, equipo, is_admin) ON usuarios TO authenticated;
