# Fantasy dinámico — Fase D (power-ups) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship power-ups: los usuarios ganan tokens de 6 tipos distintos
(cadencia cada 3 jornadas resueltas + racha de aciertos de apuesta) y
pueden aplicar como mucho uno por jornada, con efectos que van desde sumar
puntos a un jugador hasta modificar la resolución de apuestas o el
presupuesto.

**Architecture:** Dos tablas nuevas (`powerups_usuario` inventario,
`powerups_aplicados` histórico de uso) + un trigger `BEFORE INSERT` en
`powerups_aplicados` que gasta el token atómicamente y aplica el efecto
inmediato de "+50€" + una extensión más de `resolver_jornada()` (mismo
patrón de capas que Fases B→C) que aplica "+2 puntos"/"blindaje" a
`alineaciones.puntos_jornada`, "doble ganancia"/"apuesta sin riesgo" a
`apuestas.ganancia`, y concede los tokens nuevos al final + una policy y
trigger extra sobre `alineaciones` para la excepción de "Capitán tardío".
Frontend: pestaña nueva "Power-ups" + una modificación de `Draft.tsx` para
la ventana extendida del capitán.

**Tech Stack:** Supabase Postgres (SQL, RLS, PL/pgSQL, triggers), React 19 + TypeScript frontend (Vitest).

**Spec:** `docs/superpowers/specs/2026-09-11-fantasy-dinamico-design.md` (Subproyecto D)

## Global Constraints

- 6 tipos de power-up: `puntos_extra`, `blindaje`, `presupuesto_extra`,
  `doble_ganancia`, `apuesta_sin_riesgo`, `capitan_tardio`.
- Como mucho 1 power-up aplicado por usuario y jornada
  (`UNIQUE(usuario_id, jornada)` en `powerups_aplicados`).
- Ventana de aplicación: la misma de 24h antes del partido que ya rige
  alineaciones/apuestas — salvo el propio efecto de `capitan_tardio`, que
  abre una ventana adicional hasta 1h antes SOLO para el campo `capitan`.
- Objetivo (dorsal) obligatorio para `puntos_extra`/`blindaje`, prohibido
  para los otros 4 tipos — enforced con un `CHECK`.
- Se gana 1 token de tipo aleatorio para TODOS los usuarios cada 3
  jornadas RESUELTAS en orden (no cada 3 números de jornada), evaluado
  DESPUÉS de marcar la jornada actual como `finalizado = true`.
- Se gana 1 token aleatorio extra, individual, para cualquier usuario con
  al menos un acierto de apuesta en la jornada resuelta inmediatamente
  anterior Y en la que se acaba de resolver.
- `powerups_aplicados` es de solo inserción para el dueño — no hay
  UPDATE/DELETE por policy (decisión explícita: aplicar un power-up es un
  gesto de un solo uso, no editable). El admin sí puede todo vía
  `FOR ALL`.
- Gastar un token (`powerups_usuario.disponibles -= 1`) ocurre siempre
  dentro de un trigger `SECURITY DEFINER` en el propio INSERT de
  `powerups_aplicados`, nunca confiado al cliente — rechaza la operación
  si `disponibles <= 0`.
- "+50€" se aplica al instante al redimirlo (mismo trigger de INSERT),
  no espera a `resolver_jornada`.
- "Doble ganancia"/"apuesta sin riesgo" se aplican sobre TODAS las
  apuestas de esa jornada (no una elegida), después de que los 4 bloques
  de resolución de apuestas de Fase C ya hayan calculado su `ganancia`, y
  ANTES del bloque que financia el presupuesto de la siguiente jornada
  (que suma `ganancia`).
- "+2 puntos"/"blindaje" se aplican ENTRE el `UPDATE` de puntuación normal
  de alineaciones y el `UPDATE` que pone a 0 las alineaciones incompletas
  — así un equipo incompleto (`puntos_jornada` sigue `NULL` en ese punto)
  nunca se ve "rescatado" por el power-up.
- La fórmula de "blindaje" (`tarjetas*3 + expulsiones*1 +
  expulsiones_graves*5`) duplica a mano las constantes de
  `scraper/src/points.ts::calcMatchPoints` — cualquier cambio de esa
  fórmula debe reflejarse aquí también (ver nota de sincronización en el
  spec).
- **Caveat documentado, no bloqueante**: el frontend valida que el
  `objetivo` de "+2 puntos"/"blindaje" sea uno de los 7 jugadores de la
  alineación del usuario esa jornada, pero esto NO se repite en el
  servidor — si un cliente manipulado manda un `objetivo` fuera de esa
  alineación, el power-up simplemente no tiene efecto (el `JOIN` en
  `resolver_jornada` no encuentra fila que actualizar), gastando el token
  sin beneficio. Es un auto-perjuicio, no un vector de trampa — mismo
  criterio ya aceptado para `presupuesto_usado` en Fase B.
- Sin ramas de Supabase (plan Free) — igual que en Fases A, B y C, el
  controlador aplica las migraciones a prod con confirmación explícita del
  usuario; ningún implementador de tarea llama a un MCP de Supabase.

---

### Task 1: Migración — tablas `powerups_usuario`/`powerups_aplicados`, RLS, trigger de gasto+efecto inmediato

**Files:**
- Create: `supabase/migrations/20260914000000_fantasy_powerups.sql`

**Interfaces:**
- Consumes: `usuarios`, `jornadas`, `presupuestos`, `is_admin(uuid)` (ya en prod).
- Produces: tablas `powerups_usuario(usuario_id, tipo, disponibles)` y
  `powerups_aplicados(id, usuario_id, jornada, tipo, objetivo,
  aplicado_en)`; función/trigger `powerups_aplicar()` que gasta el token y
  aplica el efecto inmediato de `presupuesto_extra`. Task 2 (resolver) y
  el frontend (Task 4/5) los usan.

**El implementador de esta tarea escribe y commitea el fichero `.sql` — NO
llama a ningún MCP de Supabase.** El controlador lo aplica a prod en la
Task 8, con confirmación del usuario.

- [ ] **Step 1: Crear el fichero de migración**

```sql
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
```

- [ ] **Step 2: Commit del fichero (el implementador para aquí)**

```bash
git add supabase/migrations/20260914000000_fantasy_powerups.sql
git commit -m "feat(db): powerups tables + atomic spend trigger + immediate presupuesto_extra effect"
```

Reporta DONE con el path del fichero. La aplicación a prod es la Task 8
(controlador, con confirmación del usuario).

---

### Task 2: Migración — `resolver_jornada()` aplica efectos de power-ups y concede tokens

**Files:**
- Create: `supabase/migrations/20260914000001_fantasy_powerups_resolver.sql`

**Interfaces:**
- Consumes: `powerups_usuario`, `powerups_aplicados` (Task 1), `apuestas`,
  `alineaciones`, `jornadas`, `historial`, `jugadores`, `usuarios` (ya en
  prod desde Fases A-C).
- Produces: `resolver_jornada(integer)` ampliada — mismo nombre y firma,
  se sustituye entera vía `CREATE OR REPLACE`.

**El implementador escribe y commitea el fichero — NO llama a ningún MCP
de Supabase.**

- [ ] **Step 1: Crear el fichero de migración**

```sql
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
    AND a.puntos_jornada IS NOT NULL;

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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260914000001_fantasy_powerups_resolver.sql
git commit -m "feat(db): resolver_jornada applies powerup effects, grants cadence + streak tokens"
```

---

### Task 3: Migración — excepción de RLS "Capitán tardío" sobre `alineaciones`

**Files:**
- Create: `supabase/migrations/20260914000002_fantasy_powerups_capitan_tardio.sql`

**Interfaces:**
- Consumes: `alineaciones`, `powerups_aplicados` (Task 1), `jornadas`,
  `is_admin(uuid)`.
- Produces: policy nueva `alineaciones_owner_write_tardio` + trigger
  `alineaciones_limitar_capitan_tardio` sobre `alineaciones`. La policy
  existente `alineaciones_owner_write` (Fase A/B, ya en prod) NO se toca.

**El implementador escribe y commitea el fichero — NO llama a ningún MCP
de Supabase.**

- [ ] **Step 1: Crear el fichero de migración**

```sql
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
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER alineaciones_before_update_capitan_tardio
BEFORE UPDATE ON alineaciones
FOR EACH ROW EXECUTE FUNCTION alineaciones_limitar_capitan_tardio();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260914000002_fantasy_powerups_capitan_tardio.sql
git commit -m "feat(db): capitan_tardio RLS exception + column-guard trigger on alineaciones"
```

---

### Task 4: Frontend — tipos `PowerupInventario`/`PowerupAplicado` + `validarPowerup`

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/powerups.ts`
- Test: `src/lib/powerups.test.ts`

**Interfaces:**
- Produces: `export interface PowerupInventario { usuario_id: string; tipo:
  TipoPowerup; disponibles: number }`; `export interface PowerupAplicado {
  id: number; usuario_id: string; jornada: number; tipo: TipoPowerup;
  objetivo: number | null; aplicado_en: string }`; `export type
  TipoPowerup = 'puntos_extra' | 'blindaje' | 'presupuesto_extra' |
  'doble_ganancia' | 'apuesta_sin_riesgo' | 'capitan_tardio'`;
  `validarPowerup(tipo: TipoPowerup, objetivo: number | null, misJugadores:
  number[]): { ok: true } | { ok: false; error: string }`. Task 5
  (`Powerups.tsx`) los usa.

- [ ] **Step 1: Añadir los tipos**

Al final de `src/types/index.ts`:

```ts
export type TipoPowerup =
  | 'puntos_extra'
  | 'blindaje'
  | 'presupuesto_extra'
  | 'doble_ganancia'
  | 'apuesta_sin_riesgo'
  | 'capitan_tardio'

export interface PowerupInventario {
  usuario_id: string
  tipo: TipoPowerup
  disponibles: number
}

export interface PowerupAplicado {
  id: number
  usuario_id: string
  jornada: number
  tipo: TipoPowerup
  objetivo: number | null
  aplicado_en: string
}
```

- [ ] **Step 2: Escribir el test que falla**

Crea `src/lib/powerups.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validarPowerup } from './powerups'

describe('validarPowerup', () => {
  it('ok para puntos_extra con objetivo en la alineación', () => {
    expect(validarPowerup('puntos_extra', 7, [1, 7, 12])).toEqual({ ok: true })
  })

  it('ok para presupuesto_extra sin objetivo', () => {
    expect(validarPowerup('presupuesto_extra', null, [1, 7, 12])).toEqual({ ok: true })
  })

  it('falla si puntos_extra/blindaje no traen objetivo', () => {
    expect(validarPowerup('blindaje', null, [1, 7, 12])).toEqual({
      ok: false, error: 'Elige un jugador objetivo.',
    })
  })

  it('falla si el objetivo no está en tu alineación de esta jornada', () => {
    expect(validarPowerup('puntos_extra', 99, [1, 7, 12])).toEqual({
      ok: false, error: 'El jugador objetivo debe estar en tu alineación de esta jornada.',
    })
  })

  it('falla si un tipo sin objetivo trae uno igualmente', () => {
    expect(validarPowerup('doble_ganancia', 7, [1, 7, 12])).toEqual({
      ok: false, error: 'Este power-up no necesita un jugador objetivo.',
    })
  })
})
```

- [ ] **Step 3: Ejecutar y comprobar que falla**

Run: `npx vitest run src/lib/powerups.test.ts`
Expected: FAIL — no se encuentra el módulo `./powerups`.

- [ ] **Step 4: Implementar**

Crea `src/lib/powerups.ts`:

```ts
import type { TipoPowerup } from '../types'

export type ResultadoValidacionPowerup = { ok: true } | { ok: false; error: string }

const REQUIERE_OBJETIVO: TipoPowerup[] = ['puntos_extra', 'blindaje']

/** Un power-up con objetivo (+2 puntos / blindaje) exige un dorsal de la
 * propia alineación de esa jornada; el resto no admite objetivo. */
export function validarPowerup(
  tipo: TipoPowerup,
  objetivo: number | null,
  misJugadores: number[],
): ResultadoValidacionPowerup {
  const requiere = REQUIERE_OBJETIVO.includes(tipo)
  if (requiere && objetivo === null) {
    return { ok: false, error: 'Elige un jugador objetivo.' }
  }
  if (requiere && objetivo !== null && !misJugadores.includes(objetivo)) {
    return { ok: false, error: 'El jugador objetivo debe estar en tu alineación de esta jornada.' }
  }
  if (!requiere && objetivo !== null) {
    return { ok: false, error: 'Este power-up no necesita un jugador objetivo.' }
  }
  return { ok: true }
}
```

- [ ] **Step 5: Ejecutar y comprobar que pasa**

Run: `npx vitest run src/lib/powerups.test.ts`
Expected: PASS, 5 tests en verde.

- [ ] **Step 6: Ejecutar toda la suite del frontend**

Run: `npx vitest run`
Expected: todo en verde.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/lib/powerups.ts src/lib/powerups.test.ts
git commit -m "feat(web): TipoPowerup/PowerupInventario/PowerupAplicado types + validarPowerup"
```

---

### Task 5: Frontend — pantalla `Powerups.tsx`

**Files:**
- Create: `src/components/Dashboard/Powerups.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `jornadaAbierta` (`src/lib/jornada.ts`), `validarPowerup`
  (Task 4), `TipoPowerup`/`PowerupInventario`/`PowerupAplicado`/`Jornada`
  (Task 4 y ya existentes).
- Produces: componente `Powerups` con props `{ usuario: Usuario; jugadores:
  Jugador[] }`. Task 7 lo monta en `Dashboard.tsx`.

No hay test automatizado para el componente (mismo criterio que
`Draft`/`Apuestas`/`Ranking`/`Players` — verificación manual, la lógica no
trivial ya está cubierta por `validarPowerup`).

**Nota para el implementador:** para saber qué 7 jugadores tiene el
usuario esa jornada (para validar el objetivo de +2 puntos/blindaje),
este componente necesita leer la `alineaciones` del usuario para la
jornada abierta — igual que hace `Draft.tsx`, pero de forma independiente
(no comparten estado entre pestañas).

- [ ] **Step 1: Crear `Powerups.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Jugador, Usuario, Jornada, PowerupInventario, PowerupAplicado, TipoPowerup } from '../../types'
import { jornadaAbierta } from '../../lib/jornada'
import { validarPowerup } from '../../lib/powerups'

interface Props {
  usuario: Usuario
  jugadores: Jugador[]
}

const TIPOS: { tipo: TipoPowerup; label: string; requiereObjetivo: boolean }[] = [
  { tipo: 'puntos_extra', label: '+2 puntos a un jugador', requiereObjetivo: true },
  { tipo: 'blindaje', label: 'Blindaje de tarjeta', requiereObjetivo: true },
  { tipo: 'presupuesto_extra', label: '+50€ de presupuesto', requiereObjetivo: false },
  { tipo: 'doble_ganancia', label: 'Doble ganancia en apuestas', requiereObjetivo: false },
  { tipo: 'apuesta_sin_riesgo', label: 'Apuesta sin riesgo', requiereObjetivo: false },
  { tipo: 'capitan_tardio', label: 'Capitán tardío (hasta 1h antes)', requiereObjetivo: false },
]

export function Powerups({ usuario, jugadores }: Props) {
  const [jornada, setJornada] = useState<Jornada | null | 'loading'>('loading')
  const [inventario, setInventario] = useState<PowerupInventario[]>([])
  const [aplicado, setAplicado] = useState<PowerupAplicado | null>(null)
  const [misJugadores, setMisJugadores] = useState<number[]>([])
  const [tipoElegido, setTipoElegido] = useState<TipoPowerup | ''>('')
  const [objetivo, setObjetivo] = useState('')
  const [aplicando, setAplicando] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    supabase
      .from('jornadas')
      .select('*')
      .then(({ data, error }) => {
        if (error) console.error('Jornadas fetch error:', error)
        const abiertas = (data ?? []) as Jornada[]
        const n = jornadaAbierta(abiertas)
        setJornada(n === null ? null : abiertas.find(j => j.numero === n) ?? null)
      })
  }, [])

  useEffect(() => {
    if (!jornada || jornada === 'loading') return
    let cancelled = false
    supabase
      .from('powerups_usuario')
      .select('*')
      .eq('usuario_id', usuario.id)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Inventario fetch error:', error)
        setInventario((data ?? []) as PowerupInventario[])
      })
    supabase
      .from('powerups_aplicados')
      .select('*')
      .eq('usuario_id', usuario.id)
      .eq('jornada', jornada.numero)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Aplicado fetch error:', error)
        setAplicado(data as PowerupAplicado | null)
      })
    supabase
      .from('alineaciones')
      .select('jugadores')
      .eq('usuario_id', usuario.id)
      .eq('jornada', jornada.numero)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Alineacion fetch error:', error)
        setMisJugadores((data?.jugadores as number[] | undefined) ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [jornada, usuario.id])

  if (jornada === 'loading') return <div className="loading-msg">Cargando...</div>

  if (jornada === null) {
    return <p className="placeholder">No hay ninguna jornada abierta para aplicar power-ups todavía.</p>
  }

  const bloqueada = jornada.fecha_partido !== null &&
    new Date(jornada.fecha_partido).getTime() - Date.now() <= 24 * 60 * 60 * 1000

  const tipoInfo = TIPOS.find(t => t.tipo === tipoElegido)

  const aplicar = async () => {
    if (!tipoElegido) { setMsg('Elige un power-up.'); return }
    const objetivoNum = tipoInfo?.requiereObjetivo ? Number(objetivo) || null : null
    const validacion = validarPowerup(tipoElegido, objetivoNum, misJugadores)
    if (!validacion.ok) { setMsg(validacion.error); return }

    setAplicando(true)
    setMsg('')
    const { data, error } = await supabase
      .from('powerups_aplicados')
      .insert({ usuario_id: usuario.id, jornada: jornada.numero, tipo: tipoElegido, objetivo: objetivoNum })
      .select()
      .single()
    if (error) {
      setMsg(`Error: ${error.message}`)
    } else {
      setAplicado(data as PowerupAplicado)
      setInventario(prev => prev.map(p => p.tipo === tipoElegido ? { ...p, disponibles: p.disponibles - 1 } : p))
      setMsg('✓ Power-up aplicado')
    }
    setAplicando(false)
  }

  return (
    <div className="powerups-container">
      <div className="team-total-pts">
        <span>Jornada {jornada.numero} — power-ups</span>
      </div>

      <ul className="powerups-inventario">
        {TIPOS.map(({ tipo, label }) => {
          const item = inventario.find(p => p.tipo === tipo)
          return (
            <li key={tipo} className="powerup-row">
              <span>{label}</span>
              <strong>{item?.disponibles ?? 0}</strong>
            </li>
          )
        })}
      </ul>

      {aplicado ? (
        <p className="placeholder">
          Ya aplicaste "{TIPOS.find(t => t.tipo === aplicado.tipo)?.label ?? aplicado.tipo}" esta jornada
          {aplicado.objetivo !== null && ` (objetivo: dorsal ${aplicado.objetivo})`}.
        </p>
      ) : bloqueada ? (
        <p className="placeholder">Jornada bloqueada — ya no se pueden aplicar power-ups.</p>
      ) : (
        <div className="powerup-aplicar">
          <select value={tipoElegido} onChange={e => { setTipoElegido(e.target.value as TipoPowerup | ''); setObjetivo('') }}>
            <option value="">— Elige un power-up —</option>
            {TIPOS.map(({ tipo, label }) => (
              <option key={tipo} value={tipo} disabled={(inventario.find(p => p.tipo === tipo)?.disponibles ?? 0) <= 0}>
                {label} ({inventario.find(p => p.tipo === tipo)?.disponibles ?? 0})
              </option>
            ))}
          </select>

          {tipoInfo?.requiereObjetivo && (
            <select value={objetivo} onChange={e => setObjetivo(e.target.value)}>
              <option value="">— Jugador objetivo —</option>
              {jugadores.filter(j => misJugadores.includes(j.numero)).map(j => (
                <option key={j.numero} value={String(j.numero)}>{j.nick || j.name}</option>
              ))}
            </select>
          )}

          {msg && <p className="admin-msg">{msg}</p>}
          <button className="save-btn" onClick={aplicar} disabled={aplicando}>
            {aplicando ? 'Aplicando...' : 'Aplicar power-up'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: CSS**

Añade a `src/index.css`, junto a la sección `APUESTAS`:

```css
/* ==========================================================================
   POWER-UPS (Fase D)
   ========================================================================== */

.powerups-container {
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.powerups-inventario {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.powerup-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: var(--bg-card);
  border: var(--border);
  border-radius: var(--radius);
}

.powerup-aplicar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: var(--border);
  border-radius: var(--radius);
}

.powerup-aplicar select {
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: #fff;
  padding: 6px 10px;
}
```

- [ ] **Step 3: Verificar que el build compila**

Run: `npm run build`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/Dashboard/Powerups.tsx src/index.css
git commit -m "feat(web): Powerups screen — inventory + apply one per jornada"
```

---

### Task 6: Frontend — `Draft.tsx` soporta "Capitán tardío"

**Files:**
- Modify: `src/components/Dashboard/Draft.tsx`

**Interfaces:**
- Consumes: tabla `powerups_aplicados` (Task 1) vía Supabase client
  directo (no hace falta un helper nuevo).

**Contexto para el implementador:** lee primero el fichero completo de
`Draft.tsx` — ya tiene un estado `ahora: number | null` (fijado dentro de
un `.then()`, nunca `Date.now()` en el render, por una regla de lint de
este proyecto — `react-hooks/purity`) y una variable derivada `bloqueada`
que oculta TODO el bloque de selección de jugadores y el botón de capitán
cuando `pasadoDeadline`. Este cambio añade una SEGUNDA variable derivada
`pasadoDeadlineCapitan` (con un umbral de 1h en vez de 24h SI el usuario
tiene el power-up `capitan_tardio` aplicado esa jornada) y muestra un
mini-editor de capitán independiente cuando el equipo ya está bloqueado
pero el capitán todavía no.

- [ ] **Step 1: Añadir el fetch del power-up**

En el segundo `useEffect` de `Draft.tsx` (el que depende de `[jornada,
usuario.id]` y ya hace fetch de `alineaciones` y `presupuesto_actual`),
añade un tercer fetch en paralelo:

```tsx
const [tieneCapitanTardio, setTieneCapitanTardio] = useState(false)
```

(declarar junto a los demás `useState` del componente, antes del primer
`useEffect`).

Dentro del segundo `useEffect`, junto a las otras dos llamadas a
`supabase` (antes del `return () => { cancelled = true }`):

```tsx
supabase
  .from('powerups_aplicados')
  .select('tipo')
  .eq('usuario_id', usuario.id)
  .eq('jornada', jornada.numero)
  .eq('tipo', 'capitan_tardio')
  .maybeSingle()
  .then(({ data, error }) => {
    if (cancelled) return
    if (error) console.error('Powerup capitan_tardio fetch error:', error)
    setTieneCapitanTardio(data !== null)
  })
```

- [ ] **Step 2: Derivar el segundo umbral en el render**

Junto a la línea existente que calcula `pasadoDeadline` (24h), añade:

```tsx
const pasadoDeadlineCapitan = ahora !== null && jornada.fecha_partido !== null &&
  new Date(jornada.fecha_partido).getTime() - ahora <= 60 * 60 * 1000
```

Y una nueva variable derivada que decide si el mini-editor de capitán debe
mostrarse:

```tsx
const puedeEditarCapitanTarde = bloqueada && tieneCapitanTardio && !pasadoDeadlineCapitan &&
  alineacion !== null && alineacion.puntos_jornada === null
```

(la condición `alineacion.puntos_jornada === null` reutiliza la misma
regla que ya usa `bloqueada` para "no editable si ya se resolvió" —
capitán tardío no debe reabrir una jornada ya puntuada).

- [ ] **Step 3: Función para cambiar solo el capitán**

Junto a la función `guardar()` existente, añade:

```tsx
const cambiarCapitanTarde = async (nuevoCapitan: number) => {
  if (!alineacion) return
  const { error } = await supabase
    .from('alineaciones')
    .update({ capitan: nuevoCapitan })
    .eq('usuario_id', usuario.id)
    .eq('jornada', jornada.numero)
  setMsg(error ? `Error: ${error.message}` : '✓ Capitán actualizado')
}
```

- [ ] **Step 4: Renderizar el mini-editor**

Dentro del bloque `{bloqueada && (...)}` ya existente (el que muestra
"Alineación bloqueada para esta jornada"), después del párrafo de
`<p className="placeholder">`, añade:

```tsx
{puedeEditarCapitanTarde && (
  <div className="powerup-aplicar">
    <span>Capitán tardío: puedes cambiar el capitán hasta 1h antes del partido.</span>
    <select
      value={alineacion?.capitan ?? ''}
      onChange={e => cambiarCapitanTarde(Number(e.target.value))}
    >
      {(alineacion?.jugadores ?? []).map(numero => {
        const j = jugadores.find(x => x.numero === numero)
        return <option key={numero} value={numero}>{j?.nick || j?.name || numero}</option>
      })}
    </select>
  </div>
)}
```

No hace falta un `useState` de `jugadores` distinto — `Draft.tsx` ya
recibe `jugadores: Jugador[]` como prop.

- [ ] **Step 5: Verificar que el build compila**

Run: `npm run build`
Expected: 0 errores.

- [ ] **Step 6: Ejecutar lint**

Run: `npm run lint`
Expected: 0 errores, 0 warnings. Presta atención especial a
`react-hooks/purity` y `react-hooks/set-state-in-effect` — este proyecto
ya tuvo bugs reales de ambos tipos en tareas anteriores de fases previas;
no des el lint por bueno sin ver la salida completa.

- [ ] **Step 7: Ejecutar toda la suite del frontend**

Run: `npx vitest run`
Expected: todo en verde.

- [ ] **Step 8: Commit**

```bash
git add src/components/Dashboard/Draft.tsx
git commit -m "feat(web): Draft.tsx supports capitan_tardio powerup window"
```

---

### Task 7: Frontend — pestaña "Power-ups" en la navegación

**Files:**
- Modify: `src/components/Dashboard/Shell.tsx`
- Modify: `src/components/Dashboard/Dashboard.tsx`

**Interfaces:**
- Consumes: `Powerups` (Task 5).

- [ ] **Step 1: Ampliar `Shell.tsx`**

En `src/components/Dashboard/Shell.tsx`, cambia el tipo `Tab`:

```ts
export type Tab = 'team' | 'ranking' | 'players' | 'profile' | 'apuestas' | 'powerups'
```

Y añade una entrada a `NAV_ITEMS` (después de `'apuestas'`, antes de
`'ranking'`):

```ts
const NAV_ITEMS: { tab: Tab; icon: string; label: string }[] = [
  { tab: 'team',     icon: '🌊', label: 'Mi Equipo'  },
  { tab: 'apuestas', icon: '🎲', label: 'Apuestas'   },
  { tab: 'powerups', icon: '⚡', label: 'Power-ups'  },
  { tab: 'ranking',  icon: '🏆', label: 'Ranking'    },
  { tab: 'players',  icon: '👥', label: 'Jugadores'  },
  { tab: 'profile',  icon: '👤', label: 'Perfil'     },
]
```

- [ ] **Step 2: Montar `Powerups` en `Dashboard.tsx`**

En `src/components/Dashboard/Dashboard.tsx`, añade el import:

```tsx
import { Powerups } from './Powerups'
```

Y añade la rama de renderizado junto a las demás (después de `tab ===
'apuestas'`):

```tsx
{tab === 'powerups' && <Powerups usuario={usuario} jugadores={jugadores} />}
```

- [ ] **Step 3: Ajustar el CSS de la barra de navegación móvil si hace falta**

Este proyecto ya tiene 5 pestañas en `.bottom-nav` desde la Fase C, y su
CSS ya se corrigió entonces para no desbordar (`left/right: 12px`,
`justify-content: space-around`, `padding: 6px 8px`, `min-width: 0` en
`.bottom-nav-btn`). Con esta tarea pasan a ser 6. Comprueba visualmente
(o razona sobre el ancho: 6 botones × ~94px con la etiqueta más larga
"Power-ups" ≈ 564px) si vuelve a desbordar en un viewport de ~390px de
ancho. Si es así, reduce `font-size` de `.bottom-nav-btn` de `0.72rem` a
`0.62rem` y el `padding` a `4px 6px` — no hace falta nada más agresivo.

- [ ] **Step 4: Verificar que el build compila**

Run: `npm run build`
Expected: 0 errores.

- [ ] **Step 5: Ejecutar lint y toda la suite del frontend**

Run: `npm run lint && npx vitest run`
Expected: todo en verde.

- [ ] **Step 6: Commit**

```bash
git add src/components/Dashboard/Shell.tsx src/components/Dashboard/Dashboard.tsx src/index.css
git commit -m "feat(web): wire Powerups into the nav"
```

---

### Task 8: Verificación manual end-to-end + aplicar migraciones a prod + push/PR

**Files:** ninguno nuevo.

- [ ] **Step 1: Suites completas en verde**

Run: `npm run build && npx vitest run && npm run lint`
Expected: todo en verde (esta fase no toca el scraper).

- [ ] **Step 2 (controlador): Pedir confirmación y aplicar las tres migraciones a prod**

Muestra el SQL de las tres migraciones al usuario, en orden. Solo tras el
ok, `mcp__claude_ai_Supabase__apply_migration` contra `sihvxbhqcyynuulhqmii`,
una migración cada vez, en el mismo orden (`...000_fantasy_powerups.sql`,
`...001_fantasy_powerups_resolver.sql`,
`...002_fantasy_powerups_capitan_tardio.sql`).

- [ ] **Step 3 (controlador): Verificar el trigger de gasto con datos de prueba**

Pide confirmación al usuario antes de este bloque (escribe en
`powerups_usuario`/`powerups_aplicados` con datos de prueba, aunque en una
jornada sentinela). Run `mcp__claude_ai_Supabase__execute_sql`:

```sql
INSERT INTO jornadas (numero, fecha_partido) VALUES (999, now() + interval '10 days')
  ON CONFLICT (numero) DO NOTHING;

SELECT id FROM usuarios LIMIT 1; -- anota <UID>

-- Sin inventario: debe fallar
INSERT INTO powerups_aplicados (usuario_id, jornada, tipo)
VALUES ('<UID>', 999, 'presupuesto_extra');
-- Expected: ERROR "no tienes ningún power-up de tipo presupuesto_extra disponible"

-- Da inventario y reintenta
INSERT INTO powerups_usuario (usuario_id, tipo, disponibles) VALUES ('<UID>', 'presupuesto_extra', 1)
  ON CONFLICT (usuario_id, tipo) DO UPDATE SET disponibles = 1;

INSERT INTO powerups_aplicados (usuario_id, jornada, tipo)
VALUES ('<UID>', 999, 'presupuesto_extra');

SELECT disponibles FROM powerups_usuario WHERE usuario_id = '<UID>' AND tipo = 'presupuesto_extra';
-- Expected: 0 (se gastó)

SELECT presupuesto FROM presupuestos WHERE usuario_id = '<UID>' AND jornada = 999;
-- Expected: 1050 (1000 base + 50 del power-up)

-- Un segundo intento del mismo tipo en la misma jornada debe fallar por
-- el UNIQUE(usuario_id, jornada), no llega ni a comprobar inventario
INSERT INTO powerups_aplicados (usuario_id, jornada, tipo)
VALUES ('<UID>', 999, 'blindaje', 6);
-- Expected: ERROR de violación de UNIQUE (ya aplicó uno esta jornada)
```

Expected: el token se gasta atómicamente y de forma correcta, el efecto
inmediato de +50€ se aplica, y el límite de 1 por jornada se cumple.

- [ ] **Step 4 (controlador): Limpiar los datos de prueba**

```sql
DELETE FROM powerups_aplicados WHERE jornada = 999;
DELETE FROM presupuestos WHERE jornada = 999;
DELETE FROM powerups_usuario WHERE usuario_id = '<UID>' AND tipo = 'presupuesto_extra' AND disponibles = 0;
DELETE FROM jornadas WHERE numero = 999;
SELECT nombre, puntos FROM usuarios ORDER BY nombre; -- confirma sin cambios
```

- [ ] **Step 5: Arrancar el dev server y probar las pantallas manualmente**

Run: `npm run dev`. Con una cuenta real: entra en "Power-ups", comprueba
que el inventario se ve (vacío es normal si no se ha resuelto ninguna
jornada desde que se desplegó esta fase). Si quieres probar el flujo
completo de aplicar un power-up, inserta temporalmente un token e
inventario de prueba como en el Step 3, con confirmación del usuario, y
límpialo al terminar.

- [ ] **Step 6: Push y PR**

```bash
git push -u origin feature/fantasy-dinamico-fase-d
```

Abre PR contra `develop`. Título sugerido: "feat: fantasy dinámico — Fase D
(power-ups)". Cuerpo: enlaza el spec y este plan.
