-- Migration: cuotas_previas
-- Probabilidad inicial de las apuestas, tomada de la temporada 25-26, que se
-- mezcla con el histórico de la temporada actual dentro de cuota_actual().
--
-- Mezcla (misma idea que la ventana de precios): el prior pesa como 5
-- "partidos virtuales", así que a medida que se juegan partidos esta
-- temporada el histórico real lo va desplazando:
--   p = (prior * 5 + aciertos_actuales) / (5 + observaciones_actuales)
-- Sin fila en cuotas_previas (jugadores nuevos, portería) se comporta como
-- antes: solo histórico actual, y 0.5 (x2) si todavía no hay ninguno.
--
-- Origen de los datos (25-26, C.W. Sharks A, 16 partidos jugados):
--  * resultado: se perdieron todos los partidos (dato del usuario) -> gana 0,
--    empata 0, pierde 1.
--  * goleador / expulsado: estimadas por simulación (Poisson por jugador con
--    su tasa de goles / (exclusiones+tarjetas) por partido de 25-26 y su
--    frecuencia de participación) como P(ser líder del partido | hubo
--    líder), que es lo que cuenta cuota_actual(). No hay datos por partido
--    de la 25-26, solo totales de temporada.
--  * portería: sin datos de goles encajados por partido -> sin prior.
-- Selección goleador/expulsado = dorsal (jugadores.numero), igual que apuestas.

CREATE TABLE IF NOT EXISTS cuotas_previas (
  tipo         text    NOT NULL,
  seleccion    text    NOT NULL,
  probabilidad numeric NOT NULL CHECK (probabilidad >= 0 AND probabilidad <= 1),
  PRIMARY KEY (tipo, seleccion)
);

ALTER TABLE cuotas_previas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cuotas_previas_select ON cuotas_previas;
CREATE POLICY cuotas_previas_select ON cuotas_previas
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS cuotas_previas_admin_all ON cuotas_previas;
CREATE POLICY cuotas_previas_admin_all ON cuotas_previas
  FOR ALL TO authenticated
  USING (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));

INSERT INTO cuotas_previas (tipo, seleccion, probabilidad) VALUES
  ('resultado','gana',0), ('resultado','empata',0), ('resultado','pierde',1),
  ('goleador','1',0.000),  ('expulsado','1',0.008),
  ('goleador','2',0.000),  ('expulsado','2',0.000),
  ('goleador','4',0.052),  ('expulsado','4',0.078),
  ('goleador','5',0.114),  ('expulsado','5',0.137),
  ('goleador','6',0.686),  ('expulsado','6',0.127),
  ('goleador','8',0.230),  ('expulsado','8',0.265),
  ('goleador','9',0.143),  ('expulsado','9',0.028),
  ('goleador','10',0.000), ('expulsado','10',0.227),
  ('goleador','11',0.009), ('expulsado','11',0.154),
  ('goleador','12',0.031), ('expulsado','12',0.030),
  ('goleador','13',0.080), ('expulsado','13',0.051),
  ('goleador','14',0.030), ('expulsado','14',0.039),
  ('goleador','15',0.081), ('expulsado','15',0.053),
  ('goleador','16',0.029), ('expulsado','16',0.231),
  ('goleador','17',0.040), ('expulsado','17',0.351)
ON CONFLICT (tipo, seleccion) DO UPDATE SET probabilidad = EXCLUDED.probabilidad;

-- cuota_actual: cuerpo de 20260913000000 con UN solo cambio, el cálculo final
-- de la probabilidad (mezcla con cuotas_previas).
CREATE OR REPLACE FUNCTION cuota_actual(p_tipo text, p_seleccion text, p_jornada integer)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_num   integer;
  v_den   integer;
  v_prob  numeric;
  v_prior numeric;
  v_peso  constant integer := 5;  -- partidos virtuales del prior de la 25-26
BEGIN
  IF p_tipo = 'resultado' THEN
    SELECT count(*) FILTER (WHERE resultado = p_seleccion),
           count(*) FILTER (WHERE resultado IS NOT NULL)
    INTO v_num, v_den
    FROM jornadas WHERE numero < p_jornada;

  ELSIF p_tipo IN ('goleador', 'expulsado') THEN
    WITH por_jornada AS (
      SELECT h.jornada, j.numero,
        CASE WHEN p_tipo = 'goleador'
          THEN (h.stats->>'goles')::int
          ELSE (h.stats->>'tarjetas')::int + (h.stats->>'expulsiones')::int
        END AS valor
      FROM historial h
      JOIN jugadores j ON j.id = h.jugador_id
      WHERE h.jornada < p_jornada
    ),
    maximos AS (
      SELECT jornada, array_agg(numero) AS lideres
      FROM por_jornada pj
      WHERE valor > 0 AND valor = (SELECT max(valor) FROM por_jornada p2 WHERE p2.jornada = pj.jornada)
      GROUP BY jornada
    )
    SELECT count(*) FILTER (WHERE p_seleccion::int = ANY(lideres)), count(*)
    INTO v_num, v_den
    FROM maximos;

  ELSIF p_tipo = 'porteria' THEN
    SELECT count(*) FILTER (WHERE (h.stats->>'goles_contra')::int < 8), count(*)
    INTO v_num, v_den
    FROM historial h
    JOIN jugadores j ON j.id = h.jugador_id
    WHERE h.jornada < p_jornada AND j.pos = 'Portero' AND (h.stats->>'partidos')::int > 0;

  ELSE
    RAISE EXCEPTION 'cuota_actual: tipo desconocido %', p_tipo;
  END IF;

  SELECT probabilidad INTO v_prior FROM cuotas_previas
  WHERE tipo = p_tipo AND seleccion = p_seleccion;

  IF v_prior IS NOT NULL THEN
    v_prob := (v_prior * v_peso + COALESCE(v_num, 0)) / (v_peso + COALESCE(v_den, 0));
  ELSE
    v_prob := CASE WHEN v_den IS NULL OR v_den = 0 THEN 0.5 ELSE v_num::numeric / v_den END;
  END IF;

  IF v_prob <= 0 THEN RETURN 2.1; END IF;
  RETURN LEAST(2.1, GREATEST(1.2, round(1 / v_prob, 2)));
END $$;

GRANT EXECUTE ON FUNCTION cuota_actual(text, text, integer) TO authenticated;
