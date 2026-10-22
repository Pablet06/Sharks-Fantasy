-- historial_anterior: puntos por jornada de la temporada 25-26, usados solo para
-- calcular el precio inicial (ventana mixta). Tabla aparte para no contaminar
-- resolver_jornada / cuota_actual / recalc_puntos, que leen `historial` sin
-- filtro de temporada.
CREATE TABLE IF NOT EXISTS historial_anterior (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jugador_id  integer NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  jornada     integer NOT NULL,          -- jornada federativa 25-26
  stats       jsonb   NOT NULL,
  puntos      double precision NOT NULL, -- mismo tipo que historial.puntos
  date        timestamptz,               -- mismo tipo que historial.date
  UNIQUE (jugador_id, jornada)
);

ALTER TABLE historial_anterior ENABLE ROW LEVEL SECURITY;

-- Lectura publica (anon + authenticated): useJugadores carga una sola vez al
-- montar App, posiblemente antes del login. Son datos publicos de la federacion.
DROP POLICY IF EXISTS historial_anterior_select ON historial_anterior;
CREATE POLICY historial_anterior_select ON historial_anterior
  FOR SELECT TO anon, authenticated USING (true);

-- Escritura solo admin (el scraper usa service_role, que se salta RLS).
DROP POLICY IF EXISTS historial_anterior_admin_all ON historial_anterior;
CREATE POLICY historial_anterior_admin_all ON historial_anterior
  FOR ALL TO authenticated
  USING (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));
