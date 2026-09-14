-- Migration: fantasy_powerups_resolver
-- Amplía resolver_jornada() (ya en prod desde Fase C) para aplicar los
-- efectos de power-ups y conceder los tokens nuevos de esta jornada.
-- Todo lo demás de la función (guardas, puntuación de alineaciones,
-- resolución de apuestas, financiación de la siguiente jornada) es
-- idéntico a la versión de Fase C, con dos bloques nuevos insertados en
-- puntos concretos (ver comentarios inline) y dos bloques añadidos al
-- final.

CREATE OR REPLACE FUNCTION resolver_jornada(p_jornada integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jornada_anterior integer;
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

  -- Power-up "+2 puntos": entra AQUÍ, entre la puntuación normal y el
  -- fallback a 0 de abajo, para que un equipo todavía incompleto
  -- (puntos_jornada sigue NULL en este punto) nunca se vea "rescatado".
  UPDATE alineaciones a SET puntos_jornada = a.puntos_jornada + 2
  FROM powerups_aplicados pa
  WHERE pa.usuario_id = a.usuario_id AND pa.jornada = a.jornada
    AND pa.tipo = 'puntos_extra' AND a.jornada = p_jornada
    AND a.puntos_jornada IS NOT NULL
    AND pa.objetivo = ANY(a.jugadores);

  -- Power-up "blindaje de tarjeta": suma de vuelta la penalización exacta
  -- del jugador objetivo. Constantes duplicadas a mano de
  -- scraper/src/points.ts::calcMatchPoints (tarjetas*-3, expulsiones*-1,
  -- expulsiones_graves*-5) -- si esa fórmula cambia, esta migración queda
  -- desincronizada (ver spec, tabla de riesgos).
  UPDATE alineaciones a SET
    puntos_jornada = a.puntos_jornada
      + COALESCE((h.stats->>'tarjetas')::int, 0) * 3
      + COALESCE((h.stats->>'expulsiones')::int, 0) * 1
      + COALESCE((h.stats->>'expulsiones_graves')::int, 0) * 5
  FROM powerups_aplicados pa
  JOIN jugadores j ON j.numero = pa.objetivo
  LEFT JOIN historial h ON h.jugador_id = j.id AND h.jornada = p_jornada
  WHERE pa.usuario_id = a.usuario_id AND pa.jornada = a.jornada
    AND pa.tipo = 'blindaje' AND a.jornada = p_jornada
    AND a.puntos_jornada IS NOT NULL
    AND pa.objetivo = ANY(a.jugadores);

  UPDATE alineaciones SET puntos_jornada = 0, actualizado_en = now()
  WHERE jornada = p_jornada AND puntos_jornada IS NULL;

  UPDATE usuarios u SET puntos = COALESCE(
    (SELECT SUM(a.puntos_jornada) FROM alineaciones a
     WHERE a.usuario_id = u.id AND a.puntos_jornada IS NOT NULL), 0);

  -- Apuestas de resultado. Si jornadas.resultado sigue NULL, no se
  -- resuelven aún estas apuestas.
  UPDATE apuestas a SET
    resuelto = true,
    acierto = (a.seleccion = j.resultado),
    ganancia = CASE WHEN a.seleccion = j.resultado
      THEN a.importe * a.cuota - a.importe
      ELSE -a.importe END
  FROM jornadas j
  WHERE a.jornada = p_jornada AND a.tipo = 'resultado' AND j.numero = p_jornada
    AND j.resultado IS NOT NULL AND NOT a.resuelto;

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

  -- Power-up "doble ganancia": TODAS las apuestas acertadas de esa
  -- jornada duplican su ganancia neta. Corre después de los 4 bloques de
  -- arriba (que acaban de fijar `ganancia`) y antes de financiar la
  -- siguiente jornada (que suma `ganancia`).
  UPDATE apuestas a SET ganancia = a.ganancia * 2
  FROM powerups_aplicados pa
  WHERE pa.usuario_id = a.usuario_id AND pa.jornada = a.jornada
    AND pa.tipo = 'doble_ganancia' AND a.jornada = p_jornada
    AND a.resuelto AND a.ganancia > 0;

  -- Power-up "apuesta sin riesgo": ninguna apuesta fallada de esa jornada
  -- resta el importe (no toca `acierto`, sigue registrado como fallo).
  UPDATE apuestas a SET ganancia = 0
  FROM powerups_aplicados pa
  WHERE pa.usuario_id = a.usuario_id AND pa.jornada = a.jornada
    AND pa.tipo = 'apuesta_sin_riesgo' AND a.jornada = p_jornada
    AND a.resuelto AND a.ganancia < 0;

  -- Financia el presupuesto de la jornada siguiente con la ganancia neta
  -- de apuestas (ya ajustada por los power-ups de arriba), solo si esa
  -- jornada ya existe.
  IF EXISTS (SELECT 1 FROM jornadas WHERE numero = p_jornada + 1) THEN
    INSERT INTO presupuestos (usuario_id, jornada, presupuesto)
    SELECT a.usuario_id, p_jornada + 1, GREATEST(0, 1000 + COALESCE(SUM(a.ganancia), 0))
    FROM apuestas a
    WHERE a.jornada = p_jornada AND a.resuelto
    GROUP BY a.usuario_id
    ON CONFLICT (usuario_id, jornada) DO UPDATE SET presupuesto = EXCLUDED.presupuesto;
  END IF;

  UPDATE jornadas SET finalizado = true WHERE numero = p_jornada;

  -- Token de cadencia: cada 3 jornadas RESUELTAS (no cada 3 números de
  -- jornada), para todos los usuarios a la vez. Va DESPUÉS del UPDATE de
  -- arriba para que la propia jornada actual cuente en el recuento.
  IF (SELECT count(*) FROM jornadas WHERE finalizado = true) % 3 = 0 THEN
    INSERT INTO powerups_usuario (usuario_id, tipo, disponibles)
    SELECT id, (ARRAY['puntos_extra','blindaje','presupuesto_extra',
                       'doble_ganancia','apuesta_sin_riesgo','capitan_tardio'])
                [1 + floor(random() * 6)::int], 1
    FROM usuarios
    ON CONFLICT (usuario_id, tipo) DO UPDATE SET disponibles = powerups_usuario.disponibles + 1;
  END IF;

  -- Token de racha: por usuario, si tuvo >=1 acierto de apuesta en la
  -- jornada RESUELTA inmediatamente anterior (en orden, no en número) Y
  -- en la que se acaba de resolver.
  SELECT max(numero) INTO v_jornada_anterior
  FROM jornadas WHERE finalizado = true AND numero < p_jornada;

  IF v_jornada_anterior IS NOT NULL THEN
    INSERT INTO powerups_usuario (usuario_id, tipo, disponibles)
    SELECT DISTINCT a1.usuario_id,
      (ARRAY['puntos_extra','blindaje','presupuesto_extra',
             'doble_ganancia','apuesta_sin_riesgo','capitan_tardio'])
      [1 + floor(random() * 6)::int], 1
    FROM apuestas a1
    WHERE a1.jornada = p_jornada AND a1.acierto = true
      AND EXISTS (
        SELECT 1 FROM apuestas a2
        WHERE a2.usuario_id = a1.usuario_id AND a2.jornada = v_jornada_anterior
          AND a2.acierto = true
      )
    ON CONFLICT (usuario_id, tipo) DO UPDATE SET disponibles = powerups_usuario.disponibles + 1;
  END IF;
END $$;

REVOKE ALL ON FUNCTION resolver_jornada(integer) FROM public;
GRANT EXECUTE ON FUNCTION resolver_jornada(integer) TO authenticated, service_role;
