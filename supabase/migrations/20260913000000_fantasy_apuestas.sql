-- Migration: fantasy_apuestas
-- Fase C del fantasy dinámico: apuestas con cuotas automáticas.
-- Ver docs/superpowers/specs/2026-09-11-fantasy-dinamico-design.md, Subproyecto C.
--
-- La cuota NUNCA la manda el cliente: un trigger BEFORE INSERT la calcula
-- con cuota_actual(), la misma función que el frontend llama por RPC para
-- previsualizarla antes de apostar. Cerrar esto en el servidor evita que
-- una llamada directa a la API falsifique una cuota y fuerce una ganancia.

CREATE TABLE apuestas (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id  uuid NOT NULL REFERENCES usuarios(id),
  jornada     integer NOT NULL REFERENCES jornadas(numero),
  tipo        text NOT NULL CHECK (tipo IN ('resultado','goleador','expulsado','porteria')),
  seleccion   text NOT NULL,
  importe     numeric NOT NULL CHECK (importe > 0),
  cuota       numeric,
  resuelto    boolean NOT NULL DEFAULT false,
  acierto     boolean,
  ganancia    numeric,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, jornada, tipo)
);

-- Fix (revisión final, hallazgo I1): sin esto, una seleccion no numérica en
-- goleador/expulsado revienta el cast `::int` dentro de resolver_jornada()
-- y aborta la transacción ENTERA — incluida la puntuación de alineaciones
-- de esa jornada.
ALTER TABLE apuestas ADD CONSTRAINT apuestas_seleccion_forma CHECK (
  (tipo = 'resultado' AND seleccion IN ('gana','pierde','empata'))
  OR (tipo = 'porteria' AND seleccion = 'si')
  OR (tipo IN ('goleador','expulsado') AND seleccion ~ '^[0-9]+$')
);

ALTER TABLE apuestas ENABLE ROW LEVEL SECURITY;

-- Privadas siempre: ni pública ni "visible una vez resuelta" como
-- alineaciones — solo el dueño y el admin, punto.
CREATE POLICY apuestas_select ON apuestas
  FOR SELECT TO authenticated
  USING (
    usuario_id = (SELECT auth.uid())
    OR is_admin((SELECT auth.uid()))
  );

-- El dueño solo puede crear/editar/borrar su propia fila, y solo mientras
-- falten más de 24h para el partido de esa jornada (mismo criterio que
-- alineaciones_owner_write).
CREATE POLICY apuestas_owner_write ON apuestas
  FOR ALL TO authenticated
  USING (
    usuario_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM jornadas j
      WHERE j.numero = apuestas.jornada
        AND j.fecha_partido IS NOT NULL
        AND now() < j.fecha_partido - interval '24 hours'
    )
  )
  WITH CHECK (
    usuario_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM jornadas j
      WHERE j.numero = apuestas.jornada
        AND j.fecha_partido IS NOT NULL
        AND now() < j.fecha_partido - interval '24 hours'
    )
  );

CREATE POLICY apuestas_admin_all ON apuestas
  FOR ALL TO authenticated
  USING     (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));

-- Probabilidad implícita del histórico de toda la temporada hasta la
-- jornada anterior (p_jornada excluida), invertida y acotada a 1.2x-2.1x.
-- Sin histórico todavía, probabilidad neutra de 0.5.
CREATE OR REPLACE FUNCTION cuota_actual(p_tipo text, p_seleccion text, p_jornada integer)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_num  integer;
  v_den  integer;
  v_prob numeric;
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

  v_prob := CASE WHEN v_den IS NULL OR v_den = 0 THEN 0.5 ELSE v_num::numeric / v_den END;
  IF v_prob <= 0 THEN RETURN 2.1; END IF;
  RETURN LEAST(2.1, GREATEST(1.2, round(1 / v_prob, 2)));
END $$;

GRANT EXECUTE ON FUNCTION cuota_actual(text, text, integer) TO authenticated;

-- Fix (revisión final, hallazgo C1): sin esta comprobación, el tope del
-- 20% del presupuesto (validarApuestas en el frontend) es puramente
-- cosmético — una llamada directa a la API con un importe enorme pasaba
-- sin límite real, fabricando presupuesto para la jornada siguiente sin
-- techo.
CREATE OR REPLACE FUNCTION apuestas_fijar_cuota()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.cuota := cuota_actual(NEW.tipo, NEW.seleccion, NEW.jornada);

  IF auth.uid() IS NOT NULL AND NOT is_admin(auth.uid()) THEN
    -- Excluye filas del mismo tipo: en un INSERT genuino no puede existir
    -- ninguna (UNIQUE usuario_id,jornada,tipo), y en un upsert que resuelve
    -- como UPDATE (ON CONFLICT) esta es justo la fila que se va a
    -- sustituir -- sin esto se contaba dos veces al reeditar una apuesta
    -- ya existente (Postgres dispara BEFORE INSERT sobre la fila
    -- propuesta ANTES de comprobar el conflicto ON CONFLICT).
    IF (SELECT COALESCE(SUM(importe), 0) FROM apuestas
        WHERE usuario_id = NEW.usuario_id AND jornada = NEW.jornada AND tipo != NEW.tipo)
       + NEW.importe > presupuesto_actual(NEW.usuario_id, NEW.jornada) * 0.2 THEN
      RAISE EXCEPTION 'apuestas: el total apostado supera el 20%% del presupuesto';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER apuestas_before_insert
BEFORE INSERT ON apuestas
FOR EACH ROW EXECUTE FUNCTION apuestas_fijar_cuota();

-- Fix (revisión Task 1): apuestas_owner_write es FOR ALL sin restricción de
-- columnas, así que sin este trigger un dueño podría hacer un UPDATE directo
-- (fuera de la app) y escribir a mano cuota/resuelto/acierto/ganancia antes
-- del cierre de 24h. Mismo patrón de guarda que resolver_jornada: deja pasar
-- sin tocar a admin y al service-role/scraper (auth.uid() IS NULL), revierte
-- las columnas protegidas a su valor anterior para cualquier otro actor.
--
-- Fix (revisión final, hallazgos C1+C2): el upsert de la app (onConflict
-- usuario_id,jornada,tipo) resuelve como UPDATE cuando ya existe una fila
-- para ese tipo, y ese UPDATE no incluye `cuota` en su payload — así que
-- sin recalcularla aquí, cambiar de selección (p.ej. de "empata" a "gana")
-- conservaba la cuota fijada para la selección ANTERIOR. Ahora se
-- recalcula si tipo/seleccion/jornada cambian, y se revalida también aquí
-- el tope del 20% (el importe sí puede cambiar en un UPDATE).
CREATE OR REPLACE FUNCTION apuestas_proteger_columnas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_admin(auth.uid()) THEN
    IF NEW.tipo IS DISTINCT FROM OLD.tipo
       OR NEW.seleccion IS DISTINCT FROM OLD.seleccion
       OR NEW.jornada IS DISTINCT FROM OLD.jornada THEN
      NEW.cuota := cuota_actual(NEW.tipo, NEW.seleccion, NEW.jornada);
    ELSE
      NEW.cuota := OLD.cuota;
    END IF;
    NEW.resuelto := OLD.resuelto;
    NEW.acierto := OLD.acierto;
    NEW.ganancia := OLD.ganancia;

    IF (SELECT COALESCE(SUM(importe), 0) FROM apuestas
        WHERE usuario_id = NEW.usuario_id AND jornada = NEW.jornada AND id != NEW.id)
       + NEW.importe > presupuesto_actual(NEW.usuario_id, NEW.jornada) * 0.2 THEN
      RAISE EXCEPTION 'apuestas: el total apostado supera el 20%% del presupuesto';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER apuestas_before_update
BEFORE UPDATE ON apuestas
FOR EACH ROW EXECUTE FUNCTION apuestas_proteger_columnas();
