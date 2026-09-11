# Fantasy dinámico — Fase A (alineación por jornada) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the schema foundation for per-jornada fantasy scoring —
`jornadas`, `alineaciones`, `presupuestos` tables and a `resolver_jornada()`
function that freezes points per jornada — wired into the existing weekly
scraper, without touching the current UI or breaking the live game.

**Architecture:** Two migrations (tables+RLS, then functions) applied to a
Supabase dev branch and verified there before merging to prod. The scraper's
`syncJornada` gains a `jornadas` upsert; `runSync` calls the new
`resolver_jornada` RPC for every jornada it just synced, in parallel with the
existing `recalc()` (old `equipo`-based scoring keeps working — nothing
consumes `alineaciones` yet, so this is inert until Fase B ships the draft UI
and starts writing rows). A small frontend-only price helper
(`src/lib/precio.ts`) and an admin "reprocess jornada" button round out the
foundation Fase B will build on.

**Tech Stack:** Supabase Postgres (SQL migrations, RLS, PL/pgSQL), Node.js/TypeScript scraper (Vitest), React 19 + TypeScript frontend (Vitest).

**Spec:** `docs/superpowers/specs/2026-09-11-fantasy-dinamico-design.md` (Subproyecto A)

## Global Constraints

- Presupuesto base: **1000€** por jornada.
- Precio de jugador: `max(50, round(100 + 12 × media_puntos_ultimas_5_jornadas_jugadas))` — el `12` es una constante a recalibrar, no cerrada.
- Bloqueo de alineación: **24h antes** de `jornadas.fecha_partido`.
- Alineación con menos de 7 jugadores al resolver la jornada → **0 puntos**, sin puntuación parcial.
- Capitán: sus puntos de esa jornada cuentan **doble** (no un +100% aparte — el total de su línea se multiplica por 2).
- Sin suelo de seguridad en `presupuestos` (Fase C se encarga; Fase A no lo toca).
- Transparencia: cualquiera puede leer la alineación/presupuesto de cualquier usuario, igual que hoy `usuarios.equipo` es público vía el modal "ver equipo" de Ranking.
- Supabase project ref: `sihvxbhqcyynuulhqmii`. **Sin ramas de desarrollo** — el proyecto está en plan Free y `create_branch` devuelve `PaymentRequiredException` (confirmado en Task 1). Toda migración se aplica **directamente a prod**, y solo el controlador (no un subagente) ejecuta `apply_migration`/`execute_sql` contra prod, con el visto bueno explícito del usuario antes de cada aplicación — un implementador de tarea escribe y commitea el `.sql`, pero nunca lo aplica él mismo.

---

### Task 1: `jornadas` + `alineaciones` — esquema y RLS

**Files:**
- Create: `supabase/migrations/20260911000000_fantasy_jornadas_alineaciones.sql`

**Interfaces:**
- Produces: tabla `jornadas(numero, fecha_partido, resultado, goles_favor, goles_contra, finalizado)`; tabla `alineaciones(id, usuario_id, jornada, jugadores int[], capitan, presupuesto_usado, puntos_jornada, creado_en, actualizado_en)`, `UNIQUE(usuario_id, jornada)`. Task 2 y el scraper (Task 4-5) escriben sobre estas tablas.

- [ ] **Step 1: Crear el fichero de migración**

```sql
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
```

- [x] **Step 2: Crear la rama de desarrollo de Supabase y aplicar**

> **Nota post-ejecución:** `create_branch` devolvió `PaymentRequiredException`
> — este proyecto está en plan Free, sin ramas de desarrollo disponibles. La
> migración se aplicó **directamente a prod** en su lugar (ver ruling en el
> ledger de esta tarea, `.superpowers/sdd/2026-09-11-fantasy-dinamico-fase-a/progress.md`).
> El resto del plan (Task 2 en adelante) asume este mismo camino: sin ramas,
> aplicación a prod mediada por el controlador con confirmación del usuario.

Run (MCP):
- ~~`mcp__claude_ai_Supabase__create_branch` project `sihvxbhqcyynuulhqmii`, name `fantasy-dinamico-fase-a`~~ (falló, ver nota arriba)
- `mcp__claude_ai_Supabase__apply_migration` directamente contra prod, con el contenido del fichero

Expected: la migración aplica sin error.

- [x] **Step 3: Verificar el esquema**

Run `mcp__claude_ai_Supabase__execute_sql` contra prod:

```sql
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename IN ('jornadas','alineaciones')
ORDER BY tablename, policyname;

INSERT INTO jornadas (numero, fecha_partido) VALUES (999, now() + interval '10 days');
SELECT * FROM jornadas WHERE numero = 999;
```

Expected: 5 filas de políticas (`jornadas_select`, `jornadas_admin_write`,
`alineaciones_select`, `alineaciones_owner_write`, `alineaciones_admin_all`);
el INSERT de prueba se lee de vuelta con `finalizado = false`.

> El `numero = 999` de prueba quedó en prod tras esta verificación (era una
> rama en el plan original, no prod) — limpiado por el controlador con
> `DELETE FROM jornadas WHERE numero = 999` tras confirmación del usuario.

- [x] **Step 4: Commit**

```bash
git add supabase/migrations/20260911000000_fantasy_jornadas_alineaciones.sql
git commit -m "feat(db): jornadas + alineaciones tables for per-jornada scoring"
```

---

### Task 2: `presupuestos`, `presupuesto_actual()`, `resolver_jornada()`

**Files:**
- Create: `supabase/migrations/20260911000001_fantasy_presupuestos_resolver.sql`

**Interfaces:**
- Consumes: `jornadas`, `alineaciones`, `usuarios`, `historial`, `jugadores`, `is_admin(uuid)` (Task 1 y migraciones previas — ya en prod).
- Produces: función `presupuesto_actual(usuario_id uuid, jornada integer) RETURNS numeric`; función `resolver_jornada(jornada integer) RETURNS void`, invocable por `authenticated` (admin) y `service_role` (scraper). Task 4-5 del scraper y el admin (Task 7) llaman a `resolver_jornada` vía `supabase.rpc('resolver_jornada', { p_jornada })`.

**El implementador de esta tarea escribe y commitea el fichero `.sql` — NO
llama a `apply_migration` ni a ningún MCP de Supabase.** Sin ramas de
desarrollo disponibles (ver Global Constraints), aplicar a prod lo hace
únicamente el controlador tras confirmación explícita del usuario, después
de que el reviewer apruebe el SQL.

- [ ] **Step 1: Crear el fichero de migración**

```sql
-- Migration: fantasy_presupuestos_resolver
-- Budget table + read helper, and the function that freezes points for a
-- resolved jornada. See docs/superpowers/specs/2026-09-11-fantasy-dinamico-design.md.

CREATE TABLE presupuestos (
  usuario_id  uuid NOT NULL REFERENCES usuarios(id),
  jornada     integer NOT NULL REFERENCES jornadas(numero),
  presupuesto numeric NOT NULL,
  PRIMARY KEY (usuario_id, jornada)
);

ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;

CREATE POLICY presupuestos_select ON presupuestos
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY presupuestos_admin_write ON presupuestos
  FOR ALL TO authenticated
  USING     (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));

-- Presupuesto de un usuario para una jornada: la fila si existe (la fijará
-- una apuesta resuelta en Fase C), si no el base de 1000€.
CREATE OR REPLACE FUNCTION presupuesto_actual(p_usuario_id uuid, p_jornada integer)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT presupuesto FROM presupuestos WHERE usuario_id = p_usuario_id AND jornada = p_jornada),
    1000
  );
$$;

GRANT EXECUTE ON FUNCTION presupuesto_actual(uuid, integer) TO anon, authenticated;

-- Congela los puntos de cada alineación de la jornada N y actualiza el total
-- de temporada de cada usuario. La llama el scraper (service role: auth.uid()
-- resuelve NULL, se deja pasar) justo después de escribir el historial de esa
-- jornada, o el admin a mano desde AdminView para reprocesar.
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

  -- Alineaciones completas (7 jugadores): puntos = suma de historial.puntos
  -- de esa jornada, doble para el capitán.
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
      AND array_length(al.jugadores, 1) = 7
    GROUP BY al.id
  ) sub
  WHERE a.id = sub.id;

  -- Alineaciones incompletas de esa jornada (NULL, <7, o jugadores que no
  -- resolvieron ningún historial): 0 puntos, sin puntuación parcial.
  UPDATE alineaciones SET puntos_jornada = 0, actualizado_en = now()
  WHERE jornada = p_jornada AND puntos_jornada IS NULL;

  -- Total de temporada = suma de las jornadas ya resueltas de cada usuario.
  UPDATE usuarios u SET puntos = COALESCE(sub.total, 0)
  FROM (
    SELECT usuario_id, SUM(puntos_jornada) AS total
    FROM alineaciones
    WHERE puntos_jornada IS NOT NULL
    GROUP BY usuario_id
  ) sub
  WHERE u.id = sub.usuario_id;

  UPDATE jornadas SET finalizado = true WHERE numero = p_jornada;
END $$;

REVOKE ALL ON FUNCTION resolver_jornada(integer) FROM public;
GRANT EXECUTE ON FUNCTION resolver_jornada(integer) TO authenticated, service_role;
```

- [ ] **Step 2: Commit del fichero (el implementador para aquí)**

```bash
git add supabase/migrations/20260911000001_fantasy_presupuestos_resolver.sql
git commit -m "feat(db): presupuestos table + resolver_jornada() scoring function"
```

Reporta DONE con el path del fichero. Los pasos 3-5 (aplicar y verificar
contra prod) los ejecuta el controlador, no este implementador.

---

**A partir de aquí, pasos del controlador — no de un subagente implementador:**

- [ ] **Step 3 (controlador): Pedir confirmación y aplicar en prod**

Antes de llamar a `mcp__claude_ai_Supabase__apply_migration`, pide
confirmación explícita al usuario mostrando el SQL a aplicar. Solo tras el
ok, aplica con `project_id: sihvxbhqcyynuulhqmii`.

Expected: aplica sin error.

- [ ] **Step 4 (controlador): Verificar `presupuesto_actual` con datos reales**

Run `mcp__claude_ai_Supabase__execute_sql` contra prod:

```sql
SELECT numero FROM jornadas ORDER BY numero DESC LIMIT 1; -- anota N
SELECT id FROM usuarios LIMIT 1;                          -- anota UID

SELECT presupuesto_actual('<UID>', 999); -- ninguna fila en presupuestos -> 1000
INSERT INTO presupuestos (usuario_id, jornada, presupuesto) VALUES ('<UID>', 999, 730);
SELECT presupuesto_actual('<UID>', 999); -- ahora 730
```

Expected: `1000` antes del INSERT, `730` después.

- [ ] **Step 5 (controlador): Verificar `resolver_jornada` extremo a extremo con datos de prueba**

Esto escribe filas de prueba en `alineaciones`/`jornadas` de **prod**
(limpiadas en el siguiente paso) — antes de ejecutar el bloque, confirma con
el usuario que quieres correrlo. Run `mcp__claude_ai_Supabase__execute_sql`
contra prod (usa una jornada real con historial ya cargado — sustituye `<J>`
por el número que devuelva la primera query, y `<UID>` por un id real de
`usuarios`):

```sql
SELECT jornada, count(*) FROM historial GROUP BY jornada ORDER BY jornada DESC LIMIT 1;
SELECT numero, puntos FROM jugadores LIMIT 7; -- anota 7 numeros y sus puntos de esa jornada

-- Alineación de prueba: los 7 primeros jugadores, capitán = el primero.
INSERT INTO jornadas (numero, fecha_partido) VALUES (<J>, NULL)
  ON CONFLICT (numero) DO NOTHING;
INSERT INTO alineaciones (usuario_id, jornada, jugadores, capitan)
VALUES ('<UID>', <J>, ARRAY(SELECT numero FROM jugadores LIMIT 7), (SELECT numero FROM jugadores LIMIT 1));

-- Segunda alineación, incompleta a propósito (solo 3 jugadores).
INSERT INTO alineaciones (usuario_id, jornada, jugadores, capitan)
VALUES ((SELECT id FROM usuarios WHERE id <> '<UID>' LIMIT 1), <J>,
        ARRAY(SELECT numero FROM jugadores LIMIT 3), NULL);

SELECT resolver_jornada(<J>);

SELECT usuario_id, jugadores, capitan, puntos_jornada FROM alineaciones WHERE jornada = <J>;
SELECT id, puntos FROM usuarios;
SELECT finalizado FROM jornadas WHERE numero = <J>;
```

Expected: la alineación completa tiene `puntos_jornada` = suma de
`historial.puntos` de esa jornada para los 7 jugadores, con el punto del
capitán contado el doble (verifica a mano contra `SELECT puntos FROM
historial WHERE jornada = <J> AND jugador_id IN (...)`); la incompleta tiene
`puntos_jornada = 0`; `usuarios.puntos` del primer usuario sube exactamente
esa cantidad; `jornadas.finalizado` es `true`.

- [ ] **Step 6 (controlador): Limpiar los datos de prueba en prod**

```sql
DELETE FROM alineaciones WHERE jornada IN (999, <J>);
DELETE FROM presupuestos WHERE jornada = 999;
DELETE FROM jornadas WHERE numero = 999;
-- deja <J> tal y como estaba salvo alineaciones (ya borradas) y finalizado=true
-- (correcto: esa jornada ya tenía historial completo, así que es razonable
-- que quede marcada finalizada).
```

El commit del `.sql` ya se hizo en el Step 2 (lo hizo el implementador) —
nada que commitear aquí.

---

### Task 3: Scraper — `resultadoJornada()` (resultado del partido)

**Files:**
- Modify: `scraper/src/sync.ts`
- Test: `scraper/test/sync.test.ts`

**Interfaces:**
- Produces: `resultadoJornada(golesFavor: number, golesContra: number): 'gana' | 'pierde' | 'empata'`. Task 4 lo usa para construir la fila de `jornadas`.

- [ ] **Step 1: Escribir el test que falla**

Añade a `scraper/test/sync.test.ts` (junto a los `describe` existentes):

```ts
describe('resultadoJornada', () => {
  it('gana cuando marcamos más goles que el rival', () => {
    expect(resultadoJornada(10, 7)).toBe('gana')
  })

  it('pierde cuando marcamos menos', () => {
    expect(resultadoJornada(5, 9)).toBe('pierde')
  })

  it('empata a los mismos goles', () => {
    expect(resultadoJornada(8, 8)).toBe('empata')
  })
})
```

Y añade `resultadoJornada` al import existente:

```ts
import { rawToStats, resultadoJornada, runSync, staleJornadas } from '../src/sync'
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `cd scraper && npm run test -- sync.test.ts`
Expected: FAIL — `resultadoJornada` no existe / no es exportado.

- [ ] **Step 3: Implementar**

En `scraper/src/sync.ts`, junto a `rawToStats` (antes de `getDbPlayers`):

```ts
export function resultadoJornada(golesFavor: number, golesContra: number): 'gana' | 'pierde' | 'empata' {
  if (golesFavor > golesContra) return 'gana'
  if (golesFavor < golesContra) return 'pierde'
  return 'empata'
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `cd scraper && npm run test -- sync.test.ts`
Expected: PASS, todos los tests del fichero en verde.

- [ ] **Step 5: Commit**

```bash
git add scraper/src/sync.ts scraper/test/sync.test.ts
git commit -m "feat(scraper): resultadoJornada helper"
```

---

### Task 4: Scraper — escribir `jornadas` desde `syncJornada`

**Files:**
- Modify: `scraper/src/sync.ts:32-84` (`syncJornada`)

**Interfaces:**
- Consumes: `resultadoJornada` (Task 3), tabla `jornadas` (Task 1).

No hay test nuevo aquí: `syncJornada` ya no se prueba a nivel unitario (hace
I/O real vía `getRoundMatches`/`fetchMatchStats`, igual que su upsert de
`historial` hoy) — se verifica manualmente en Task 8 contra la rama de
Supabase.

- [ ] **Step 1: Calcular `golesFavor` junto a `golesContra`**

En `scraper/src/sync.ts`, dentro de `syncJornada`, justo debajo de la línea
que calcula `golesContra` (`const golesContra = ...`):

```ts
  const golesFavor =
    sharksMatch.sharks === 'local' ? sharksMatch.golesLocal : sharksMatch.golesVisitante
```

- [ ] **Step 2: Upsert de `jornadas` tras el upsert de `historial`**

Justo antes del `return { jornada: round.jornada, ... }` final de
`syncJornada`, después del bloque que hace `await supabase.from('historial').upsert(...)`:

```ts
  const { error: jError } = await supabase
    .from('jornadas')
    .upsert({
      numero: round.jornada,
      fecha_partido: matchDate,
      resultado: resultadoJornada(golesFavor, golesContra),
      goles_favor: golesFavor,
      goles_contra: golesContra,
    }, { onConflict: 'numero' })
  if (jError) throw new Error(`jornadas upsert J${round.jornada}: ${jError.message}`)
```

- [ ] **Step 3: Verificar que el scraper sigue compilando**

Run: `cd scraper && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add scraper/src/sync.ts
git commit -m "feat(scraper): write jornadas row (fecha/resultado/goles) alongside historial"
```

---

### Task 5: Scraper — llamar a `resolver_jornada` tras sincronizar

**Files:**
- Modify: `scraper/src/sync.ts` (`runSync`)
- Test: `scraper/test/sync.test.ts`

**Interfaces:**
- Consumes: RPC `resolver_jornada` (Task 2).
- Produces: `resolverJornadas(jornadas: Iterable<number>): Promise<void>`, exportada.

- [ ] **Step 1: Ampliar el mock de `supabase` para incluir `rpc`**

En `scraper/test/sync.test.ts`, cambia la línea del mock:

```ts
vi.mock('../src/supabase', () => ({ supabase: { rpc: vi.fn() } }))
```

Y añade el import de `supabase` junto a los demás imports del fichero:

```ts
import { supabase } from '../src/supabase'
```

- [ ] **Step 2: Escribir el test que falla**

```ts
describe('resolverJornadas', () => {
  it('llama a resolver_jornada una vez por cada jornada sincronizada', async () => {
    const rpc = vi.mocked(supabase.rpc)
    rpc.mockClear()
    rpc.mockResolvedValue({ error: null } as never)

    await resolverJornadas([3, 5])

    expect(rpc).toHaveBeenNthCalledWith(1, 'resolver_jornada', { p_jornada: 3 })
    expect(rpc).toHaveBeenNthCalledWith(2, 'resolver_jornada', { p_jornada: 5 })
  })

  it('sigue con las demás jornadas si una falla, sin lanzar', async () => {
    const rpc = vi.mocked(supabase.rpc)
    rpc.mockClear()
    rpc.mockResolvedValueOnce({ error: { message: 'boom' } } as never)
    rpc.mockResolvedValueOnce({ error: null } as never)

    await expect(resolverJornadas([1, 2])).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalledTimes(2)
  })
})
```

Añade `resolverJornadas` al import de `../src/sync`.

- [ ] **Step 2b: Ejecutar y comprobar que falla**

Run: `cd scraper && npm run test -- sync.test.ts`
Expected: FAIL — `resolverJornadas` no existe.

- [ ] **Step 3: Implementar**

En `scraper/src/sync.ts`, después de `recalc()` y antes de `staleJornadas`:

```ts
// ponytail: corre en paralelo con el recalc() de equipo de arriba durante la
// Fase A — nada escribe todavía en `alineaciones`, así que hoy es un no-op
// sobre usuarios.puntos. La Fase B debe quitar la llamada a recalc() de
// runSync en cuanto la UI de draft escriba alineaciones reales — ver
// docs/superpowers/specs/2026-09-11-fantasy-dinamico-design.md.
export async function resolverJornadas(jornadas: Iterable<number>): Promise<void> {
  for (const jornada of jornadas) {
    const { error } = await supabase.rpc('resolver_jornada', { p_jornada: jornada })
    if (error) console.error(`resolver_jornada J${jornada} failed: ${error.message}`)
  }
}
```

Y en `runSync`, justo después de `await recalc()`:

```ts
  await recalc()
  await resolverJornadas(syncedJornadas)
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `cd scraper && npm run test -- sync.test.ts`
Expected: PASS, todos los tests del fichero en verde.

- [ ] **Step 5: Ejecutar la suite completa del scraper**

Run: `cd scraper && npm run test`
Expected: todos los ficheros en verde (el mock ampliado de `supabase` no debe romper `fncv.test.ts`, `leverade.test.ts`, etc. — son ficheros distintos con sus propios mocks).

- [ ] **Step 6: Commit**

```bash
git add scraper/src/sync.ts scraper/test/sync.test.ts
git commit -m "feat(scraper): call resolver_jornada RPC for every synced jornada"
```

---

### Task 6: Frontend — `calcPrecio()` (precio de jugador)

**Files:**
- Create: `src/lib/precio.ts`
- Test: `src/lib/precio.test.ts`

**Interfaces:**
- Consumes: `HistorialEntry` (`src/types/index.ts`).
- Produces: `calcPrecio(historial: HistorialEntry[]): number`. La pantalla de draft (Fase B) la usará para mostrar el precio de cada jugador.

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/precio.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { calcPrecio } from './precio'
import type { HistorialEntry } from '../types'

const entry = (jornada: number, puntos: number, partidos = 1): HistorialEntry => ({
  id: jornada,
  jugador_id: 1,
  jornada,
  stats: {
    partidos, goles: 0, goles_penalti: 0, penaltis_fallados: 0, faltas_penalti: 0,
    tarjetas: 0, expulsiones: 0, expulsiones_graves: 0, goles_contra: 0,
  },
  puntos,
  date: '2026-01-01',
})

describe('calcPrecio', () => {
  it('suelo de 50€ sin ninguna jornada jugada', () => {
    expect(calcPrecio([])).toBe(50)
  })

  it('ignora jornadas no jugadas (partidos = 0)', () => {
    expect(calcPrecio([entry(1, 20, 0)])).toBe(50)
  })

  it('solo promedia las últimas 5 jornadas jugadas, por número de jornada', () => {
    const hist = [
      entry(1, 100),                                   // fuera de las últimas 5
      entry(2, 4), entry(3, 5), entry(4, 6), entry(5, 7), entry(6, 8),
    ]
    // últimas 5 por jornada: 2,3,4,5,6 -> media (4+5+6+7+8)/5 = 6 -> 100+12*6=172
    expect(calcPrecio(hist)).toBe(172)
  })

  it('aplica el suelo de 50€ cuando la fórmula da menos', () => {
    // 100 + 12*(-10) = -20 -> suelo 50
    expect(calcPrecio([entry(1, -10)])).toBe(50)
  })
})
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npx vitest run src/lib/precio.test.ts`
Expected: FAIL — no se encuentra el módulo `./precio`.

- [ ] **Step 3: Implementar**

Crea `src/lib/precio.ts`:

```ts
import type { HistorialEntry } from '../types'

/**
 * Precio de fantasy de un jugador: base 100€ + 12€ por cada punto de fantasy
 * de media en sus últimas 5 jornadas jugadas (partidos > 0), con un suelo de
 * 50€. El multiplicador (12) es una constante a recalibrar si el "mejor 7"
 * no queda claramente por encima del presupuesto base de 1000€ — ver
 * docs/superpowers/specs/2026-09-11-fantasy-dinamico-design.md.
 */
export function calcPrecio(historial: HistorialEntry[]): number {
  const jugadas = historial
    .filter(h => h.stats.partidos > 0)
    .sort((a, b) => b.jornada - a.jornada)
    .slice(0, 5)
  if (jugadas.length === 0) return 50
  const media = jugadas.reduce((sum, h) => sum + h.puntos, 0) / jugadas.length
  return Math.max(50, Math.round(100 + 12 * media))
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npx vitest run src/lib/precio.test.ts`
Expected: PASS, 4 tests en verde.

- [ ] **Step 5: Ejecutar toda la suite del frontend**

Run: `npx vitest run`
Expected: todos los ficheros en verde (root `npm run test` es modo watch — no lo uses para verificar, ver `docs/diary/federation-sync.md`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/precio.ts src/lib/precio.test.ts
git commit -m "feat(web): calcPrecio — player price from recent fantasy form"
```

---

### Task 7: Admin — botón "Reprocesar jornada"

**Files:**
- Modify: `src/components/Admin/SyncAdmin.tsx`

**Interfaces:**
- Consumes: RPC `resolver_jornada` (Task 2), vía `supabase.rpc` — mismo patrón que el botón "Recalcular puntos" ya existente en este fichero.

No hay test automatizado (este proyecto no tiene suite E2E — "prueba manual
de cada sección", mismo criterio que el resto de `Admin/`). Se verifica a
mano en Task 8.

- [ ] **Step 1: Añadir el estado y el handler**

En `src/components/Admin/SyncAdmin.tsx`, junto a los demás `useState`:

```tsx
  const [jornadaInput, setJornadaInput] = useState('')
  const [resolviendo, setResolviendo] = useState(false)

  const resolverJornada = async () => {
    const n = Number(jornadaInput)
    if (!n) return
    setResolviendo(true)
    setMsg('')
    const { error } = await supabase.rpc('resolver_jornada', { p_jornada: n })
    setMsg(error ? `Error: ${error.message}` : `✓ Jornada ${n} resuelta`)
    if (!error) data.refetch()
    setResolviendo(false)
  }
```

- [ ] **Step 2: Añadir el control en el JSX**

Justo antes del `</div>` de cierre, después del botón "Recalcular puntos" existente:

```tsx
      <div className="admin-view-topbar">
        <label>
          Jornada:
          <input
            type="number"
            value={jornadaInput}
            onChange={e => setJornadaInput(e.target.value)}
          />
        </label>
        <button onClick={resolverJornada} disabled={resolviendo || !jornadaInput} className="admin-subnav-btn">
          {resolviendo ? 'Resolviendo…' : 'Reprocesar jornada'}
        </button>
      </div>
```

- [ ] **Step 3: Verificar que el build compila**

Run: `npm run build`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/Admin/SyncAdmin.tsx
git commit -m "feat(web): admin button to manually re-run resolver_jornada"
```

---

### Task 8: Verificación manual end-to-end + push/PR

**Files:** ninguno nuevo — solo verificación.

Sin ramas de Supabase (ver Global Constraints), ambas migraciones (Task 1 y
2) ya quedaron aplicadas directamente a prod, cada una con confirmación del
usuario en su propia tarea — no hay nada que mergear aquí.

- [ ] **Step 1: Arrancar el dev server**

Run: `npm run dev`

- [ ] **Step 2: Verificar que el juego actual sigue funcionando igual**

Abre `http://localhost:5173`, entra con una cuenta existente. Confirma que
Pool/Ranking/Players/Profile se ven y funcionan exactamente igual que antes
de este plan (esta fase no toca ninguna pantalla salvo el nuevo botón de
Admin) — `alineaciones`/`jornadas`/`presupuestos` no tienen todavía ningún
consumidor en la UI de usuario.

- [ ] **Step 3: Confirmar que la suite completa sigue en verde**

Run: `npm run build && npx vitest run && npm run lint`
Run: `cd scraper && npx tsc --noEmit && npm run test`

Expected: todo en verde.

- [ ] **Step 4: Probar el botón de Admin contra prod**

Entra como admin en el dev server, ve a Admin → Sync, escribe el número de
una jornada con historial real (cualquier jornada ya sincronizada) y pulsa
"Reprocesar jornada". Confirma el mensaje `✓ Jornada <J> resuelta` — sin
alineaciones para esa jornada en prod, es un no-op, exactamente el
comportamiento esperado en Fase A.

- [ ] **Step 5: Push y PR**

```bash
git push -u origin feature/fantasy-dinamico-fase-a
```

Abre PR contra `develop` (PROJECT_TYPE: team). Título sugerido: "feat: fantasy dinámico — Fase A (alineación por jornada)". Cuerpo: enlaza el spec (`docs/superpowers/specs/2026-09-11-fantasy-dinamico-design.md`) y este plan.
