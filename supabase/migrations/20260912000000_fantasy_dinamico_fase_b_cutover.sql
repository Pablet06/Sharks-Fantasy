-- Migration: fantasy_dinamico_fase_b_cutover
-- Fase B del fantasy dinámico: corte limpio con el modelo usuarios.equipo.
-- Ver docs/superpowers/specs/2026-09-11-fantasy-dinamico-design.md, Subproyecto B.
--
-- 1. alineaciones_select deja de ser pública sin condiciones: el dueño y el
--    admin ven siempre su fila; cualquier otro usuario (o una llamada
--    anónima a la API) solo la ve una vez resuelta. Evita copiar picks
--    ajenos antes del cierre de la jornada.
-- 2. resolver_jornada() reactiva el bloque de usuarios.puntos que la
--    migración de endurecimiento de Fase A dejó comentado a propósito —
--    ahora sí hay una UI de draft real escribiendo en alineaciones, así que
--    ya no es solo un riesgo de pisar datos de prueba sobre datos reales.
--    Se activa en el mismo cambio (Task 3 de este plan) que quita la
--    llamada a recalc() del scraper — nunca deben convivir las dos fuentes
--    de verdad escribiendo la misma columna a la vez.

DROP POLICY IF EXISTS alineaciones_select ON alineaciones;

CREATE POLICY alineaciones_select ON alineaciones
  FOR SELECT TO anon, authenticated
  USING (
    puntos_jornada IS NOT NULL
    OR usuario_id = (SELECT auth.uid())
    OR is_admin((SELECT auth.uid()))
  );

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

  UPDATE jornadas SET finalizado = true WHERE numero = p_jornada;
END $$;

REVOKE ALL ON FUNCTION resolver_jornada(integer) FROM public;
GRANT EXECUTE ON FUNCTION resolver_jornada(integer) TO authenticated, service_role;

-- Finding 1 (final review, fase B): recalc_puntos() still recomputed
-- usuarios.puntos from the retired usuarios.equipo model, double-writing
-- the same column resolver_jornada() now owns exclusively. Re-declared here
-- identical to 20260909000001_recalc_puntos.sql minus that final block —
-- the jugadores.stats accumulation (still correct/needed) is untouched.
CREATE OR REPLACE FUNCTION recalc_puntos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'recalc_puntos: solo admin';
  END IF;

  -- Accumulated per-player stats from historial. goles_contra -> 0.
  UPDATE jugadores j SET stats = COALESCE(sub.tot, '{
    "partidos":0,"goles":0,"goles_penalti":0,"penaltis_fallados":0,
    "faltas_penalti":0,"tarjetas":0,"expulsiones":0,"expulsiones_graves":0,
    "goles_contra":0}'::jsonb)
  FROM (
    SELECT h.jugador_id,
      jsonb_build_object(
        'partidos',           SUM((h.stats->>'partidos')::int),
        'goles',              SUM((h.stats->>'goles')::int),
        'goles_penalti',      SUM((h.stats->>'goles_penalti')::int),
        'penaltis_fallados',  SUM((h.stats->>'penaltis_fallados')::int),
        'faltas_penalti',     SUM((h.stats->>'faltas_penalti')::int),
        'tarjetas',           SUM((h.stats->>'tarjetas')::int),
        'expulsiones',        SUM((h.stats->>'expulsiones')::int),
        'expulsiones_graves', SUM((h.stats->>'expulsiones_graves')::int),
        'goles_contra',       0
      ) AS tot
    FROM historial h
    GROUP BY h.jugador_id
  ) sub
  WHERE j.id = sub.jugador_id;

  -- Players with no historial rows this season: zero them.
  UPDATE jugadores j SET stats = '{
    "partidos":0,"goles":0,"goles_penalti":0,"penaltis_fallados":0,
    "faltas_penalti":0,"tarjetas":0,"expulsiones":0,"expulsiones_graves":0,
    "goles_contra":0}'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM historial h WHERE h.jugador_id = j.id);
END $$;

REVOKE ALL ON FUNCTION recalc_puntos() FROM public;
GRANT EXECUTE ON FUNCTION recalc_puntos() TO authenticated;
