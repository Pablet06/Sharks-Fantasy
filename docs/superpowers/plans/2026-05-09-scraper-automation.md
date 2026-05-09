# Scraper Automation (Supabase + GitHub Actions) Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the scraper from Firebase to Supabase and automate it via GitHub Actions cron (runs every Saturday night automatically).

**Architecture:** Scraper stays as Node.js + TypeScript in `scraper/`. GitHub Actions workflow triggers on a cron schedule (Saturdays 23:00 CET = 22:00 UTC). All credentials via GitHub Secrets. No local server needed — the Express server (`server.js`) becomes optional for manual runs only.

**Tech Stack:** Node.js 20 + TypeScript, Supabase JS SDK v2, Cheerio, Axios, GitHub Actions.

**Prerequisite:** Plan `2026-05-09-supabase-migration.md` must be complete (Supabase has data + correct schema).

---

## File Structure

```
scraper/
├── src/
│   ├── index.ts         — main sync logic (ported from index.js, uses Supabase)
│   ├── supabase.ts      — Supabase admin client (service role)
│   └── points.ts        — calcMatchPoints (duplicate from frontend — scraper is separate process)
├── package.json
└── tsconfig.json
.github/
└── workflows/
    ├── scraper.yml      — weekly cron + manual trigger
    └── deploy.yml       — frontend deploy (from Plan 2)
```

**Note:** `scraper/server.js` and `scraper/rebuild_history.js` are kept as-is for manual use. Only `scraper/index.js` is replaced by `scraper/src/index.ts`.

---

### Task 1: Port Scraper to TypeScript + Supabase

**Files:**
- Create: `scraper/src/supabase.ts`
- Create: `scraper/src/points.ts`
- Create: `scraper/src/index.ts`
- Modify: `scraper/package.json` — add TypeScript deps
- Create: `scraper/tsconfig.json`

- [ ] **Step 1: Add TypeScript dependencies to scraper**

```bash
cd scraper
npm install @supabase/supabase-js
npm install -D typescript @types/node tsx
```

- [ ] **Step 2: Create scraper tsconfig.json**

```json
// scraper/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Update scraper package.json**

```json
{
  "name": "sharks-fantasy-scraper",
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "sync": "node --env-file=../.env --import tsx/esm src/index.ts",
    "sync:prod": "tsx src/index.ts"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "cheerio": "^1.0.0-rc.12",
    "@supabase/supabase-js": "^2.0.0",
    "dotenv": "^17.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0"
  }
}
```

- [ ] **Step 4: Create Supabase admin client for scraper**

```typescript
// scraper/src/supabase.ts
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

// Service role key bypasses RLS — only use server-side
export const supabase = createClient(url, serviceKey)
```

- [ ] **Step 5: Create points logic (copy from frontend types)**

```typescript
// scraper/src/points.ts
export interface PlayerStats {
  partidos: number; goles: number; penaltis: number; tarjetas: number
  expulsiones: number; tiros: number; penaltis_fallados: number
  paradas: number; goles_contra: number; penaltis_parados: number
}

// Mirror the union type from frontend — catches DB pos typos at compile time
export type Position = 'Portero' | 'Boya' | 'Extremo' | 'Lateral' | 'Contraboya'

export function calcMatchPoints(pos: Position, s: PlayerStats): number {
  let pts = s.partidos * 1
  pts += s.tarjetas * -5
  pts += s.expulsiones * -1
  if (pos === 'Portero') {
    pts += s.paradas * 2
    pts += s.goles_contra * -1
    pts += s.penaltis_parados * 3
  } else {
    pts += s.goles * 6
    pts += s.penaltis * 4
    pts += s.tiros * 2
    pts += s.penaltis_fallados * -3
  }
  return pts
}
```

- [ ] **Step 6: Port main scraper logic to TypeScript + Supabase**

```typescript
// scraper/src/index.ts
import 'dotenv/config'
import axios from 'axios'
import * as cheerio from 'cheerio'
import { supabase } from './supabase.js'
import { calcMatchPoints, type PlayerStats, type Position } from './points.js'

const TARGET_URL = 'https://clupik.pro/es/team/15688441'

const normalize = (str: string) =>
  str.replace(/\s*\(c\)$/i, '').toLowerCase().normalize('NFD')
     .replace(/[̀-ͯ]/g, '').trim()

async function getMaxJornada(): Promise<number> {
  const { data } = await supabase
    .from('historial')
    .select('jornada')
    .order('jornada', { ascending: false })
    .limit(1)
    .single()
  return data?.jornada ?? 0
}

async function recalcUserPoints(): Promise<void> {
  const { data: jugadores } = await supabase
    .from('jugadores')
    .select('numero, historial(*)')

  if (!jugadores) return

  const pointsByNumero = new Map<number, number>()
  jugadores.forEach(j => {
    const total = (j.historial as { puntos: number }[])
      .reduce((sum, h) => sum + h.puntos, 0)
    pointsByNumero.set(j.numero, total)
  })

  const { data: usuarios } = await supabase.from('usuarios').select('id, equipo')
  if (!usuarios) return

  for (const u of usuarios) {
    const puntos = (u.equipo as number[])
      .reduce((sum, id) => sum + (pointsByNumero.get(id) ?? 0), 0)
    await supabase.from('usuarios').update({ puntos }).eq('id', u.id)
  }
  console.log(`✅ Recalculated points for ${usuarios.length} users.`)
}

export async function syncTeamStats(): Promise<void> {
  console.log(`\n[${new Date().toISOString()}] Starting sync...`)

  // 1. Fetch web stats
  const { data: html } = await axios.get(TARGET_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })
  const $ = cheerio.load(html)
  const table = $('table').first()
  const headers: string[] = []
  table.find('th').each((_, th) => headers.push($(th).text().trim()))

  const idx = {
    name: headers.indexOf('Nombre'), pj: headers.indexOf('PJ'),
    g: headers.indexOf('G'), gp: headers.indexOf('GP'),
    ta: headers.indexOf('TA'), tr: headers.indexOf('TR'),
    ex: headers.indexOf('EX'), pf: headers.indexOf('PF')
  }

  const parseStat = (txt: string) => (txt && txt !== '-') ? (parseInt(txt) || 0) : 0

  const webPlayers: { name: string; stats: PlayerStats }[] = []
  table.find('tbody tr').each((_, row) => {
    const cols = $(row).find('td')
    if (cols.length > 0) {
      let rawName = $(cols[idx.name]).text().trim()
      let name = rawName.replace(/^Ver\s+/i, '').replace(/Ver$/i, '').trim()
      if (name.includes('\n')) {
        name = name.split('\n').map((s: string) => s.trim()).filter((s: string) => s.length > 2).pop() || name
      }
      if (name) {
        webPlayers.push({
          name,
          stats: {
            partidos: parseStat($(cols[idx.pj]).text()),
            goles: parseStat($(cols[idx.g]).text()),
            penaltis: parseStat($(cols[idx.gp]).text()),
            tarjetas: parseStat($(cols[idx.ta]).text()) + parseStat($(cols[idx.tr]).text()),
            expulsiones: parseStat($(cols[idx.ex]).text()),
            tiros: 0,
            penaltis_fallados: idx.pf > -1 ? parseStat($(cols[idx.pf]).text()) : 0,
            paradas: 0, goles_contra: 0, penaltis_parados: 0
          }
        })
      }
    }
  })
  console.log(`Parsed ${webPlayers.length} players from web.`)

  // 2. Get DB players with historial
  const { data: dbPlayers, error } = await supabase
    .from('jugadores')
    .select('id, numero, name, nick, pos, stats, historial(*)')
  
  if (error || !dbPlayers) throw new Error(`DB fetch failed: ${error?.message}`)

  const maxJornada = await getMaxJornada()
  const nextJornada = maxJornada + 1
  let updatesCount = 0

  for (const p of dbPlayers) {
    const pName = normalize(p.name)
    const pNick = normalize(p.nick || '')
    const webP = webPlayers.find(wp => {
      const wpName = normalize(wp.name)
      return wpName === pName || (pNick && wpName === pNick) || wpName.includes(pName)
    })
    if (!webP) continue

    // Calculate DB totals from historial
    const historial = p.historial as { stats: PlayerStats }[]
    const dbTotals: PlayerStats = historial.reduce(
      (acc, h) => {
        const s = h.stats
        return {
          partidos: acc.partidos + (s.partidos || 0),
          goles: acc.goles + (s.goles || 0),
          penaltis: acc.penaltis + (s.penaltis || 0),
          tarjetas: acc.tarjetas + (s.tarjetas || 0),
          expulsiones: acc.expulsiones + (s.expulsiones || 0),
          tiros: acc.tiros + (s.tiros || 0),
          penaltis_fallados: acc.penaltis_fallados + (s.penaltis_fallados || 0),
          paradas: acc.paradas + (s.paradas || 0),
          goles_contra: acc.goles_contra + (s.goles_contra || 0),
          penaltis_parados: acc.penaltis_parados + (s.penaltis_parados || 0)
        }
      },
      { partidos: 0, goles: 0, penaltis: 0, tarjetas: 0, expulsiones: 0,
        tiros: 0, penaltis_fallados: 0, paradas: 0, goles_contra: 0, penaltis_parados: 0 }
    )

    const delta: PlayerStats = {
      partidos: webP.stats.partidos - dbTotals.partidos,
      goles: webP.stats.goles - dbTotals.goles,
      penaltis: webP.stats.penaltis - dbTotals.penaltis,
      tarjetas: webP.stats.tarjetas - dbTotals.tarjetas,
      expulsiones: webP.stats.expulsiones - dbTotals.expulsiones,
      tiros: 0, penaltis_fallados: webP.stats.penaltis_fallados - dbTotals.penaltis_fallados,
      paradas: 0, goles_contra: 0, penaltis_parados: 0
    }

    const hasChanges = Object.values(delta).some(v => v !== 0)
    if (!hasChanges) continue

    console.log(`  Update ${p.name}: +${delta.goles}g +${delta.partidos}pj`)
    const puntos = calcMatchPoints(p.pos as Position, delta)

    const { error: insertErr } = await supabase.from('historial').insert({
      jugador_id: p.id,
      jornada: nextJornada,
      stats: delta,
      puntos,
      date: new Date().toISOString()
    })
    if (insertErr) { console.error(`Historial insert error for ${p.name}:`, insertErr); continue }

    // Update root stats
    await supabase.from('jugadores').update({ stats: webP.stats }).eq('id', p.id)
    updatesCount++
  }

  if (updatesCount > 0) {
    console.log(`\n✅ Created J${nextJornada} for ${updatesCount} players.`)
    await recalcUserPoints()
  } else {
    console.log('\n✅ No new stats. DB is up to date.')
  }
}

syncTeamStats().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 7: Test scraper locally**

```bash
cd scraper && npm run sync
```
Expected: connects to Supabase, fetches clupik.pro, logs player matches, no new jornada if already synced.

- [ ] **Step 8: Commit**

```bash
git add scraper/
git commit -m "feat: port scraper to TypeScript + Supabase, remove Firebase dependency"
```

---

### Task 2: GitHub Actions Cron Workflow

**Files:**
- Create: `.github/workflows/scraper.yml`

- [ ] **Step 1: Create scraper workflow**

```yaml
# .github/workflows/scraper.yml
name: Weekly Stats Sync

on:
  schedule:
    # Every Saturday at 22:00 UTC (23:00 CET / 00:00 CEST)
    - cron: '0 22 * * 6'
  workflow_dispatch:   # Manual trigger from GitHub UI

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: scraper/package-lock.json

      - name: Install scraper dependencies
        run: npm ci
        working-directory: scraper

      - name: Run stats sync
        # No .env file here — env vars injected above. dotenv no-ops gracefully on missing file.
        run: npm run sync:prod
        working-directory: scraper
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}

      - name: Notify on failure
        if: failure()
        run: echo "::error::Scraper sync failed! Check logs above."
```

- [ ] **Step 2: Add GitHub Secrets**
  - Go to GitHub repo → Settings → Secrets and variables → Actions
  - Add `SUPABASE_URL` (your project URL, e.g. `https://xxxx.supabase.co`)
  - Add `SUPABASE_SERVICE_ROLE_KEY` (from Supabase Settings → API → service_role key)
  - **Do NOT add the anon key** — service role is for scraper only

- [ ] **Step 3: Test manual trigger**
  - Go to GitHub repo → Actions tab → "Weekly Stats Sync" → "Run workflow"
  - Watch logs — should complete with "No new stats" or create a new jornada

- [ ] **Step 4: Verify cron syntax**

Test your cron expression at https://crontab.guru
`0 22 * * 6` = "At 22:00 on Saturday"

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/scraper.yml
git commit -m "feat: add GitHub Actions cron for weekly stats sync"
```

---

### Task 3: Remove All Hardcoded Credentials

- [ ] **Step 1: Verify no credentials in code**

```bash
grep -r "AIzaSy" . --include="*.ts" --include="*.js" --include="*.tsx"
grep -r "ADMIN_PASSWORD" . --include="*.ts" --include="*.js" --exclude-dir=node_modules
grep -r "eyJhbGc" . --include="*.ts" --include="*.js" --include="*.tsx"
```

Expected: 0 results (all in .env or GitHub Secrets).

- [ ] **Step 2: Check .gitignore has .env**

```bash
grep ".env" .gitignore
```
Expected: `.env` is listed. If not, add it.

- [ ] **Step 3: Verify .env.example is complete**

```
# Frontend (Vite — prefix required)
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key

# Scraper backend (NOT in frontend)
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore .env.example
git commit -m "security: ensure all credentials via env vars, no hardcoded keys"
```

---

### Task 4: Archive Old Files

- [ ] **Step 1: Move old scraper files to archive**

```bash
mkdir -p scraper/legacy
mv scraper/index.js scraper/legacy/
mv scraper/server.js scraper/legacy/
mv scraper/rebuild_history.js scraper/legacy/
mv scraper/check_db.js scraper/legacy/
```

- [ ] **Step 2: Archive old index.html**

The original `index.html` is kept as-is on the `develop` branch for reference. Once the React app is deployed and verified, it can be removed.

- [ ] **Step 3: Commit**

```bash
git add scraper/legacy/ scraper/src/
git commit -m "chore: archive legacy scraper files, keep for reference"
```
