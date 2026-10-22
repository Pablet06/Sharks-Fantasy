-- Migration: usuarios_fk_on_delete_cascade
-- Borrar una cuenta fallaba si el usuario tenía datos de juego: la Edge
-- Function delete-account borra primero la fila de `usuarios`, pero
-- alineaciones, apuestas, presupuestos, powerups_usuario y powerups_aplicados
-- apuntaban a ella con ON DELETE NO ACTION y la violación de clave foránea
-- devolvía "Failed to delete user data". Con CASCADE, eliminar la cuenta
-- elimina también sus datos de juego (lo esperable de "borrar mi cuenta").
-- Solo cambia el comportamiento al borrar; no toca datos existentes.

ALTER TABLE alineaciones       DROP CONSTRAINT alineaciones_usuario_id_fkey,
  ADD CONSTRAINT alineaciones_usuario_id_fkey       FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE apuestas           DROP CONSTRAINT apuestas_usuario_id_fkey,
  ADD CONSTRAINT apuestas_usuario_id_fkey           FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE presupuestos       DROP CONSTRAINT presupuestos_usuario_id_fkey,
  ADD CONSTRAINT presupuestos_usuario_id_fkey       FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE powerups_usuario   DROP CONSTRAINT powerups_usuario_usuario_id_fkey,
  ADD CONSTRAINT powerups_usuario_usuario_id_fkey   FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE powerups_aplicados DROP CONSTRAINT powerups_aplicados_usuario_id_fkey,
  ADD CONSTRAINT powerups_aplicados_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;
