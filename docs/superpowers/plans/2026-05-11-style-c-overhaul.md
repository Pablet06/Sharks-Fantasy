# Style C Overhaul + Edge Function Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply Style C (bottom tab nav, immersive dark theme) to the remaining screens (Dashboard shell, Ranking, Players) and deploy the `delete-account` Supabase Edge Function.

**Architecture:** Extract a new `Shell.tsx` component that owns the layout chrome (slim header + floating bottom tab bar). `Dashboard.tsx` becomes a thin orchestrator. Ranking and Players get visual polish. The Edge Function handles auth-user deletion server-side using the service role.

**Tech Stack:** React 18, TypeScript, Vite, vanilla CSS (CSS custom properties in `index.css`), Supabase JS v2, Deno (Edge Functions).

> **No test suite in this project** (`Test: N/A` per CLAUDE.md). Skip TDD steps — verify visually in the browser via `npm run dev` (Vite dev server).

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/Dashboard/Shell.tsx` | Layout chrome: slim header + floating bottom nav |
| Modify | `src/components/Dashboard/Dashboard.tsx` | Remove old header/nav, wrap content in Shell, keep admin logic |
| Modify | `src/components/Ranking/Ranking.tsx` | Medal list: 🥇🥈🥉 top 3 + compact list |
| Modify | `src/components/Players/Players.tsx` | Add position filter chips above search |
| Modify | `src/index.css` | Add `.bottom-nav`, `.bottom-nav-btn`, `.filter-chip` CSS |
| Create | `supabase/functions/delete-account/index.ts` | Deno Edge Function: verify JWT → delete user row → delete auth user |

---

## Task 1: CSS — bottom nav + filter chips

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Add bottom nav styles**

Append to `src/index.css` (before the `@media` block):

```css
/* ==========================================================================
   BOTTOM NAV (Shell)
   ========================================================================== */

.bottom-nav {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  background: rgba(10, 10, 26, 0.88);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(0, 210, 255, 0.18);
  border-radius: 28px;
  padding: 10px 18px;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 210, 255, 0.08);
  z-index: 100;
}

.bottom-nav-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px 16px;
  border-radius: 20px;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0.3px;
  transition: color 0.18s, background 0.18s;
  min-width: 60px;
}

.bottom-nav-btn .nav-icon {
  font-size: 1.2rem;
  line-height: 1;
}

.bottom-nav-btn:hover {
  color: #fff;
}

.bottom-nav-btn.active {
  background: linear-gradient(135deg, var(--secondary), var(--primary));
  color: #fff;
}

/* Push content above the fixed nav */
.dashboard-main {
  padding-bottom: 100px;
}

/* ==========================================================================
   FILTER CHIPS (Players)
   ========================================================================== */

.filter-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.filter-chip {
  padding: 5px 14px;
  border-radius: 18px;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.5px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: var(--text-muted);
  background: transparent;
  transition: all 0.18s;
  cursor: pointer;
}

.filter-chip:hover {
  color: #fff;
  border-color: var(--primary);
}

.filter-chip.active-all {
  background: rgba(0, 210, 255, 0.15);
  border-color: var(--primary);
  color: var(--primary);
}

/* Rank medals */
.rank-gold   { border-color: rgba(255, 215, 0, 0.5) !important; }
.rank-silver { border-color: rgba(140, 180, 255, 0.5) !important; }
.rank-bronze { border-color: rgba(205, 127, 50, 0.5) !important; }

.rank-gold   .rank-pts { color: var(--accent); }
.rank-silver .rank-pts { color: #8ab8ff; }
.rank-bronze .rank-pts { color: #cd7f32; }
```

- [ ] **Step 2: Verify build compiles**

```bash
npm run build 2>&1 | tail -5
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "style: add bottom-nav, filter-chips, rank-medal CSS classes"
```

---

## Task 2: Shell.tsx — layout chrome component

**Files:**
- Create: `src/components/Dashboard/Shell.tsx`

- [ ] **Step 1: Create Shell.tsx**

```tsx
import type { ReactNode } from 'react'

export type Tab = 'team' | 'ranking' | 'players' | 'profile'

interface ShellProps {
  tab: Tab
  onTabChange: (t: Tab) => void
  onSignOut: () => void
  children: ReactNode
}

const NAV_ITEMS: { tab: Tab; icon: string; label: string }[] = [
  { tab: 'team',    icon: '🌊', label: 'Mi Equipo'  },
  { tab: 'ranking', icon: '🏆', label: 'Ranking'    },
  { tab: 'players', icon: '👥', label: 'Jugadores'  },
  { tab: 'profile', icon: '👤', label: 'Perfil'     },
]

export function Shell({ tab, onTabChange, onSignOut, children }: ShellProps) {
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <img src="/Sharks-Fantasy/logo.png" alt="Sharks" className="header-logo" />
        <h1 className="header-title">SHARKS FANTASY</h1>
        <button onClick={onSignOut} className="signout-btn">Salir</button>
      </header>

      <main className="dashboard-main">
        {children}
      </main>

      <nav className="bottom-nav">
        {NAV_ITEMS.map(item => (
          <button
            key={item.tab}
            className={`bottom-nav-btn ${tab === item.tab ? 'active' : ''}`}
            onClick={() => onTabChange(item.tab)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | tail -5
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/Dashboard/Shell.tsx
git commit -m "feat: add Shell component with bottom floating nav"
```

---

## Task 3: Dashboard.tsx — wire Shell, keep admin logic

**Files:**
- Modify: `src/components/Dashboard/Dashboard.tsx`

- [ ] **Step 1: Rewrite Dashboard.tsx**

Replace the entire file content with:

```tsx
import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Jugador, Usuario } from '../../types'
import { Shell } from './Shell'
import type { Tab } from './Shell'
import { Pool } from './Pool'
import { Ranking } from '../Ranking/Ranking'
import { Players } from '../Players/Players'
import { Profile } from '../Profile/Profile'
import { AdminPanel } from '../Admin/AdminPanel'

interface Props {
  user: User
  usuario: Usuario
  jugadores: Jugador[]
  onSignOut: () => void
  onUpdateNombre: (nombre: string) => Promise<unknown>
  onUpdateEquipo: (equipo: number[]) => Promise<unknown>
}

export function Dashboard({ user, usuario, jugadores, onSignOut, onUpdateNombre, onUpdateEquipo }: Props) {
  const [tab, setTab] = useState<Tab>('team')
  const [showAdmin, setShowAdmin] = useState(false)
  const [adminClickCount, setAdminClickCount] = useState(0)

  const handleAdminTrigger = () => {
    const next = adminClickCount + 1
    setAdminClickCount(next)
    if (next >= 2) {
      setShowAdmin(true)
      setAdminClickCount(0)
    }
    setTimeout(() => setAdminClickCount(0), 800)
  }

  return (
    <>
      <Shell tab={tab} onTabChange={setTab} onSignOut={onSignOut}>
        {tab === 'team'    && <Pool usuario={usuario} jugadores={jugadores} onUpdateEquipo={onUpdateEquipo} />}
        {tab === 'ranking' && <Ranking jugadores={jugadores} currentUserId={usuario.id} />}
        {tab === 'players' && <Players jugadores={jugadores} />}
        {tab === 'profile' && (
          <Profile
            usuario={usuario}
            userEmail={user.email ?? ''}
            onUpdate={onUpdateNombre}
            onSignOut={onSignOut}
          />
        )}
      </Shell>

      {/* Hidden admin trigger — fixed bottom-right, invisible */}
      <span
        style={{ position: 'fixed', bottom: 8, right: 12, zIndex: 200, fontSize: '0.7rem', color: 'transparent', userSelect: 'none', cursor: 'default' }}
        onClick={handleAdminTrigger}
      >·</span>

      {showAdmin && (
        <AdminPanel
          jugadores={jugadores}
          onClose={() => setShowAdmin(false)}
          onRefresh={() => window.location.reload()}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Verify build compiles**

```bash
npm run build 2>&1 | tail -5
```
Expected: no errors.

- [ ] **Step 3: Start dev server and verify UI looks right**

```bash
npm run dev
```

Open the app. Confirm:
- Slim header at top (logo + title + Salir)
- Floating bottom nav visible with 🌊🏆👥👤
- Tabs switch correctly
- Double-clicking the bottom-right invisible dot still opens AdminPanel

- [ ] **Step 4: Commit**

```bash
git add src/components/Dashboard/Dashboard.tsx
git commit -m "feat: wire Shell into Dashboard, move admin trigger to fixed overlay"
```

---

## Task 4: Ranking.tsx — medal list

**Files:**
- Modify: `src/components/Ranking/Ranking.tsx`

- [ ] **Step 1: Update Ranking.tsx**

Replace the `<ol className="ranking-list">` block with a medal-aware version. Full updated file:

```tsx
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Usuario, Jugador } from '../../types'
import { calcTotalPoints } from '../../lib/points'
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
  const [viewPlayer, setViewPlayer] = useState<Jugador | null>(null)

  useEffect(() => {
    supabase
      .from('usuarios')
      .select('*')
      .order('puntos', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data) setRanking(data as Usuario[])
        setLoading(false)
      })
  }, [])

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
            <div className="mini-pool">
              {viewTeam.equipo.map(id => {
                const p = jugadores.find(j => j.numero === id)
                if (!p) return null
                return (
                  <button key={id} className="mini-player" onClick={() => setViewPlayer(p)}>
                    <img src={p.photo || '/Sharks-Fantasy/jugadores/predeterminado.png'} alt={p.nick || p.name} />
                    <span>{p.nick || p.name}</span>
                    <span className="mini-pts">{calcTotalPoints(p.historial || [])} pts</span>
                  </button>
                )
              })}
            </div>
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

- [ ] **Step 2: Verify in browser**

Check the Ranking tab. Confirm:
- 🥇🥈🥉 appear for positions 1–3 with gold/silver/bronze borders
- Positions 4+ show `#4`, `#5`, etc.
- Current user row is highlighted in gold background regardless of rank

- [ ] **Step 3: Commit**

```bash
git add src/components/Ranking/Ranking.tsx
git commit -m "feat: ranking medal list — top 3 with gold/silver/bronze treatment"
```

---

## Task 5: Players.tsx — position filter chips

**Files:**
- Modify: `src/components/Players/Players.tsx`

- [ ] **Step 1: Update Players.tsx**

```tsx
import { useState } from 'react'
import type { Jugador } from '../../types'
import { calcTotalPoints } from '../../lib/points'
import { PlayerCard } from '../Dashboard/PlayerCard'

interface Props {
  jugadores: Jugador[]
}

const POSITIONS = ['Todos', 'Portero', 'Boya', 'Extremo', 'Lateral', 'Contraboya']

export function Players({ jugadores }: Props) {
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState('Todos')
  const [selected, setSelected] = useState<Jugador | null>(null)

  const filtered = jugadores
    .filter(j => {
      const q = search.toLowerCase()
      const matchesSearch = j.name.toLowerCase().includes(q) || (j.nick || '').toLowerCase().includes(q)
      const matchesPos = posFilter === 'Todos' || j.pos.toLowerCase() === posFilter.toLowerCase()
      return matchesSearch && matchesPos
    })
    .sort((a, b) => calcTotalPoints(b.historial || []) - calcTotalPoints(a.historial || []))

  return (
    <div className="players-browser">
      <div className="filter-chips">
        {POSITIONS.map(pos => {
          const isAll = pos === 'Todos'
          const isActive = posFilter === pos
          const chipClass = isActive
            ? isAll
              ? 'filter-chip active-all'
              : `filter-chip pos-badge pos-${pos.toLowerCase()}`
            : 'filter-chip'
          return (
            <button
              key={pos}
              className={chipClass}
              onClick={() => setPosFilter(pos)}
            >
              {pos}
            </button>
          )
        })}
      </div>

      <input
        placeholder="Buscar jugador..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="search-input"
      />

      <ul className="players-list">
        {filtered.map(j => (
          <li key={j.id} onClick={() => setSelected(j)} className="player-row">
            <img
              src={j.photo || '/Sharks-Fantasy/jugadores/predeterminado.png'}
              alt={j.nick || j.name}
              className="player-row-photo"
            />
            <div className="player-row-info">
              <strong>{j.name}</strong>
              <span className={`pos-badge pos-${j.pos.toLowerCase()}`}>{j.pos}</span>
            </div>
            <span className="player-row-pts">{calcTotalPoints(j.historial || [])} pts</span>
          </li>
        ))}
      </ul>

      {selected && <PlayerCard jugador={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Check the Jugadores tab. Confirm:
- Filter chips appear above the search bar
- "Todos" active chip is cyan
- Position chips use their corresponding pos-badge color when active
- List filters correctly on chip click and search input

- [ ] **Step 3: Commit**

```bash
git add src/components/Players/Players.tsx
git commit -m "feat: players position filter chips"
```

---

## Task 6: Edge Function — delete-account

**Files:**
- Create: `supabase/functions/delete-account/index.ts`

- [ ] **Step 1: Create the functions directory and file**

```bash
mkdir -p supabase/functions/delete-account
```

- [ ] **Step 2: Write the Edge Function**

Create `supabase/functions/delete-account/index.ts`:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')

    // Service role client — can delete auth users
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verify the token and get the user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Delete the usuarios row first (FK safe)
    const { error: dbError } = await supabase
      .from('usuarios')
      .delete()
      .eq('id', user.id)

    if (dbError) {
      console.error('DB delete error:', dbError)
      return new Response(JSON.stringify({ error: 'Failed to delete user data' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Delete the auth user
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id)
    if (deleteError) {
      console.error('Auth delete error:', deleteError)
      return new Response(JSON.stringify({ error: 'Failed to delete auth user' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
```

- [ ] **Step 3: Commit the function**

```bash
git add supabase/functions/delete-account/index.ts
git commit -m "feat: add delete-account Supabase Edge Function"
```

- [ ] **Step 4: Deploy to Supabase**

Requires Supabase CLI (`brew install supabase/tap/supabase`) and being logged in (`supabase login`).

```bash
supabase functions deploy delete-account --project-ref <YOUR_PROJECT_REF>
```

Replace `<YOUR_PROJECT_REF>` with the project ref from the Supabase dashboard URL (e.g. `abcdefghijklmn`).

- [ ] **Step 5: Verify SUPABASE_SERVICE_ROLE_KEY is set**

In Supabase dashboard → Project Settings → Edge Functions → confirm `SUPABASE_SERVICE_ROLE_KEY` is set as a secret. If not:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>
```

- [ ] **Step 6: Smoke test the function**

In Profile tab → click "Eliminar cuenta" → confirm → should log out cleanly. If it returns an error, check Edge Function logs in Supabase dashboard → Edge Functions → Logs.

---

## Done

All tasks complete when:
- [ ] Bottom nav floats at the bottom, tabs switch correctly
- [ ] Ranking shows 🥇🥈🥉 medals with colored borders
- [ ] Players has position filter chips that work
- [ ] `delete-account` function is deployed and Profile can call it
