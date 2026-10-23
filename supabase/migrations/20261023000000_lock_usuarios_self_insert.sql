-- Migration: lock_usuarios_self_insert
-- CRITICAL fix (revisión pre-partido 2026-10-23): usuarios_insert_own solo
-- comprobaba auth.uid() = id, y `authenticated` tiene INSERT sobre todas las
-- columnas (incl. is_admin y puntos). Con "Confirm email" desactivado, cualquiera
-- que se registre podía hacer
--   supabase.from('usuarios').insert({ id: myId, nombre: 'x', is_admin: true })
-- y quedar como admin total. 20260910000000_lock_usuarios_self_update.sql solo
-- cerró el UPDATE.
--
-- Fix: un alta propia nunca puede nacer admin ni con puntos. createProfile()
-- inserta { id, nombre, equipo, puntos: 0 } y is_admin toma su default (false),
-- así que el flujo normal sigue funcionando. Los admins reales insertan filas
-- ajenas vía usuarios_admin_all (políticas permisivas, se combinan con OR).

DROP POLICY usuarios_insert_own ON usuarios;

CREATE POLICY usuarios_insert_own ON usuarios
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id AND is_admin = false AND puntos = 0);
