-- Migration: fotos_privadas
-- Las fotos de los jugadores dejan de estar en public/ (repo público) y pasan a un
-- bucket privado de Storage. `jugadores.photo` guarda la ruta dentro del bucket
-- (p. ej. 'AndoniIrastorza.png'); null = foto por defecto (sigue en public/).
-- Lectura: cualquier usuario autenticado (URLs firmadas). Escritura: solo admins.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('jugadores', 'jugadores', false, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "jugadores_fotos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'jugadores');

CREATE POLICY "jugadores_fotos_insert_admin" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'jugadores'
    AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.is_admin));

CREATE POLICY "jugadores_fotos_update_admin" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'jugadores'
    AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.is_admin));

CREATE POLICY "jugadores_fotos_delete_admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'jugadores'
    AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.is_admin));

-- Las fotos antiguas (rutas './jugadores/X.png' de public/) se descartan: las nuevas
-- se suben desde el admin. null = foto por defecto.
UPDATE public.jugadores SET photo = NULL WHERE photo LIKE './jugadores/%';
