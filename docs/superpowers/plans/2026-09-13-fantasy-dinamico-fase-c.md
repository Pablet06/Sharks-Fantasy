# Fantasy dinámico — Fase C (apuestas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship apuestas: antes del deadline de cada jornada, el usuario apuesta
sobre hasta 4 resultados con cuotas automáticas; acertar o fallar ajusta el
presupuesto de la jornada siguiente.

**Architecture:** Una tabla `apuestas` + una función `cuota_actual()` (llamada
también desde el frontend vía RPC para mostrar la cuota antes de apostar) +
un trigger que congela la cuota al insertar (nunca la manda el cliente) +
una extensión de `resolver_jornada()` que resuelve las apuestas de la
jornada y financia `presupuestos` de la siguiente. Frontend: una pestaña
nueva "Apuestas" independiente del draft.

**Tech Stack:** Supabase Postgres (SQL, RLS, PL/pgSQL, triggers), React 19 + TypeScript frontend (Vitest).

**Spec:** `docs/superpowers/specs/2026-09-11-fantasy-dinamico-design.md` (Subproyecto C)

## Global Constraints

- 4 tipos de apuesta por jornada, una selección por tipo: `resultado`
  (gana/pierde/empata), `goleador` (dorsal), `expulsado` (dorsal), `porteria`
  (selección fija `'si'`).
- Importe total apostado esa jornada (suma de las 4) ≤ 20% del presupuesto
  de esa jornada.
- Cuota = `clamp(1 / prob, 1.2, 2.1)`, probabilidad sobre **todo el
  histórico de la temporada hasta la jornada anterior** (no una ventana);
  sin histórico, `prob = 0.5`.
- **La cuota nunca la manda el cliente** — la fija un trigger `BEFORE
  INSERT` en el servidor, usando la misma función que el frontend llama
  para previsualizarla.
- Empate en `goleador`/`expulsado` → nadie acierta, se devuelve el importe
  (`ganancia = 0`), no cuenta como fallo.
- `presupuesto(jornada+1) = max(0, 1000 + suma de ganancias de esa jornada)`.
  Sin suelo de seguridad. Si la jornada+1 no existe todavía, no se escribe
  nada.
- Apuestas **privadas siempre** — solo el dueño y el admin las ven, ni
  siquiera resueltas (a diferencia de `alineaciones`).
- Sin ramas de Supabase (plan Free) — igual que en Fases A y B, el
  controlador aplica las migraciones a prod con confirmación explícita del
  usuario; ningún implementador de tarea llama a un MCP de Supabase.

---

### Task 1: Migración — tabla `apuestas`, `cuota_actual()`, trigger de cuota

**Files:**
- Create: `supabase/migrations/20260913000000_fantasy_apuestas.sql`

**Interfaces:**
- Consumes: `jornadas`, `historial`, `jugadores`, `is_admin(uuid)` (ya en prod).
- Produces: tabla `apuestas(id, usuario_id, jornada, tipo, seleccion,
  importe, cuota, resuelto, acierto, ganancia, creado_en)`; función
  `cuota_actual(p_tipo text, p_seleccion text, p_jornada integer) RETURNS numeric`.
  Task 2 (resolución) y el frontend (Task 5, vía RPC) los usan.

**El implementador de esta tarea escribe y commitea el fichero `.sql` — NO
llama a ningún MCP de Supabase.** El controlador lo aplica a prod en la
Task 7, con confirmación del usuario.

- [ ] **Step 1: Crear el fichero de migración**

```sql
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

CREATE OR REPLACE FUNCTION apuestas_fijar_cuota()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.cuota := cuota_actual(NEW.tipo, NEW.seleccion, NEW.jornada);
  RETURN NEW;
END $$;

CREATE TRIGGER apuestas_before_insert
BEFORE INSERT ON apuestas
FOR EACH ROW EXECUTE FUNCTION apuestas_fijar_cuota();
```

- [ ] **Step 2: Commit del fichero (el implementador para aquí)**

```bash
git add supabase/migrations/20260913000000_fantasy_apuestas.sql
git commit -m "feat(db): apuestas table + cuota_actual() + server-side cuota trigger"
```

Reporta DONE con el path del fichero. La aplicación a prod es la Task 7
(controlador, con confirmación del usuario).

---

### Task 2: Migración — `resolver_jornada()` resuelve apuestas y financia la siguiente jornada

**Files:**
- Create: `supabase/migrations/20260913000001_fantasy_apuestas_resolver.sql`

**Interfaces:**
- Consumes: `apuestas`, `presupuestos`, `jornadas`, `historial`, `jugadores`
  (Task 1 y migraciones previas).
- Produces: `resolver_jornada(integer)` ampliada — mismo nombre y firma, se
  sustituye entera vía `CREATE OR REPLACE`.

**El implementador escribe y commitea el fichero — NO llama a ningún MCP de
Supabase.**

- [ ] **Step 1: Crear el fichero de migración**

```sql
-- Migration: fantasy_apuestas_resolver
-- Amplía resolver_jornada() (ya en prod desde Fase B) para resolver las
-- apuestas de la jornada y financiar el presupuesto de la siguiente.
-- Todo lo demás de la función (guardas, puntuación de alineaciones,
-- finalizado) es idéntico a la versión de Fase B.

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

  UPDATE usuarios u SET puntos = COALESCE(
    (SELECT SUM(a.puntos_jornada) FROM alineaciones a
     WHERE a.usuario_id = u.id AND a.puntos_jornada IS NOT NULL), 0);

  -- Apuestas de resultado.
  UPDATE apuestas a SET
    resuelto = true,
    acierto = (a.seleccion = j.resultado),
    ganancia = CASE WHEN a.seleccion = j.resultado
      THEN a.importe * a.cuota - a.importe
      ELSE -a.importe END
  FROM jornadas j
  WHERE a.jornada = p_jornada AND a.tipo = 'resultado' AND j.numero = p_jornada AND NOT a.resuelto;

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
    acierto = (SELECT array_length(nums, 1) = 1 AND a.seleccion::int = ANY(nums) FROM lideres),
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
    acierto = (SELECT array_length(nums, 1) = 1 AND a.seleccion::int = ANY(nums) FROM lideres),
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

  -- Financia el presupuesto de la jornada siguiente con la ganancia neta de
  -- apuestas, solo si esa jornada ya existe. Sin fila = presupuesto_actual
  -- cae a los 1000€ base (nadie apostó, o la jornada+1 no existe todavía).
  IF EXISTS (SELECT 1 FROM jornadas WHERE numero = p_jornada + 1) THEN
    INSERT INTO presupuestos (usuario_id, jornada, presupuesto)
    SELECT a.usuario_id, p_jornada + 1, GREATEST(0, 1000 + COALESCE(SUM(a.ganancia), 0))
    FROM apuestas a
    WHERE a.jornada = p_jornada AND a.resuelto
    GROUP BY a.usuario_id
    ON CONFLICT (usuario_id, jornada) DO UPDATE SET presupuesto = EXCLUDED.presupuesto;
  END IF;

  UPDATE jornadas SET finalizado = true WHERE numero = p_jornada;
END $$;

REVOKE ALL ON FUNCTION resolver_jornada(integer) FROM public;
GRANT EXECUTE ON FUNCTION resolver_jornada(integer) TO authenticated, service_role;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260913000001_fantasy_apuestas_resolver.sql
git commit -m "feat(db): resolver_jornada resolves apuestas, funds next jornada's presupuesto"
```

---

### Task 3: Frontend — tipo `Apuesta`

**Files:**
- Modify: `src/types/index.ts`

**Interfaces:**
- Produces: `export interface Apuesta { id: number; usuario_id: string; jornada: number; tipo: 'resultado' | 'goleador' | 'expulsado' | 'porteria'; seleccion: string; importe: number; cuota: number | null; resuelto: boolean; acierto: boolean | null; ganancia: number | null; creado_en: string }`.
  Tasks 4-6 lo usan.

- [ ] **Step 1: Añadir el tipo**

Al final de `src/types/index.ts`:

```ts
export interface Apuesta {
  id: number
  usuario_id: string
  jornada: number
  tipo: 'resultado' | 'goleador' | 'expulsado' | 'porteria'
  seleccion: string
  importe: number
  cuota: number | null
  resuelto: boolean
  acierto: boolean | null
  ganancia: number | null
  creado_en: string
}
```

- [ ] **Step 2: Verificar que el build compila**

Run: `npm run build`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(web): Apuesta type"
```

---

### Task 4: Frontend — `src/lib/apuestas.ts` (validación del tope de apuestas)

**Files:**
- Create: `src/lib/apuestas.ts`
- Test: `src/lib/apuestas.test.ts`

**Interfaces:**
- Produces: `export interface ApuestaInput { tipo: string; seleccion: string; importe: number }`;
  `validarApuestas(apuestas: ApuestaInput[], presupuesto: number): { ok: true } | { ok: false; error: string }`.
  Task 6 (`Apuestas.tsx`) la usa antes de guardar.

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/apuestas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validarApuestas } from './apuestas'

describe('validarApuestas', () => {
  it('ok con importes positivos dentro del 20% del presupuesto', () => {
    expect(validarApuestas([{ tipo: 'resultado', seleccion: 'gana', importe: 100 }], 1000))
      .toEqual({ ok: true })
  })

  it('ok sumando varias apuestas hasta el tope exacto', () => {
    const apuestas = [
      { tipo: 'resultado', seleccion: 'gana', importe: 100 },
      { tipo: 'porteria', seleccion: 'si', importe: 100 },
    ]
    expect(validarApuestas(apuestas, 1000)).toEqual({ ok: true })
  })

  it('falla si algún importe es 0 o negativo', () => {
    expect(validarApuestas([{ tipo: 'resultado', seleccion: 'gana', importe: 0 }], 1000)).toEqual({
      ok: false, error: 'El importe debe ser mayor que 0.',
    })
  })

  it('falla si la suma supera el 20% del presupuesto', () => {
    const apuestas = [
      { tipo: 'resultado', seleccion: 'gana', importe: 150 },
      { tipo: 'porteria', seleccion: 'si', importe: 100 },
    ]
    expect(validarApuestas(apuestas, 1000)).toEqual({
      ok: false, error: 'El total apostado (250€) supera el 20% del presupuesto (200€).',
    })
  })
})
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npx vitest run src/lib/apuestas.test.ts`
Expected: FAIL — no se encuentra el módulo `./apuestas`.

- [ ] **Step 3: Implementar**

Crea `src/lib/apuestas.ts`:

```ts
export interface ApuestaInput {
  tipo: string
  seleccion: string
  importe: number
}

export type ResultadoValidacionApuestas = { ok: true } | { ok: false; error: string }

/** Regla de apuestas válidas: todos los importes > 0, y la suma de todas
 * las apuestas de la jornada no supera el 20% del presupuesto disponible. */
export function validarApuestas(
  apuestas: ApuestaInput[],
  presupuesto: number,
): ResultadoValidacionApuestas {
  if (apuestas.some(a => a.importe <= 0)) {
    return { ok: false, error: 'El importe debe ser mayor que 0.' }
  }
  const total = apuestas.reduce((sum, a) => sum + a.importe, 0)
  const tope = presupuesto * 0.2
  if (total > tope) {
    return {
      ok: false,
      error: `El total apostado (${total}€) supera el 20% del presupuesto (${Math.round(tope)}€).`,
    }
  }
  return { ok: true }
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npx vitest run src/lib/apuestas.test.ts`
Expected: PASS, 4 tests en verde.

- [ ] **Step 5: Ejecutar toda la suite del frontend**

Run: `npx vitest run`
Expected: todo en verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/apuestas.ts src/lib/apuestas.test.ts
git commit -m "feat(web): validarApuestas — 20% cap on total staked per jornada"
```

---

### Task 5: Frontend — pantalla `Apuestas.tsx`

**Files:**
- Create: `src/components/Dashboard/Apuestas.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `jornadaAbierta` (`src/lib/jornada.ts`, ya existente), `validarApuestas`
  (Task 4), `Jornada`/`Apuesta` (Task 3, ya existente `Jornada`).
- Produces: componente `Apuestas` con props `{ usuario: Usuario; jugadores: Jugador[] }`.
  Task 6 lo monta en `Dashboard.tsx`.

No hay test automatizado para el componente (mismo criterio que `Draft`/
`Ranking`/`Players` — verificación manual, la lógica no trivial ya está
cubierta por `validarApuestas`).

- [ ] **Step 1: Crear `Apuestas.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Jugador, Usuario, Jornada, Apuesta } from '../../types'
import { jornadaAbierta } from '../../lib/jornada'
import { validarApuestas } from '../../lib/apuestas'

interface Props {
  usuario: Usuario
  jugadores: Jugador[]
}

type Tipo = 'resultado' | 'goleador' | 'expulsado' | 'porteria'

const TIPOS: { tipo: Tipo; label: string }[] = [
  { tipo: 'resultado', label: 'Resultado del partido' },
  { tipo: 'goleador', label: 'Máximo goleador' },
  { tipo: 'expulsado', label: 'Más expulsado' },
  { tipo: 'porteria', label: 'Portería: menos de 8 goles' },
]

interface Fila {
  seleccion: string
  importe: string
  cuota: number | null
}

const filaVacia = (seleccion = ''): Fila => ({ seleccion, importe: '', cuota: null })

export function Apuestas({ usuario, jugadores }: Props) {
  const [jornada, setJornada] = useState<Jornada | null | 'loading'>('loading')
  const [existentes, setExistentes] = useState<Apuesta[]>([])
  const [presupuesto, setPresupuesto] = useState(1000)
  const [filas, setFilas] = useState<Record<Tipo, Fila>>({
    resultado: filaVacia(),
    goleador: filaVacia(),
    expulsado: filaVacia(),
    porteria: filaVacia('si'),
  })
  const [guardando, setGuardando] = useState(false)
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
      .from('apuestas')
      .select('*')
      .eq('usuario_id', usuario.id)
      .eq('jornada', jornada.numero)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Apuestas fetch error:', error)
        setExistentes((data ?? []) as Apuesta[])
      })
    supabase
      .rpc('presupuesto_actual', { p_usuario_id: usuario.id, p_jornada: jornada.numero })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Presupuesto fetch error:', error)
        setPresupuesto(typeof data === 'number' ? data : 1000)
      })
    return () => {
      cancelled = true
    }
  }, [jornada, usuario.id])

  const actualizarCuota = async (tipo: Tipo, seleccion: string, jornadaNumero: number) => {
    if (!seleccion) return
    const { data, error } = await supabase.rpc('cuota_actual', {
      p_tipo: tipo, p_seleccion: seleccion, p_jornada: jornadaNumero,
    })
    if (error) { console.error('Cuota fetch error:', error); return }
    setFilas(prev => ({ ...prev, [tipo]: { ...prev[tipo], cuota: typeof data === 'number' ? data : null } }))
  }

  useEffect(() => {
    if (!jornada || jornada === 'loading') return
    actualizarCuota('porteria', 'si', jornada.numero)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jornada])

  if (jornada === 'loading') return <div className="loading-msg">Cargando...</div>

  if (jornada === null) {
    return <p className="placeholder">No hay ninguna jornada abierta para apostar todavía.</p>
  }

  const bloqueada = jornada.fecha_partido !== null &&
    new Date(jornada.fecha_partido).getTime() - Date.now() <= 24 * 60 * 60 * 1000

  const setSeleccion = (tipo: Tipo, seleccion: string) => {
    setFilas(prev => ({ ...prev, [tipo]: { ...prev[tipo], seleccion, cuota: null } }))
    actualizarCuota(tipo, seleccion, jornada.numero)
  }

  const setImporte = (tipo: Tipo, importe: string) => {
    setFilas(prev => ({ ...prev, [tipo]: { ...prev[tipo], importe } }))
  }

  const guardar = async () => {
    const pasadoDeadlineNow = jornada.fecha_partido !== null &&
      new Date(jornada.fecha_partido).getTime() - Date.now() <= 24 * 60 * 60 * 1000
    if (pasadoDeadlineNow) { setMsg('Esta jornada ya está bloqueada.'); return }

    const activas = TIPOS
      .map(({ tipo }) => ({ tipo, seleccion: filas[tipo].seleccion, importe: Number(filas[tipo].importe) || 0 }))
      .filter(a => a.seleccion && a.importe > 0)

    if (activas.length === 0) { setMsg('Elige al menos una apuesta.'); return }

    const validacion = validarApuestas(activas, presupuesto)
    if (!validacion.ok) { setMsg(validacion.error); return }

    setGuardando(true)
    setMsg('')
    const { error } = await supabase.from('apuestas').upsert(
      activas.map(a => ({
        usuario_id: usuario.id,
        jornada: jornada.numero,
        tipo: a.tipo,
        seleccion: a.seleccion,
        importe: a.importe,
      })),
      { onConflict: 'usuario_id,jornada,tipo' },
    )
    setMsg(error ? `Error: ${error.message}` : '✓ Apuestas guardadas')
    setGuardando(false)
  }

  return (
    <div className="apuestas-container">
      <div className="team-total-pts">
        <span>Jornada {jornada.numero} — presupuesto</span>
        <strong>{presupuesto}€</strong>
      </div>

      {bloqueada ? (
        <div className="apuestas-list">
          {TIPOS.map(({ tipo, label }) => {
            const previa = existentes.find(a => a.tipo === tipo)
            if (!previa) return null
            return (
              <div key={tipo} className="apuesta-row">
                <span>{label}: {previa.seleccion} — {previa.importe}€ a {previa.cuota}x</span>
                {previa.resuelto && (
                  <span className={(previa.ganancia ?? 0) > 0 ? 'pts-positive' : (previa.ganancia ?? 0) < 0 ? 'pts-negative' : ''}>
                    {previa.acierto === null ? 'empate' : previa.acierto ? 'acierto' : 'fallo'} ({previa.ganancia}€)
                  </span>
                )}
              </div>
            )
          })}
          {existentes.length === 0 && <p className="placeholder">No apostaste nada esta jornada.</p>}
        </div>
      ) : (
        <>
          {TIPOS.map(({ tipo, label }) => (
            <div key={tipo} className="apuesta-row">
              <span>{label}</span>
              {tipo === 'resultado' && (
                <select value={filas.resultado.seleccion} onChange={e => setSeleccion('resultado', e.target.value)}>
                  <option value="">—</option>
                  <option value="gana">Gana</option>
                  <option value="pierde">Pierde</option>
                  <option value="empata">Empata</option>
                </select>
              )}
              {(tipo === 'goleador' || tipo === 'expulsado') && (
                <select value={filas[tipo].seleccion} onChange={e => setSeleccion(tipo, e.target.value)}>
                  <option value="">—</option>
                  {jugadores.map(j => (
                    <option key={j.numero} value={String(j.numero)}>{j.nick || j.name}</option>
                  ))}
                </select>
              )}
              {tipo === 'porteria' && <span>¿Menos de 8 goles?</span>}
              {filas[tipo].cuota !== null && <span className="apuesta-cuota">{filas[tipo].cuota}x</span>}
              <input
                type="number"
                placeholder="Importe €"
                value={filas[tipo].importe}
                onChange={e => setImporte(tipo, e.target.value)}
              />
            </div>
          ))}
          {msg && <p className="admin-msg">{msg}</p>}
          <button className="save-btn" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar apuestas'}
          </button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: CSS**

Añade a `src/index.css`, junto a la sección `DRAFT`:

```css
/* ==========================================================================
   APUESTAS (Fase C)
   ========================================================================== */

.apuestas-container {
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.apuesta-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 12px 16px;
  background: var(--bg-card);
  border: var(--border);
  border-radius: var(--radius);
}

.apuesta-row select,
.apuesta-row input[type="number"] {
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: #fff;
  padding: 6px 10px;
}

.apuesta-row input[type="number"] {
  width: 90px;
}

.apuesta-cuota {
  font-family: 'Teko', sans-serif;
  font-size: 1.2rem;
  color: var(--accent);
}

.apuestas-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
```

- [ ] **Step 3: Verificar que el build compila**

Run: `npm run build`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/Dashboard/Apuestas.tsx src/index.css
git commit -m "feat(web): Apuestas screen — 4 bet types, live odds, 20% cap"
```

---

### Task 6: Frontend — pestaña "Apuestas" en la navegación

**Files:**
- Modify: `src/components/Dashboard/Shell.tsx`
- Modify: `src/components/Dashboard/Dashboard.tsx`

**Interfaces:**
- Consumes: `Apuestas` (Task 5).

- [ ] **Step 1: Ampliar `Shell.tsx`**

En `src/components/Dashboard/Shell.tsx`, cambia el tipo `Tab`:

```ts
export type Tab = 'team' | 'ranking' | 'players' | 'profile' | 'apuestas'
```

Y añade una entrada a `NAV_ITEMS` (después de `'team'`, antes de `'ranking'`):

```ts
const NAV_ITEMS: { tab: Tab; icon: string; label: string }[] = [
  { tab: 'team',     icon: '🌊', label: 'Mi Equipo'  },
  { tab: 'apuestas', icon: '🎲', label: 'Apuestas'   },
  { tab: 'ranking',  icon: '🏆', label: 'Ranking'    },
  { tab: 'players',  icon: '👥', label: 'Jugadores'  },
  { tab: 'profile',  icon: '👤', label: 'Perfil'     },
]
```

- [ ] **Step 2: Montar `Apuestas` en `Dashboard.tsx`**

En `src/components/Dashboard/Dashboard.tsx`, añade el import:

```tsx
import { Apuestas } from './Apuestas'
```

Y añade la rama de renderizado junto a las demás (después de `tab === 'team'`):

```tsx
{tab === 'apuestas' && <Apuestas usuario={usuario} jugadores={jugadores} />}
```

- [ ] **Step 3: Verificar que el build compila**

Run: `npm run build`
Expected: 0 errores.

- [ ] **Step 4: Ejecutar toda la suite del frontend**

Run: `npx vitest run`
Expected: todo en verde.

- [ ] **Step 5: Commit**

```bash
git add src/components/Dashboard/Shell.tsx src/components/Dashboard/Dashboard.tsx
git commit -m "feat(web): wire Apuestas into the nav"
```

---

### Task 7: Verificación manual end-to-end + aplicar migraciones a prod + push/PR

**Files:** ninguno nuevo.

- [ ] **Step 1: Suites completas en verde**

Run: `npm run build && npx vitest run && npm run lint`
Expected: todo en verde (esta fase no toca el scraper).

- [ ] **Step 2 (controlador): Pedir confirmación y aplicar las dos migraciones a prod**

Muestra el SQL de `20260913000000_fantasy_apuestas.sql` y
`20260913000001_fantasy_apuestas_resolver.sql` al usuario. Solo tras el ok,
`mcp__claude_ai_Supabase__apply_migration` contra `sihvxbhqcyynuulhqmii`,
una migración cada vez.

- [ ] **Step 3 (controlador): Verificar `cuota_actual` con datos reales**

Run `mcp__claude_ai_Supabase__execute_sql` contra prod (usa jornadas y
dorsales reales de la temporada ya backfillada):

```sql
SELECT cuota_actual('resultado', 'gana', 999) AS cuota_gana;
SELECT cuota_actual('resultado', 'pierde', 999) AS cuota_pierde;
SELECT cuota_actual('porteria', 'si', 999) AS cuota_porteria;
```

Expected: los tres valores están entre 1.2 y 2.1; la suma implícita de
probabilidades de `resultado` (gana+pierde+empata) debería rondar 1.0 si
hay histórico suficiente.

- [ ] **Step 4 (controlador): Verificar el trigger y la resolución con datos de prueba**

Pide confirmación al usuario antes de este bloque (escribe en `apuestas` y
llama a `resolver_jornada`, aunque con datos de prueba en una jornada
sentinela, no en una jornada con usuarios reales apostando). Run
`mcp__claude_ai_Supabase__execute_sql`:

```sql
INSERT INTO jornadas (numero, fecha_partido) VALUES (999, now() + interval '10 days')
  ON CONFLICT (numero) DO NOTHING;
INSERT INTO jornadas (numero, fecha_partido) VALUES (998, NULL)
  ON CONFLICT (numero) DO NOTHING; -- jornada "ya jugada" de prueba, resultado se fija a mano abajo

SELECT id FROM usuarios LIMIT 1; -- anota <UID>

INSERT INTO apuestas (usuario_id, jornada, tipo, seleccion, importe)
VALUES ('<UID>', 998, 'resultado', 'gana', 50);

SELECT cuota, resuelto FROM apuestas WHERE usuario_id = '<UID>' AND jornada = 998;
-- Expected: cuota ya rellenada por el trigger (no NULL), resuelto = false

UPDATE jornadas SET resultado = 'gana', finalizado = false WHERE numero = 998;
-- resolver_jornada exige historial para la jornada; usa una que ya tenga
-- (p. ej. la última jornada real con historial) en vez de 998 si hace
-- falta un caso real de extremo a extremo — para este smoke test basta con
-- comprobar que el UPDATE de apuestas no revienta si no hay historial:
SELECT resolver_jornada(998); -- no-op esperado (sin historial para 998)
SELECT resuelto FROM apuestas WHERE usuario_id = '<UID>' AND jornada = 998;
-- Expected: sigue en false (resolver_jornada no tocó nada, correcto)
```

Expected: la cuota se rellena sola al insertar (nunca NULL, nunca lo que
mandó el cliente porque el INSERT no incluyó `cuota`); `resolver_jornada`
en una jornada sin historial no revienta y no resuelve nada.

- [ ] **Step 5 (controlador): Limpiar los datos de prueba**

```sql
DELETE FROM apuestas WHERE jornada IN (998, 999);
DELETE FROM jornadas WHERE numero IN (998, 999);
SELECT nombre, puntos FROM usuarios ORDER BY nombre; -- confirma sin cambios
```

- [ ] **Step 6: Arrancar el dev server y probar la pantalla de Apuestas**

Run: `npm run dev`. Con una cuenta real: entra en "Apuestas". Si no hay
jornada abierta, inserta temporalmente una jornada de prueba (numero 999,
fecha futura) como en la Fase B, con confirmación del usuario. Comprueba:
cuota de "Portería" visible al cargar; elegir un resultado o jugador
recalcula su cuota; guardar con un importe que supere el 20% del
presupuesto muestra el error exacto de `validarApuestas`; guardar dentro
del tope funciona. Limpia la jornada de prueba al terminar.

- [ ] **Step 7: Push y PR**

```bash
git push -u origin feature/fantasy-dinamico-fase-c
```

Abre PR contra `develop`. Título sugerido: "feat: fantasy dinámico — Fase C
(apuestas)". Cuerpo: enlaza el spec y este plan.
