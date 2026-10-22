# Fantasy dinámico — Fase B (draft, presupuesto, capitán, corte con el modelo antiguo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the draft screen that replaces "Mi Equipo": cada usuario elige 7
jugadores + capitán dentro de su presupuesto para la próxima jornada, con
bloqueo real a 24h del partido. Corte limpio con el modelo antiguo
(`usuarios.equipo`/`recalc()`) en el mismo cambio.

**Architecture:** Una migración (RLS + reactivar `resolver_jornada`), tres
cambios en el scraper (calendario futuro, quitar `recalc()`), y en el
frontend: dos módulos puros nuevos (`jornada.ts`, `draft.ts`), una pantalla
nueva (`Draft.tsx`) que sustituye a `Pool.tsx`, y una actualización del modal
de Ranking. Todo sobre el esquema que ya está en prod desde la Fase A.

**Tech Stack:** Supabase Postgres (SQL, RLS, PL/pgSQL), Node.js/TypeScript
scraper (Vitest), React 19 + TypeScript frontend (Vitest).

**Spec:** `docs/superpowers/specs/2026-09-11-fantasy-dinamico-design.md` (Subproyecto B)

## Global Constraints

- Jornada abierta para draftear = la de menor `numero` en `jornadas` donde
  `finalizado = false`, `fecha_partido IS NOT NULL`, y
  `now() < fecha_partido - interval '24 hours'`. Sin fecha conocida = no
  abierta (fail-closed, ya aplicado en RLS desde la Fase A).
- `alineaciones_select`: visible siempre para el dueño y el admin; para
  cualquier otro, solo cuando `puntos_jornada IS NOT NULL`.
- Draft: exactamente 7 dorsales distintos, uno marcado capitán, coste total
  (`calcPrecio` por jugador) ≤ `presupuesto_actual(usuario, jornada)`.
- Corte limpio: `usuarios.equipo` deja de leerse/escribirse para puntos y
  para la UI de equipo; la columna se queda en la tabla sin usar (no se
  borra). `recalc()` (JS, scraper) se elimina; `resolver_jornada()` pasa a
  ser la única fuente de `usuarios.puntos`.
- Sin ramas de Supabase disponibles (plan Free) — igual que en Fase A, la
  migración de esta fase la aplica el controlador directamente a prod, con
  el SQL mostrado al usuario y su confirmación explícita antes de cada
  escritura. Ningún implementador de tarea llama a un MCP de Supabase.
- Mecanismo de calendario futuro confirmado contra la API real de Leverade:
  `GET /rounds/{id}?include=matches` devuelve cada partido con
  `meta.home_team`/`meta.away_team` (IDs de equipo) incluso sin fecha ni
  resultado; `GET /teams/{id}` da el nombre del equipo
  (`SHARKS_TEAM_NAME = 'C.W. Sharks A'`, ya definido en `scraper/src/fncv.ts`).

---

### Task 1: Migración — RLS de `alineaciones_select` + reactivar `usuarios.puntos`

**Files:**
- Create: `supabase/migrations/20260912000000_fantasy_dinamico_fase_b_cutover.sql`

**Interfaces:**
- Consumes: `alineaciones`, `resolver_jornada()`, `is_admin(uuid)` (ya en prod).
- Produces: política `alineaciones_select` sustituida; `resolver_jornada()`
  con el bloque de `usuarios.puntos` activo. Nada más cambia.

**El implementador de esta tarea escribe y commitea el fichero `.sql` — NO
llama a ningún MCP de Supabase.** El controlador lo aplica a prod después,
con confirmación explícita del usuario (Task 10).

- [ ] **Step 1: Crear el fichero de migración**

```sql
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
git add supabase/migrations/20260912000000_fantasy_dinamico_fase_b_cutover.sql
git commit -m "feat(db): fase B cutover — real alineaciones visibility, reactivate usuarios.puntos"
```

Reporta DONE con el path del fichero. La aplicación a prod es la Task 10
(controlador, con confirmación del usuario).

---

### Task 2: Scraper — `leverade.ts`: equipos de un partido futuro

**Files:**
- Modify: `scraper/src/leverade.ts`
- Test: `scraper/test/leverade.test.ts`

**Interfaces:**
- Produces: `Match` gana los campos `homeTeamId: string | null` y
  `awayTeamId: string | null`; nueva función `getTeamName(teamId: string): Promise<string>`.
  Task 3 los usa para identificar el partido de los Sharks en una jornada
  aún no jugada.

- [ ] **Step 1: Escribir el test que falla**

Añade a `scraper/test/leverade.test.ts`, dentro del `describe('getRoundMatches', ...)`
existente (el fixture `round.json` ya trae `meta.home_team`/`meta.away_team`
reales, no hace falta tocar el fixture):

```ts
  it('incluye los ids de equipo local/visitante de cada partido', async () => {
    stubFetch({ '/rounds/': round })
    const matches = await getRoundMatches('19460842')
    expect(matches[0].homeTeamId).toBe('15688434')
    expect(matches[0].awayTeamId).toBe('15688435')
  })
```

Y un nuevo `describe` al final del fichero:

```ts
describe('getTeamName', () => {
  it('devuelve el nombre del equipo', async () => {
    stubFetch({
      '/teams/15688434': JSON.stringify({
        data: { type: 'team', id: '15688434', attributes: { name: 'C.W. Sharks A' } },
      }),
    })
    const name = await getTeamName('15688434')
    expect(name).toBe('C.W. Sharks A')
  })
})
```

Y añade `getTeamName` al import existente de `../src/leverade`.

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `cd scraper && npm run test -- leverade.test.ts`
Expected: FAIL — `homeTeamId`/`awayTeamId` son `undefined`, `getTeamName` no existe.

- [ ] **Step 3: Implementar**

En `scraper/src/leverade.ts`, amplía `JsonApiDoc` para incluir `meta`:

```ts
interface JsonApiDoc {
  data: {
    relationships?: Record<string, { data: { id: string }[] | { id: string } | null }>
  }
  included?: {
    type: string
    id: string
    attributes: Record<string, unknown>
    meta?: Record<string, unknown>
  }[]
}
```

Amplía `Match`:

```ts
export interface Match {
  id: string
  date: string | null
  finished: boolean
  homeTeamId: string | null
  awayTeamId: string | null
}
```

Actualiza el `.map` de `getRoundMatches`:

```ts
export async function getRoundMatches(roundId: string): Promise<Match[]> {
  const doc = await getJson<JsonApiDoc>(`${API}/rounds/${roundId}?include=matches`)
  return (doc.included ?? [])
    .filter(x => x.type === 'match')
    .map(x => ({
      id: x.id,
      date: (x.attributes.date as string | null) ?? null,
      finished: x.attributes.finished === true,
      homeTeamId: (x.meta?.home_team as string | undefined) ?? null,
      awayTeamId: (x.meta?.away_team as string | undefined) ?? null,
    }))
}
```

Añade al final del fichero:

```ts
export async function getTeamName(teamId: string): Promise<string> {
  const doc = await getJson<{ data: { attributes: { name: string } } }>(`${API}/teams/${teamId}`)
  return doc.data.attributes.name
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `cd scraper && npm run test -- leverade.test.ts`
Expected: PASS, todos los tests del fichero en verde.

- [ ] **Step 5: Commit**

```bash
git add scraper/src/leverade.ts scraper/test/leverade.test.ts
git commit -m "feat(scraper): expose match home/away team ids + getTeamName"
```

---

### Task 3: Scraper — calendario futuro + quitar `recalc()`

**Files:**
- Modify: `scraper/src/sync.ts`
- Test: `scraper/test/sync.test.ts`

**Interfaces:**
- Consumes: `getRoundMatches`, `getTeamName`, `SHARKS_TEAM_NAME` (Task 2 y
  `fncv.ts` ya existente).
- Produces: `ladoSharks(homeName, awayName): 'home' | 'away' | null` (pura,
  exportada); `syncCalendar(rounds, historialJornadas): Promise<void>`
  (exportada). Elimina `recalc()` y `STAT_KEYS` (sin más usos tras esto).

- [ ] **Step 1: Escribir los tests que fallan**

Al principio de `scraper/test/sync.test.ts`, junto al `vi.mock('../src/supabase', ...)`
existente, añade un mock estático (hoisted, igual patrón) del módulo
`leverade`:

```ts
vi.mock('../src/leverade', async () => {
  const actual = await vi.importActual<typeof import('../src/leverade')>('../src/leverade')
  return { ...actual, getRoundMatches: vi.fn(), getTeamName: vi.fn() }
})
```

Añade `getRoundMatches, getTeamName` al import de `'../src/leverade'` que ya
exista en el fichero (o créalo si no existe todavía), y `syncCalendar,
ladoSharks` al import existente de `'../src/sync'`.

```ts
describe('ladoSharks', () => {
  it('detecta a los Sharks como local', () => {
    expect(ladoSharks('C.W. Sharks A', 'C.W. Elx B')).toBe('home')
  })

  it('detecta a los Sharks como visitante', () => {
    expect(ladoSharks('C.W. Elx B', 'C.W. Sharks A')).toBe('away')
  })

  it('devuelve null si ninguno de los dos es Sharks', () => {
    expect(ladoSharks('C.W. Elx B', 'C.W. UPV A')).toBe(null)
  })
})

describe('syncCalendar', () => {
  it('escribe fecha_partido para una jornada sin historial, identificando a los Sharks por sus equipos', async () => {
    vi.mocked(getRoundMatches).mockResolvedValue([
      { id: 'm1', date: '2026-10-05T18:00:00Z', finished: false, homeTeamId: 't1', awayTeamId: 't2' },
    ])
    vi.mocked(getTeamName).mockImplementation((id: string) =>
      Promise.resolve(id === 't2' ? 'C.W. Sharks A' : 'C.W. Elx B'),
    )
    const upsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase).from = vi.fn(() => ({ upsert })) as never

    await syncCalendar([{ id: 'r1', jornada: 5 }], new Set([1, 2, 3, 4]))

    expect(upsert).toHaveBeenCalledWith(
      { numero: 5, fecha_partido: '2026-10-05T18:00:00Z' },
      { onConflict: 'numero' },
    )
  })

  it('no toca una jornada que ya tiene historial', async () => {
    vi.mocked(getRoundMatches).mockClear()
    const upsert = vi.fn()
    vi.mocked(supabase).from = vi.fn(() => ({ upsert })) as never

    await syncCalendar([{ id: 'r1', jornada: 3 }], new Set([1, 2, 3]))

    expect(getRoundMatches).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })
})
```

Este es el mismo patrón de mock estático que ya usa el fichero para
`../src/supabase` — no hace falta `vi.doMock` ni `import()` dinámico.

- [ ] **Step 2: Ejecutar y comprobar que fallan**

Run: `cd scraper && npm run test -- sync.test.ts`
Expected: FAIL — `ladoSharks`/`syncCalendar` no existen.

- [ ] **Step 3: Implementar `ladoSharks` y `syncCalendar`**

En `scraper/src/sync.ts`, añade el import de lo nuevo de `leverade.ts` y
`fncv.ts` (ya se importa `SHARKS_TEAM_NAME` indirectamente vía `fncv.js`,
confirma el import existente):

```ts
import { getRounds, getRoundMatches, getTeamName, type Round } from './leverade.js'
```

Añade junto a `resultadoJornada`:

```ts
export function ladoSharks(homeName: string, awayName: string): 'home' | 'away' | null {
  if (homeName === SHARKS_TEAM_NAME) return 'home'
  if (awayName === SHARKS_TEAM_NAME) return 'away'
  return null
}

/**
 * Escribe fecha_partido en `jornadas` para las rondas que todavía no tienen
 * historial (jornadas futuras o sin jugar), identificando el partido de los
 * Sharks por los ids de equipo del partido — no depende de que exista
 * página de stats (que solo aparece una vez jugado el partido).
 */
export async function syncCalendar(rounds: Round[], historialJornadas: Set<number>): Promise<void> {
  const pendientes = rounds.filter(r => !historialJornadas.has(r.jornada))
  const nombreEquipo = new Map<string, string>()
  const resolverNombre = async (teamId: string): Promise<string> => {
    if (!nombreEquipo.has(teamId)) nombreEquipo.set(teamId, await getTeamName(teamId))
    return nombreEquipo.get(teamId)!
  }

  for (const round of pendientes) {
    const matches = await getRoundMatches(round.id)
    let fechaSharks: string | null = null
    for (const m of matches) {
      if (!m.homeTeamId || !m.awayTeamId) continue
      const [homeName, awayName] = await Promise.all([
        resolverNombre(m.homeTeamId),
        resolverNombre(m.awayTeamId),
      ])
      if (ladoSharks(homeName, awayName) !== null) {
        fechaSharks = m.date
        break
      }
    }
    if (fechaSharks === null) continue

    const { error } = await supabase
      .from('jornadas')
      .upsert({ numero: round.jornada, fecha_partido: fechaSharks }, { onConflict: 'numero' })
    if (error) console.error(`syncCalendar J${round.jornada}: ${error.message}`)
  }
}
```

- [ ] **Step 4: Quitar `recalc()` y su llamada**

Elimina de `scraper/src/sync.ts`:
- La función `recalc()` completa (con su comentario `ponytail:`).
- La constante `const STAT_KEYS = Object.keys(EMPTY_STATS) as (keyof PlayerStats)[]` (sin más usos tras quitar `recalc()`).
- La línea `await recalc()` dentro de `runSync`.

`resolver_jornada` (vía `resolverJornadas`) pasa a ser la única fuente de
`usuarios.puntos` — ya reactivada en prod por la Task 1/11 de este plan.

- [ ] **Step 5: Llamar a `syncCalendar` desde `runSync`**

Justo después de `const rounds = await getRounds(tournamentId)` (antes del
bucle principal por jornada), añade:

```ts
  const { data: histRows } = await supabase.from('historial').select('jornada')
  const historialJornadas = new Set((histRows ?? []).map(h => h.jornada as number))
  await syncCalendar(rounds, historialJornadas)
```

- [ ] **Step 6: Ejecutar y comprobar que todo pasa**

Run: `cd scraper && npm run test -- sync.test.ts`
Expected: PASS.

Run: `cd scraper && npx tsc --noEmit`
Expected: 0 errores (confirma que no quedan referencias a `recalc`/`STAT_KEYS`).

- [ ] **Step 7: Ejecutar la suite completa del scraper**

Run: `cd scraper && npm run test`
Expected: todos los ficheros en verde.

- [ ] **Step 8: Commit**

```bash
git add scraper/src/sync.ts scraper/test/sync.test.ts
git commit -m "feat(scraper): sync future jornada dates, drop the old recalc() model"
```

---

### Task 4: Frontend — tipos `Jornada` y `Alineacion`

**Files:**
- Modify: `src/types/index.ts`

**Interfaces:**
- Produces: `export interface Jornada { numero: number; fecha_partido: string | null; resultado: 'gana' | 'pierde' | 'empata' | null; goles_favor: number | null; goles_contra: number | null; finalizado: boolean }`
  y `export interface Alineacion { id: number; usuario_id: string; jornada: number; jugadores: number[] | null; capitan: number | null; presupuesto_usado: number | null; puntos_jornada: number | null; creado_en: string; actualizado_en: string }`.
  Tasks 5-9 los usan.

- [ ] **Step 1: Añadir los tipos**

Al final de `src/types/index.ts`:

```ts
export interface Jornada {
  numero: number
  fecha_partido: string | null
  resultado: 'gana' | 'pierde' | 'empata' | null
  goles_favor: number | null
  goles_contra: number | null
  finalizado: boolean
}

export interface Alineacion {
  id: number
  usuario_id: string
  jornada: number
  jugadores: number[] | null
  capitan: number | null
  presupuesto_usado: number | null
  puntos_jornada: number | null
  creado_en: string
  actualizado_en: string
}
```

- [ ] **Step 2: Verificar que el build compila**

Run: `npm run build`
Expected: 0 errores (los tipos no se usan todavía, solo se declaran).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(web): Jornada + Alineacion types"
```

---

### Task 5: Frontend — `src/lib/jornada.ts` (jornada abierta)

**Files:**
- Create: `src/lib/jornada.ts`
- Test: `src/lib/jornada.test.ts`

**Interfaces:**
- Consumes: `Jornada` (Task 4).
- Produces: `jornadaAbierta(jornadas: Jornada[], ahora?: Date): number | null`.
  Task 7 (`Draft.tsx`) la usa para saber qué jornada draftear.

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/jornada.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { jornadaAbierta } from './jornada'
import type { Jornada } from '../types'

const j = (numero: number, o: Partial<Jornada> = {}): Jornada => ({
  numero, fecha_partido: null, resultado: null, goles_favor: null,
  goles_contra: null, finalizado: false, ...o,
})

describe('jornadaAbierta', () => {
  it('null si no hay ninguna jornada', () => {
    expect(jornadaAbierta([])).toBeNull()
  })

  it('null si la única jornada no tiene fecha todavía', () => {
    expect(jornadaAbierta([j(5)])).toBeNull()
  })

  it('null si el partido es en menos de 24h', () => {
    const ahora = new Date('2026-01-01T00:00:00Z')
    const fecha = new Date('2026-01-01T20:00:00Z').toISOString() // 20h después
    expect(jornadaAbierta([j(5, { fecha_partido: fecha })], ahora)).toBeNull()
  })

  it('devuelve la jornada si faltan más de 24h', () => {
    const ahora = new Date('2026-01-01T00:00:00Z')
    const fecha = new Date('2026-01-05T00:00:00Z').toISOString()
    expect(jornadaAbierta([j(5, { fecha_partido: fecha })], ahora)).toBe(5)
  })

  it('ignora una jornada ya finalizada aunque su fecha sea futura por error de datos', () => {
    const ahora = new Date('2026-01-01T00:00:00Z')
    const fecha = new Date('2026-01-05T00:00:00Z').toISOString()
    expect(jornadaAbierta([j(5, { fecha_partido: fecha, finalizado: true })], ahora)).toBeNull()
  })

  it('con varias jornadas abiertas, devuelve la de número más bajo', () => {
    const ahora = new Date('2026-01-01T00:00:00Z')
    const fecha = new Date('2026-01-10T00:00:00Z').toISOString()
    expect(jornadaAbierta([j(7, { fecha_partido: fecha }), j(6, { fecha_partido: fecha })], ahora)).toBe(6)
  })
})
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npx vitest run src/lib/jornada.test.ts`
Expected: FAIL — no se encuentra el módulo `./jornada`.

- [ ] **Step 3: Implementar**

Crea `src/lib/jornada.ts`:

```ts
import type { Jornada } from '../types'

const VEINTICUATRO_HORAS_MS = 24 * 60 * 60 * 1000

/**
 * La jornada abierta para draftear: la de número más bajo con fecha de
 * partido conocida, no finalizada, y a más de 24h vista. Sin fecha
 * conocida no cuenta como abierta (coincide con el fail-closed de la RLS
 * de `alineaciones`).
 */
export function jornadaAbierta(jornadas: Jornada[], ahora: Date = new Date()): number | null {
  const candidatas = jornadas.filter(j =>
    !j.finalizado &&
    j.fecha_partido !== null &&
    new Date(j.fecha_partido).getTime() - ahora.getTime() > VEINTICUATRO_HORAS_MS
  )
  if (candidatas.length === 0) return null
  return Math.min(...candidatas.map(j => j.numero))
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npx vitest run src/lib/jornada.test.ts`
Expected: PASS, 6 tests en verde.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jornada.ts src/lib/jornada.test.ts
git commit -m "feat(web): jornadaAbierta — pick the next draftable jornada"
```

---

### Task 6: Frontend — `src/lib/draft.ts` (validación del draft)

**Files:**
- Create: `src/lib/draft.ts`
- Test: `src/lib/draft.test.ts`

**Interfaces:**
- Produces: `validarDraft(jugadores: number[], capitan: number | null, precios: Record<number, number>, presupuesto: number): { ok: true } | { ok: false; error: string }`.
  Task 7 la usa antes de guardar.

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/draft.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validarDraft } from './draft'

const precios = { 1: 100, 2: 100, 3: 100, 4: 100, 5: 100, 6: 100, 7: 100, 8: 500 }

describe('validarDraft', () => {
  it('ok con 7 jugadores distintos, capitán entre ellos, dentro de presupuesto', () => {
    expect(validarDraft([1, 2, 3, 4, 5, 6, 7], 3, precios, 1000)).toEqual({ ok: true })
  })

  it('falla con menos de 7', () => {
    expect(validarDraft([1, 2, 3], 1, precios, 1000)).toEqual({
      ok: false, error: 'Elige exactamente 7 jugadores.',
    })
  })

  it('falla con un dorsal repetido', () => {
    expect(validarDraft([1, 2, 3, 4, 5, 6, 6], 1, precios, 1000).ok).toBe(false)
  })

  it('falla sin capitán', () => {
    expect(validarDraft([1, 2, 3, 4, 5, 6, 7], null, precios, 1000)).toEqual({
      ok: false, error: 'Elige un capitán de tu 7.',
    })
  })

  it('falla si el capitán no está en los 7', () => {
    expect(validarDraft([1, 2, 3, 4, 5, 6, 7], 8, precios, 1000).ok).toBe(false)
  })

  it('falla si el coste total supera el presupuesto', () => {
    expect(validarDraft([1, 2, 3, 4, 5, 6, 8], 1, precios, 1000)).toEqual({
      ok: false, error: 'Te pasas del presupuesto (1100€ de 1000€).',
    })
  })
})
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npx vitest run src/lib/draft.test.ts`
Expected: FAIL — no se encuentra el módulo `./draft`.

- [ ] **Step 3: Implementar**

Crea `src/lib/draft.ts`:

```ts
export type ResultadoValidacion = { ok: true } | { ok: false; error: string }

/** Reglas de un draft válido: exactamente 7 dorsales distintos, capitán
 * entre ellos, coste total dentro del presupuesto disponible. */
export function validarDraft(
  jugadores: number[],
  capitan: number | null,
  precios: Record<number, number>,
  presupuesto: number,
): ResultadoValidacion {
  if (jugadores.length !== 7) return { ok: false, error: 'Elige exactamente 7 jugadores.' }
  if (new Set(jugadores).size !== 7) return { ok: false, error: 'No puedes repetir jugador.' }
  if (capitan === null || !jugadores.includes(capitan)) {
    return { ok: false, error: 'Elige un capitán de tu 7.' }
  }
  const usado = jugadores.reduce((sum, n) => sum + (precios[n] ?? 0), 0)
  if (usado > presupuesto) {
    return { ok: false, error: `Te pasas del presupuesto (${usado}€ de ${presupuesto}€).` }
  }
  return { ok: true }
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npx vitest run src/lib/draft.test.ts`
Expected: PASS, 6 tests en verde.

- [ ] **Step 5: Ejecutar toda la suite del frontend**

Run: `npx vitest run`
Expected: todos los ficheros en verde (no uses `npm run test`, es modo watch).

- [ ] **Step 6: Commit**

```bash
git add src/lib/draft.ts src/lib/draft.test.ts
git commit -m "feat(web): validarDraft — 7 jugadores, capitán, presupuesto"
```

---

### Task 7: Frontend — pantalla `Draft.tsx`

**Files:**
- Create: `src/components/Dashboard/Draft.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `jornadaAbierta` (Task 5), `validarDraft` (Task 6), `calcPrecio`
  (ya existente, `src/lib/precio.ts`), `Jornada`/`Alineacion` (Task 4),
  `calcTotalPoints`/`calcMatchPoints` (existentes, `src/lib/points.ts`).
- Produces: componente `Draft` con props `{ usuario: Usuario; jugadores: Jugador[] }`.
  Task 8 lo monta en `Dashboard.tsx` en vez de `Pool`.

No hay test automatizado para el componente (este proyecto no tiene suite
de componentes — verificación manual, igual que `Pool`/`Ranking`/`Players`
hoy). La lógica de negocio no trivial ya está cubierta por `validarDraft` y
`jornadaAbierta` (Tasks 5-6).

- [ ] **Step 1: Crear `Draft.tsx`**

```tsx
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import type { Jugador, Usuario, Jornada, Alineacion } from '../../types'
import { calcPrecio } from '../../lib/precio'
import { jornadaAbierta } from '../../lib/jornada'
import { validarDraft } from '../../lib/draft'
import { PlayerCard } from './PlayerCard'

interface Props {
  usuario: Usuario
  jugadores: Jugador[]
}

const POSITIONS = ['Todos', 'Portero', 'Boya', 'Extremo', 'Lateral', 'Contraboya']
const PRESUPUESTO_BASE = 1000

export function Draft({ usuario, jugadores }: Props) {
  const [jornada, setJornada] = useState<Jornada | null | 'loading'>('loading')
  const [alineacion, setAlineacion] = useState<Alineacion | null>(null)
  const [presupuesto, setPresupuesto] = useState(PRESUPUESTO_BASE)
  const [seleccion, setSeleccion] = useState<number[]>([])
  const [capitan, setCapitan] = useState<number | null>(null)
  const [posFilter, setPosFilter] = useState('Todos')
  const [selectedCard, setSelectedCard] = useState<Jugador | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')

  const precios = useMemo(() => {
    const m: Record<number, number> = {}
    for (const j of jugadores) m[j.numero] = calcPrecio(j.historial ?? [])
    return m
  }, [jugadores])

  useEffect(() => {
    supabase
      .from('jornadas')
      .select('*')
      .then(({ data }) => {
        const abiertas = (data ?? []) as Jornada[]
        const n = jornadaAbierta(abiertas)
        setJornada(n === null ? null : abiertas.find(j => j.numero === n) ?? null)
      })
  }, [])

  useEffect(() => {
    if (!jornada || jornada === 'loading') return
    supabase
      .from('alineaciones')
      .select('*')
      .eq('usuario_id', usuario.id)
      .eq('jornada', jornada.numero)
      .maybeSingle()
      .then(({ data }) => {
        const a = data as Alineacion | null
        setAlineacion(a)
        setSeleccion(a?.jugadores ?? [])
        setCapitan(a?.capitan ?? null)
      })

    supabase
      .rpc('presupuesto_actual', { p_usuario_id: usuario.id, p_jornada: jornada.numero })
      .then(({ data }) => setPresupuesto(typeof data === 'number' ? data : PRESUPUESTO_BASE))
  }, [jornada, usuario.id])

  if (jornada === 'loading') return <div className="loading-msg">Cargando...</div>

  if (jornada === null) {
    return <p className="placeholder">No hay ninguna jornada abierta para draftear todavía.</p>
  }

  // Bloqueada si ya se resolvió (puntos_jornada asignado) O si el deadline
  // ya pasó aunque la jornada aún no se haya resuelto (el sitio puede
  // quedarse abierto en una pestaña desde antes del cierre) — sin esto, un
  // intento de guardar tras el deadline solo fallaría con el error crudo de
  // la RLS en vez de explicarlo antes de intentarlo.
  const pasadoDeadline = jornada.fecha_partido !== null &&
    new Date(jornada.fecha_partido).getTime() - Date.now() <= 24 * 60 * 60 * 1000
  const bloqueada = pasadoDeadline || (alineacion !== null && alineacion.puntos_jornada !== null)
  const usado = seleccion.reduce((sum, n) => sum + (precios[n] ?? 0), 0)

  const toggleJugador = (numero: number) => {
    if (bloqueada) return
    setSeleccion(prev => {
      if (prev.includes(numero)) {
        if (capitan === numero) setCapitan(null)
        return prev.filter(n => n !== numero)
      }
      if (prev.length >= 7) return prev
      return [...prev, numero]
    })
  }

  const guardar = async () => {
    const validacion = validarDraft(seleccion, capitan, precios, presupuesto)
    if (!validacion.ok) { setMsg(validacion.error); return }
    setGuardando(true)
    setMsg('')
    const { error } = await supabase.from('alineaciones').upsert({
      usuario_id: usuario.id,
      jornada: jornada.numero,
      jugadores: seleccion,
      capitan,
      presupuesto_usado: usado,
    }, { onConflict: 'usuario_id,jornada' })
    setMsg(error ? `Error: ${error.message}` : '✓ Alineación guardada')
    setGuardando(false)
  }

  const filtrados = jugadores.filter(j => posFilter === 'Todos' || j.pos === posFilter)

  return (
    <div className="draft-container">
      <div className="team-total-pts">
        <span>Jornada {jornada.numero} — presupuesto</span>
        <strong>{presupuesto - usado}€ <small>de {presupuesto}€</small></strong>
      </div>

      {bloqueada && (
        <p className="placeholder">
          Alineación bloqueada para esta jornada
          {alineacion?.puntos_jornada !== null && ` — ${alineacion?.puntos_jornada} pts`}
        </p>
      )}

      {!bloqueada && (
        <div className="filter-chips">
          {POSITIONS.map(pos => (
            <button
              key={pos}
              className={`filter-chip ${posFilter === pos ? 'active-all' : ''}`}
              onClick={() => setPosFilter(pos)}
            >
              {pos}
            </button>
          ))}
        </div>
      )}

      <ul className="players-list">
        {filtrados.map(j => {
          const elegido = seleccion.includes(j.numero)
          return (
            <li key={j.id} className={`player-row ${elegido ? 'current-user' : ''}`}>
              <img
                src={j.photo || '/Sharks-Fantasy/jugadores/predeterminado.png'}
                alt={j.nick || j.name}
                className="player-row-photo"
                onClick={() => setSelectedCard(j)}
              />
              <div className="player-row-info" onClick={() => setSelectedCard(j)}>
                <strong>{j.nick || j.name}</strong>
                <span className={`pos-badge pos-${j.pos.toLowerCase()}`}>{j.pos}</span>
              </div>
              <span className="player-row-pts">{precios[j.numero]}€</span>
              {!bloqueada && (
                <>
                  <button
                    className={`draft-pick-btn ${elegido ? 'active' : ''}`}
                    onClick={() => toggleJugador(j.numero)}
                    disabled={!elegido && seleccion.length >= 7}
                  >
                    {elegido ? '✓' : '+'}
                  </button>
                  {elegido && (
                    <button
                      className={`draft-capitan-btn ${capitan === j.numero ? 'active' : ''}`}
                      onClick={() => setCapitan(j.numero)}
                      title="Marcar como capitán"
                    >
                      ★
                    </button>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>

      {!bloqueada && (
        <>
          {msg && <p className="admin-msg">{msg}</p>}
          <button className="save-btn" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : `Guardar (${seleccion.length}/7)`}
          </button>
        </>
      )}

      {selectedCard && <PlayerCard jugador={selectedCard} onClose={() => setSelectedCard(null)} />}
    </div>
  )
}
```

- [ ] **Step 2: CSS del draft**

Añade a `src/index.css`, junto a la sección de `PLAYERS BROWSER`:

```css
/* ==========================================================================
   DRAFT (Fase B)
   ========================================================================== */

.draft-container {
  max-width: 720px;
  margin: 0 auto;
}

.draft-pick-btn {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: transparent;
  color: var(--text-muted);
  font-size: 1.1rem;
  transition: background 0.18s, border-color 0.18s, color 0.18s;
}

.draft-pick-btn.active {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--bg-dark);
}

.draft-pick-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.draft-capitan-btn {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(255, 215, 0, 0.3);
  background: transparent;
  color: rgba(255, 215, 0, 0.4);
  font-size: 1.1rem;
  margin-left: 4px;
  transition: color 0.18s, border-color 0.18s;
}

.draft-capitan-btn.active {
  color: var(--accent);
  border-color: var(--accent);
}
```

- [ ] **Step 3: Verificar que el build compila**

Run: `npm run build`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/Dashboard/Draft.tsx src/index.css
git commit -m "feat(web): Draft screen — pick 7, captain, budget, save"
```

---

### Task 8: Frontend — sustituir `Pool` por `Draft`, quitar `usuarios.equipo`

**Files:**
- Modify: `src/components/Dashboard/Dashboard.tsx`
- Modify: `src/App.tsx`
- Modify: `src/hooks/useUsuario.ts`
- Delete: `src/components/Dashboard/Pool.tsx`

**Interfaces:**
- Consumes: `Draft` (Task 7).

- [ ] **Step 1: `Dashboard.tsx` monta `Draft` en vez de `Pool`**

En `src/components/Dashboard/Dashboard.tsx`:
- Cambia el import `import { Pool } from './Pool'` por `import { Draft } from './Draft'`.
- Quita `onUpdateEquipo` de `Props` y de la firma de `Dashboard`.
- Cambia `{tab === 'team' && <Pool usuario={usuario} jugadores={jugadores} onUpdateEquipo={onUpdateEquipo} />}`
  por `{tab === 'team' && <Draft usuario={usuario} jugadores={jugadores} />}`.

- [ ] **Step 2: `App.tsx` deja de pasar `onUpdateEquipo`**

En `src/App.tsx`:
- Quita `updateEquipo` de la desestructuración de `useUsuario(user?.id)`.
- Quita la prop `onUpdateEquipo={updateEquipo}` del `<Dashboard ... />`.

- [ ] **Step 3: `useUsuario.ts` pierde `updateEquipo`**

En `src/hooks/useUsuario.ts`, elimina la función `updateEquipo` completa y
quítala del `return` del hook (ya no la usa nadie tras el Step 2).

- [ ] **Step 4: Borrar `Pool.tsx`**

```bash
git rm src/components/Dashboard/Pool.tsx
```

- [ ] **Step 5: Verificar que el build compila**

Run: `npm run build`
Expected: 0 errores (confirma que no queda ninguna referencia a `Pool`,
`onUpdateEquipo` o `updateEquipo`).

- [ ] **Step 6: Ejecutar la suite del frontend**

Run: `npx vitest run`
Expected: todo en verde.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(web): Dashboard mounts Draft instead of Pool, drop updateEquipo"
```

---

### Task 9: Frontend — `Ranking.tsx`: "ver equipo" muestra la última alineación resuelta

**Files:**
- Modify: `src/components/Ranking/Ranking.tsx`

**Interfaces:**
- Consumes: `Alineacion` (Task 4).

- [ ] **Step 1: Reescribir el modal "ver equipo"**

Sustituye el bloque de estado y el modal en `src/components/Ranking/Ranking.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Usuario, Jugador, Alineacion } from '../../types'
import { PlayerCard } from '../Dashboard/PlayerCard'

interface Props {
  jugadores: Jugador[]
  currentUserId: string
}

const MEDAL: Record<number, string> = { 0: '🥇', 1: '🥈', 2: '🥉' }
const RANK_CLASS: Record<number, string> = { 0: 'rank-gold', 1: 'rank-silver', 2: 'rank-bronze' }

export function Ranking({ jugadores, currentUserId }: Props) {
  const [ranking, setRanking] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [viewTeam, setViewTeam] = useState<Usuario | null>(null)
  const [viewAlineacion, setViewAlineacion] = useState<Alineacion | null | 'none'>('none')
  const [viewPlayer, setViewPlayer] = useState<Jugador | null>(null)

  useEffect(() => {
    supabase
      .from('usuarios')
      .select('*')
      .order('puntos', { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (error) console.error('Ranking fetch error:', error)
        if (data) setRanking(data as Usuario[])
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!viewTeam) return
    setViewAlineacion('none')
    supabase
      .from('alineaciones')
      .select('*')
      .eq('usuario_id', viewTeam.id)
      .not('puntos_jornada', 'is', null)
      .order('jornada', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setViewAlineacion((data as Alineacion) ?? null))
  }, [viewTeam])

  if (loading) return <div className="loading-msg">Cargando ranking...</div>

  return (
    <div className="ranking">
      <h2 className="section-title">Top 10</h2>
      <ol className="ranking-list">
        {ranking.map((u, i) => {
          const isMedal = i < 3
          const isCurrentUser = u.id === currentUserId
          return (
            <li
              key={u.id}
              className={`ranking-item ${isCurrentUser ? 'current-user' : ''} ${isMedal ? RANK_CLASS[i] : ''}`}
              onClick={() => setViewTeam(u)}
            >
              <span className="rank-pos">{isMedal ? MEDAL[i] : `#${i + 1}`}</span>
              <span className="rank-name">{u.nombre}</span>
              <span className="rank-pts">{u.puntos} pts</span>
            </li>
          )
        })}
      </ol>

      {viewTeam && (
        <div className="modal-overlay" onClick={() => setViewTeam(null)}>
          <div className="team-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setViewTeam(null)}>×</button>
            <h3>{viewTeam.nombre}</h3>
            {viewAlineacion === 'none' && <p className="placeholder">Cargando...</p>}
            {viewAlineacion === null && (
              <p className="placeholder">Todavía no tiene ninguna jornada resuelta.</p>
            )}
            {viewAlineacion && viewAlineacion !== 'none' && (
              <>
                <p className="placeholder">Jornada {viewAlineacion.jornada} — {viewAlineacion.puntos_jornada} pts</p>
                <div className="mini-pool">
                  {(viewAlineacion.jugadores ?? []).map(id => {
                    const p = jugadores.find(j => j.numero === id)
                    if (!p) return null
                    return (
                      <button key={id} className="mini-player" onClick={() => setViewPlayer(p)}>
                        <img src={p.photo || '/Sharks-Fantasy/jugadores/predeterminado.png'} alt={p.nick || p.name} />
                        <span>{p.nick || p.name}{viewAlineacion.capitan === id ? ' ★' : ''}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {viewPlayer && (
        <PlayerCard jugador={viewPlayer} onClose={() => setViewPlayer(null)} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar que el build compila**

Run: `npm run build`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/Ranking/Ranking.tsx
git commit -m "feat(web): Ranking ver-equipo shows the latest resolved alineacion"
```

---

### Task 10: Verificación manual end-to-end + aplicar migración a prod + push/PR

**Files:** ninguno nuevo.

- [ ] **Step 1: Suites completas en verde**

Run: `npm run build && npx vitest run && npm run lint`
Run: `cd scraper && npx tsc --noEmit && npm run test`
Expected: todo en verde.

- [ ] **Step 2 (controlador): Pedir confirmación y aplicar la migración de Task 1 a prod**

Muestra el SQL del fichero `20260912000000_fantasy_dinamico_fase_b_cutover.sql`
al usuario. Solo tras el ok, `mcp__claude_ai_Supabase__apply_migration`
contra `sihvxbhqcyynuulhqmii`.

- [ ] **Step 3 (controlador): Verificar en prod**

Run `mcp__claude_ai_Supabase__execute_sql`:

```sql
SELECT policyname, qual FROM pg_policies WHERE tablename = 'alineaciones' AND policyname = 'alineaciones_select';
SELECT prosrc FROM pg_proc WHERE proname = 'resolver_jornada';
```

Expected: la política ya no tiene `USING (true)`; el código de la función
incluye el `UPDATE usuarios` (ya no comentado).

- [ ] **Step 4: Arrancar el dev server y probar el draft de verdad**

Run: `npm run dev`. Con una cuenta real: entra en "Mi Equipo", confirma que
aparece la pantalla de draft (o el aviso de "no hay jornada abierta" si el
scraper todavía no ha escrito ninguna fecha futura — en ese caso, correr
`cd scraper && npm run sync` en local para poblar `jornadas` antes de
probar). Elige 7, marca capitán, guarda. Confirma en Ranking que "ver
equipo" ya no rompe (mostrará "todavía no tiene ninguna jornada resuelta"
para todo el mundo hasta que se resuelva la primera jornada con este
sistema).

- [ ] **Step 5: Push y PR**

```bash
git push -u origin feature/fantasy-dinamico-fase-b
```

Abre PR contra `develop`. Título sugerido: "feat: fantasy dinámico — Fase B
(draft, presupuesto, capitán)". Cuerpo: enlaza el spec y este plan.
