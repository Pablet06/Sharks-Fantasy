-- Migration: alineaciones_no_repetir
-- Regla de repetidos: respecto a tu alineación anterior no puedes repetir el
-- capitán y repites como máximo 4 de los 7 jugadores. Misma regla que
-- validarDraft() en src/lib/draft.ts (4 = MAX_REPETIDOS); este trigger evita
-- saltársela llamando a la API directamente.
--
-- "Anterior" NO es jornada - 1: jornadas.numero es el número de la
-- federación (no consecutivo); el orden del Fantasy es jornadas.orden. La
-- anterior es la alineación del usuario en la jornada con mayor `orden` por
-- debajo de la actual (aunque se saltara alguna). Se compara también con la
-- siguiente (menor `orden` por encima): el scraper escribe el calendario
-- futuro y la RLS deja escribir por API varias jornadas abiertas en cualquier
-- orden. Sin vecina no hay restricción; una vecina con jugadores/capitán NULL
-- no restringe esa parte.
--
-- Exentos: el admin (Admin > Usuarios) y el service role / SQL editor
-- (auth.uid() NULL), mismo patrón que alineaciones_limitar_capitan_tardio.
--
-- Cuándo salta: INSERT o UPDATE OF jugadores, capitan. Cubre el capitán
-- tardío (Draft.tsx hace UPDATE capitan); no salta con el UPDATE de
-- puntos_jornada de resolver_jornada. Un upsert (INSERT ... ON CONFLICT DO
-- UPDATE) pasa por el BEFORE INSERT y por el BEFORE UPDATE con el mismo NEW:
-- mismo resultado. En UPDATE solo se comprueba lo que cambia de verdad (el
-- capitán si cambia el capitán, los repetidos si cambian los jugadores), así
-- que un UPDATE sin cambios no hace nada y un cambio de capitán tardío no lo
-- bloquean unos jugadores que ya no se pueden tocar (p. ej. puestos por el
-- admin).
--
-- Orden: Postgres ejecuta los BEFORE ROW por orden alfabético de nombre:
-- alineaciones_before_update_capitan_tardio (revierte `jugadores` fuera de
-- las 24h) -> alineaciones_composicion -> alineaciones_repeticion. Este ve
-- los jugadores ya revertidos y los errores de composición salen antes.
--
-- No revalida el histórico (J1-J7 ya incumplen la regla porque no existía):
-- solo actúa al escribir y solo mira las dos vecinas de la fila escrita.
--
-- Sin SECURITY DEFINER: lee filas propias (alineaciones_select deja ver
-- siempre las del dueño) y jornadas (lectura pública). Idempotente.
--
-- ponytail: no cubre borrar por API la alineación de en medio (deja
-- contiguas dos sin comparar) ni dos escrituras simultáneas del mismo usuario
-- en jornadas vecinas; la UI no hace ninguna. Si hace falta: trigger AFTER
-- DELETE y pg_advisory_xact_lock por usuario_id.

CREATE OR REPLACE FUNCTION alineaciones_validar_repeticion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ver_capitan   boolean := true;
  v_ver_jugadores boolean := true;
  v_orden         integer;
  v_vecina        record;
  v_rep           integer;
BEGIN
  IF auth.uid() IS NULL OR is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_ver_capitan   := NEW.capitan   IS DISTINCT FROM OLD.capitan;
    v_ver_jugadores := NEW.jugadores IS DISTINCT FROM OLD.jugadores;
    IF NOT (v_ver_capitan OR v_ver_jugadores) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- NULL si la jornada no existe: no hay vecinas y la FK rechaza después.
  SELECT orden INTO v_orden FROM jornadas WHERE numero = NEW.jornada;

  FOR v_vecina IN
    (SELECT 'anterior' AS cual, a.jugadores, a.capitan
       FROM alineaciones a JOIN jornadas j ON j.numero = a.jornada
      WHERE a.usuario_id = NEW.usuario_id AND j.orden < v_orden
      ORDER BY j.orden DESC LIMIT 1)
    UNION ALL
    (SELECT 'siguiente' AS cual, a.jugadores, a.capitan
       FROM alineaciones a JOIN jornadas j ON j.numero = a.jornada
      WHERE a.usuario_id = NEW.usuario_id AND j.orden > v_orden
      ORDER BY j.orden ASC LIMIT 1)
  LOOP
    -- `=` con un NULL en cualquiera de los dos da NULL -> no se considera repetido.
    IF v_ver_capitan AND NEW.capitan = v_vecina.capitan THEN
      RAISE EXCEPTION 'alineacion invalida: no puedes repetir el capitan de tu alineacion %', v_vecina.cual
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_ver_jugadores THEN
      -- unnest(NULL) no da filas y x = ANY(NULL) es NULL: cualquier NULL cuenta 0.
      SELECT count(DISTINCT x) INTO v_rep
        FROM unnest(NEW.jugadores) AS x
       WHERE x = ANY (v_vecina.jugadores);
      IF v_rep > 4 THEN  -- 4 = MAX_REPETIDOS en src/lib/draft.ts
        RAISE EXCEPTION 'alineacion invalida: repites % jugadores de tu alineacion % (maximo 4): cambia al menos 3', v_rep, v_vecina.cual
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS alineaciones_repeticion ON alineaciones;
CREATE TRIGGER alineaciones_repeticion
  BEFORE INSERT OR UPDATE OF jugadores, capitan ON alineaciones
  FOR EACH ROW EXECUTE FUNCTION alineaciones_validar_repeticion();
