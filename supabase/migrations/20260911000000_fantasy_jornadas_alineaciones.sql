-- Migration: fantasy_jornadas_alineaciones
-- Foundation for the season 26-27 dynamic fantasy overhaul (see
-- docs/superpowers/specs/2026-09-11-fantasy-dinamico-design.md, Subproyecto A).
-- Adds a per-jornada fixture/result table and a per-(usuario, jornada) frozen
-- lineup, replacing the old model where usuarios.equipo/puntos recompute
-- retroactively over "whatever team you have right now".

CREATE TABLE jornadas (
  numero        integer PRIMARY KEY,
  fecha_partido timestamptz,
  resultado     text CHECK (resultado IN ('gana','pierde','empata')),
  goles_favor   integer,
  goles_contra  integer,
  finalizado    boolean NOT NULL DEFAULT false
);

ALTER TABLE jornadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY jornadas_select ON jornadas
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY jornadas_admin_write ON jornadas
  FOR ALL TO authenticated
  USING     (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));

CREATE TABLE alineaciones (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id        uuid NOT NULL REFERENCES usuarios(id),
  jornada           integer NOT NULL REFERENCES jornadas(numero),
  jugadores         integer[],
  capitan           integer,
  presupuesto_usado numeric,
  puntos_jornada    integer,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  actualizado_en    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, jornada)
);

ALTER TABLE alineaciones ENABLE ROW LEVEL SECURITY;

-- Transparencia: cualquiera puede ver la alineación de cualquiera, igual que
-- hoy usuarios.equipo es público (Ranking > ver equipo).
CREATE POLICY alineaciones_select ON alineaciones
  FOR SELECT TO anon, authenticated
  USING (true);

-- El dueño solo puede crear/editar/borrar su propia fila, y solo mientras
-- falten más de 24h para el partido de esa jornada (o no se conozca la
-- fecha todavía — ver riesgo en el spec: el admin la rellena a mano).
CREATE POLICY alineaciones_owner_write ON alineaciones
  FOR ALL TO authenticated
  USING (
    usuario_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM jornadas j
      WHERE j.numero = alineaciones.jornada
        AND (j.fecha_partido IS NULL OR now() < j.fecha_partido - interval '24 hours')
    )
  )
  WITH CHECK (
    usuario_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM jornadas j
      WHERE j.numero = alineaciones.jornada
        AND (j.fecha_partido IS NULL OR now() < j.fecha_partido - interval '24 hours')
    )
  );

CREATE POLICY alineaciones_admin_all ON alineaciones
  FOR ALL TO authenticated
  USING     (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));
