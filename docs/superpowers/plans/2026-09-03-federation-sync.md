# Federation Sync (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cumulative-diff scraper with one that pulls authoritative per-jornada, per-player stats from the FNCV (Leverade) match pages, on a new stat model and scoring formula, and backfill season 25-26 verified against the federation's own totals.

**Architecture:** A Node/TypeScript scraper enumerates the season's 18 jornadas and their matches through Leverade's public JSON:API, then scrapes each Sharks match's server-rendered `/stats` HTML page with cheerio. Each match produces one `historial` row per rostered player (delta = that jornada). Accumulated `jugadores.stats` and `usuarios.puntos` are recomputed from `historial`. The frontend drops the four data-less stat fields and adopts the new formula.

**Tech Stack:** Node 24, TypeScript, `tsx` (no build step), `@supabase/supabase-js` (service role), `axios`, `cheerio`, `vitest`. Frontend: React 19 + Vite + `vitest`. Supabase Postgres + RLS.

**Spec:** `docs/superpowers/specs/2026-09-03-federation-sync-and-admin-design.md` (read Subproject A and the "Fuente de datos" section)

## Global Constraints

- **No seasons table.** `historial.jornada` stays a flat integer. Season config lives in a `config` key/value table.
- **Rate limiting is mandatory.** Every HTTP request to `waterpolo.fncv.es` waits ≥ 1500 ms after the previous one and sends a real browser `User-Agent`. Cloudflare returns `429` / a JS challenge otherwise.
- **Scraper writes with the service role key** (`SUPABASE_SERVICE_ROLE_KEY`), which bypasses RLS. Never put that key in frontend code.
- **`calcMatchPoints` is duplicated** in `src/lib/points.ts` and `scraper/src/points.ts` on purpose (separate processes). Both must stay identical; both are tested.
- **Supabase project id:** `sihvxbhqcyynuulhqmii` (name `sharks-fantasy`).
- **Federation identifiers (season 25-26):** tournament `1324114`, Leverade team `15688441` = "C.W. Sharks A".
- **New `PlayerStats` shape** (exact field names, used everywhere):
  ```ts
  interface PlayerStats {
    partidos: number
    goles: number
    goles_penalti: number
    penaltis_fallados: number
    faltas_penalti: number
    tarjetas: number
    expulsiones: number
    expulsiones_graves: number
    goles_contra: number
  }
  ```
- **Branch:** all work on `feature/federation-sync`, cut from `develop` after PR #1 merges.

---

## File Structure

**Migration**
- `supabase/migrations/20260904000000_federation_sync.sql` — `jugadores.leverade_id`, `historial` unique constraint, `config` table + RLS.

**Scraper — rewrite of `scraper/src/`** (old `index.ts` moved to `scraper/legacy/index.ts`)
- `scraper/src/http.ts` — rate-limited fetch helpers (`getJson`, `getHtml`) with delay + UA + retry/backoff.
- `scraper/src/leverade.ts` — public API client: list rounds, list a round's matches.
- `scraper/src/fncv.ts` — fetch + cheerio-parse a `/match/{id}/stats` page into a typed structure.
- `scraper/src/points.ts` — `PlayerStats`, `Position`, `EMPTY_STATS`, `calcMatchPoints`.
- `scraper/src/match.ts` — resolve a federation player (`leveradeId` + name) to a `jugadores.id`.
- `scraper/src/config.ts` — read/write the `config` table.
- `scraper/src/supabase.ts` — unchanged (service-role client).
- `scraper/src/sync.ts` — orchestration: per-jornada processing + `recalc()`.
- `scraper/src/discover.ts` — one-off: print `leverade_id` ↔ DB player mapping candidates.
- `scraper/src/index.ts` — CLI arg parsing, dispatches to `sync.ts` / `discover.ts`.
- `scraper/test/points.test.ts`, `scraper/test/fncv.test.ts`, `scraper/test/leverade.test.ts`, `scraper/test/match.test.ts`
- `scraper/test/fixtures/` — captured `stats.html`, `round.json`, `group.json`.
- `scraper/package.json` — add `vitest`, test script, `test` fixtures.
- `scraper/vitest.config.ts` — new.

**Frontend**
- `src/types/index.ts` — new `PlayerStats`.
- `src/lib/points.ts` — new `calcMatchPoints` (mirror of scraper).
- `src/lib/points.test.ts` — rewritten.
- `src/components/Dashboard/PlayerCard.tsx` — stat display for the new model.
- `src/components/Admin/AdminPanel.tsx` — minimal fix so it compiles (Phase B rewrites it).

**CI / docs**
- `.github/workflows/scraper.yml` — call `npm run sync` (incremental).
- `docs/diary/federation-sync.md` — backfill verification table (created in Task 12).

---

### Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/20260904000000_federation_sync.sql`

**Interfaces:**
- Produces: table `config(key text pk, value text not null)` with seed rows `tournament_id`, `last_sync_at`, `unmatched_players`; column `jugadores.leverade_id bigint unique`; constraint `historial_jugador_jornada_uniq`.

- [ ] **Step 1: Write the migration file**

```sql
-- Migration: federation_sync
-- Supports the per-jornada scraper rework. Adds a stable federation player id,
-- a uniqueness constraint for idempotent per-jornada upserts, and a tiny
-- key/value config table (NOT a seasons table) holding the active federation
-- tournament id and sync bookkeeping.

-- 1. Stable Leverade player id, for matching federation rows to jugadores.
ALTER TABLE jugadores ADD COLUMN leverade_id bigint UNIQUE;

-- 2. One historial row per (player, jornada); lets the scraper upsert.
--    Existing prod data has at most one row per pair already.
ALTER TABLE historial ADD CONSTRAINT historial_jugador_jornada_uniq
  UNIQUE (jugador_id, jornada);

-- 3. Config: key/value, one row per setting.
CREATE TABLE config (
  key   text PRIMARY KEY,
  value text NOT NULL
);
INSERT INTO config (key, value) VALUES
  ('tournament_id', '1324114'),
  ('last_sync_at', ''),
  ('unmatched_players', '[]');

ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Public read (frontend shows sync status); admin-only write.
CREATE POLICY config_read ON config
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY config_admin_write ON config
  FOR ALL TO authenticated
  USING     (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.is_admin));
```

- [ ] **Step 2: Apply the migration to the remote project**

Use the Supabase MCP tool `apply_migration` with `project_id: sihvxbhqcyynuulhqmii`, `name: federation_sync`, and the SQL above. (If working from the Supabase CLI instead: `supabase db push`.)

- [ ] **Step 3: Verify**

Run this SQL via the Supabase MCP `execute_sql` tool (`project_id: sihvxbhqcyynuulhqmii`):

```sql
select
  (select count(*) from config) as config_rows,
  (select value from config where key='tournament_id') as tid,
  (select count(*) from information_schema.columns
     where table_name='jugadores' and column_name='leverade_id') as has_leverade_col,
  (select count(*) from pg_constraint where conname='historial_jugador_jornada_uniq') as has_uniq;
```

Expected: `config_rows=3`, `tid=1324114`, `has_leverade_col=1`, `has_uniq=1`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260904000000_federation_sync.sql
git commit -m "feat(db): add leverade_id, historial unique constraint, config table"
```

---

### Task 2: Rate-limited HTTP helpers

**Files:**
- Create: `scraper/src/http.ts`
- Create: `scraper/vitest.config.ts`
- Modify: `scraper/package.json` (add vitest + test script)
- Test: `scraper/test/http.test.ts`

**Interfaces:**
- Produces:
  - `getJson<T>(url: string): Promise<T>` — GET, `Accept: application/json`, rate-limited, retries.
  - `getHtml(url: string): Promise<string>` — GET, browser UA, rate-limited, retries; throws if the body looks like a Cloudflare challenge.
  - `setMinDelayMs(ms: number): void` — test hook to drop the delay to 0.

- [ ] **Step 1: Add vitest to the scraper**

Edit `scraper/package.json`:
- Add to `devDependencies`: `"vitest": "^4.1.5"`
- Add to `scripts`: `"test": "vitest run"`, `"test:watch": "vitest"`

Then:

```bash
cd scraper && npm install
```

- [ ] **Step 2: Create `scraper/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Write the failing test — `scraper/test/http.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getJson, getHtml, setMinDelayMs } from '../src/http'

beforeEach(() => {
  setMinDelayMs(0)
  vi.restoreAllMocks()
})

describe('getJson', () => {
  it('parses a JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"a":1}', { status: 200 })))
    expect(await getJson<{ a: number }>('https://x/y')).toEqual({ a: 1 })
  })

  it('retries on 429 then succeeds', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
    vi.stubGlobal('fetch', f)
    expect(await getJson('https://x/y')).toEqual({ ok: true })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('throws after 3 failed attempts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    await expect(getJson('https://x/y')).rejects.toThrow(/500/)
  })
})

describe('getHtml', () => {
  it('returns the body for a normal page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>ok</html>', { status: 200 })))
    expect(await getHtml('https://x/y')).toContain('ok')
  })

  it('throws on a Cloudflare challenge body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('<html>Comprobando tu navegador</html>', { status: 200 })))
    await expect(getHtml('https://x/y')).rejects.toThrow(/challenge|Cloudflare/i)
  })
})
```

- [ ] **Step 4: Run it, verify it fails**

```bash
cd scraper && npm test -- http
```
Expected: FAIL — `Cannot find module '../src/http'`.

- [ ] **Step 5: Implement `scraper/src/http.ts`**

```ts
let minDelayMs = 1500
let lastRequestAt = 0

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

export function setMinDelayMs(ms: number): void {
  minDelayMs = ms
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function throttle(): Promise<void> {
  const wait = lastRequestAt + minDelayMs - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequestAt = Date.now()
}

async function request(url: string, headers: Record<string, string>): Promise<Response> {
  const maxAttempts = 3
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await throttle()
    try {
      const res = await fetch(url, { headers })
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`${url} -> HTTP ${res.status}`)
        await sleep(attempt * 3000)
        continue
      }
      if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
      return res
    } catch (err) {
      lastErr = err
      await sleep(attempt * 3000)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await request(url, { Accept: 'application/json' })
  return res.json() as Promise<T>
}

export async function getHtml(url: string): Promise<string> {
  const res = await request(url, { 'User-Agent': UA, Accept: 'text/html' })
  const body = await res.text()
  if (body.includes('Comprobando tu navegador') || body.includes('cf-browser-verification')) {
    throw new Error(`Cloudflare challenge received for ${url}`)
  }
  return body
}
```

- [ ] **Step 6: Run tests, verify pass**

```bash
cd scraper && npm test -- http
```
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add scraper/src/http.ts scraper/test/http.test.ts scraper/vitest.config.ts scraper/package.json scraper/package-lock.json
git commit -m "feat(scraper): rate-limited HTTP helpers with retry and CF-challenge detection"
```

---

### Task 3: Leverade API client

**Files:**
- Create: `scraper/src/leverade.ts`
- Test: `scraper/test/leverade.test.ts`
- Create: `scraper/test/fixtures/group.json`, `scraper/test/fixtures/round.json`

**Interfaces:**
- Consumes: `getJson` from `scraper/src/http.ts`.
- Produces:
  - `type Round = { id: string; jornada: number }`
  - `type Match = { id: string; date: string | null; finished: boolean }`
  - `getRounds(tournamentId: string): Promise<Round[]>` — sorted by `jornada` asc.
  - `getRoundMatches(roundId: string): Promise<Match[]>`

- [ ] **Step 1: Capture fixtures**

```bash
cd scraper
mkdir -p test/fixtures
curl -s 'https://api.leverade.com/tournaments/1324114?include=groups' -o /tmp/tour.json
# read the group id from /tmp/tour.json (data.relationships.groups.data[0].id), then:
curl -s 'https://api.leverade.com/groups/<GROUP_ID>?include=rounds' -o test/fixtures/group.json
# pick a round id from group.json included[], then:
curl -s 'https://api.leverade.com/rounds/<ROUND_ID>?include=matches' -o test/fixtures/round.json
```

Confirm `group.json` has `included[]` entries with `type:"round"` and `attributes.order`; `round.json` has `included[]` with `type:"match"` and `attributes.finished`.

- [ ] **Step 2: Write the failing test — `scraper/test/leverade.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { getRounds, getRoundMatches } from '../src/leverade'

const group = readFileSync(new URL('./fixtures/group.json', import.meta.url), 'utf8')
const round = readFileSync(new URL('./fixtures/round.json', import.meta.url), 'utf8')

// tournament -> groups call returns a minimal shape; group call returns the fixture
function stubFetch(map: Record<string, string>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    for (const [frag, body] of Object.entries(map)) {
      if (url.includes(frag)) return new Response(body, { status: 200 })
    }
    throw new Error(`unexpected url ${url}`)
  }))
}

describe('getRounds', () => {
  it('returns rounds sorted by jornada', async () => {
    stubFetch({
      '/tournaments/1324114': JSON.stringify({
        data: { relationships: { groups: { data: [{ id: '3652217' }] } } },
      }),
      '/groups/3652217': group,
    })
    const rounds = await getRounds('1324114')
    expect(rounds.length).toBe(18)
    expect(rounds[0]).toEqual({ id: expect.any(String), jornada: 1 })
    expect(rounds.map(r => r.jornada)).toEqual([...Array(18)].map((_, i) => i + 1))
  })
})

describe('getRoundMatches', () => {
  it('extracts match id / date / finished', async () => {
    stubFetch({ '/rounds/': round })
    const matches = await getRoundMatches('19460842')
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0]).toHaveProperty('finished')
    expect(matches.some(m => m.finished)).toBe(true)
  })
})
```

- [ ] **Step 3: Run it, verify it fails**

```bash
cd scraper && npm test -- leverade
```
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `scraper/src/leverade.ts`**

```ts
import { getJson } from './http.js'

const API = 'https://api.leverade.com'

interface JsonApiDoc {
  data: {
    relationships?: Record<string, { data: { id: string }[] | { id: string } | null }>
  }
  included?: {
    type: string
    id: string
    attributes: Record<string, unknown>
  }[]
}

export interface Round {
  id: string
  jornada: number
}

export interface Match {
  id: string
  date: string | null
  finished: boolean
}

export async function getRounds(tournamentId: string): Promise<Round[]> {
  const tour = await getJson<JsonApiDoc>(`${API}/tournaments/${tournamentId}?include=groups`)
  const groups = tour.data.relationships?.groups?.data
  const groupId = Array.isArray(groups) ? groups[0]?.id : groups?.id
  if (!groupId) throw new Error(`No group for tournament ${tournamentId}`)

  const grp = await getJson<JsonApiDoc>(`${API}/groups/${groupId}?include=rounds`)
  const rounds = (grp.included ?? [])
    .filter(x => x.type === 'round')
    .map(x => ({ id: x.id, jornada: Number(x.attributes.order) }))
    .sort((a, b) => a.jornada - b.jornada)
  if (rounds.length === 0) throw new Error(`No rounds for group ${groupId}`)
  return rounds
}

export async function getRoundMatches(roundId: string): Promise<Match[]> {
  const doc = await getJson<JsonApiDoc>(`${API}/rounds/${roundId}?include=matches`)
  return (doc.included ?? [])
    .filter(x => x.type === 'match')
    .map(x => ({
      id: x.id,
      date: (x.attributes.date as string | null) ?? null,
      finished: x.attributes.finished === true,
    }))
}
```

- [ ] **Step 5: Run tests, verify pass**

```bash
cd scraper && npm test -- leverade
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scraper/src/leverade.ts scraper/test/leverade.test.ts scraper/test/fixtures/group.json scraper/test/fixtures/round.json
git commit -m "feat(scraper): Leverade API client for jornada/match enumeration"
```

---

### Task 4: FNCV match `/stats` parser

**Files:**
- Create: `scraper/src/fncv.ts`
- Test: `scraper/test/fncv.test.ts`
- Create: `scraper/test/fixtures/stats.html`

**Interfaces:**
- Consumes: `getHtml` from `scraper/src/http.ts`; `cheerio`.
- Produces:
  - `type RawPlayer = { leveradeId: string | null; nombre: string; jugo: boolean; G: number; GP: number; TA: number; TR: number; EX: number; ED: number; EB: number; EN: number; EP: number; P: number; PF: number }`
  - `type MatchStats = { local: string; visitante: string; golesLocal: number; golesVisitante: number; sharks: 'local' | 'visitante' | null; jugadores: RawPlayer[] }`
  - `parseMatchStats(html: string): MatchStats` — pure, testable.
  - `fetchMatchStats(tournamentId: string, matchId: string): Promise<MatchStats>` — `getHtml` + `parseMatchStats`.
  - `SHARKS_TEAM_NAME = 'C.W. Sharks A'`

- [ ] **Step 1: Capture a real fixture and inspect it**

```bash
cd scraper
curl -s -A 'Mozilla/5.0' 'https://waterpolo.fncv.es/es/tournament/1324114/match/143423190/stats' -o test/fixtures/stats.html
```

Open `test/fixtures/stats.html`. Confirm:
- The `<title>` (or an `<h1>`) reads `"C.N. Godella B — C.W. Sharks A ..."` (local — visitante, dash is `—` U+2014).
- Two score numbers appear near the top (`Goles 11 : Goles 7`).
- Two player tables. Cells carry `colstyle-*` classes: `colstyle-dorsal`, `colstyle-nombre`, then one per stat. Header row text order is `A JUGADOR G GP G5P TA TR EX ED EB EN EP P PF O`.
- Name cell contains `<a href="https://waterpolo.fncv.es/es/players/{id}">`.
- Zero values render as `‐` (U+2010) — treat non-numeric as 0.
- The first cell text is `Titular N` or empty; extract the dorsal digits and treat "player appears in this table with a numeric row" as `jugo: true` unless every stat cell is `‐` **and** there is no dorsal (bench, did not dress). Use: `jugo = hasDorsal`.

Adjust the selectors in Step 3 to match what you actually see.

- [ ] **Step 2: Write the failing test — `scraper/test/fncv.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseMatchStats } from '../src/fncv'

const html = readFileSync(new URL('./fixtures/stats.html', import.meta.url), 'utf8')

describe('parseMatchStats', () => {
  const m = parseMatchStats(html)

  it('reads both team names and which side is Sharks', () => {
    expect(m.local).toBe('C.N. Godella B')
    expect(m.visitante).toBe('C.W. Sharks A')
    expect(m.sharks).toBe('visitante')
  })

  it('reads the score', () => {
    expect(m.golesLocal).toBe(11)
    expect(m.golesVisitante).toBe(7)
  })

  it('parses Sharks players with leverade ids', () => {
    const carlos = m.jugadores.find(p => p.nombre.includes('CARLOS FERRER'))
    expect(carlos).toBeTruthy()
    expect(carlos!.leveradeId).toMatch(/^\d+$/)
    expect(carlos!.jugo).toBe(true)
    expect(carlos!.G).toBe(1)
    expect(carlos!.GP).toBe(1)
  })

  it('treats dash cells as zero', () => {
    const andoni = m.jugadores.find(p => p.nombre.includes('ANDONI IRASTORZA'))
    expect(andoni!.G).toBe(0)
    expect(andoni!.EX).toBe(0)
  })

  it('returns only the Sharks side in jugadores', () => {
    expect(m.jugadores.every(p => !p.nombre.includes('MILO MARABESE'))).toBe(true)
  })
})
```

(Adjust the exact expected numbers to the fixture you captured — read the table for match 143423190 in `stats.html` and fill in real values.)

- [ ] **Step 3: Run it, verify it fails**

```bash
cd scraper && npm test -- fncv
```
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `scraper/src/fncv.ts`**

```ts
import * as cheerio from 'cheerio'
import { getHtml } from './http.js'

export const SHARKS_TEAM_NAME = 'C.W. Sharks A'
const TOURNAMENT_HOST = 'https://waterpolo.fncv.es'

export interface RawPlayer {
  leveradeId: string | null
  nombre: string
  jugo: boolean
  G: number; GP: number
  TA: number; TR: number
  EX: number; ED: number; EB: number; EN: number; EP: number
  P: number; PF: number
}

export interface MatchStats {
  local: string
  visitante: string
  golesLocal: number
  golesVisitante: number
  sharks: 'local' | 'visitante' | null
  jugadores: RawPlayer[]
}

const num = (txt: string): number => {
  const n = parseInt(txt.replace(/[^\d-]/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

export function parseMatchStats(html: string): MatchStats {
  const $ = cheerio.load(html)

  // Title: "Local — Visitante | ..."   (em dash U+2014)
  const title = ($('title').first().text() || $('h1').first().text()).trim()
  const [local, visitante] = title.split('|')[0].split('—').map(s => s.trim())

  // Score: the two "Goles" numbers near the top of the page.
  const scoreNums = $('*')
    .filter((_, el) => /^\s*\d+\s*$/.test($(el).children().length ? '' : $(el).text()))
    .map((_, el) => num($(el).text()))
    .get()
  // Fall back to a more targeted selector if the page has a dedicated score block —
  // check stats.html and use it. The generic approach: take the first two integers
  // that appear inside the elements labelled "Goles".
  const golesEls = $('*').filter((_, el) => $(el).text().trim() === 'Goles')
  const golesLocal = num(golesEls.eq(0).nextAll().addBack().parent().text().match(/\d+/)?.[0] ?? '0')
  const golesVisitante = num(golesEls.eq(1).parent().text().match(/\d+/)?.[0] ?? '0')

  // Player tables: iterate every table that has the stat header, tag it with the
  // nearest preceding team name.
  const teams: { name: string; players: RawPlayer[] }[] = []
  $('table').each((_, table) => {
    const $table = $(table)
    const headerText = $table.find('tr').first().text().replace(/\s+/g, ' ').trim()
    if (!/JUGADOR\s+G\s+GP/i.test(headerText)) return

    // nearest preceding element whose text is exactly a known team name
    let teamName = ''
    let node = $table.prevAll().toArray().find(el => {
      const t = $(el).text().trim()
      return t === local || t === visitante
    })
    if (node) teamName = $(node).text().trim()

    const players: RawPlayer[] = []
    $table.find('tbody tr').each((_, row) => {
      const $cells = $(row).find('td')
      if ($cells.length < 10) return
      const dorsalCell = $cells.eq(0).text().trim()
      const dorsal = dorsalCell.match(/\d+/)?.[0] ?? null
      const $nameCell = $cells.eq(1)
      const nombre = $nameCell.text().trim().replace(/\s+/g, ' ')
      if (!nombre) return
      const href = $nameCell.find('a[href*="/players/"]').attr('href') ?? ''
      const leveradeId = href.match(/\/players\/(\d+)/)?.[1] ?? null

      // Column order after A + JUGADOR: G GP G5P TA TR EX ED EB EN EP P PF O
      const c = (i: number) => num($cells.eq(i).text())
      players.push({
        leveradeId, nombre, jugo: dorsal !== null,
        G: c(2), GP: c(3), /* G5P c(4) ignored */
        TA: c(5), TR: c(6),
        EX: c(7), ED: c(8), EB: c(9), EN: c(10), EP: c(11),
        P: c(12), PF: c(13), /* O c(14) ignored */
      })
    })
    if (teamName) teams.push({ name: teamName, players })
  })

  const sharksTeam = teams.find(t => t.name === SHARKS_TEAM_NAME)
  const sharks: MatchStats['sharks'] =
    local === SHARKS_TEAM_NAME ? 'local' : visitante === SHARKS_TEAM_NAME ? 'visitante' : null

  return {
    local, visitante, golesLocal, golesVisitante, sharks,
    jugadores: sharksTeam?.players ?? [],
  }
}

export async function fetchMatchStats(tournamentId: string, matchId: string): Promise<MatchStats> {
  const html = await getHtml(`${TOURNAMENT_HOST}/es/tournament/${tournamentId}/match/${matchId}/stats`)
  return parseMatchStats(html)
}
```

> **Note for the implementer:** the score-extraction lines above are a best-effort guess. Open `stats.html`, find the real markup around `Goles 11 : Goles 7`, and replace the `golesLocal` / `golesVisitante` derivation with a selector that targets it directly. The test in Step 2 is your oracle — make it green against the real fixture.

- [ ] **Step 5: Iterate parser against the fixture until the test passes**

```bash
cd scraper && npm test -- fncv
```
Expected: PASS (5 tests). Fix selectors in `fncv.ts` as needed.

- [ ] **Step 6: Commit**

```bash
git add scraper/src/fncv.ts scraper/test/fncv.test.ts scraper/test/fixtures/stats.html
git commit -m "feat(scraper): cheerio parser for FNCV match /stats pages"
```

---

### Task 5: New points formula (scraper copy)

**Files:**
- Create: `scraper/src/points.ts`
- Test: `scraper/test/points.test.ts`

**Interfaces:**
- Produces:
  - `interface PlayerStats` (exact shape from Global Constraints)
  - `type Position = 'Portero' | 'Boya' | 'Extremo' | 'Lateral' | 'Contraboya'`
  - `const EMPTY_STATS: PlayerStats`
  - `function calcMatchPoints(pos: Position, s: PlayerStats): number`

- [ ] **Step 1: Write the failing test — `scraper/test/points.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { calcMatchPoints, EMPTY_STATS } from '../src/points'

const stats = (o: Partial<typeof EMPTY_STATS>) => ({ ...EMPTY_STATS, ...o })

describe('calcMatchPoints', () => {
  it('field player: appearance + goals + penalty goals', () => {
    // 1 + 4*5 + 1*3 = 24
    expect(calcMatchPoints('Boya', stats({ partidos: 1, goles: 4, goles_penalti: 1 }))).toBe(24)
  })

  it('field player: missed penalty and conceded penalty foul', () => {
    // 1 + (-2) + (-1) = -2
    expect(calcMatchPoints('Lateral', stats({ partidos: 1, penaltis_fallados: 1, faltas_penalti: 1 }))).toBe(-2)
  })

  it('field player: card -3, minor exclusion -1, grave exclusion -5', () => {
    // 1 + (-3) + (-1) + (-5) = -8
    expect(calcMatchPoints('Extremo', stats({
      partidos: 1, tarjetas: 1, expulsiones: 1, expulsiones_graves: 1,
    }))).toBe(-8)
  })

  it('goalkeeper: appearance + start bonus + defensive bonus (7 conceded)', () => {
    // 1 + 2 + max(0, 10-7) = 6
    expect(calcMatchPoints('Portero', stats({ partidos: 1, goles_contra: 7 }))).toBe(6)
  })

  it('goalkeeper: defensive bonus floors at 0 (15 conceded)', () => {
    // 1 + 2 + 0 = 3
    expect(calcMatchPoints('Portero', stats({ partidos: 1, goles_contra: 15 }))).toBe(3)
  })

  it('goalkeeper who did not play scores 0', () => {
    expect(calcMatchPoints('Portero', stats({ partidos: 0, goles_contra: 12 }))).toBe(0)
  })

  it('goalkeeper still loses points for their own cards/exclusions', () => {
    // 1 + 2 + max(0,10-5) + (-3) = 5
    expect(calcMatchPoints('Portero', stats({ partidos: 1, goles_contra: 5, tarjetas: 1 }))).toBe(5)
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

```bash
cd scraper && npm test -- points
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `scraper/src/points.ts`**

```ts
export interface PlayerStats {
  partidos: number
  goles: number
  goles_penalti: number
  penaltis_fallados: number
  faltas_penalti: number
  tarjetas: number
  expulsiones: number
  expulsiones_graves: number
  goles_contra: number
}

export type Position = 'Portero' | 'Boya' | 'Extremo' | 'Lateral' | 'Contraboya'

export const EMPTY_STATS: PlayerStats = {
  partidos: 0, goles: 0, goles_penalti: 0, penaltis_fallados: 0,
  faltas_penalti: 0, tarjetas: 0, expulsiones: 0, expulsiones_graves: 0,
  goles_contra: 0,
}

export function calcMatchPoints(pos: Position, s: PlayerStats): number {
  let pts = s.partidos * 1
  pts += s.faltas_penalti * -1
  pts += s.expulsiones * -1
  pts += s.tarjetas * -3
  pts += s.expulsiones_graves * -5

  if (pos === 'Portero') {
    if (s.partidos > 0) {
      pts += 2
      pts += Math.max(0, 10 - s.goles_contra)
    }
  } else {
    pts += s.goles * 5
    pts += s.goles_penalti * 3
    pts += s.penaltis_fallados * -2
  }
  return pts
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd scraper && npm test -- points
```
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add scraper/src/points.ts scraper/test/points.test.ts
git commit -m "feat(scraper): new stat model + scoring formula"
```

---

### Task 6: Player matching

**Files:**
- Create: `scraper/src/match.ts`
- Test: `scraper/test/match.test.ts`

**Interfaces:**
- Produces:
  - `type DbPlayer = { id: number; name: string; nick: string | null; leverade_id: number | null }`
  - `function normalize(s: string): string` — lowercase, strip accents, collapse spaces.
  - `function resolvePlayer(raw: { leveradeId: string | null; nombre: string }, dbPlayers: DbPlayer[]): DbPlayer | null` — match by `leverade_id` first, then by normalized `given + first surname` against `name`/`nick`.

- [ ] **Step 1: Write the failing test — `scraper/test/match.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { resolvePlayer, normalize, type DbPlayer } from '../src/match'

const db: DbPlayer[] = [
  { id: 6,  name: 'Carlos Ferrer',   nick: 'Carlos', leverade_id: 111 },
  { id: 13, name: 'Pablo Ferrer',    nick: 'Pablo',  leverade_id: null },
  { id: 9,  name: 'Hernan Frances',  nick: 'Hernan', leverade_id: null },
]

describe('normalize', () => {
  it('strips accents and lowercases', () => {
    expect(normalize('HERNÁN  FRANCÉS')).toBe('hernan frances')
  })
})

describe('resolvePlayer', () => {
  it('matches by leverade id when present', () => {
    expect(resolvePlayer({ leveradeId: '111', nombre: 'WHATEVER' }, db)?.id).toBe(6)
  })

  it('falls back to given + first surname', () => {
    expect(resolvePlayer({ leveradeId: null, nombre: 'PABLO FERRER BAIXAULI' }, db)?.id).toBe(13)
  })

  it('does not confuse two players sharing a surname', () => {
    expect(resolvePlayer({ leveradeId: null, nombre: 'CARLOS FERRER BAIXAULI' }, db)?.id).toBe(6)
  })

  it('returns null when nothing matches', () => {
    expect(resolvePlayer({ leveradeId: null, nombre: 'NUEVO FICHAJE GARCIA' }, db)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

```bash
cd scraper && npm test -- match
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `scraper/src/match.ts`**

```ts
export interface DbPlayer {
  id: number
  name: string
  nick: string | null
  leverade_id: number | null
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// "PABLO FERRER BAIXAULI" -> "pablo ferrer"
function givenPlusFirstSurname(fullName: string): string {
  const parts = normalize(fullName).split(' ')
  return parts.length >= 2 ? `${parts[0]} ${parts[1]}` : parts[0] ?? ''
}

export function resolvePlayer(
  raw: { leveradeId: string | null; nombre: string },
  dbPlayers: DbPlayer[],
): DbPlayer | null {
  if (raw.leveradeId) {
    const byId = dbPlayers.find(p => p.leverade_id === Number(raw.leveradeId))
    if (byId) return byId
  }
  const key = givenPlusFirstSurname(raw.nombre)
  return (
    dbPlayers.find(p => normalize(p.name) === key) ??
    dbPlayers.find(p => p.nick && `${normalize(p.nick)} ${normalize(p.name).split(' ')[1] ?? ''}`.trim() === key) ??
    dbPlayers.find(p => givenPlusFirstSurname(p.name) === key) ??
    null
  )
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd scraper && npm test -- match
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scraper/src/match.ts scraper/test/match.test.ts
git commit -m "feat(scraper): federation-to-db player matching by leverade id then name"
```

---

### Task 7: Config reader/writer

**Files:**
- Create: `scraper/src/config.ts`
- Test: `scraper/test/config.test.ts`

**Interfaces:**
- Consumes: `supabase` from `scraper/src/supabase.ts`.
- Produces:
  - `getConfig(key: string): Promise<string>` — throws if missing.
  - `setConfig(key: string, value: string): Promise<void>`
  - `getTournamentId(): Promise<string>` — `getConfig('tournament_id')`.

- [ ] **Step 1: Write the failing test — `scraper/test/config.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'

const from = vi.fn()
vi.mock('../src/supabase', () => ({ supabase: { from } }))

import { getConfig, setConfig } from '../src/config'

describe('getConfig', () => {
  it('returns the value for a key', async () => {
    from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: '1324114' } }) }) }),
    })
    expect(await getConfig('tournament_id')).toBe('1324114')
  })

  it('throws when the key is missing', async () => {
    from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    })
    await expect(getConfig('nope')).rejects.toThrow(/nope/)
  })
})

describe('setConfig', () => {
  it('upserts the key', async () => {
    const upsert = vi.fn(async () => ({ error: null }))
    from.mockReturnValue({ upsert })
    await setConfig('last_sync_at', '2026-09-04')
    expect(upsert).toHaveBeenCalledWith({ key: 'last_sync_at', value: '2026-09-04' }, { onConflict: 'key' })
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

```bash
cd scraper && npm test -- config
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `scraper/src/config.ts`**

```ts
import { supabase } from './supabase.js'

export async function getConfig(key: string): Promise<string> {
  const { data } = await supabase.from('config').select('value').eq('key', key).maybeSingle()
  if (!data) throw new Error(`config key not found: ${key}`)
  return data.value as string
}

export async function setConfig(key: string, value: string): Promise<void> {
  const { error } = await supabase.from('config').upsert({ key, value }, { onConflict: 'key' })
  if (error) throw new Error(`config write failed for ${key}: ${error.message}`)
}

export function getTournamentId(): Promise<string> {
  return getConfig('tournament_id')
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd scraper && npm test -- config
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scraper/src/config.ts scraper/test/config.test.ts
git commit -m "feat(scraper): config table reader/writer"
```

---

### Task 8: Sync orchestration

**Files:**
- Create: `scraper/src/sync.ts`
- Test: `scraper/test/sync.test.ts`

**Interfaces:**
- Consumes: `getRounds`, `getRoundMatches` (leverade.ts); `fetchMatchStats`, `SHARKS_TEAM_NAME` (fncv.ts); `resolvePlayer`, `DbPlayer` (match.ts); `calcMatchPoints`, `EMPTY_STATS`, `PlayerStats`, `Position` (points.ts); `getConfig`, `setConfig`, `getTournamentId` (config.ts); `supabase` (supabase.ts).
- Produces:
  - `rawToStats(raw: RawPlayer, golesContra: number): PlayerStats` — map federation columns to the model.
  - `syncJornada(tournamentId: string, round: Round, dbPlayers: DbPlayer[]): Promise<{ jornada: number; rows: number; unmatched: string[] } | null>` — null if no finished Sharks match.
  - `recalc(): Promise<void>` — rebuild `jugadores.stats` + `usuarios.puntos` from `historial`.
  - `runSync(opts: { backfill?: boolean; jornada?: number }): Promise<void>` — top-level.

- [ ] **Step 1: Write the failing test — `scraper/test/sync.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { rawToStats } from '../src/sync'
import type { RawPlayer } from '../src/fncv'

const raw = (o: Partial<RawPlayer>): RawPlayer => ({
  leveradeId: '1', nombre: 'X', jugo: true,
  G: 0, GP: 0, TA: 0, TR: 0, EX: 0, ED: 0, EB: 0, EN: 0, EP: 0, P: 0, PF: 0,
  ...o,
})

describe('rawToStats', () => {
  it('maps federation columns to the stat model', () => {
    const s = rawToStats(raw({ G: 2, GP: 1, TA: 1, TR: 1, EX: 2, ED: 1, EP: 1, P: 1, PF: 1, jugo: true }), 9)
    expect(s).toEqual({
      partidos: 1,
      goles: 2,
      goles_penalti: 1,
      penaltis_fallados: 1,
      faltas_penalti: 1,
      tarjetas: 2,          // TA + TR
      expulsiones: 2,       // EX
      expulsiones_graves: 3, // ED + EB + EN + EP
      goles_contra: 9,
    })
  })

  it('sets partidos 0 when the player did not dress', () => {
    expect(rawToStats(raw({ jugo: false }), 9).partidos).toBe(0)
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

```bash
cd scraper && npm test -- sync
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `scraper/src/sync.ts`**

```ts
import { supabase } from './supabase.js'
import { getRounds, getRoundMatches, type Round } from './leverade.js'
import { fetchMatchStats, SHARKS_TEAM_NAME, type RawPlayer } from './fncv.js'
import { resolvePlayer, type DbPlayer } from './match.js'
import { calcMatchPoints, EMPTY_STATS, type PlayerStats, type Position } from './points.js'
import { getTournamentId, setConfig } from './config.js'

const STAT_KEYS = Object.keys(EMPTY_STATS) as (keyof PlayerStats)[]

export function rawToStats(raw: RawPlayer, golesContra: number): PlayerStats {
  return {
    partidos: raw.jugo ? 1 : 0,
    goles: raw.G,
    goles_penalti: raw.GP,
    penaltis_fallados: raw.PF,
    faltas_penalti: raw.P,
    tarjetas: raw.TA + raw.TR,
    expulsiones: raw.EX,
    expulsiones_graves: raw.ED + raw.EB + raw.EN + raw.EP,
    goles_contra: raw.jugo ? golesContra : 0,
  }
}

async function getDbPlayers(): Promise<DbPlayer[]> {
  const { data, error } = await supabase
    .from('jugadores')
    .select('id, name, nick, pos, numero, leverade_id')
  if (error || !data) throw new Error(`jugadores fetch failed: ${error?.message}`)
  return data as unknown as DbPlayer[]
}

export async function syncJornada(
  tournamentId: string,
  round: Round,
  dbPlayers: (DbPlayer & { pos: Position })[],
): Promise<{ jornada: number; rows: number; unmatched: string[] } | null> {
  const matches = await getRoundMatches(round.id)
  const finished = matches.filter(m => m.finished)

  let sharksMatch: Awaited<ReturnType<typeof fetchMatchStats>> | null = null
  let matchDate: string | null = null
  for (const m of finished) {
    const stats = await fetchMatchStats(tournamentId, m.id)
    if (stats.local === SHARKS_TEAM_NAME || stats.visitante === SHARKS_TEAM_NAME) {
      sharksMatch = stats
      matchDate = m.date
      break
    }
  }
  if (!sharksMatch) return null

  const golesContra =
    sharksMatch.sharks === 'local' ? sharksMatch.golesVisitante : sharksMatch.golesLocal

  const unmatched: string[] = []
  const byPlayerId = new Map<number, PlayerStats>()
  for (const rp of sharksMatch.jugadores) {
    const db = resolvePlayer(rp, dbPlayers)
    if (!db) { unmatched.push(`J${round.jornada}: ${rp.nombre} (${rp.leveradeId ?? 'sin id'})`); continue }
    byPlayerId.set(db.id, rawToStats(rp, golesContra))
  }

  // Dense historial: every rostered player gets a row, 0s if absent.
  const upserts = dbPlayers.map(db => {
    const stats = byPlayerId.get(db.id) ?? { ...EMPTY_STATS }
    return {
      jugador_id: db.id,
      jornada: round.jornada,
      stats,
      puntos: calcMatchPoints(db.pos, stats),
      date: matchDate ?? new Date().toISOString(),
    }
  })

  const { error } = await supabase
    .from('historial')
    .upsert(upserts, { onConflict: 'jugador_id,jornada' })
  if (error) throw new Error(`historial upsert J${round.jornada}: ${error.message}`)

  return { jornada: round.jornada, rows: upserts.length, unmatched }
}

export async function recalc(): Promise<void> {
  const { data: hist } = await supabase.from('historial').select('jugador_id, stats, puntos')
  const { data: jugadores } = await supabase.from('jugadores').select('id, numero')
  const { data: usuarios } = await supabase.from('usuarios').select('id, equipo')
  if (!hist || !jugadores || !usuarios) throw new Error('recalc: fetch failed')

  // Accumulated stats per player (goles_contra kept at 0 — per-match only).
  const acc = new Map<number, PlayerStats>()
  const puntosByPlayer = new Map<number, number>()
  for (const h of hist) {
    const cur = acc.get(h.jugador_id) ?? { ...EMPTY_STATS }
    const s = h.stats as PlayerStats
    for (const k of STAT_KEYS) cur[k] += s[k] ?? 0
    cur.goles_contra = 0
    acc.set(h.jugador_id, cur)
    puntosByPlayer.set(h.jugador_id, (puntosByPlayer.get(h.jugador_id) ?? 0) + (h.puntos ?? 0))
  }

  for (const j of jugadores) {
    await supabase.from('jugadores')
      .update({ stats: acc.get(j.id) ?? { ...EMPTY_STATS } })
      .eq('id', j.id)
  }

  const puntosByNumero = new Map<number, number>()
  for (const j of jugadores) puntosByNumero.set(j.numero, puntosByPlayer.get(j.id) ?? 0)

  for (const u of usuarios) {
    const puntos = (u.equipo as number[]).reduce((sum, n) => sum + (puntosByNumero.get(n) ?? 0), 0)
    await supabase.from('usuarios').update({ puntos }).eq('id', u.id)
  }
  console.log(`recalc: ${jugadores.length} jugadores, ${usuarios.length} usuarios`)
}

export async function runSync(opts: { backfill?: boolean; jornada?: number }): Promise<void> {
  const tournamentId = await getTournamentId()
  const dbPlayers = (await getDbPlayers()) as (DbPlayer & { pos: Position })[]
  const rounds = await getRounds(tournamentId)

  if (opts.backfill) {
    console.log('backfill: wiping historial')
    await supabase.from('historial').delete().neq('jugador_id', -1)
  }

  const targets = opts.jornada
    ? rounds.filter(r => r.jornada === opts.jornada)
    : rounds

  const allUnmatched: string[] = []
  for (const round of targets) {
    if (!opts.backfill && !opts.jornada) {
      // incremental: skip jornadas already present in historial
      const { count } = await supabase
        .from('historial')
        .select('*', { count: 'exact', head: true })
        .eq('jornada', round.jornada)
      if ((count ?? 0) > 0) continue
    }
    if (opts.jornada) {
      await supabase.from('historial').delete().eq('jornada', round.jornada)
    }
    const res = await syncJornada(tournamentId, round, dbPlayers)
    if (!res) { console.log(`J${round.jornada}: no finished Sharks match`); continue }
    console.log(`J${res.jornada}: ${res.rows} rows, ${res.unmatched.length} unmatched`)
    allUnmatched.push(...res.unmatched)
  }

  await recalc()
  await setConfig('last_sync_at', new Date().toISOString())
  await setConfig('unmatched_players', JSON.stringify(allUnmatched))
  if (allUnmatched.length) {
    console.warn('UNMATCHED FEDERATION PLAYERS:\n' + allUnmatched.join('\n'))
  }
}
```

> **Negative-delta guard:** with per-match scraping there is no delta to go negative — each jornada is read whole from its own page. The old guard is not needed. (If a jornada is re-scraped with `--jornada N`, its rows are deleted first, so it is also a clean whole-write.)

- [ ] **Step 4: Run tests, verify pass**

```bash
cd scraper && npm test -- sync
```
Expected: PASS (2 tests). `runSync`/`syncJornada`/`recalc` are integration-covered by Task 11's live backfill, not unit tests.

- [ ] **Step 5: Typecheck the whole scraper**

```bash
cd scraper && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add scraper/src/sync.ts scraper/test/sync.test.ts
git commit -m "feat(scraper): per-jornada sync orchestration + recalc"
```

---

### Task 9: CLI + archive old scraper

**Files:**
- Create: `scraper/src/index.ts` (replace)
- Create: `scraper/legacy/index.ts` (move current `scraper/src/index.ts` here)
- Delete: `scraper/src/index.ts` (old content — moved)

**Interfaces:**
- Consumes: `runSync` from `sync.ts`; `runDiscover` from `discover.ts` (Task 10 — if implementing 10 before 9, wire it; else stub the import and add in Task 10).
- Produces: CLI entrypoint. Flags: `--backfill`, `--jornada <n>`, `--discover`.

- [ ] **Step 1: Move the old scraper aside**

```bash
cd scraper
git mv src/index.ts legacy/index.ts
```

Add a one-line header comment to `legacy/index.ts`:

```ts
// ARCHIVED 2026-09-04 — replaced by the per-jornada scraper in scraper/src/.
// Kept for reference (cumulative-diff approach against clupik.pro).
```

- [ ] **Step 2: Create the new `scraper/src/index.ts`**

```ts
import { runSync } from './sync.js'
import { runDiscover } from './discover.js'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('--discover')) {
    await runDiscover()
    return
  }
  const jIdx = args.indexOf('--jornada')
  const jornada = jIdx > -1 ? Number(args[jIdx + 1]) : undefined
  const backfill = args.includes('--backfill')
  console.log(`[${new Date().toISOString()}] sync start`, { backfill, jornada })
  await runSync({ backfill, jornada })
  console.log('sync done')
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 3: Update `scraper/package.json` scripts**

```json
"scripts": {
  "sync": "node --env-file=../.env --import tsx/esm src/index.ts",
  "sync:prod": "node --import tsx/esm src/index.ts",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

(`sync:prod` is what the workflow calls; keep both.)

- [ ] **Step 4: Typecheck**

```bash
cd scraper && npx tsc --noEmit
```
Expected: no errors (needs `discover.ts` from Task 10 — do Task 10 before this typecheck, or temporarily inline `const runDiscover = async () => { throw new Error('not built yet') }` and remove in Task 10).

- [ ] **Step 5: Commit**

```bash
git add scraper/src/index.ts scraper/legacy/index.ts scraper/package.json
git commit -m "feat(scraper): new CLI (--backfill / --jornada / --discover), archive old scraper"
```

---

### Task 10: Player discovery helper + populate `leverade_id`

**Files:**
- Create: `scraper/src/discover.ts`

**Interfaces:**
- Consumes: `getRounds`, `getRoundMatches` (leverade.ts); `fetchMatchStats`, `SHARKS_TEAM_NAME` (fncv.ts); `resolvePlayer` (match.ts); `supabase`, `getTournamentId`.
- Produces: `runDiscover(): Promise<void>` — prints, for every distinct federation Sharks player across the season, `{ leveradeId, nombre, matchedDbId | 'UNMATCHED' }`, then prints ready-to-run SQL `UPDATE jugadores SET leverade_id = ... WHERE id = ...;` for the ones matched by name.

- [ ] **Step 1: Implement `scraper/src/discover.ts`**

```ts
import { supabase } from './supabase.js'
import { getRounds, getRoundMatches } from './leverade.js'
import { fetchMatchStats, SHARKS_TEAM_NAME } from './fncv.js'
import { resolvePlayer, type DbPlayer } from './match.js'
import { getTournamentId } from './config.js'

export async function runDiscover(): Promise<void> {
  const tournamentId = await getTournamentId()
  const { data } = await supabase.from('jugadores').select('id, name, nick, leverade_id')
  const dbPlayers = (data ?? []) as DbPlayer[]

  const seen = new Map<string, string>() // leveradeId -> nombre
  const rounds = await getRounds(tournamentId)
  for (const round of rounds) {
    const matches = await getRoundMatches(round.id)
    for (const m of matches.filter(x => x.finished)) {
      const stats = await fetchMatchStats(tournamentId, m.id)
      if (stats.local !== SHARKS_TEAM_NAME && stats.visitante !== SHARKS_TEAM_NAME) continue
      for (const p of stats.jugadores) {
        if (p.leveradeId && !seen.has(p.leveradeId)) seen.set(p.leveradeId, p.nombre)
      }
    }
  }

  console.log(`\n${seen.size} distinct federation players:\n`)
  const sql: string[] = []
  for (const [leveradeId, nombre] of seen) {
    const db = resolvePlayer({ leveradeId, nombre }, dbPlayers)
    const already = dbPlayers.find(d => d.leverade_id === Number(leveradeId))
    const tag = already ? `already -> id ${already.id}` : db ? `name-match -> id ${db.id}` : 'UNMATCHED'
    console.log(`  ${leveradeId.padEnd(12)} ${nombre.padEnd(34)} ${tag}`)
    if (!already && db) sql.push(`UPDATE jugadores SET leverade_id = ${leveradeId} WHERE id = ${db.id};`)
  }
  console.log('\n-- SQL for name-matched players (review before running):\n' + sql.join('\n'))
  console.log('\n-- UNMATCHED players need a manual decision (new signing? nickname mismatch?).')
}
```

- [ ] **Step 2: Typecheck**

```bash
cd scraper && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Run discovery against live data**

```bash
cd scraper && npm run sync -- --discover
```
Expected: a table of ~17-20 federation players, most `name-match`, plus generated `UPDATE` SQL.

- [ ] **Step 4: Populate `leverade_id`**

Review the printed SQL. For each `UNMATCHED` row, decide: existing player with a nickname mismatch (add a manual `UPDATE`), or a genuine new signing not in `jugadores` (leave for Phase B admin; note it in the diary). Run the reviewed `UPDATE` statements via the Supabase MCP `execute_sql` tool (`project_id: sihvxbhqcyynuulhqmii`).

- [ ] **Step 5: Verify**

```sql
select count(*) filter (where leverade_id is not null) as mapped,
       count(*) as total
from jugadores;
```
Expected: `mapped` ≈ `total` (17), minus any confirmed-departed players.

- [ ] **Step 6: Commit**

```bash
git add scraper/src/discover.ts
git commit -m "feat(scraper): --discover helper to map federation players to jugadores"
```

---

### Task 11: Run the backfill and verify against the federation

**Files:**
- Create: `docs/diary/federation-sync.md`

- [ ] **Step 1: Run the backfill**

```bash
cd scraper && npm run sync -- --backfill
```
Expected: ~18 lines `J1: 17 rows ...` (some `no finished Sharks match` for bye weeks), then `recalc: 17 jugadores, 2 usuarios`, then `last_sync_at` written. Watch for `UNMATCHED FEDERATION PLAYERS` — if any, resolve (Task 10 Step 4) and re-run.

- [ ] **Step 2: Pull the computed accumulated totals**

Via Supabase MCP `execute_sql` (`project_id: sihvxbhqcyynuulhqmii`):

```sql
select j.name, j.pos,
       (j.stats->>'partidos')::int  as pj,
       (j.stats->>'goles')::int     as g,
       (j.stats->>'goles_penalti')::int as gp,
       (j.stats->>'expulsiones')::int   as ex,
       (j.stats->>'faltas_penalti')::int as p,
       (j.stats->>'penaltis_fallados')::int as pf
from jugadores j order by j.numero;
```

- [ ] **Step 3: Compare against the federation**

Open `https://waterpolo.fncv.es/es/tournament/1324114/statistics`, filter/scan the `C.W. Sharks A` rows. For each player compare `PJ, G, GP, EX, P, PF`. Record the comparison as a table in `docs/diary/federation-sync.md`. Acceptable differences:
- `PJ` may differ by the "convocado vs jugó" definition — decide the rule, state it in the diary, and if needed adjust `rawToStats` (`jugo`) + re-run `--backfill`.
- Nothing else should differ. Any mismatch in `G/GP/EX/P/PF` is a parser bug — fix `fncv.ts`, re-run Task 4 test, re-run `--backfill`.

- [ ] **Step 4: Sanity-check user points**

```sql
select nombre, puntos, equipo from usuarios;
```
Expected: both `puntos` > 0 and plausible (tens to low hundreds).

- [ ] **Step 5: Write the diary entry**

`docs/diary/federation-sync.md`: what was built, the verification table, the "convocado vs jugó" decision, any unmatched/departed players, and the exact commands to re-run (`npm run sync`, `--backfill`, `--jornada N`).

- [ ] **Step 6: Commit**

```bash
git add docs/diary/federation-sync.md
git commit -m "docs: federation sync backfill verification for season 25-26"
```

---

### Task 12: Frontend — stat model + points formula

**Files:**
- Modify: `src/types/index.ts:1-14`
- Modify: `src/lib/points.ts:1-19`
- Modify: `src/lib/points.test.ts` (rewrite)

**Interfaces:**
- Produces: `PlayerStats` (matching the scraper), `calcMatchPoints(pos, s)` identical to `scraper/src/points.ts`.

- [ ] **Step 1: Update `src/types/index.ts`**

Replace the `PlayerStats` interface (lines 1-12) with:

```ts
export interface PlayerStats {
  partidos: number
  goles: number
  goles_penalti: number
  penaltis_fallados: number
  faltas_penalti: number
  tarjetas: number
  expulsiones: number
  expulsiones_graves: number
  goles_contra: number
}
```

Leave `Position`, `HistorialEntry`, `Jugador`, `Usuario` unchanged. Add to `Jugador`:

```ts
  leverade_id: number | null
```

- [ ] **Step 2: Rewrite `src/lib/points.test.ts`**

Use the exact same test cases as `scraper/test/points.test.ts` Step 1, but import from `./points` and keep the existing `calcTotalPoints` tests (lines 38-49) unchanged. Add `EMPTY_STATS` import.

- [ ] **Step 3: Run it, verify it fails**

```bash
npm test -- points
```
Expected: FAIL — old `calcMatchPoints` signature / missing `EMPTY_STATS`.

- [ ] **Step 4: Update `src/lib/points.ts`**

Replace the file's `calcMatchPoints` and add `EMPTY_STATS`, copying `scraper/src/points.ts` verbatim (the `calcMatchPoints` body + `EMPTY_STATS`), but keep the `import type { PlayerStats, Position } from '../types'` line and the existing `calcTotalPoints` export.

```ts
import type { PlayerStats, Position } from '../types'

export const EMPTY_STATS: PlayerStats = {
  partidos: 0, goles: 0, goles_penalti: 0, penaltis_fallados: 0,
  faltas_penalti: 0, tarjetas: 0, expulsiones: 0, expulsiones_graves: 0,
  goles_contra: 0,
}

export function calcMatchPoints(pos: Position, s: PlayerStats): number {
  let pts = s.partidos * 1
  pts += s.faltas_penalti * -1
  pts += s.expulsiones * -1
  pts += s.tarjetas * -3
  pts += s.expulsiones_graves * -5

  if (pos === 'Portero') {
    if (s.partidos > 0) {
      pts += 2
      pts += Math.max(0, 10 - s.goles_contra)
    }
  } else {
    pts += s.goles * 5
    pts += s.goles_penalti * 3
    pts += s.penaltis_fallados * -2
  }
  return pts
}

export function calcTotalPoints(historial: { puntos: number }[]): number {
  return historial.reduce((sum, h) => sum + h.puntos, 0)
}
```

- [ ] **Step 5: Run tests, verify pass**

```bash
npm test -- points
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/lib/points.ts src/lib/points.test.ts
git commit -m "feat(web): new stat model + scoring formula, add leverade_id to Jugador"
```

---

### Task 13: Frontend — PlayerCard + AdminPanel compile fix

**Files:**
- Modify: `src/components/Dashboard/PlayerCard.tsx:10-28,59-78`
- Modify: `src/components/Admin/AdminPanel.tsx:16-19`

**Interfaces:**
- Consumes: new `PlayerStats`, `calcMatchPoints`.

- [ ] **Step 1: Update `PlayerCard.tsx` `getKeyStats` (lines 10-28)**

```ts
function getKeyStats(pos: Position, stats: PlayerStats) {
  const base = [
    { label: 'Faltas penalti', value: stats.faltas_penalti },
    { label: 'Tarjetas', value: stats.tarjetas },
    { label: 'Expulsiones', value: stats.expulsiones },
    { label: 'Expuls. graves', value: stats.expulsiones_graves },
  ]
  if (pos === 'Portero') {
    return [{ label: 'G. Encajados (equipo)', value: stats.goles_contra }, ...base]
  }
  return [
    { label: 'Goles', value: stats.goles },
    { label: 'Goles penalti', value: stats.goles_penalti },
    { label: 'Penaltis fallados', value: stats.penaltis_fallados },
    ...base,
  ]
}
```

- [ ] **Step 2: Update the stats grid (lines 59-78)**

```tsx
<div className="stats-section-label">Estadísticas generales</div>
<div className="stats-grid">
  <div className="stat-item"><span>Partidos</span><strong>{s.partidos}</strong></div>
  {jugador.pos !== 'Portero' && (
    <>
      <div className="stat-item"><span>Goles</span><strong>{s.goles}</strong></div>
      <div className="stat-item"><span>Goles penalti</span><strong>{s.goles_penalti}</strong></div>
      <div className="stat-item"><span>P. Fallados</span><strong>{s.penaltis_fallados}</strong></div>
    </>
  )}
  <div className="stat-item"><span>Faltas penalti</span><strong>{s.faltas_penalti}</strong></div>
  <div className="stat-item"><span>Tarjetas</span><strong>{s.tarjetas}</strong></div>
  <div className="stat-item"><span>Expulsiones</span><strong>{s.expulsiones}</strong></div>
  <div className="stat-item"><span>Expuls. graves</span><strong>{s.expulsiones_graves}</strong></div>
</div>
```

For `Portero`, the accumulated `goles_contra` is always 0 (per-match only), so don't show it in the accumulated grid — only in the per-jornada chips via `getKeyStats`. That is already the case with the code above.

- [ ] **Step 3: Fix `AdminPanel.tsx` stats object (lines 16-19)**

```ts
  const [stats, setStats] = useState({
    partidos: 0, goles: 0, goles_penalti: 0, penaltis_fallados: 0,
    faltas_penalti: 0, tarjetas: 0, expulsiones: 0, expulsiones_graves: 0,
    goles_contra: 0,
  })
```

(Phase B replaces this component. This is only to keep the build green.)

- [ ] **Step 4: Typecheck + lint + build**

```bash
npm run build && npm run lint
```
Expected: build succeeds, no lint errors.

- [ ] **Step 5: Run the full frontend test suite**

```bash
npm test
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/Dashboard/PlayerCard.tsx src/components/Admin/AdminPanel.tsx
git commit -m "feat(web): PlayerCard shows new stat model; AdminPanel compiles"
```

---

### Task 14: CI workflow + final integration check

**Files:**
- Modify: `.github/workflows/scraper.yml:20-30`

- [ ] **Step 1: Update the workflow**

Change the install + run steps to:

```yaml
      - name: Install scraper dependencies
        run: npm ci
        working-directory: scraper

      - name: Run stats sync (incremental)
        run: npm run sync:prod
        working-directory: scraper
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

(`npm ci` needs `scraper/package-lock.json` committed and current — it was updated in Task 2. If `npm ci` fails on lockfile mismatch, run `cd scraper && npm install` and commit the lockfile.)

- [ ] **Step 2: Run the scraper test suite once more**

```bash
cd scraper && npm test
```
Expected: all pass (http, leverade, fncv, points, match, config, sync).

- [ ] **Step 3: Dry-run incremental sync locally**

```bash
cd scraper && npm run sync
```
Expected: `J{n}: no finished Sharks match` or all jornadas already present → straight to `recalc` → `sync done`. No new rows (backfill already loaded everything).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/scraper.yml scraper/package-lock.json
git commit -m "ci: scraper workflow runs incremental sync"
```

- [ ] **Step 5: Open the PR**

```bash
git push -u origin feature/federation-sync
gh pr create --base develop --title "Federation sync rework (per-jornada)" --body "$(cat <<'EOF'
Implements docs/superpowers/specs/2026-09-03-federation-sync-and-admin-design.md — Subproject A.

- Scraper rewritten: enumerates jornadas via Leverade API, scrapes each Sharks
  match /stats page (cheerio), one historial row per player per jornada.
- New stat model (drops paradas/tiros/penaltis_parados; adds goles_penalti,
  faltas_penalti, expulsiones_graves) + new scoring formula.
- jugadores.leverade_id, historial UNIQUE(jugador_id,jornada), config table.
- Season 25-26 backfilled and verified against the federation's own totals
  (see docs/diary/federation-sync.md).
- Frontend: PlayerCard + points updated to the new model.

Phase B (extended admin panel) is a separate plan/PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Fuente de datos (Leverade API + FNCV `/stats`) → Tasks 3, 4. ✅
- Rate limiting → Task 2. ✅
- A1 stat model → Tasks 5, 12 (+ Global Constraints). ✅
- A2 formula → Tasks 5, 12. ✅
- A3 player matching (`leverade_id` + fallback, unmatched list) → Tasks 1, 6, 10; unmatched persisted to `config` in Task 8 (`runSync`). ✅
- A4 scraper modules + CLI modes + guards → Tasks 2-10. ✅
- A5 schema → Task 1. ✅
- A6 backfill + verification → Task 11. ✅
- A7 frontend (types, points, PlayerCard, other components) → Tasks 12, 13; grep confirmed no other component uses removed fields (Global note). ✅
- `scraper.yml` → Task 14. ✅
- Diary → Task 11. ✅

**Placeholder scan:** The FNCV score-extraction code in Task 4 Step 4 is explicitly flagged as best-effort with the test as oracle and a real fixture captured in Step 1 — the implementer has a concrete method (make the Step 2 test green), not a "TODO". `runDiscover` import in Task 9 has an explicit inline stub instruction if Task 10 is done after. No bare TBDs.

**Type consistency:** `PlayerStats` (9 fields) identical in Global Constraints, Task 5, Task 12. `RawPlayer` fields (Task 4) consumed by `rawToStats` (Task 8) — names match (`G, GP, TA, TR, EX, ED, EB, EN, EP, P, PF`, `jugo`, `leveradeId`, `nombre`). `DbPlayer` (Task 6) extended with `pos: Position` in Task 8 — `getDbPlayers` selects `pos`. `Round`/`Match` (Task 3) consumed in Task 8. `resolvePlayer` signature identical in Tasks 6, 8, 10. `calcMatchPoints(pos, s)` identical scraper/web.

**Gap fixed during review:** `getDbPlayers` in Task 8 must `select` `pos` and `numero` (used by `recalc`) — added to the query in the Step 3 code.
