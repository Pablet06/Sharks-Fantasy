# Extended Admin Panel (Phase B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the (currently disabled) `AdminPanel` modal into a full in-app admin view — Jugadores / Historial / Sync / Usuarios / Temporada — backed by real server-enforced RLS and a single Postgres recalculation function.

**Architecture:** A new `AdminView` replaces the Shell's `<main>` content when an admin clicks "Admin" (the nav tabs hide, `AdminView` has its own sub-nav + a "back to app" button). One shared hook `useAdminData` loads `jugadores` + `usuarios` + `config`; each section mutates through the anon Supabase client and RLS decides. All writes that change `historial` end with an RPC call to `recalc_puntos()` — one SECURITY DEFINER function that rebuilds `jugadores.stats` and `usuarios.puntos` from `historial`. RLS admin checks move to a single `is_admin(uuid)` SECURITY DEFINER function to avoid policy recursion on `usuarios`.

**Tech Stack:** React 19 + TypeScript + Vite, `@supabase/supabase-js` (anon key, RLS-enforced), Supabase Postgres migrations + RLS, one Deno edge function. `vitest` (node env — see constraints).

**Spec:** `docs/superpowers/specs/2026-09-03-federation-sync-and-admin-design.md` — read "Subproyecto B" (sections B1–B4) and "Riesgos / ceilings conocidos".

## Global Constraints

- **Supabase project id:** `sihvxbhqcyynuulhqmii` (name `sharks-fantasy`). Apply migrations to a **development branch** first (`mcp__claude_ai_Supabase__create_branch`), verify, then merge — never straight to prod.
- **No seasons table.** Season config is rows in the existing `config` key/value table (`tournament_id`, `last_sync_at`, `unmatched_players`).
- **`PlayerStats` shape (exact field names), 9 fields:**
  ```ts
  interface PlayerStats {
    partidos: number; goles: number; goles_penalti: number
    penaltis_fallados: number; faltas_penalti: number; tarjetas: number
    expulsiones: number; expulsiones_graves: number; goles_contra: number
  }
  ```
- **`goles_contra` in accumulated `jugadores.stats` is always 0** — it is a per-match figure only. Both the scraper's `recalc()` and the new `recalc_puntos()` RPC must force it to 0 in the accumulation.
- **`equipo` is exactly 7 `jugadores.numero` values** — 1 Portero + 6 field players. Editing a user's team must keep that invariant.
- **Scoring formula lives in `src/lib/points.ts`** (`calcMatchPoints(pos, stats)`), mirrored in `scraper/src/points.ts`. Phase B does **not** change the formula. The RPC does **not** recompute per-row `puntos` — it sums the `historial.puntos` already stored. Per-row `puntos` is recomputed client-side with `calcMatchPoints` whenever an admin edits a `historial` row.
- **Vitest runs in `environment: 'node'`** (`vite.config.ts`) — loading jsdom on this OneDrive checkout blows the worker-start timeout. Do **not** add React component tests that need `jsdom`. Test pure logic and SQL; verify UI manually and record it in the diary.
- **Branch:** all work on `feature/admin-panel`, cut from `develop` (which already has Phase A).
- **RLS admin identity:** every policy checks `is_admin((SELECT auth.uid()))` — the `(SELECT …)` wrapper is required (Supabase perf advisor; see `20260903000001_admin_rls_perf.sql`).
- **Existing admin user:** `usuarios.id = '6d917fce-3a1a-4b4d-abb1-f1f8cc61c8a3'` (Pablo) has `is_admin = true`.

---

## File Structure

**Migrations** (`supabase/migrations/`)
- `20260909000000_admin_is_admin_fn.sql` — `is_admin(uuid)` SECURITY DEFINER STABLE; drop & recreate every existing `EXISTS (SELECT 1 FROM usuarios …)` policy (jugadores insert/update, historial insert/update, config write) to call it; add `jugadores` DELETE, `historial` DELETE, and `usuarios` admin-ALL policies; narrow `config` write policy to `FOR INSERT, UPDATE`.
- `20260909000001_recalc_puntos.sql` — `recalc_puntos()` RETURNS void, SECURITY DEFINER, with an `is_admin` guard.

**Edge function**
- `supabase/functions/delete-account/index.ts` — accept an optional `{ target_user_id }` body; if present, require the caller to be `is_admin` and delete that user instead of the caller.

**Frontend — new**
- `src/lib/adminStats.ts` — `sumStats(entries: {stats: PlayerStats}[]): PlayerStats` (goles_contra forced to 0). Pure.
- `src/lib/adminStats.test.ts`
- `src/hooks/useAdminData.ts` — loads `jugadores` (+ historial), `usuarios`, `config`; returns `{ jugadores, usuarios, config, loading, error, refetch }`.
- `src/components/Admin/AdminView.tsx` — container, sub-nav, "← Volver a la app".
- `src/components/Admin/JugadoresAdmin.tsx`
- `src/components/Admin/HistorialAdmin.tsx`
- `src/components/Admin/SyncAdmin.tsx`
- `src/components/Admin/UsuariosAdmin.tsx`
- `src/components/Admin/TemporadaAdmin.tsx`

**Frontend — modified**
- `src/components/Dashboard/Shell.tsx` — add `hideNav?: boolean`.
- `src/components/Dashboard/Dashboard.tsx` — render `<AdminView>` as the Shell child when `showAdmin`.
- `src/index.css` — admin styles (append a `/* ===== Admin ===== */` block; the project keeps all CSS in one file).

**Frontend — deleted**
- `src/components/Admin/AdminPanel.tsx` (and its import in `Dashboard.tsx`).

**Docs**
- `docs/features/admin-panel/README.md` — written in the final task.
- `docs/diary/federation-sync.md` — per-section manual-test notes appended as you go.

---

## A note on testing this plan

Most tasks here are **UI wiring** the spec explicitly says not to E2E-test ("sin suite E2E (YAGNI para 1 admin); prueba manual de cada sección antes del merge, documentada en el diario"). For those tasks the "test" step is a **scripted manual check against a Supabase dev branch**, and the deliverable includes a diary note. Tasks with real logic (the SQL functions, `sumStats`, the team-invariant guard, the edge-function auth check) get proper failing-test-first cycles. Do not skip the manual checks — they are the acceptance gate.

---

### Task 1: `is_admin()` function + policy consolidation migration

**Files:**
- Create: `supabase/migrations/20260909000000_admin_is_admin_fn.sql`
- Reference: `supabase/migrations/20260903000000_admin_rls.sql`, `20260903000001_admin_rls_perf.sql`, `20260904000000_federation_sync.sql`

**Interfaces:**
- Produces: SQL function `is_admin(uid uuid) RETURNS boolean`; policies `jugadores_admin_delete`, `historial_admin_delete`, `usuarios_admin_all`.

- [ ] **Step 1: Write the migration**

```sql
-- Migration: admin_is_admin_fn
-- A policy on `usuarios` that does `EXISTS (SELECT 1 FROM usuarios …)` recurses.
-- Move the admin check into one SECURITY DEFINER function (runs as owner, skips
-- RLS on its own SELECT) and route every admin policy through it. Also add the
-- DELETE policies Phase B needs and an admin-wide policy on `usuarios`.

CREATE OR REPLACE FUNCTION is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT u.is_admin FROM usuarios u WHERE u.id = uid), false);
$$;

REVOKE ALL ON FUNCTION is_admin(uuid) FROM public;
GRANT EXECUTE ON FUNCTION is_admin(uuid) TO anon, authenticated;

-- jugadores: rewrite insert/update, add delete
DROP POLICY IF EXISTS "jugadores_admin_insert" ON jugadores;
DROP POLICY IF EXISTS "jugadores_admin_update" ON jugadores;
CREATE POLICY "jugadores_admin_insert" ON jugadores
  FOR INSERT TO authenticated
  WITH CHECK (is_admin((SELECT auth.uid())));
CREATE POLICY "jugadores_admin_update" ON jugadores
  FOR UPDATE TO authenticated
  USING (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));
CREATE POLICY "jugadores_admin_delete" ON jugadores
  FOR DELETE TO authenticated
  USING (is_admin((SELECT auth.uid())));

-- historial: rewrite insert/update, add delete
DROP POLICY IF EXISTS "historial_admin_insert" ON historial;
DROP POLICY IF EXISTS "historial_admin_update" ON historial;
CREATE POLICY "historial_admin_insert" ON historial
  FOR INSERT TO authenticated
  WITH CHECK (is_admin((SELECT auth.uid())));
CREATE POLICY "historial_admin_update" ON historial
  FOR UPDATE TO authenticated
  USING (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));
CREATE POLICY "historial_admin_delete" ON historial
  FOR DELETE TO authenticated
  USING (is_admin((SELECT auth.uid())));

-- config: narrow FOR ALL -> INSERT + UPDATE, route through is_admin
DROP POLICY IF EXISTS config_admin_write ON config;
CREATE POLICY config_admin_insert ON config
  FOR INSERT TO authenticated
  WITH CHECK (is_admin((SELECT auth.uid())));
CREATE POLICY config_admin_update ON config
  FOR UPDATE TO authenticated
  USING (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));

-- usuarios: existing self-policies stay (users read/update/insert their own row).
-- Add an admin-wide policy so the panel can read/update/delete any row.
CREATE POLICY usuarios_admin_all ON usuarios
  FOR ALL TO authenticated
  USING (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));
```

- [ ] **Step 2: Create a Supabase dev branch and apply**

Run (MCP):
- `mcp__claude_ai_Supabase__create_branch` project `sihvxbhqcyynuulhqmii`, name `admin-panel`
- `mcp__claude_ai_Supabase__apply_migration` on the branch with the file's contents

Expected: migration applies with no error.

- [ ] **Step 3: Verify policy behaviour on the branch**

Run `mcp__claude_ai_Supabase__execute_sql` on the branch:

```sql
-- function works
SELECT is_admin('6d917fce-3a1a-4b4d-abb1-f1f8cc61c8a3') AS should_be_true,
       is_admin('00000000-0000-0000-0000-000000000000') AS should_be_false;
-- policies exist
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename IN ('jugadores','historial','config','usuarios')
ORDER BY tablename, policyname;
```

Expected: `should_be_true = t`, `should_be_false = f`; delete policies present on `jugadores`/`historial`; `usuarios_admin_all` present; `config_admin_insert`/`config_admin_update` present, no `config_admin_write`.

- [ ] **Step 4: Verify no policy recursion**

```sql
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"6d917fce-3a1a-4b4d-abb1-f1f8cc61c8a3","role":"authenticated"}', true);
SELECT count(*) FROM usuarios;      -- must return a number, not "infinite recursion"
RESET ROLE;
```

Expected: a row count, no `42P17` recursion error.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260909000000_admin_is_admin_fn.sql
git commit -m "feat(db): is_admin() SECURITY DEFINER fn + admin DELETE/usuarios policies"
```

---

### Task 2: `recalc_puntos()` RPC migration

**Files:**
- Create: `supabase/migrations/20260909000001_recalc_puntos.sql`
- Reference: `scraper/src/sync.ts` (the `recalc()` function it mirrors)

**Interfaces:**
- Consumes: `is_admin(uuid)` (Task 1).
- Produces: SQL function `recalc_puntos() RETURNS void`. Rebuilds `jugadores.stats` (sum of that player's `historial.stats`, `goles_contra` forced to 0) and `usuarios.puntos` (sum of `historial.puntos` for players whose `numero` is in the user's `equipo`).

- [ ] **Step 1: Write the migration**

```sql
-- Migration: recalc_puntos
-- Single source of truth for rebuilding accumulated stats + user points from
-- historial, callable by the admin panel. Mirrors scraper/src/sync.ts recalc().
-- goles_contra is a per-match figure: forced to 0 in the accumulation.

CREATE OR REPLACE FUNCTION recalc_puntos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'recalc_puntos: solo admin';
  END IF;

  -- Accumulated per-player stats from historial. goles_contra -> 0.
  UPDATE jugadores j SET stats = COALESCE(sub.tot, '{
    "partidos":0,"goles":0,"goles_penalti":0,"penaltis_fallados":0,
    "faltas_penalti":0,"tarjetas":0,"expulsiones":0,"expulsiones_graves":0,
    "goles_contra":0}'::jsonb)
  FROM (
    SELECT h.jugador_id,
      jsonb_build_object(
        'partidos',           SUM((h.stats->>'partidos')::int),
        'goles',              SUM((h.stats->>'goles')::int),
        'goles_penalti',      SUM((h.stats->>'goles_penalti')::int),
        'penaltis_fallados',  SUM((h.stats->>'penaltis_fallados')::int),
        'faltas_penalti',     SUM((h.stats->>'faltas_penalti')::int),
        'tarjetas',           SUM((h.stats->>'tarjetas')::int),
        'expulsiones',        SUM((h.stats->>'expulsiones')::int),
        'expulsiones_graves', SUM((h.stats->>'expulsiones_graves')::int),
        'goles_contra',       0
      ) AS tot
    FROM historial h
    GROUP BY h.jugador_id
  ) sub
  WHERE j.id = sub.jugador_id;

  -- Players with no historial rows this season: zero them.
  UPDATE jugadores j SET stats = '{
    "partidos":0,"goles":0,"goles_penalti":0,"penaltis_fallados":0,
    "faltas_penalti":0,"tarjetas":0,"expulsiones":0,"expulsiones_graves":0,
    "goles_contra":0}'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM historial h WHERE h.jugador_id = j.id);

  -- Per-user points: sum historial.puntos over the user's equipo (numero[]).
  UPDATE usuarios u SET puntos = COALESCE(sub.p, 0)
  FROM (
    SELECT u2.id, SUM(h.puntos) AS p
    FROM usuarios u2
    LEFT JOIN jugadores j ON j.numero = ANY(u2.equipo)
    LEFT JOIN historial h ON h.jugador_id = j.id
    GROUP BY u2.id
  ) sub
  WHERE u.id = sub.id;
END $$;

REVOKE ALL ON FUNCTION recalc_puntos() FROM public;
GRANT EXECUTE ON FUNCTION recalc_puntos() TO authenticated;
```

- [ ] **Step 2: Apply to the dev branch**

Run `mcp__claude_ai_Supabase__apply_migration` on branch `admin-panel`.
Expected: applies clean.

- [ ] **Step 3: Verify parity with the current accumulated values**

The branch was forked from prod, so `jugadores.stats` / `usuarios.puntos` currently hold the scraper's values. Snapshot, run the RPC, diff:

```sql
CREATE TEMP TABLE before_j AS SELECT id, stats FROM jugadores;
CREATE TEMP TABLE before_u AS SELECT id, puntos FROM usuarios;
SELECT recalc_puntos();
SELECT j.id, b.stats AS old, j.stats AS new
FROM jugadores j JOIN before_j b USING (id)
WHERE j.stats IS DISTINCT FROM b.stats;
SELECT u.id, b.puntos AS old, u.puntos AS new
FROM usuarios u JOIN before_u b USING (id)
WHERE u.puntos IS DISTINCT FROM b.puntos;
```

Expected: **zero rows** from both diff queries (RPC reproduces the scraper's numbers exactly). If any row differs, stop and reconcile the SQL against `scraper/src/sync.ts recalc()` before continuing.

- [ ] **Step 4: Verify the admin guard**

```sql
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
SELECT recalc_puntos();   -- expect: ERROR "recalc_puntos: solo admin"
RESET ROLE;
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260909000001_recalc_puntos.sql
git commit -m "feat(db): recalc_puntos() RPC (mirrors scraper recalc, admin-guarded)"
```

---

### Task 3: `sumStats` pure helper

**Files:**
- Create: `src/lib/adminStats.ts`
- Test: `src/lib/adminStats.test.ts`

**Interfaces:**
- Consumes: `PlayerStats` from `src/types`.
- Produces: `sumStats(entries: { stats: PlayerStats }[]): PlayerStats` — element-wise sum, `goles_contra` forced to 0. Used by `HistorialAdmin` to show a live "new accumulated total" preview before saving.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { sumStats } from './adminStats'
import { EMPTY_STATS } from './points'

const e = (o: Partial<typeof EMPTY_STATS>) => ({ stats: { ...EMPTY_STATS, ...o } })

describe('sumStats', () => {
  it('sums fields element-wise', () => {
    expect(sumStats([e({ goles: 2, partidos: 1 }), e({ goles: 3, partidos: 1, tarjetas: 1 })]))
      .toEqual({ ...EMPTY_STATS, goles: 5, partidos: 2, tarjetas: 1 })
  })

  it('forces goles_contra to 0 (per-match figure only)', () => {
    expect(sumStats([e({ goles_contra: 8 }), e({ goles_contra: 5 })]).goles_contra).toBe(0)
  })

  it('returns EMPTY_STATS for no entries', () => {
    expect(sumStats([])).toEqual(EMPTY_STATS)
  })
})
```

- [ ] **Step 2: Run it, expect failure**

Run: `npx vitest run src/lib/adminStats.test.ts`
Expected: FAIL — `sumStats` not exported.

- [ ] **Step 3: Implement**

```ts
import type { PlayerStats } from '../types'
import { EMPTY_STATS } from './points'

const KEYS = Object.keys(EMPTY_STATS) as (keyof PlayerStats)[]

export function sumStats(entries: { stats: PlayerStats }[]): PlayerStats {
  const acc: PlayerStats = { ...EMPTY_STATS }
  for (const { stats } of entries) {
    for (const k of KEYS) acc[k] += stats[k] ?? 0
  }
  acc.goles_contra = 0
  return acc
}
```

- [ ] **Step 4: Run it, expect pass**

Run: `npx vitest run src/lib/adminStats.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/lib/adminStats.ts src/lib/adminStats.test.ts
git commit -m "feat(web): sumStats helper for admin historial preview"
```

---

### Task 4: `useAdminData` hook

**Files:**
- Create: `src/hooks/useAdminData.ts`
- Reference: `src/hooks/useJugadores.ts` (pattern to follow)

**Interfaces:**
- Produces: `useAdminData(): { jugadores: Jugador[]; usuarios: Usuario[]; config: Record<string,string>; loading: boolean; error: string | null; refetch: () => void }`.

- [ ] **Step 1: Implement (no unit test — it is a thin fetch wrapper; verified via the sections that consume it)**

```ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Jugador, Usuario } from '../types'

export function useAdminData() {
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [config, setConfig] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const refetch = useCallback(() => setNonce(n => n + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      supabase.from('jugadores').select('*, historial(*)').order('numero'),
      supabase.from('usuarios').select('*').order('puntos', { ascending: false }),
      supabase.from('config').select('key, value'),
    ]).then(([j, u, c]) => {
      if (cancelled) return
      const err = j.error || u.error || c.error
      if (err) { setError(err.message); setLoading(false); return }
      setJugadores((j.data ?? []) as Jugador[])
      setUsuarios((u.data ?? []) as Usuario[])
      setConfig(Object.fromEntries((c.data ?? []).map(r => [r.key, r.value])))
      setError(null)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [nonce])

  return { jugadores, usuarios, config, loading, error, refetch }
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: `tsc -b` passes (the hook is unused so far — that is fine, no lint error for an exported symbol).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAdminData.ts
git commit -m "feat(web): useAdminData hook (jugadores + usuarios + config)"
```

---

### Task 5: `AdminView` shell + wire into Dashboard, delete `AdminPanel`

**Files:**
- Create: `src/components/Admin/AdminView.tsx`
- Modify: `src/components/Dashboard/Shell.tsx`, `src/components/Dashboard/Dashboard.tsx`
- Delete: `src/components/Admin/AdminPanel.tsx`
- Modify: `src/index.css` (append admin styles)

**Interfaces:**
- Consumes: `useAdminData` (Task 4).
- Produces: `<AdminView onExit={() => void} />`. Renders a sub-nav (`jugadores | historial | sync | usuarios | temporada`) and the active section. Section components are added in later tasks; until then each renders a `null`-safe placeholder.

- [ ] **Step 1: Add `hideNav` to Shell**

In `src/components/Dashboard/Shell.tsx`, add to `ShellProps`:
```ts
  hideNav?: boolean
```
Destructure it, and guard both navs:
```tsx
{!hideNav && (
  <nav className="desktop-only desktop-nav">
    {/* …unchanged… */}
  </nav>
)}
```
```tsx
{!hideNav && (
  <nav className="bottom-nav mobile-only">
    {/* …unchanged… */}
  </nav>
)}
```

- [ ] **Step 2: Create `AdminView.tsx`**

```tsx
import { useState } from 'react'
import { useAdminData } from '../../hooks/useAdminData'
import { JugadoresAdmin } from './JugadoresAdmin'
import { HistorialAdmin } from './HistorialAdmin'
import { SyncAdmin } from './SyncAdmin'
import { UsuariosAdmin } from './UsuariosAdmin'
import { TemporadaAdmin } from './TemporadaAdmin'

type Section = 'jugadores' | 'historial' | 'sync' | 'usuarios' | 'temporada'
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'jugadores', label: 'Jugadores' },
  { id: 'historial', label: 'Historial' },
  { id: 'sync', label: 'Sync' },
  { id: 'usuarios', label: 'Usuarios' },
  { id: 'temporada', label: 'Temporada' },
]

interface Props { onExit: () => void }

export function AdminView({ onExit }: Props) {
  const [section, setSection] = useState<Section>('jugadores')
  const data = useAdminData()

  return (
    <div className="admin-view">
      <div className="admin-view-topbar">
        <button className="admin-back-btn" onClick={onExit}>← Volver a la app</button>
        <nav className="admin-subnav">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              className={`admin-subnav-btn ${section === s.id ? 'active' : ''}`}
              onClick={() => setSection(s.id)}
            >{s.label}</button>
          ))}
        </nav>
      </div>

      {data.loading && <p className="admin-msg">Cargando…</p>}
      {data.error && <p className="admin-msg admin-error">Error: {data.error}</p>}

      {!data.loading && !data.error && (
        <div className="admin-section-body">
          {section === 'jugadores' && <JugadoresAdmin data={data} />}
          {section === 'historial' && <HistorialAdmin data={data} />}
          {section === 'sync' && <SyncAdmin data={data} />}
          {section === 'usuarios' && <UsuariosAdmin data={data} />}
          {section === 'temporada' && <TemporadaAdmin data={data} />}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create placeholder section files** (each replaced in its own task)

For each of `JugadoresAdmin`, `HistorialAdmin`, `SyncAdmin`, `UsuariosAdmin`, `TemporadaAdmin`, create `src/components/Admin/<Name>.tsx`:

```tsx
import type { useAdminData } from '../../hooks/useAdminData'

interface Props { data: ReturnType<typeof useAdminData> }

export function <Name>({ data }: Props) {
  void data
  return <p className="admin-msg">Sección en construcción.</p>
}
```

- [ ] **Step 4: Wire into Dashboard, delete AdminPanel**

`src/components/Dashboard/Dashboard.tsx` — replace the `AdminPanel` import with `AdminView`, and replace the render:

```tsx
import { AdminView } from '../Admin/AdminView'
// …
export function Dashboard({ user, usuario, jugadores, onSignOut, onUpdateNombre, onUpdateEquipo }: Props) {
  const [tab, setTab] = useState<Tab>('team')
  const [showAdmin, setShowAdmin] = useState(false)

  return (
    <Shell
      tab={tab}
      onTabChange={setTab}
      onSignOut={onSignOut}
      isAdmin={usuario.is_admin}
      onAdminClick={() => setShowAdmin(true)}
      hideNav={showAdmin}
    >
      {showAdmin && usuario.is_admin ? (
        <AdminView onExit={() => setShowAdmin(false)} />
      ) : (
        <>
          {tab === 'team'    && <Pool usuario={usuario} jugadores={jugadores} onUpdateEquipo={onUpdateEquipo} />}
          {tab === 'ranking' && <Ranking jugadores={jugadores} currentUserId={usuario.id} />}
          {tab === 'players' && <Players jugadores={jugadores} />}
          {tab === 'profile' && (
            <Profile usuario={usuario} userEmail={user.email ?? ''} onUpdate={onUpdateNombre} onSignOut={onSignOut} />
          )}
        </>
      )}
    </Shell>
  )
}
```

Then `rm src/components/Admin/AdminPanel.tsx`.

- [ ] **Step 5: Add minimal admin CSS**

Append to `src/index.css` (match the existing dark-glass style — reuse existing custom properties/colours from the file):

```css
/* ===== Admin ===== */
.admin-view { max-width: 1100px; margin: 0 auto; padding: 1rem; }
.admin-view-topbar { display: flex; flex-wrap: wrap; gap: .75rem; align-items: center; margin-bottom: 1rem; }
.admin-back-btn { background: none; border: 1px solid currentColor; border-radius: 999px; padding: .35rem .8rem; color: inherit; cursor: pointer; }
.admin-subnav { display: flex; flex-wrap: wrap; gap: .4rem; }
.admin-subnav-btn { background: rgba(255,255,255,.05); border: 0; border-radius: 999px; padding: .35rem .8rem; color: inherit; cursor: pointer; }
.admin-subnav-btn.active { background: var(--accent, #29b6f6); color: #06202a; font-weight: 700; }
.admin-section-body { display: flex; flex-direction: column; gap: 1rem; }
.admin-table { width: 100%; border-collapse: collapse; font-size: .9rem; }
.admin-table th, .admin-table td { padding: .4rem .5rem; border-bottom: 1px solid rgba(255,255,255,.08); text-align: left; }
.admin-table input, .admin-table select { width: 100%; background: rgba(0,0,0,.25); border: 1px solid rgba(255,255,255,.15); border-radius: 6px; color: inherit; padding: .25rem .4rem; }
.admin-row-actions { display: flex; gap: .4rem; }
.admin-danger { color: #ff6b6b; border-color: #ff6b6b !important; }
.admin-msg { opacity: .8; }
.admin-error { color: #ff6b6b; }
.admin-scroll { overflow-x: auto; }
```

- [ ] **Step 6: Build + manual check**

Run: `npm run lint && npm run build`
Expected: both exit 0.

Manual (dev server, admin account):
1. Click "Admin" → nav tabs disappear, sub-nav appears, "← Volver a la app" shows.
2. Click each sub-nav item → "Sección en construcción." renders, no console error.
3. Click "← Volver a la app" → back to the normal app on the `team` tab.

- [ ] **Step 7: Commit + diary note**

Append to `docs/diary/federation-sync.md` under a new `## Phase B — <date>` heading: "Task 5: AdminView shell wired; nav hides on entry; 5 placeholder sections; AdminPanel deleted. Manual check passed."

```bash
git add src/components/Admin src/components/Dashboard/Shell.tsx src/components/Dashboard/Dashboard.tsx src/index.css docs/diary/federation-sync.md
git rm src/components/Admin/AdminPanel.tsx
git commit -m "feat(web): AdminView shell + sub-nav, replaces AdminPanel modal"
```

---

### Task 6: Sync section

**Files:**
- Modify: `src/components/Admin/SyncAdmin.tsx`

**Interfaces:**
- Consumes: `data.config` (`last_sync_at`, `unmatched_players`), `data.jugadores` (for jornada count), `data.refetch`.
- Produces: read-only status + a "Recalcular puntos" button calling `supabase.rpc('recalc_puntos')`.

- [ ] **Step 1: Implement**

```tsx
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { useAdminData } from '../../hooks/useAdminData'

interface Props { data: ReturnType<typeof useAdminData> }

export function SyncAdmin({ data }: Props) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const jornadas = new Set(
    data.jugadores.flatMap(j => (j.historial ?? []).map(h => h.jornada))
  )
  let unmatched: string[] = []
  try { unmatched = JSON.parse(data.config.unmatched_players || '[]') } catch { unmatched = [] }

  const recalc = async () => {
    setBusy(true); setMsg('')
    const { error } = await supabase.rpc('recalc_puntos')
    setMsg(error ? `Error: ${error.message}` : '✓ Puntos recalculados')
    if (!error) data.refetch()
    setBusy(false)
  }

  return (
    <div>
      <h3>Estado de sincronización</h3>
      <ul>
        <li>Última sync: {data.config.last_sync_at || '—'}</li>
        <li>Jornadas en historial: {jornadas.size}</li>
        <li>Jugadores sin emparejar: {unmatched.length === 0 ? '—' : unmatched.join(', ')}</li>
      </ul>
      <button onClick={recalc} disabled={busy} className="admin-subnav-btn">
        {busy ? 'Recalculando…' : 'Recalcular puntos'}
      </button>
      {msg && <p className="admin-msg">{msg}</p>}
      <p className="admin-msg">
        Para re-sincronizar con la federación: <code>npm run sync</code> en local,
        o lanza el workflow «Weekly Stats Sync» en GitHub Actions.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run: `npm run lint && npm run build`
Expected: exit 0.

- [ ] **Step 3: Manual check** (dev server, admin; migrations from Tasks 1–2 must be on the branch the dev `.env` points at — or temporarily point `.env` at the branch, see the task-0 note below)

1. Sync section shows a `last_sync_at`, a jornada count > 0, "—" for unmatched.
2. Click "Recalcular puntos" → "✓ Puntos recalculados", no console error, ranking unchanged (values already correct).
3. In an incognito window logged in as **non-admin** (charly) there is no "Admin" button — but also confirm directly: in devtools console `await supabase.rpc('recalc_puntos')` returns an error with `solo admin`.

- [ ] **Step 4: Commit + diary note**

```bash
git add src/components/Admin/SyncAdmin.tsx docs/diary/federation-sync.md
git commit -m "feat(web): admin Sync section (status + recalc_puntos RPC)"
```

---

### Task 7: Jugadores section (CRUD)

**Files:**
- Modify: `src/components/Admin/JugadoresAdmin.tsx`

**Interfaces:**
- Consumes: `data.jugadores`, `data.usuarios` (to warn on delete), `data.refetch`.
- Produces: create / inline-edit / delete of `jugadores` rows.

- [ ] **Step 1: Implement**

```tsx
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Jugador, Position } from '../../types'
import type { useAdminData } from '../../hooks/useAdminData'

interface Props { data: ReturnType<typeof useAdminData> }
const POSITIONS: Position[] = ['Portero', 'Boya', 'Extremo', 'Lateral', 'Contraboya']

const BLANK = {
  numero: 0, name: '', nick: '', pos: 'Lateral' as Position,
  phrase: '', photo: '', leverade_id: '',
}

export function JugadoresAdmin({ data }: Props) {
  const [draft, setDraft] = useState<Record<number, Partial<Jugador>>>({})
  const [nuevo, setNuevo] = useState(BLANK)
  const [msg, setMsg] = useState('')

  const patch = (id: number, field: string, value: unknown) =>
    setDraft(d => ({ ...d, [id]: { ...d[id], [field]: value } }))

  const save = async (j: Jugador) => {
    const changes = draft[j.id]
    if (!changes || Object.keys(changes).length === 0) return
    setMsg('')
    const { error } = await supabase.from('jugadores').update(changes).eq('id', j.id)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setDraft(d => { const { [j.id]: _, ...rest } = d; return rest })
    data.refetch()
  }

  const crear = async () => {
    setMsg('')
    const row = {
      ...nuevo,
      nick: nuevo.nick || null,
      phrase: nuevo.phrase || null,
      photo: nuevo.photo || null,
      leverade_id: nuevo.leverade_id ? Number(nuevo.leverade_id) : null,
      stats: {
        partidos: 0, goles: 0, goles_penalti: 0, penaltis_fallados: 0,
        faltas_penalti: 0, tarjetas: 0, expulsiones: 0, expulsiones_graves: 0, goles_contra: 0,
      },
    }
    const { error } = await supabase.from('jugadores').insert(row)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setNuevo(BLANK)
    data.refetch()
  }

  const borrar = async (j: Jugador) => {
    const enEquipos = data.usuarios.filter(u => u.equipo.includes(j.numero)).map(u => u.nombre)
    const warn = enEquipos.length
      ? `\n\n⚠️ En el equipo de: ${enEquipos.join(', ')}. Su hueco quedará vacío hasta que lo cambien.`
      : ''
    if (!confirm(`¿Borrar a ${j.name}? Se borrará también su historial.${warn}`)) return
    setMsg('')
    // historial rows FK-cascade or must go first depending on the constraint;
    // delete them explicitly to be safe.
    await supabase.from('historial').delete().eq('jugador_id', j.id)
    const { error } = await supabase.from('jugadores').delete().eq('id', j.id)
    if (error) { setMsg(`Error: ${error.message}`); return }
    data.refetch()
  }

  return (
    <div className="admin-scroll">
      <h3>Jugadores</h3>
      {msg && <p className="admin-msg admin-error">{msg}</p>}
      <table className="admin-table">
        <thead>
          <tr><th>Nº</th><th>Nombre</th><th>Nick</th><th>Pos</th><th>Frase</th><th>Foto URL</th><th>leverade_id</th><th></th></tr>
        </thead>
        <tbody>
          {data.jugadores.map(j => {
            const d = draft[j.id] ?? {}
            const val = (f: keyof Jugador) => (d[f] ?? j[f] ?? '') as string | number
            return (
              <tr key={j.id}>
                <td><input type="number" value={val('numero')} onChange={e => patch(j.id, 'numero', Number(e.target.value))} /></td>
                <td><input value={val('name')} onChange={e => patch(j.id, 'name', e.target.value)} /></td>
                <td><input value={val('nick')} onChange={e => patch(j.id, 'nick', e.target.value)} /></td>
                <td>
                  <select value={val('pos')} onChange={e => patch(j.id, 'pos', e.target.value)}>
                    {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </td>
                <td><input value={val('phrase')} onChange={e => patch(j.id, 'phrase', e.target.value)} /></td>
                <td><input value={val('photo')} onChange={e => patch(j.id, 'photo', e.target.value)} /></td>
                <td><input type="number" value={val('leverade_id')} onChange={e => patch(j.id, 'leverade_id', Number(e.target.value))} /></td>
                <td className="admin-row-actions">
                  <button className="admin-subnav-btn" disabled={!draft[j.id]} onClick={() => save(j)}>Guardar</button>
                  <button className="admin-subnav-btn admin-danger" onClick={() => borrar(j)}>Borrar</button>
                </td>
              </tr>
            )
          })}
          <tr>
            <td><input type="number" value={nuevo.numero} onChange={e => setNuevo({ ...nuevo, numero: Number(e.target.value) })} /></td>
            <td><input value={nuevo.name} onChange={e => setNuevo({ ...nuevo, name: e.target.value })} /></td>
            <td><input value={nuevo.nick} onChange={e => setNuevo({ ...nuevo, nick: e.target.value })} /></td>
            <td>
              <select value={nuevo.pos} onChange={e => setNuevo({ ...nuevo, pos: e.target.value as Position })}>
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </td>
            <td><input value={nuevo.phrase} onChange={e => setNuevo({ ...nuevo, phrase: e.target.value })} /></td>
            <td><input value={nuevo.photo} onChange={e => setNuevo({ ...nuevo, photo: e.target.value })} /></td>
            <td><input value={nuevo.leverade_id} onChange={e => setNuevo({ ...nuevo, leverade_id: e.target.value })} /></td>
            <td><button className="admin-subnav-btn" onClick={crear} disabled={!nuevo.name || !nuevo.numero}>Crear</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run: `npm run lint && npm run build`
Expected: exit 0. (`confirm()` is allowed here — this is the app in a normal browser, not the automation harness.)

- [ ] **Step 3: Manual check** (dev server, admin, dev branch DB)

1. Edit Andoni's `phrase` → Guardar → row persists after refetch, PlayerCard shows the new phrase.
2. Create a throwaway player (nº 99, "TEST", Lateral) → appears in the list and in the normal "Jugadores" tab.
3. Delete "TEST" → gone; no console error.
4. Try to delete a player who is in a user's `equipo` → warning names the user; after deleting, that user's team slot renders empty (no crash) in their view.

- [ ] **Step 4: Commit + diary note**

```bash
git add src/components/Admin/JugadoresAdmin.tsx docs/diary/federation-sync.md
git commit -m "feat(web): admin Jugadores section (create/edit/delete)"
```

---

### Task 8: Historial section

**Files:**
- Modify: `src/components/Admin/HistorialAdmin.tsx`
- Reference: `src/lib/points.ts` (`calcMatchPoints`), `src/lib/adminStats.ts` (`sumStats`)

**Interfaces:**
- Consumes: `data.jugadores` (each with `historial`), `data.refetch`, `calcMatchPoints`, `sumStats`.
- Produces: per-jornada view; edit a row's stats (recomputes that row's `puntos`, upserts, then calls `recalc_puntos`); add a manual row; delete a row; delete a whole jornada.

- [ ] **Step 1: Implement**

```tsx
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { calcMatchPoints, EMPTY_STATS } from '../../lib/points'
import type { PlayerStats, Jugador } from '../../types'
import type { useAdminData } from '../../hooks/useAdminData'

interface Props { data: ReturnType<typeof useAdminData> }
const STAT_KEYS = Object.keys(EMPTY_STATS) as (keyof PlayerStats)[]

interface Row { jugador: Jugador; entryId: number | null; stats: PlayerStats }

export function HistorialAdmin({ data }: Props) {
  const [jornada, setJornada] = useState(1)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [addJugadorId, setAddJugadorId] = useState<number | ''>('')

  const allJornadas = [...new Set(
    data.jugadores.flatMap(j => (j.historial ?? []).map(h => h.jornada))
  )].sort((a, b) => a - b)

  const rows: Row[] = data.jugadores
    .map(j => {
      const e = (j.historial ?? []).find(h => h.jornada === jornada)
      return e ? { jugador: j, entryId: e.id, stats: e.stats } : null
    })
    .filter((r): r is Row => r !== null)

  const [edits, setEdits] = useState<Record<number, PlayerStats>>({})
  const statOf = (r: Row) => edits[r.jugador.id] ?? r.stats

  const setStat = (jid: number, base: PlayerStats, key: keyof PlayerStats, v: number) =>
    setEdits(e => ({ ...e, [jid]: { ...(e[jid] ?? base), [key]: v } }))

  const afterWrite = async (okMsg: string) => {
    const { error } = await supabase.rpc('recalc_puntos')
    setMsg(error ? `Guardado, pero recalc falló: ${error.message}` : okMsg)
    setEdits({})
    data.refetch()
    setBusy(false)
  }

  const saveRow = async (r: Row) => {
    setBusy(true); setMsg('')
    const stats = statOf(r)
    const puntos = calcMatchPoints(r.jugador.pos, stats)
    const { error } = await supabase.from('historial').upsert(
      { jugador_id: r.jugador.id, jornada, stats, puntos },
      { onConflict: 'jugador_id,jornada' },
    )
    if (error) { setMsg(`Error: ${error.message}`); setBusy(false); return }
    await afterWrite(`✓ J${jornada} · ${r.jugador.name} (${puntos} pts)`)
  }

  const addRow = async () => {
    if (addJugadorId === '') return
    const jug = data.jugadores.find(j => j.id === addJugadorId)!
    setBusy(true); setMsg('')
    const stats = { ...EMPTY_STATS, partidos: 1 }
    const { error } = await supabase.from('historial').upsert(
      { jugador_id: jug.id, jornada, stats, puntos: calcMatchPoints(jug.pos, stats) },
      { onConflict: 'jugador_id,jornada' },
    )
    if (error) { setMsg(`Error: ${error.message}`); setBusy(false); return }
    setAddJugadorId('')
    await afterWrite(`✓ Añadida J${jornada} · ${jug.name}`)
  }

  const deleteRow = async (r: Row) => {
    if (!confirm(`¿Borrar la entrada de ${r.jugador.name} en J${jornada}?`)) return
    setBusy(true); setMsg('')
    const { error } = await supabase.from('historial').delete().eq('id', r.entryId!)
    if (error) { setMsg(`Error: ${error.message}`); setBusy(false); return }
    await afterWrite(`✓ Borrada J${jornada} · ${r.jugador.name}`)
  }

  const deleteJornada = async () => {
    if (!confirm(`¿Borrar TODAS las entradas de la jornada ${jornada}? (${rows.length} filas)`)) return
    setBusy(true); setMsg('')
    const { error } = await supabase.from('historial').delete().eq('jornada', jornada)
    if (error) { setMsg(`Error: ${error.message}`); setBusy(false); return }
    await afterWrite(`✓ Jornada ${jornada} borrada`)
  }

  return (
    <div className="admin-scroll">
      <h3>Historial por jornada</h3>
      <div className="admin-view-topbar">
        <label>Jornada <input type="number" min={1} value={jornada} onChange={e => setJornada(Number(e.target.value))} /></label>
        <span className="admin-msg">Con datos: {allJornadas.join(', ') || '—'}</span>
        <button className="admin-subnav-btn admin-danger" disabled={busy || rows.length === 0} onClick={deleteJornada}>
          Borrar jornada entera
        </button>
      </div>
      {msg && <p className="admin-msg">{msg}</p>}

      <table className="admin-table">
        <thead>
          <tr><th>Jugador</th>{STAT_KEYS.map(k => <th key={k}>{k}</th>)}<th>pts</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const s = statOf(r)
            const dirty = !!edits[r.jugador.id]
            return (
              <tr key={r.jugador.id}>
                <td>{r.jugador.name}</td>
                {STAT_KEYS.map(k => (
                  <td key={k}>
                    <input type="number" value={s[k]} onChange={e => setStat(r.jugador.id, r.stats, k, Number(e.target.value))} />
                  </td>
                ))}
                <td>{calcMatchPoints(r.jugador.pos, s)}</td>
                <td className="admin-row-actions">
                  <button className="admin-subnav-btn" disabled={busy || !dirty} onClick={() => saveRow(r)}>Guardar</button>
                  <button className="admin-subnav-btn admin-danger" disabled={busy} onClick={() => deleteRow(r)}>Borrar</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="admin-view-topbar">
        <select value={addJugadorId} onChange={e => setAddJugadorId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">— añadir jugador a J{jornada} —</option>
          {data.jugadores
            .filter(j => !rows.some(r => r.jugador.id === j.id))
            .map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
        </select>
        <button className="admin-subnav-btn" disabled={busy || addJugadorId === ''} onClick={addRow}>Añadir</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run: `npm run lint && npm run build`
Expected: exit 0.

- [ ] **Step 3: Manual check** (dev server, admin, dev branch DB)

1. Jornada 2 → rows load **with real values** (Carlos: goles 1, expulsiones 1 — the bug this replaces showed zeros).
2. Change Carlos J2 `goles` 1→2 → "pts" column updates live to 13 → Guardar → "✓", ranking + PlayerCard reflect the new total after refetch.
3. Set it back to 1, Guardar → values restored.
4. Add a player not in J2 → row appears with `partidos 1`; delete it → gone; totals consistent each time.
5. Pick an empty jornada number (e.g. 99) → no rows, "Borrar jornada entera" disabled.

- [ ] **Step 4: Commit + diary note**

```bash
git add src/components/Admin/HistorialAdmin.tsx docs/diary/federation-sync.md
git commit -m "feat(web): admin Historial section (edit/add/delete rows + jornada, recalc)"
```

---

### Task 9: Usuarios section

**Files:**
- Modify: `src/components/Admin/UsuariosAdmin.tsx`
- Reference: `src/components/Profile/Profile.tsx:28-51` (edge-function call pattern)

**Interfaces:**
- Consumes: `data.usuarios`, `data.jugadores` (for team editing), `data.refetch`.
- Produces: list users; toggle `is_admin`; edit `nombre` and `equipo`; delete user via the `delete-account` edge function with `{ target_user_id }`.

- [ ] **Step 1: Implement**

```tsx
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Usuario } from '../../types'
import type { useAdminData } from '../../hooks/useAdminData'

interface Props { data: ReturnType<typeof useAdminData> }

export function UsuariosAdmin({ data }: Props) {
  const [draft, setDraft] = useState<Record<string, Partial<Usuario>>>({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const byNumero = new Map(data.jugadores.map(j => [j.numero, j]))

  const patch = (id: string, field: string, value: unknown) =>
    setDraft(d => ({ ...d, [id]: { ...d[id], [field]: value } }))

  const toggleAdmin = async (u: Usuario) => {
    setMsg('')
    const { error } = await supabase.from('usuarios').update({ is_admin: !u.is_admin }).eq('id', u.id)
    if (error) setMsg(`Error: ${error.message}`); else data.refetch()
  }

  const saveNombre = async (u: Usuario) => {
    const nombre = draft[u.id]?.nombre
    if (nombre == null || nombre === u.nombre) return
    setMsg('')
    const { error } = await supabase.from('usuarios').update({ nombre }).eq('id', u.id)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setDraft(d => { const { [u.id]: _, ...rest } = d; return rest })
    data.refetch()
  }

  const setEquipoSlot = (u: Usuario, idx: number, numero: number) => {
    const equipo = [...(draft[u.id]?.equipo ?? u.equipo)]
    equipo[idx] = numero
    patch(u.id, 'equipo', equipo)
  }

  const saveEquipo = async (u: Usuario) => {
    const equipo = draft[u.id]?.equipo
    if (!equipo) return
    if (equipo.length !== 7 || new Set(equipo).size !== 7) {
      setMsg('El equipo debe tener 7 jugadores distintos.'); return
    }
    const porteros = equipo.filter(n => byNumero.get(n)?.pos === 'Portero').length
    if (porteros !== 1) { setMsg('El equipo debe tener exactamente 1 Portero.'); return }
    setMsg('')
    const { error } = await supabase.from('usuarios').update({ equipo }).eq('id', u.id)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setDraft(d => { const { [u.id]: _, ...rest } = d; return rest })
    data.refetch()
  }

  const borrar = async (u: Usuario) => {
    if (!confirm(`¿Borrar la cuenta de ${u.nombre}? Es irreversible.`)) return
    setBusy(true); setMsg('')
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ target_user_id: u.id }),
    })
    setBusy(false)
    if (res.ok) data.refetch()
    else setMsg(`Error borrando: ${(await res.json().catch(() => ({}))).error ?? res.status}`)
  }

  return (
    <div className="admin-scroll">
      <h3>Usuarios</h3>
      {msg && <p className="admin-msg admin-error">{msg}</p>}
      <table className="admin-table">
        <thead><tr><th>Nombre</th><th>Puntos</th><th>Admin</th><th>Equipo (nº)</th><th></th></tr></thead>
        <tbody>
          {data.usuarios.map(u => {
            const equipo = draft[u.id]?.equipo ?? u.equipo
            return (
              <tr key={u.id}>
                <td><input value={draft[u.id]?.nombre ?? u.nombre} onChange={e => patch(u.id, 'nombre', e.target.value)} onBlur={() => saveNombre(u)} /></td>
                <td>{u.puntos}</td>
                <td><input type="checkbox" checked={u.is_admin} onChange={() => toggleAdmin(u)} /></td>
                <td>
                  <div className="admin-row-actions">
                    {equipo.map((n, i) => (
                      <select key={i} value={n} onChange={e => setEquipoSlot(u, i, Number(e.target.value))}>
                        {data.jugadores.map(j => (
                          <option key={j.id} value={j.numero}>{j.numero} {j.name} ({j.pos[0]})</option>
                        ))}
                      </select>
                    ))}
                  </div>
                </td>
                <td className="admin-row-actions">
                  <button className="admin-subnav-btn" disabled={!draft[u.id]?.equipo} onClick={() => saveEquipo(u)}>Guardar equipo</button>
                  <button className="admin-subnav-btn admin-danger" disabled={busy} onClick={() => borrar(u)}>Borrar</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run: `npm run lint && npm run build`
Expected: exit 0. (Edge-function change in Task 10 — the "Borrar" button is manual-tested there.)

- [ ] **Step 3: Manual check** (dev server, admin, dev branch DB)

1. Rename charly → "charly2", blur → persists; ranking shows the new name.
2. Toggle charly's admin on → their session (incognito) now shows the "Admin" button; toggle back off.
3. Change one of charly's field-player slots to another field player → Guardar equipo → their team + points update; try to save a duplicate or drop the Portero → the inline message blocks it.

- [ ] **Step 4: Commit + diary note**

```bash
git add src/components/Admin/UsuariosAdmin.tsx docs/diary/federation-sync.md
git commit -m "feat(web): admin Usuarios section (admin toggle, nombre, equipo)"
```

---

### Task 10: `delete-account` accepts `target_user_id` for admins

**Files:**
- Modify: `supabase/functions/delete-account/index.ts`

**Interfaces:**
- Consumes: `is_admin(uuid)` is NOT used here (the function has the service client); it checks `usuarios.is_admin` directly.
- Produces: `POST /functions/v1/delete-account` with optional JSON body `{ target_user_id?: string }`. No body → deletes caller (unchanged). Body present → caller must be admin; deletes `target_user_id`.

- [ ] **Step 1: Write the failing test** — a Deno test invoked over HTTP is overkill for one function; instead assert the branch logic with a small pure extraction.

Create `supabase/functions/delete-account/resolve-target.ts`:
```ts
// Which user id should this request delete?
export function resolveTarget(
  callerId: string,
  callerIsAdmin: boolean,
  body: { target_user_id?: string } | null,
): { id: string } | { error: string } {
  const target = body?.target_user_id
  if (!target || target === callerId) return { id: callerId }
  if (!callerIsAdmin) return { error: 'forbidden' }
  return { id: target }
}
```

Create `supabase/functions/delete-account/resolve-target.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { resolveTarget } from './resolve-target'

describe('resolveTarget', () => {
  it('no body → caller deletes self', () => {
    expect(resolveTarget('a', false, null)).toEqual({ id: 'a' })
  })
  it('admin deletes another user', () => {
    expect(resolveTarget('admin', true, { target_user_id: 'b' })).toEqual({ id: 'b' })
  })
  it('non-admin cannot delete another user', () => {
    expect(resolveTarget('a', false, { target_user_id: 'b' })).toEqual({ error: 'forbidden' })
  })
  it('targeting self is allowed even for non-admin', () => {
    expect(resolveTarget('a', false, { target_user_id: 'a' })).toEqual({ id: 'a' })
  })
})
```

Add the file glob to the frontend vitest include OR run it standalone. Simplest: it already matches `src/**`? No — it is under `supabase/`. Add `'supabase/functions/**/*.test.ts'` to `vite.config.ts` `test.include`.

- [ ] **Step 2: Run, expect fail**

Run: `npx vitest run supabase/functions/delete-account/resolve-target.test.ts`
Expected: FAIL — `resolve-target.ts` not found / not exported. (Create the file in step 3.)

- [ ] **Step 3: Implement**

`resolve-target.ts` as written in Step 1. Then wire it into `index.ts`:

```ts
import { resolveTarget } from './resolve-target.ts'
// … after verifying `user` from the token …

const body = await req.json().catch(() => null) as { target_user_id?: string } | null

let callerIsAdmin = false
{
  const { data } = await supabase.from('usuarios').select('is_admin').eq('id', user.id).single()
  callerIsAdmin = !!data?.is_admin
}

const resolved = resolveTarget(user.id, callerIsAdmin, body)
if ('error' in resolved) {
  return new Response(JSON.stringify({ error: resolved.error }), {
    status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
const targetId = resolved.id

// replace the two `user.id` uses below with `targetId`
const { error: dbError } = await supabase.from('usuarios').delete().eq('id', targetId)
// …
const { error: deleteError } = await supabase.auth.admin.deleteUser(targetId)
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run supabase/functions/delete-account/resolve-target.test.ts`
Expected: PASS (4/4). Also `npx vitest run` — full suite still green.

- [ ] **Step 5: Deploy to the dev branch + manual check**

Run: `mcp__claude_ai_Supabase__deploy_edge_function` on branch `admin-panel` with both files.

Manual (dev server pointed at the branch, admin):
1. Create a throwaway auth user (sign up in an incognito window, complete onboarding).
2. As admin, Usuarios → Borrar that user → row disappears; the auth user is gone (`mcp__claude_ai_Supabase__execute_sql`: `SELECT count(*) FROM auth.users WHERE id = '<id>'` → 0).
3. As a non-admin (charly, via devtools console) `fetch(... body: JSON.stringify({target_user_id: '<pablo id>'}))` → 403.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/delete-account vite.config.ts docs/diary/federation-sync.md
git commit -m "feat(fn): delete-account accepts target_user_id for admins"
```

---

### Task 11: Temporada section

**Files:**
- Modify: `src/components/Admin/TemporadaAdmin.tsx`

**Interfaces:**
- Consumes: `data.jugadores` (for the JSON export + count), `data.config.tournament_id`, `data.refetch`.
- Produces: "Terminar temporada" (download `historial` JSON via Blob, then wipe `historial`, zero `jugadores.stats`, zero `usuarios.puntos`) and "Empezar temporada" (set `config.tournament_id`). Both gated behind typing `CONFIRMAR`.

- [ ] **Step 1: Implement**

```tsx
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { EMPTY_STATS } from '../../lib/points'
import type { useAdminData } from '../../hooks/useAdminData'

interface Props { data: ReturnType<typeof useAdminData> }

export function TemporadaAdmin({ data }: Props) {
  const [confirmEnd, setConfirmEnd] = useState('')
  const [confirmStart, setConfirmStart] = useState('')
  const [newTid, setNewTid] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const totalRows = data.jugadores.reduce((n, j) => n + (j.historial?.length ?? 0), 0)

  const terminar = async () => {
    if (confirmEnd !== 'CONFIRMAR') return
    setBusy(true); setMsg('')

    // 1. Export historial as a JSON download (browser Blob).
    const { data: hist, error: expErr } = await supabase.from('historial').select('*')
    if (expErr) { setMsg(`Export falló, abortado: ${expErr.message}`); setBusy(false); return }
    const blob = new Blob([JSON.stringify(hist, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `historial-${data.config.tournament_id}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)

    // 2. Wipe.
    const del = await supabase.from('historial').delete().gte('jornada', 0)
    if (del.error) { setMsg(`Borrado historial falló: ${del.error.message}`); setBusy(false); return }
    await supabase.from('jugadores').update({ stats: EMPTY_STATS }).gte('id', 0)
    await supabase.from('usuarios').update({ puntos: 0 }).gte('puntos', -2147483648)

    setMsg('✓ Temporada terminada. historial vaciado, stats y puntos a cero.')
    setConfirmEnd('')
    data.refetch()
    setBusy(false)
  }

  const empezar = async () => {
    if (confirmStart !== 'CONFIRMAR' || !newTid) return
    setBusy(true); setMsg('')
    const { error } = await supabase.from('config').update({ value: newTid }).eq('key', 'tournament_id')
    setMsg(error ? `Error: ${error.message}` : `✓ tournament_id = ${newTid}. Lanza «npm run sync -- --backfill» para poblar.`)
    if (!error) { setNewTid(''); setConfirmStart(''); data.refetch() }
    setBusy(false)
  }

  return (
    <div>
      <h3>Temporada</h3>
      {msg && <p className="admin-msg">{msg}</p>}

      <section>
        <h4>Terminar temporada actual</h4>
        <p className="admin-msg">
          Descarga <code>historial</code> ({totalRows} filas) como JSON, luego lo vacía
          y pone <code>jugadores.stats</code> y <code>usuarios.puntos</code> a cero. Irreversible.
        </p>
        <label>Escribe CONFIRMAR: <input value={confirmEnd} onChange={e => setConfirmEnd(e.target.value)} /></label>
        <button className="admin-subnav-btn admin-danger" disabled={busy || confirmEnd !== 'CONFIRMAR'} onClick={terminar}>
          Terminar temporada
        </button>
      </section>

      <section>
        <h4>Empezar temporada nueva</h4>
        <p className="admin-msg">
          Cambia <code>config.tournament_id</code> (actual: <code>{data.config.tournament_id}</code>) al de
          la nueva temporada en la federación. Después: <code>npm run sync -- --backfill</code>.
        </p>
        <label>Nuevo tournament_id: <input value={newTid} onChange={e => setNewTid(e.target.value)} /></label>
        <label>Escribe CONFIRMAR: <input value={confirmStart} onChange={e => setConfirmStart(e.target.value)} /></label>
        <button className="admin-subnav-btn admin-danger" disabled={busy || confirmStart !== 'CONFIRMAR' || !newTid} onClick={empezar}>
          Cambiar tournament_id
        </button>
      </section>
    </div>
  )
}
```

Note on the wipe filters: Supabase requires a filter on every `delete`/`update`. `historial.delete().gte('jornada', 0)` matches all (jornada is ≥ 1). `jugadores.update(...).gte('id', 0)` matches all. `usuarios.update({puntos:0}).gte('puntos', -2147483648)` matches all. This is a `ponytail:` corner: a "match everything" filter is load-bearing — if the column semantics change, revisit.

- [ ] **Step 2: Build**

Run: `npm run lint && npm run build`
Expected: exit 0.

- [ ] **Step 3: Manual check** — **on the dev branch only, and re-seed afterward**

1. Type `CONFIRMAR` under "Terminar" → button enables → click.
2. Browser downloads `historial-1324114-<date>.json` with all rows.
3. `historial` is empty (`SELECT count(*) FROM historial` → 0), all `jugadores.stats` zero, all `usuarios.puntos` 0. App shows everyone at 0 pts.
4. "Empezar": set `tournament_id` to `9999`, CONFIRMAR → `config` row updated; set it back to `1324114`.
5. **Re-seed the branch**: `mcp__claude_ai_Supabase__reset_branch` (re-applies migrations from a clean prod copy) OR re-import the downloaded JSON, so later manual checks have data. Record which you did.

- [ ] **Step 4: Commit + diary note**

```bash
git add src/components/Admin/TemporadaAdmin.tsx docs/diary/federation-sync.md
git commit -m "feat(web): admin Temporada section (end season export+wipe / start season)"
```

---

### Task 12: Carry-over fixes, docs, merge branch to prod, PR

**Files:**
- Modify: `scraper/src/sync.ts` — add a `ponytail:` comment marking the `recalc()` / `recalc_puntos()` duplication as deliberate deferred debt.
- Create: `docs/features/admin-panel/README.md`
- Modify: `docs/diary/federation-sync.md`

- [ ] **Step 1: Mark the recalc duplication**

In `scraper/src/sync.ts`, above `export async function recalc()`:
```ts
// ponytail: this duplicates the recalc_puntos() Postgres RPC (Phase B). Kept
// because the scraper runs headless with the service role and the RPC has an
// is_admin(auth.uid()) guard. Unify only when the scraper is next touched:
// either drop the guard for a NULL auth.uid() (service role) or expose an
// unguarded recalc the scraper alone may call. Parity is verified in the
// Phase B plan Task 2 Step 3.
```

- [ ] **Step 2: Confirm the config-policy carry-overs are resolved**

The diary listed: `config` RLS used bare `auth.uid()` and `FOR ALL`. Task 1 replaced it with `is_admin((SELECT auth.uid()))` and split to `FOR INSERT, UPDATE`. Grep to confirm nothing else references the old policy name:
```bash
grep -rn "config_admin_write" supabase/ && echo "STILL REFERENCED — fix" || echo "clean"
```
Expected: `clean`.

- [ ] **Step 3: Full verification**

```bash
npm run lint
npm run build
npx vitest run
cd scraper && npx vitest run && npx tsc --noEmit && cd ..
```
Expected: lint 0, build 0, frontend vitest green (incl. `adminStats` + `resolve-target`), scraper vitest green, scraper tsc 0.

- [ ] **Step 4: Write `docs/features/admin-panel/README.md`**

```markdown
# Admin Panel (Phase B)

## What it does
An in-app admin view for `usuarios.is_admin` users: manage `jugadores`,
edit `historial` per jornada, see sync status, manage `usuarios`, and
end/start a season. Opens from the "Admin" button; the normal nav hides
while it is open.

## How to use it
- **Jugadores** — create / inline-edit / delete players. Deleting warns if
  the player is in someone's team.
- **Historial** — pick a jornada; edit a row's 9 stats (points recompute
  live), add a manual row, delete a row or the whole jornada. Every change
  runs `recalc_puntos()`.
- **Sync** — read-only status + "Recalcular puntos". Federation re-sync is
  still `npm run sync` / the GitHub Actions workflow.
- **Usuarios** — rename, toggle admin, edit the 7-player team, delete the
  account (via the `delete-account` edge function).
- **Temporada** — "Terminar" downloads `historial` as JSON then wipes it and
  zeros stats/points; "Empezar" sets `config.tournament_id`. Both need the
  word `CONFIRMAR`.

## Configuration
- RLS: `is_admin(uuid)` SECURITY DEFINER function; admin policies on
  `jugadores`, `historial`, `config`, `usuarios`.
- `recalc_puntos()` RPC — the single recalculation path for the frontend.
- Edge function `delete-account` takes an optional `{ target_user_id }`.

## Known limitations
- No undo on Temporada actions beyond the JSON export.
- `recalc_puntos()` and the scraper's `recalc()` are separate implementations
  (parity-tested, not shared).
- Two goalkeepers in one team is blocked on save but not elsewhere.
- No React component tests (jsdom is too slow on this checkout); sections are
  manually verified — see `docs/diary/federation-sync.md`.
```

- [ ] **Step 5: Merge the Supabase dev branch to prod**

Only after every manual check passed on the branch:
- `mcp__claude_ai_Supabase__merge_branch` branch `admin-panel` → prod `sihvxbhqcyynuulhqmii`
- Verify on prod: `SELECT is_admin('6d917fce-3a1a-4b4d-abb1-f1f8cc61c8a3')` → `t`; `pg_policies` has the new policies; `SELECT recalc_puntos()` as the prod admin session succeeds.
- `mcp__claude_ai_Supabase__deploy_edge_function` `delete-account` to prod.

- [ ] **Step 6: Commit, push, open PR**

```bash
git add scraper/src/sync.ts docs/features/admin-panel/README.md docs/diary/federation-sync.md
git commit -m "docs: admin panel feature doc + mark recalc duplication as deferred debt"
git push -u origin feature/admin-panel
gh pr create --base develop --title "Extended admin panel (Phase B)" --body "$(cat <<'EOF'
## Summary
- `is_admin()` SECURITY DEFINER fn; admin DELETE/usuarios policies; `config` policy narrowed
- `recalc_puntos()` RPC (parity-verified against the scraper's recalc)
- `AdminView` replaces the disabled `AdminPanel` modal: Jugadores / Historial / Sync / Usuarios / Temporada
- `delete-account` edge function accepts `{ target_user_id }` for admins

## Verification
- Migrations applied + verified on a Supabase dev branch, then merged to prod
- Each section manually checked against the branch — notes in `docs/diary/federation-sync.md`
- lint 0 · build 0 · frontend vitest green · scraper vitest + tsc green

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01L1FzS27Tz5AaNu4cAy3NoV
EOF
)"
```

---

## Task 0 (do first): environment for local manual checks

The dev server reads the **root `.env`**. Manual checks in Tasks 5–11 need the DB to have the Phase B migrations. Options, pick one and note it in the diary:

- **A (recommended):** create the Supabase dev branch (Task 1 Step 2), copy its URL + anon key, and temporarily point the root `.env` `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` at the branch for the duration of Phase B. Restore prod values before merging.
- **B:** apply migrations straight to prod (only if branches are unavailable on the plan) — higher risk, not preferred.

The scraper `.env` (`SUPABASE_SERVICE_ROLE_KEY`) is unrelated to these checks.

---

## Self-Review

**Spec coverage (B1–B4):**
- B1 modal→view, sub-nav, back button → Task 5 ✓
- B2 Jugadores (create/edit/delete + team warning) → Task 7 ✓
- B2 Historial (per-jornada edit/add/delete/delete-jornada + recalc) → Task 8 ✓
- B2 Sync (read-only + recalc button + help text) → Task 6 ✓
- B2 Usuarios (list/admin toggle/nombre/equipo/delete) → Tasks 9 + 10 ✓
- B2 Temporada (end = export+wipe, start = tournament_id) → Task 11 ✓
- B3 `is_admin()` SECURITY DEFINER, rewrite existing policies, new DELETE + usuarios policies → Task 1 ✓
- B4 `recalc_puntos()` SECURITY DEFINER + `is_admin` guard, single source of truth for the frontend → Task 2 ✓; scraper duplication acknowledged (Task 12 Step 1) per spec's "a decidir en el plan"
- Delivery sequence step 4 (Phase B as its own PR to `develop`) → Task 12 ✓
- Test strategy ("no E2E, manual per section documented in diary") → every UI task Step 3 + diary notes ✓

**Carry-over bugs (from `docs/diary/federation-sync.md`):**
- `config` RLS bare `auth.uid()` + `FOR ALL` → fixed in Task 1 (`is_admin((SELECT auth.uid()))`, split to INSERT/UPDATE) ✓
- AdminPanel sums `goles_contra` → the new `HistorialAdmin` never sums; `sumStats` (Task 3) and `recalc_puntos` (Task 2) force it to 0 ✓
- AdminPanel never updates `usuarios.puntos` → every `HistorialAdmin` write calls `recalc_puntos()` (Task 8) ✓
- `historial.date` two formats → `HistorialAdmin` upserts **omit `date`** entirely; the column keeps whatever the scraper wrote, and manual rows get the DB default. (If `historial.date` is `NOT NULL` with no default, Task 8 Step 1 must add `date: new Date().toISOString().slice(0,10)` — check the column with `\d historial` on the branch first and adjust.) ✓ flagged

**Placeholder scan:** no "TBD"/"handle errors"/"similar to Task N" — each task carries full code. The one conditional is Task 8's `date` column (explicit check-and-adjust instruction, not a placeholder).

**Type consistency:**
- `useAdminData` return type is referenced as `ReturnType<typeof useAdminData>` everywhere — consistent.
- `sumStats(entries: { stats: PlayerStats }[])` — used by `HistorialAdmin` import; signature matches Task 3.
- `resolveTarget(callerId, callerIsAdmin, body)` — same signature in Task 10 Steps 1 and 3.
- `recalc_puntos()` (no args) — called as `supabase.rpc('recalc_puntos')` in Tasks 6 and 8, defined in Task 2.
- `is_admin(uuid)` — defined Task 1, used in Task 2's function body and all Task 1 policies.
- Section component prop is `{ data: ReturnType<typeof useAdminData> }` in Task 5 placeholders and every real implementation.

**Gap found + closed during review:** Task 0 (local env for manual checks) was implicit — added explicitly. Task 8 `historial.date` column nullability — added an explicit check step rather than assuming.
