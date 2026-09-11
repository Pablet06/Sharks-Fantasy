-- Migration: fantasy_dinamico_hardening
-- Post-final-review hardening pass for the Fase A fantasy dinamico branch
-- (feature/fantasy-dinamico-fase-a). Corrects three findings from the final
-- whole-branch review over 20260911000000/20260911000001, already applied
-- to prod:
--   C1 (critical): alineaciones_owner_write failed OPEN when fecha_partido
--     was unknown (NULL), letting a lineup be written/edited with no
--     deadline at all. Now fails CLOSED: writes require a known
--     fecha_partido more than 24h away.
--   C1 (continued): resolver_jornada had no guard against resolving a
--     jornada with no historial yet, and unconditionally overwrote
--     usuarios.puntos from `alineaciones` — but nothing populates
--     `alineaciones` in Fase A (no draft UI), so that UPDATE can only stomp
--     the real season score (still driven by the equipo/recalc() model)
--     with test/fraudulent data. Added a historial-guard no-op and disabled
--     the usuarios.puntos UPDATE (commented, not deleted) until Fase B.
--   I1 (important): the "incomplete lineup -> 0 points" check used
--     array_length(al.jugadores, 1) = 7, which a 7-element array with a
--     duplicate or unresolved dorsal would still satisfy while the JOINs
--     silently produced fewer than 7 scored rows (partial credit for an
--     invalid lineup). Replaced with HAVING count(DISTINCT j.numero) = 7 on
--     the scoring subquery so scoring requires exactly 7 distinct dorsals
--     that actually resolved to real players+historial for that jornada.
--
-- presupuesto_actual() and the jornadas/alineaciones/presupuestos table
-- definitions are unaffected and not touched here.

DROP POLICY IF EXISTS alineaciones_owner_write ON alineaciones;

CREATE POLICY alineaciones_owner_write ON alineaciones
  FOR ALL TO authenticated
  USING (
    usuario_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM jornadas j
      WHERE j.numero = alineaciones.jornada
        AND j.fecha_partido IS NOT NULL
        AND now() < j.fecha_partido - interval '24 hours'
    )
  )
  WITH CHECK (
    usuario_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM jornadas j
      WHERE j.numero = alineaciones.jornada
        AND j.fecha_partido IS NOT NULL
        AND now() < j.fecha_partido - interval '24 hours'
    )
  );

-- Congela los puntos de cada alineación de la jornada N. La llama el
-- scraper (service role: auth.uid() resuelve NULL, se deja pasar) justo
-- después de escribir el historial de esa jornada, o el admin a mano desde
-- AdminView para reprocesar.
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

  -- No-op si la jornada todavía no tiene historial real que puntuar (evita
  -- que el botón de "reprocesar" del admin, o cualquier llamada automática
  -- futura, resuelva una jornada sin nada que puntuar).
  IF NOT EXISTS (SELECT 1 FROM historial WHERE jornada = p_jornada) THEN
    RETURN;
  END IF;

  -- Alineaciones completas (exactamente 7 dorsales DISTINCT que resuelven a
  -- jugador + historial de esa jornada): puntos = suma de historial.puntos,
  -- doble para el capitán.
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

  -- Alineaciones incompletas de esa jornada (NULL, <7, dorsales duplicados,
  -- o jugadores que no resolvieron ningún historial): 0 puntos, sin
  -- puntuación parcial.
  UPDATE alineaciones SET puntos_jornada = 0, actualizado_en = now()
  WHERE jornada = p_jornada AND puntos_jornada IS NULL;

  -- Deshabilitado en Fase A: nada usa `alineaciones` todavía (sin UI de
  -- draft), así que esta UPDATE solo puede pisar el usuarios.puntos real del
  -- modelo equipo/recalc() con datos de prueba o fraudulentos. Fase B debe
  -- volver a activar este bloque en el mismo commit en que quite la llamada
  -- a recalc() de scraper/src/sync.ts runSync().
  --
  -- UPDATE usuarios u SET puntos = COALESCE(sub.total, 0)
  -- FROM (
  --   SELECT usuario_id, SUM(puntos_jornada) AS total
  --   FROM alineaciones
  --   WHERE puntos_jornada IS NOT NULL
  --   GROUP BY usuario_id
  -- ) sub
  -- WHERE u.id = sub.usuario_id;

  UPDATE jornadas SET finalizado = true WHERE numero = p_jornada;
END $$;

REVOKE ALL ON FUNCTION resolver_jornada(integer) FROM public;
GRANT EXECUTE ON FUNCTION resolver_jornada(integer) TO authenticated, service_role;
