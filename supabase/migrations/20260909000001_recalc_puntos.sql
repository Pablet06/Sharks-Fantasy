-- Migration: recalc_puntos
-- Single source of truth for rebuilding accumulated stats + user points from
-- historial, callable by the admin panel. Mirrors scraper/src/sync.ts recalc().
-- goles_contra is a per-match figure: forced to 0 in the accumulation.

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

  -- Per-user points: sum historial.puntos over the user's equipo (numero[]).
  UPDATE usuarios u SET puntos = COALESCE(sub.p, 0)
  FROM (
    SELECT u2.id, SUM(h.puntos) AS p
    FROM usuarios u2
    LEFT JOIN jugadores j ON j.numero = ANY(u2.equipo)
    LEFT JOIN historial h ON h.jugador_id = j.id
    GROUP BY u2.id
  ) sub
  WHERE u.id = sub.id;
END $$;

REVOKE ALL ON FUNCTION recalc_puntos() FROM public;
GRANT EXECUTE ON FUNCTION recalc_puntos() TO authenticated;
