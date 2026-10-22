-- Migration: alineaciones_composicion
-- El 7 de una alineación debe ser: 1 Portero, 2 Extremos, 2 Laterales,
-- 1 Boya y 1 Contraboya (7 dorsales distintos, todos existentes). Misma regla
-- que validarDraft() en src/lib/draft.ts; este trigger evita saltársela
-- llamando a la API directamente.
--
-- Solo valida cuando cambia `jugadores` (INSERT, o UPDATE que modifica la
-- lista): el capitán tardío (UPDATE capitan), el resolver (puntos_jornada) y
-- las alineaciones ya guardadas no se ven afectados. Idempotente.

CREATE OR REPLACE FUNCTION composicion_valida(p_jugadores integer[])
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH req(pos, n) AS (
    VALUES ('Portero', 1), ('Extremo', 2), ('Lateral', 2), ('Boya', 1), ('Contraboya', 1)
  ),
  elegidos AS (
    SELECT j.pos FROM jugadores j WHERE j.numero = ANY(p_jugadores)
  )
  SELECT p_jugadores IS NOT NULL
     AND COALESCE(array_length(p_jugadores, 1), 0) = 7
     AND (SELECT count(DISTINCT x) FROM unnest(p_jugadores) AS x) = 7
     AND (SELECT count(*) FROM elegidos) = 7
     AND NOT EXISTS (
       SELECT 1 FROM req r
       WHERE (SELECT count(*) FROM elegidos e WHERE e.pos = r.pos) <> r.n
     );
$$;

CREATE OR REPLACE FUNCTION alineaciones_validar_composicion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.jugadores IS NOT DISTINCT FROM NEW.jugadores THEN
    RETURN NEW;
  END IF;
  IF NOT composicion_valida(NEW.jugadores) THEN
    RAISE EXCEPTION 'alineacion invalida: necesitas 7 jugadores distintos (1 Portero, 2 Extremos, 2 Laterales, 1 Boya y 1 Contraboya)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS alineaciones_composicion ON alineaciones;
CREATE TRIGGER alineaciones_composicion
  BEFORE INSERT OR UPDATE OF jugadores ON alineaciones
  FOR EACH ROW EXECUTE FUNCTION alineaciones_validar_composicion();
