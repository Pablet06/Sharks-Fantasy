-- Migration: fantasy_powerups
-- Fase D del fantasy dinámico: power-ups recargables.
-- Ver docs/superpowers/specs/2026-09-11-fantasy-dinamico-design.md, Subproyecto D.
--
-- Gastar un token nunca lo decide el cliente: el trigger BEFORE INSERT de
-- esta migración decrementa powerups_usuario.disponibles de forma atómica
-- y rechaza la operación si no queda ninguno, dentro de la misma
-- transacción que registra el uso. El efecto inmediato de
-- presupuesto_extra vive en el mismo trigger porque no depende de que se
-- resuelva la jornada (a diferencia de los otros 5 tipos, resueltos en
-- resolver_jornada en la Task 2).

CREATE TABLE powerups_usuario (
  usuario_id  uuid NOT NULL REFERENCES usuarios(id),
  tipo        text NOT NULL CHECK (tipo IN (
    'puntos_extra','blindaje','presupuesto_extra',
    'doble_ganancia','apuesta_sin_riesgo','capitan_tardio'
  )),
  disponibles integer NOT NULL DEFAULT 0 CHECK (disponibles >= 0),
  PRIMARY KEY (usuario_id, tipo)
);

ALTER TABLE powerups_usuario ENABLE ROW LEVEL SECURITY;

CREATE POLICY powerups_usuario_select ON powerups_usuario
  FOR SELECT TO authenticated
  USING (
    usuario_id = (SELECT auth.uid())
    OR is_admin((SELECT auth.uid()))
  );

-- Sin policy de escritura para el dueño: el inventario solo cambia por
-- resolver_jornada() (conceder tokens) o por powerups_aplicar() (gastar
-- uno), ambos SECURITY DEFINER, nunca por una escritura directa del
-- cliente.
CREATE POLICY powerups_usuario_admin_all ON powerups_usuario
  FOR ALL TO authenticated
  USING     (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));

CREATE TABLE powerups_aplicados (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id  uuid NOT NULL REFERENCES usuarios(id),
  jornada     integer NOT NULL REFERENCES jornadas(numero),
  tipo        text NOT NULL CHECK (tipo IN (
    'puntos_extra','blindaje','presupuesto_extra',
    'doble_ganancia','apuesta_sin_riesgo','capitan_tardio'
  )),
  objetivo    integer,
  aplicado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, jornada),
  CONSTRAINT powerups_aplicados_objetivo_forma CHECK (
    (tipo IN ('puntos_extra','blindaje') AND objetivo IS NOT NULL)
    OR (tipo NOT IN ('puntos_extra','blindaje') AND objetivo IS NULL)
  )
);

ALTER TABLE powerups_aplicados ENABLE ROW LEVEL SECURITY;

CREATE POLICY powerups_aplicados_select ON powerups_aplicados
  FOR SELECT TO authenticated
  USING (
    usuario_id = (SELECT auth.uid())
    OR is_admin((SELECT auth.uid()))
  );

-- Solo INSERT para el dueño (sin UPDATE/DELETE): aplicar un power-up es
-- un gesto de un solo uso, no editable, y solo mientras falten más de 24h
-- para el partido de esa jornada (mismo criterio que
-- alineaciones_owner_write/apuestas_owner_write). La excepción de
-- capitan_tardio vive en una policy de `alineaciones` (Task 3), no aquí.
CREATE POLICY powerups_aplicados_owner_insert ON powerups_aplicados
  FOR INSERT TO authenticated
  WITH CHECK (
    usuario_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM jornadas j
      WHERE j.numero = powerups_aplicados.jornada
        AND j.fecha_partido IS NOT NULL
        AND now() < j.fecha_partido - interval '24 hours'
    )
  );

CREATE POLICY powerups_aplicados_admin_all ON powerups_aplicados
  FOR ALL TO authenticated
  USING     (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));

-- Gasta el token atómicamente (rechaza si no queda ninguno) y aplica el
-- efecto inmediato de presupuesto_extra. Los otros 5 tipos se resuelven
-- en resolver_jornada() (Task 2).
CREATE OR REPLACE FUNCTION powerups_aplicar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE powerups_usuario SET disponibles = disponibles - 1
  WHERE usuario_id = NEW.usuario_id AND tipo = NEW.tipo AND disponibles > 0;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'powerups_aplicados: no tienes ningún power-up de tipo % disponible', NEW.tipo;
  END IF;

  IF NEW.tipo = 'presupuesto_extra' THEN
    INSERT INTO presupuestos (usuario_id, jornada, presupuesto)
    VALUES (NEW.usuario_id, NEW.jornada, 1050)
    ON CONFLICT (usuario_id, jornada) DO UPDATE SET presupuesto = presupuestos.presupuesto + 50;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER powerups_aplicados_before_insert
BEFORE INSERT ON powerups_aplicados
FOR EACH ROW EXECUTE FUNCTION powerups_aplicar();
