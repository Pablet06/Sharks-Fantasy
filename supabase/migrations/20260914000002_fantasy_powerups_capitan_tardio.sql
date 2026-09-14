-- Migration: fantasy_powerups_capitan_tardio
-- Fase D del fantasy dinámico: el power-up "capitán tardío" abre una
-- ventana adicional (hasta 1h antes del partido, en vez de las 24h
-- generales) para cambiar SOLO el capitán de una alineación ya cerrada.
--
-- Postgres OR-ea entre sí las policies permisivas del mismo comando: esta
-- policy nueva coexiste con `alineaciones_owner_write` (Fase A/B) sin
-- tocarla -- una escritura pasa RLS si CUALQUIERA de las dos la admite. El
-- trigger de abajo es quien de verdad limita el efecto a solo `capitan`
-- cuando la escritura entra por esta puerta y no por la general.

CREATE POLICY alineaciones_owner_write_tardio ON alineaciones
  FOR UPDATE TO authenticated
  USING (
    usuario_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM jornadas j
      WHERE j.numero = alineaciones.jornada
        AND j.fecha_partido IS NOT NULL
        AND now() < j.fecha_partido - interval '1 hour'
    )
    AND EXISTS (
      SELECT 1 FROM powerups_aplicados pa
      WHERE pa.usuario_id = alineaciones.usuario_id
        AND pa.jornada = alineaciones.jornada
        AND pa.tipo = 'capitan_tardio'
    )
  )
  WITH CHECK (
    usuario_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM jornadas j
      WHERE j.numero = alineaciones.jornada
        AND j.fecha_partido IS NOT NULL
        AND now() < j.fecha_partido - interval '1 hour'
    )
    AND EXISTS (
      SELECT 1 FROM powerups_aplicados pa
      WHERE pa.usuario_id = alineaciones.usuario_id
        AND pa.jornada = alineaciones.jornada
        AND pa.tipo = 'capitan_tardio'
    )
  );

-- Revierte `jugadores`/`presupuesto_usado` a su valor anterior cuando la
-- escritura llega pasado el cierre general de 24h -- deja pasar tal cual
-- si todavía estamos dentro del cierre normal (ahí ya manda
-- alineaciones_owner_write) o si el actor es admin/service-role.
CREATE OR REPLACE FUNCTION alineaciones_limitar_capitan_tardio()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_fecha timestamptz;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_admin(auth.uid()) THEN
    SELECT fecha_partido INTO v_fecha FROM jornadas WHERE numero = NEW.jornada;
    IF v_fecha IS NOT NULL AND now() >= v_fecha - interval '24 hours' THEN
      NEW.jugadores := OLD.jugadores;
      NEW.presupuesto_usado := OLD.presupuesto_usado;
      NEW.puntos_jornada := OLD.puntos_jornada;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER alineaciones_before_update_capitan_tardio
BEFORE UPDATE ON alineaciones
FOR EACH ROW EXECUTE FUNCTION alineaciones_limitar_capitan_tardio();
