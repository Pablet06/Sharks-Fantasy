-- Migration: fantasy_presupuestos_resolver
-- Budget table + read helper, and the function that freezes points for a
-- resolved jornada. See docs/superpowers/specs/2026-09-11-fantasy-dinamico-design.md.

CREATE TABLE presupuestos (
  usuario_id  uuid NOT NULL REFERENCES usuarios(id),
  jornada     integer NOT NULL REFERENCES jornadas(numero),
  presupuesto numeric NOT NULL,
  PRIMARY KEY (usuario_id, jornada)
);

ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;

CREATE POLICY presupuestos_select ON presupuestos
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY presupuestos_admin_write ON presupuestos
  FOR ALL TO authenticated
  USING     (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));

-- Presupuesto de un usuario para una jornada: la fila si existe (la fijará
-- una apuesta resuelta en Fase C), si no el base de 1000€.
CREATE OR REPLACE FUNCTION presupuesto_actual(p_usuario_id uuid, p_jornada integer)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT presupuesto FROM presupuestos WHERE usuario_id = p_usuario_id AND jornada = p_jornada),
    1000
  );
$$;

GRANT EXECUTE ON FUNCTION presupuesto_actual(uuid, integer) TO anon, authenticated;

-- Congela los puntos de cada alineación de la jornada N y actualiza el total
-- de temporada de cada usuario. La llama el scraper (service role: auth.uid()
-- resuelve NULL, se deja pasar) justo después de escribir el historial de esa
-- jornada, o el admin a mano desde AdminView para reprocesar.
CREATE OR REPLACE FUNCTION resolver_jornada(p_jornada integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'resolver_jornada: solo admin o el scraper';
  END IF;

  -- Alineaciones completas (7 jugadores): puntos = suma de historial.puntos
  -- de esa jornada, doble para el capitán.
  UPDATE alineaciones a SET
    puntos_jornada = sub.total,
    actualizado_en = now()
  FROM (
    SELECT al.id,
      SUM(h.puntos * CASE WHEN j.numero = al.capitan THEN 2 ELSE 1 END) AS total
    FROM alineaciones al
    JOIN jugadores j ON j.numero = ANY(al.jugadores)
    JOIN historial h ON h.jugador_id = j.id AND h.jornada = al.jornada
    WHERE al.jornada = p_jornada
      AND array_length(al.jugadores, 1) = 7
    GROUP BY al.id
  ) sub
  WHERE a.id = sub.id;

  -- Alineaciones incompletas de esa jornada (NULL, <7, o jugadores que no
  -- resolvieron ningún historial): 0 puntos, sin puntuación parcial.
  UPDATE alineaciones SET puntos_jornada = 0, actualizado_en = now()
  WHERE jornada = p_jornada AND puntos_jornada IS NULL;

  -- Total de temporada = suma de las jornadas ya resueltas de cada usuario.
  UPDATE usuarios u SET puntos = COALESCE(sub.total, 0)
  FROM (
    SELECT usuario_id, SUM(puntos_jornada) AS total
    FROM alineaciones
    WHERE puntos_jornada IS NOT NULL
    GROUP BY usuario_id
  ) sub
  WHERE u.id = sub.usuario_id;

  UPDATE jornadas SET finalizado = true WHERE numero = p_jornada;
END $$;

REVOKE ALL ON FUNCTION resolver_jornada(integer) FROM public;
GRANT EXECUTE ON FUNCTION resolver_jornada(integer) TO authenticated, service_role;
