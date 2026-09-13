-- Migration: fantasy_apuestas_resolver
-- Amplía resolver_jornada() (ya en prod desde Fase B) para resolver las
-- apuestas de la jornada y financiar el presupuesto de la siguiente.
-- Todo lo demás de la función (guardas, puntuación de alineaciones,
-- finalizado) es idéntico a la versión de Fase B.

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

  IF NOT EXISTS (SELECT 1 FROM historial WHERE jornada = p_jornada) THEN
    RETURN;
  END IF;

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
    GROUP BY al.id
    HAVING count(DISTINCT j.numero) = 7
  ) sub
  WHERE a.id = sub.id;

  UPDATE alineaciones SET puntos_jornada = 0, actualizado_en = now()
  WHERE jornada = p_jornada AND puntos_jornada IS NULL;

  UPDATE usuarios u SET puntos = COALESCE(
    (SELECT SUM(a.puntos_jornada) FROM alineaciones a
     WHERE a.usuario_id = u.id AND a.puntos_jornada IS NOT NULL), 0);

  -- Apuestas de resultado.
  UPDATE apuestas a SET
    resuelto = true,
    acierto = (a.seleccion = j.resultado),
    ganancia = CASE WHEN a.seleccion = j.resultado
      THEN a.importe * a.cuota - a.importe
      ELSE -a.importe END
  FROM jornadas j
  WHERE a.jornada = p_jornada AND a.tipo = 'resultado' AND j.numero = p_jornada AND NOT a.resuelto;

  -- Apuestas de goleador y expulsado: mismo patrón, cambia solo la métrica.
  -- Empate (más de un líder) -> ganancia 0, ni acierto ni fallo cuentan.
  WITH por_jornada AS (
    SELECT j.numero, (h.stats->>'goles')::int AS valor
    FROM historial h JOIN jugadores j ON j.id = h.jugador_id
    WHERE h.jornada = p_jornada
  ),
  lideres AS (
    SELECT array_agg(numero) AS nums FROM por_jornada
    WHERE valor > 0 AND valor = (SELECT max(valor) FROM por_jornada)
  )
  UPDATE apuestas a SET
    resuelto = true,
    acierto = (
      SELECT CASE
        WHEN nums IS NULL THEN false
        WHEN array_length(nums, 1) > 1 THEN NULL
        ELSE a.seleccion::int = ANY(nums)
      END
      FROM lideres
    ),
    ganancia = (
      SELECT CASE
        WHEN nums IS NULL THEN -a.importe
        WHEN array_length(nums, 1) > 1 THEN 0
        WHEN a.seleccion::int = ANY(nums) THEN a.importe * a.cuota - a.importe
        ELSE -a.importe
      END
      FROM lideres
    )
  WHERE a.jornada = p_jornada AND a.tipo = 'goleador' AND NOT a.resuelto;

  WITH por_jornada AS (
    SELECT j.numero, (h.stats->>'tarjetas')::int + (h.stats->>'expulsiones')::int AS valor
    FROM historial h JOIN jugadores j ON j.id = h.jugador_id
    WHERE h.jornada = p_jornada
  ),
  lideres AS (
    SELECT array_agg(numero) AS nums FROM por_jornada
    WHERE valor > 0 AND valor = (SELECT max(valor) FROM por_jornada)
  )
  UPDATE apuestas a SET
    resuelto = true,
    acierto = (
      SELECT CASE
        WHEN nums IS NULL THEN false
        WHEN array_length(nums, 1) > 1 THEN NULL
        ELSE a.seleccion::int = ANY(nums)
      END
      FROM lideres
    ),
    ganancia = (
      SELECT CASE
        WHEN nums IS NULL THEN -a.importe
        WHEN array_length(nums, 1) > 1 THEN 0
        WHEN a.seleccion::int = ANY(nums) THEN a.importe * a.cuota - a.importe
        ELSE -a.importe
      END
      FROM lideres
    )
  WHERE a.jornada = p_jornada AND a.tipo = 'expulsado' AND NOT a.resuelto;

  -- Apuestas de portería: acierto si algún portero que jugó esa jornada
  -- encajó menos de 8.
  UPDATE apuestas a SET
    resuelto = true,
    acierto = EXISTS (
      SELECT 1 FROM historial h JOIN jugadores j ON j.id = h.jugador_id
      WHERE h.jornada = p_jornada AND j.pos = 'Portero'
        AND (h.stats->>'partidos')::int > 0 AND (h.stats->>'goles_contra')::int < 8
    ),
    ganancia = CASE WHEN EXISTS (
      SELECT 1 FROM historial h JOIN jugadores j ON j.id = h.jugador_id
      WHERE h.jornada = p_jornada AND j.pos = 'Portero'
        AND (h.stats->>'partidos')::int > 0 AND (h.stats->>'goles_contra')::int < 8
    ) THEN a.importe * a.cuota - a.importe ELSE -a.importe END
  WHERE a.jornada = p_jornada AND a.tipo = 'porteria' AND NOT a.resuelto;

  -- Financia el presupuesto de la jornada siguiente con la ganancia neta de
  -- apuestas, solo si esa jornada ya existe. Sin fila = presupuesto_actual
  -- cae a los 1000€ base (nadie apostó, o la jornada+1 no existe todavía).
  IF EXISTS (SELECT 1 FROM jornadas WHERE numero = p_jornada + 1) THEN
    INSERT INTO presupuestos (usuario_id, jornada, presupuesto)
    SELECT a.usuario_id, p_jornada + 1, GREATEST(0, 1000 + COALESCE(SUM(a.ganancia), 0))
    FROM apuestas a
    WHERE a.jornada = p_jornada AND a.resuelto
    GROUP BY a.usuario_id
    ON CONFLICT (usuario_id, jornada) DO UPDATE SET presupuesto = EXCLUDED.presupuesto;
  END IF;

  UPDATE jornadas SET finalizado = true WHERE numero = p_jornada;
END $$;

REVOKE ALL ON FUNCTION resolver_jornada(integer) FROM public;
GRANT EXECUTE ON FUNCTION resolver_jornada(integer) TO authenticated, service_role;
