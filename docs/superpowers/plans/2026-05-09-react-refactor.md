# React + TypeScript Frontend Refactor Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the monolithic `index.html` SPA as a Vite + React + TypeScript app deployed to GitHub Pages, using Supabase instead of Firebase.

**Architecture:** Vite for bundling. React with Context API for auth state (no Redux needed at this scale). Supabase JS SDK v2 for auth + data. CSS kept close to original design (cyberpunk theme) using CSS modules. No UI library — keep the custom aesthetic.

**Tech Stack:** Vite 5, React 18, TypeScript 5, Supabase JS v2, CSS Modules, Vitest for unit tests.

**Prerequisite:** Plan `2026-05-09-supabase-migration.md` must be complete (Supabase has data).

---

## File Structure

```
sharks-fantasy/
├── src/
│   ├── types/
│   │   └── index.ts              — all TypeScript interfaces
│   ├── lib/
│   │   ├── supabase.ts           — Supabase client singleton
│   │   └── points.ts             — calcMatchPoints() + calcTotalPoints()
│   ├── hooks/
│   │   ├── useAuth.ts            — Supabase auth state
│   │   ├── useJugadores.ts       — fetch/subscribe players
│   │   └── useUsuario.ts         — fetch/update current user
│   ├── components/
│   │   ├── Auth/
│   │   │   ├── Auth.tsx          — login/signup container
│   │   │   ├── LoginForm.tsx
│   │   │   └── SignupForm.tsx
│   │   ├── Dashboard/
│   │   │   ├── Dashboard.tsx     — tab container
│   │   │   ├── Pool.tsx          — 1-2-3-1 formation view
│   │   │   └── PlayerCard.tsx    — player detail modal
│   │   ├── Ranking/
│   │   │   └── Ranking.tsx       — top 10 leaderboard
│   │   ├── Players/
│   │   │   └── Players.tsx       — all players browser
│   │   ├── Profile/
│   │   │   └── Profile.tsx       — edit name, delete account
│   │   └── Admin/
│   │       └── AdminPanel.tsx    — admin features (password gated)
│   ├── App.tsx                   — auth router (login vs dashboard)
│   ├── main.tsx                  — Vite entry point
│   └── index.css                 — global styles (cyberpunk variables)
├── public/
│   └── jugadores/                — player images (copied from current)
├── .env                          — VITE_ prefixed env vars
├── .env.example
├── index.html                    — Vite root template
├── package.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

---

### Task 1: Scaffold Vite + React + TypeScript Project

- [ ] **Step 1: Create Vite project in repo root**

```bash
# From /Users/carlos/OwnCode/Sharks-Fantasy
npm create vite@latest . -- --template react-ts
# When asked about existing files: select "Ignore files and continue"
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js
npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Update vite.config.ts for GitHub Pages + tests**

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Sharks-Fantasy/',  // GitHub Pages repo name
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

- [ ] **Step 4: Create test setup file**

```typescript
// src/test-setup.ts
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Update package.json scripts**

```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "test": "vitest",
  "test:ui": "vitest --ui"
}
```

- [ ] **Step 6: Create .env for Vite (VITE_ prefix required)**

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

Note: VITE_ prefix is mandatory for Vite to expose vars to client code.

- [ ] **Step 7: Update .env.example**

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

- [ ] **Step 8: Verify dev server starts**

```bash
npm run dev
```
Expected: Vite app at http://localhost:5173

- [ ] **Step 9: Copy player images and logos to public/**

```bash
cp -r jugadores/ public/jugadores/
cp logo.png logo.ico public/
```

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json tsconfig.node.json index.html src/ .env.example
git commit -m "feat: scaffold Vite + React + TypeScript"
```

---

### Task 2: Types + Core Logic

**Files:**
- Create: `src/types/index.ts`
- Create: `src/lib/points.ts`
- Create: `src/lib/points.test.ts`
- Create: `src/lib/supabase.ts`

- [ ] **Step 1: Write the failing tests for points logic**

```typescript
// src/lib/points.test.ts
import { describe, it, expect } from 'vitest'
import { calcMatchPoints } from './points'

describe('calcMatchPoints', () => {
  it('field player: goals score correctly', () => {
    expect(calcMatchPoints('Boya', { partidos: 1, goles: 2, penaltis: 0, tarjetas: 0,
      expulsiones: 0, tiros: 1, penaltis_fallados: 0, paradas: 0, goles_contra: 0, penaltis_parados: 0 }))
      .toBe(1 + 12 + 2)  // appearance + goals + shots = 15
  })

  it('goalkeeper: saves and goals against', () => {
    expect(calcMatchPoints('Portero', { partidos: 1, goles: 0, penaltis: 0, tarjetas: 0,
      expulsiones: 0, tiros: 0, penaltis_fallados: 0, paradas: 5, goles_contra: 2, penaltis_parados: 1 }))
      .toBe(1 + 10 - 2 + 3)  // appearance + saves - goals_against + penalty_saved = 12
  })

  it('cards apply negative points', () => {
    expect(calcMatchPoints('Lateral', { partidos: 1, goles: 0, penaltis: 0, tarjetas: 1,
      expulsiones: 0, tiros: 0, penaltis_fallados: 0, paradas: 0, goles_contra: 0, penaltis_parados: 0 }))
      .toBe(1 - 5)  // appearance - card = -4
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```
Expected: FAIL — `calcMatchPoints` not found.

- [ ] **Step 3: Define TypeScript types**

```typescript
// src/types/index.ts
export interface PlayerStats {
  partidos: number
  goles: number
  penaltis: number
  tarjetas: number
  expulsiones: number
  tiros: number
  penaltis_fallados: number
  paradas: number
  goles_contra: number
  penaltis_parados: number
}

export type Position = 'Portero' | 'Boya' | 'Extremo' | 'Lateral' | 'Contraboya'

export interface HistorialEntry {
  id: number
  jugador_id: number
  jornada: number
  stats: PlayerStats
  puntos: number
  date: string
}

export interface Jugador {
  id: number
  numero: number
  name: string
  nick: string | null
  pos: Position
  phrase: string | null
  photo: string | null
  stats: PlayerStats
  historial?: HistorialEntry[]
}

export interface Usuario {
  id: string  // UUID from Supabase auth
  nombre: string
  equipo: number[]  // array of jugador.numero IDs
  puntos: number
  created_at: string
}
```

- [ ] **Step 4: Implement points logic**

```typescript
// src/lib/points.ts
import type { PlayerStats, Position } from '../types'

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

export function calcTotalPoints(historial: { puntos: number }[]): number {
  return historial.reduce((sum, h) => sum + h.puntos, 0)
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test
```
Expected: 3 tests PASS.

- [ ] **Step 6: Create Supabase client singleton**

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 7: Commit**

```bash
git add src/types/ src/lib/
git commit -m "feat: add TypeScript types, points logic with tests, Supabase client"
```

---

### Task 3: Auth Hook + Components

**Files:**
- Create: `src/hooks/useAuth.ts`
- Create: `src/components/Auth/Auth.tsx`
- Create: `src/components/Auth/LoginForm.tsx`
- Create: `src/components/Auth/SignupForm.tsx`

- [ ] **Step 1: Create auth hook**

```typescript
// src/hooks/useAuth.ts
import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = () => supabase.auth.signOut()

  return { user, loading, signOut }
}
```

- [ ] **Step 2: Create LoginForm component**

```typescript
// src/components/Auth/LoginForm.tsx
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  onSwitch: () => void
}

export function LoginForm({ onSwitch }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Iniciar Sesión</h2>
      {error && <p className="error">{error}</p>}
      <input type="email" placeholder="Email" value={email}
        onChange={e => setEmail(e.target.value)} required />
      <input type="password" placeholder="Contraseña" value={password}
        onChange={e => setPassword(e.target.value)} required />
      <button type="submit" disabled={loading}>
        {loading ? 'Entrando...' : 'Entrar'}
      </button>
      <p>¿No tienes cuenta? <button type="button" onClick={onSwitch}>Regístrate</button></p>
    </form>
  )
}
```

- [ ] **Step 3: Create SignupForm component**

```typescript
// src/components/Auth/SignupForm.tsx
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Jugador } from '../../types'

interface Props {
  jugadores: Jugador[]
  onSwitch: () => void
}

export function SignupForm({ jugadores, onSwitch }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Sign up
    const { data, error: signupError } = await supabase.auth.signUp({ email, password })
    if (signupError) { setError(signupError.message); setLoading(false); return }

    // Generate random team: 1 goalkeeper + 6 field players
    const goalkeepers = jugadores.filter(j => j.pos === 'Portero')
    const fieldPlayers = jugadores.filter(j => j.pos !== 'Portero')
    const shuffle = <T,>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5)
    const team = [
      shuffle(goalkeepers)[0]?.numero,
      ...shuffle(fieldPlayers).slice(0, 6).map(p => p.numero)
    ].filter(Boolean) as number[]

    // Create usuario row
    const { error: profileError } = await supabase
      .from('usuarios')
      .insert({ id: data.user!.id, nombre, equipo: team, puntos: 0 })

    if (profileError) setError(profileError.message)
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Crear Cuenta</h2>
      {error && <p className="error">{error}</p>}
      <input placeholder="Nombre del entrenador" value={nombre}
        onChange={e => setNombre(e.target.value)} required />
      <input type="email" placeholder="Email" value={email}
        onChange={e => setEmail(e.target.value)} required />
      <input type="password" placeholder="Contraseña (min 6 chars)" value={password}
        onChange={e => setPassword(e.target.value)} minLength={6} required />
      <button type="submit" disabled={loading}>
        {loading ? 'Creando...' : 'Registrarse'}
      </button>
      <p>¿Ya tienes cuenta? <button type="button" onClick={onSwitch}>Inicia sesión</button></p>
    </form>
  )
}
```

- [ ] **Step 4: Create Auth container**

```typescript
// src/components/Auth/Auth.tsx
import { useState } from 'react'
import { LoginForm } from './LoginForm'
import { SignupForm } from './SignupForm'
import type { Jugador } from '../../types'

interface Props {
  jugadores: Jugador[]
}

export function Auth({ jugadores }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  return (
    <div className="auth-container">
      <div className="auth-logo">
        <img src="/logo.png" alt="Sharks Fantasy" />
        <h1>SHARKS FANTASY</h1>
      </div>
      {mode === 'login'
        ? <LoginForm onSwitch={() => setMode('signup')} />
        : <SignupForm jugadores={jugadores} onSwitch={() => setMode('login')} />
      }
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAuth.ts src/components/Auth/
git commit -m "feat: add Supabase auth hook and login/signup components"
```

---

### Task 4: Data Hooks

**Files:**
- Create: `src/hooks/useJugadores.ts`
- Create: `src/hooks/useUsuario.ts`

- [ ] **Step 1: Create jugadores hook**

```typescript
// src/hooks/useJugadores.ts
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Jugador } from '../types'

export function useJugadores() {
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('jugadores')
      .select('*, historial(*)')
      .order('name')
      .then(({ data, error }) => {
        if (!error && data) setJugadores(data as Jugador[])
        setLoading(false)
      })
  }, [])

  return { jugadores, loading }
}
```

- [ ] **Step 2: Create usuario hook**

```typescript
// src/hooks/useUsuario.ts
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Usuario } from '../types'

export function useUsuario(userId: string | undefined) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }

    supabase
      .from('usuarios')
      .select('*')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) setUsuario(data)
        setLoading(false)
      })
  }, [userId])

  const updateNombre = async (nombre: string) => {
    if (!userId) return
    const { error } = await supabase.from('usuarios').update({ nombre }).eq('id', userId)
    if (!error) setUsuario(prev => prev ? { ...prev, nombre } : null)
    return error
  }

  const updateEquipo = async (equipo: number[]) => {
    if (!userId) return
    const { error } = await supabase.from('usuarios').update({ equipo }).eq('id', userId)
    if (!error) setUsuario(prev => prev ? { ...prev, equipo } : null)
    return error
  }

  return { usuario, loading, updateNombre, updateEquipo }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/
git commit -m "feat: add jugadores and usuario data hooks"
```

---

### Task 5: Dashboard + Pool Component

**Files:**
- Create: `src/components/Dashboard/Dashboard.tsx`
- Create: `src/components/Dashboard/Pool.tsx`
- Create: `src/components/Dashboard/PlayerCard.tsx`

- [ ] **Step 1: Create PlayerCard modal component**

```typescript
// src/components/Dashboard/PlayerCard.tsx
import type { Jugador } from '../../types'
import { calcTotalPoints } from '../../lib/points'

interface Props {
  jugador: Jugador
  onClose: () => void
}

export function PlayerCard({ jugador, onClose }: Props) {
  const totalPoints = calcTotalPoints(jugador.historial || [])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="player-card" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>×</button>
        <img src={jugador.photo || '/jugadores/predeterminado.png'} alt={jugador.name} />
        <h2>{jugador.name}</h2>
        <p className="position-badge">{jugador.pos}</p>
        {jugador.phrase && <p className="phrase">"{jugador.phrase}"</p>}
        <div className="stats-grid">
          <div className="stat"><span>Partidos</span><strong>{jugador.stats.partidos}</strong></div>
          <div className="stat"><span>Goles</span><strong>{jugador.stats.goles}</strong></div>
          <div className="stat"><span>Tarjetas</span><strong>{jugador.stats.tarjetas}</strong></div>
        </div>
        <h3>Puntos totales: {totalPoints}</h3>
        <h4>Por jornada:</h4>
        <ul className="historial">
          {(jugador.historial || []).map(h => (
            <li key={h.jornada}>J{h.jornada}: {h.puntos > 0 ? '+' : ''}{h.puntos} pts</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create Pool formation component**

```typescript
// src/components/Dashboard/Pool.tsx
import { useState } from 'react'
import type { Jugador, Usuario } from '../../types'
import { calcTotalPoints } from '../../lib/points'
import { PlayerCard } from './PlayerCard'

interface Props {
  usuario: Usuario
  jugadores: Jugador[]
}

export function Pool({ usuario, jugadores }: Props) {
  const [selected, setSelected] = useState<Jugador | null>(null)

  const teamPlayers = usuario.equipo
    .map(id => jugadores.find(j => j.numero === id))
    .filter(Boolean) as Jugador[]

  // Formation: goalkeeper (index 0), then 2, 3, 1 per row
  const goalkeeper = teamPlayers[0]
  const row1 = teamPlayers.slice(1, 3)   // 2 players
  const row2 = teamPlayers.slice(3, 6)   // 3 players
  const row3 = teamPlayers.slice(6, 7)   // 1 player

  const totalPoints = teamPlayers.reduce((sum, p) => sum + calcTotalPoints(p.historial || []), 0)

  const PlayerNode = ({ player }: { player: Jugador }) => (
    <div className="player-node" onClick={() => setSelected(player)}>
      <img src={player.photo || '/jugadores/predeterminado.png'} alt={player.nick || player.name} />
      <span>{player.nick || player.name}</span>
      <span className="player-pts">{calcTotalPoints(player.historial || [])} pts</span>
    </div>
  )

  return (
    <div className="pool-container">
      <div className="team-points">Total: {totalPoints} pts</div>
      <div className="pool">
        <div className="pool-row">{row3.map(p => <PlayerNode key={p.id} player={p} />)}</div>
        <div className="pool-row">{row2.map(p => <PlayerNode key={p.id} player={p} />)}</div>
        <div className="pool-row">{row1.map(p => <PlayerNode key={p.id} player={p} />)}</div>
        <div className="pool-row goalkeeper">
          {goalkeeper && <PlayerNode player={goalkeeper} />}
        </div>
      </div>
      {selected && <PlayerCard jugador={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
```

- [ ] **Step 3: Create Dashboard tab container**

```typescript
// src/components/Dashboard/Dashboard.tsx
import { useState } from 'react'
import type { Jugador, Usuario } from '../../types'
import { Pool } from './Pool'

import type { User } from '@supabase/supabase-js'

interface Props {
  user: User                                               // Supabase auth user (for email)
  usuario: Usuario
  jugadores: Jugador[]
  onSignOut: () => void
  onUpdateNombre: (nombre: string) => Promise<unknown>    // passed to Profile
}

type Tab = 'team' | 'ranking' | 'players' | 'profile'

export function Dashboard({ user, usuario, jugadores, onSignOut, onUpdateNombre }: Props) {
  const [tab, setTab] = useState<Tab>('team')

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <img src="/logo.png" alt="Sharks" className="header-logo" />
        <h1>SHARKS FANTASY</h1>
        <button onClick={onSignOut} className="signout-btn">Salir</button>
      </header>

      <nav className="tabs">
        {(['team', 'ranking', 'players', 'profile'] as Tab[]).map(t => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'team' ? 'Mi Equipo' : t === 'ranking' ? 'Ranking' :
             t === 'players' ? 'Jugadores' : 'Perfil'}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'team' && <Pool usuario={usuario} jugadores={jugadores} />}
        {tab === 'ranking' && <div>TODO: Ranking</div>}
        {tab === 'players' && <div>TODO: Players</div>}
        {tab === 'profile' && <div>TODO: Profile</div>}
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Wire up App.tsx**

```typescript
// src/App.tsx
import { useAuth } from './hooks/useAuth'
import { useJugadores } from './hooks/useJugadores'
import { useUsuario } from './hooks/useUsuario'
import { Auth } from './components/Auth/Auth'
import { Dashboard } from './components/Dashboard/Dashboard'

export function App() {
  const { user, loading: authLoading, signOut } = useAuth()
  const { jugadores, loading: jugadoresLoading } = useJugadores()
  const { usuario, loading: usuarioLoading, updateNombre } = useUsuario(user?.id)

  if (authLoading || jugadoresLoading) return <div className="loading">Cargando...</div>
  if (!user) return <Auth jugadores={jugadores} />
  if (usuarioLoading) return <div className="loading">Cargando equipo...</div>
  if (!usuario) return <div className="error">Error cargando perfil. Contacta al admin.</div>

  return (
    <Dashboard
      user={user}
      usuario={usuario}
      jugadores={jugadores}
      onSignOut={signOut}
      onUpdateNombre={updateNombre}
    />
  )
}
```

```typescript
// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 5: Verify app loads in browser**

```bash
npm run dev
```
Check: login form appears, login with a test user works, team formation renders.

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "feat: add Dashboard with Pool formation component"
```

---

### Task 6: Ranking + Players + Profile Components

**Files:**
- Create: `src/components/Ranking/Ranking.tsx`
- Create: `src/components/Players/Players.tsx`
- Create: `src/components/Profile/Profile.tsx`

- [ ] **Step 1: Create Ranking component**

```typescript
// src/components/Ranking/Ranking.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Usuario, Jugador } from '../../types'

interface Props {
  jugadores: Jugador[]
  currentUserId: string
}

export function Ranking({ jugadores, currentUserId }: Props) {
  const [ranking, setRanking] = useState<Usuario[]>([])

  useEffect(() => {
    supabase
      .from('usuarios')
      .select('*')
      .order('puntos', { ascending: false })
      .limit(10)
      .then(({ data }) => { if (data) setRanking(data) })
  }, [])

  return (
    <div className="ranking">
      <h2>Top 10</h2>
      <ol>
        {ranking.map((u, i) => (
          <li key={u.id} className={u.id === currentUserId ? 'current-user' : ''}>
            <span className="rank">{i + 1}</span>
            <span className="nombre">{u.nombre}</span>
            <span className="puntos">{u.puntos} pts</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
```

- [ ] **Step 2: Create Players browser component**

```typescript
// src/components/Players/Players.tsx
import { useState } from 'react'
import type { Jugador } from '../../types'
import { calcTotalPoints } from '../../lib/points'
import { PlayerCard } from '../Dashboard/PlayerCard'

interface Props {
  jugadores: Jugador[]
}

export function Players({ jugadores }: Props) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Jugador | null>(null)

  const filtered = jugadores
    .filter(j => {
      const q = search.toLowerCase()
      return j.name.toLowerCase().includes(q) || (j.nick || '').toLowerCase().includes(q)
    })
    .sort((a, b) => calcTotalPoints(b.historial || []) - calcTotalPoints(a.historial || []))

  return (
    <div className="players-browser">
      <input placeholder="Buscar jugador..." value={search}
        onChange={e => setSearch(e.target.value)} className="search-input" />
      <ul className="players-list">
        {filtered.map(j => (
          <li key={j.id} onClick={() => setSelected(j)}>
            <img src={j.photo || '/jugadores/predeterminado.png'} alt={j.nick || j.name} />
            <div>
              <strong>{j.name}</strong>
              <span className="pos-badge">{j.pos}</span>
            </div>
            <span className="total-pts">{calcTotalPoints(j.historial || [])} pts</span>
          </li>
        ))}
      </ul>
      {selected && <PlayerCard jugador={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
```

- [ ] **Step 3: Create Profile component**

```typescript
// src/components/Profile/Profile.tsx
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Usuario } from '../../types'

interface Props {
  usuario: Usuario
  userEmail: string
  onUpdate: (nombre: string) => Promise<unknown>
  onSignOut: () => void
}

export function Profile({ usuario, userEmail, onUpdate, onSignOut }: Props) {
  const [nombre, setNombre] = useState(usuario.nombre)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onUpdate(nombre)
    setSaving(false)
  }

  const handleDelete = async () => {
    // Account deletion MUST go through a Supabase Edge Function (see Task 7b).
    // Do NOT call supabase.auth.admin.deleteUser here — it requires service role key.
    // Do NOT delete from `usuarios` table directly — cascade flows FROM auth.users DOWN,
    // not from usuarios up. Deleting usuarios row leaves the auth user alive.
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
      }
    })
    if (res.ok) onSignOut()
    else alert('Error eliminando cuenta. Contacta al admin.')
  }

  return (
    <div className="profile">
      <h2>Mi Perfil</h2>
      <p className="email">{userEmail}</p>

      <div className="form-group">
        <label>Nombre del entrenador</label>
        <input value={nombre} onChange={e => setNombre(e.target.value)} />
        <button onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>

      <div className="danger-zone">
        {!confirmDelete
          ? <button className="danger-btn" onClick={() => setConfirmDelete(true)}>Eliminar cuenta</button>
          : <>
              <p>¿Seguro? Esto borrará todos tus datos.</p>
              <button className="danger-btn" onClick={handleDelete}>Sí, eliminar</button>
              <button onClick={() => setConfirmDelete(false)}>Cancelar</button>
            </>
        }
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire Ranking + Players + Profile into Dashboard.tsx**

Replace the TODO placeholders in `Dashboard.tsx`. `user`, `onUpdateNombre`, and `onSignOut` are now in the Dashboard Props interface (added in Task 5):
```typescript
import { Ranking } from '../Ranking/Ranking'
import { Players } from '../Players/Players'
import { Profile } from '../Profile/Profile'

// In main section (user and onUpdateNombre come from Props, not useUsuario — already wired in App.tsx):
{tab === 'ranking' && <Ranking jugadores={jugadores} currentUserId={usuario.id} />}
{tab === 'players' && <Players jugadores={jugadores} />}
{tab === 'profile' && (
  <Profile
    usuario={usuario}
    userEmail={user.email!}
    onUpdate={onUpdateNombre}
    onSignOut={onSignOut}
  />
)}
```

- [ ] **Step 5: Test all tabs in browser**

```bash
npm run dev
```
Check: all 4 tabs render, ranking loads, player search works, profile saves name.

- [ ] **Step 6: Commit**

```bash
git add src/components/
git commit -m "feat: add Ranking, Players, and Profile components"
```

---

### Task 7: Admin Panel

**Files:**
- Create: `src/components/Admin/AdminPanel.tsx`

- [ ] **Step 1: Create admin panel (password gated)**

```typescript
// src/components/Admin/AdminPanel.tsx
import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { Jugador, HistorialEntry } from '../../types'

// Admin writes go through Edge Functions (service role server-side).
// Client-side password gate is a UI convenience, not a security boundary.
// Generate hash: echo -n 'yourpassword' | sha256sum  — store ONLY the hash, never the plaintext.

const ADMIN_PASSWORD_HASH = import.meta.env.VITE_ADMIN_HASH  // set in .env, never hardcode

interface Props {
  jugadores: Jugador[]
  onClose: () => void
}

export function AdminPanel({ jugadores, onClose }: Props) {
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [selectedJugador, setSelectedJugador] = useState<Jugador | null>(null)
  const [jornada, setJornada] = useState(1)

  const checkPassword = async () => {
    const encoder = new TextEncoder()
    const data = encoder.encode(password)
    const hash = await crypto.subtle.digest('SHA-256', data)
    const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
    if (hashHex === ADMIN_PASSWORD_HASH) setAuthed(true)
    else alert('Contraseña incorrecta')
  }

  if (!authed) return (
    <div className="admin-auth">
      <h3>Admin Panel</h3>
      <input type="password" placeholder="Admin password" value={password}
        onChange={e => setPassword(e.target.value)} />
      <button onClick={checkPassword}>Acceder</button>
      <button onClick={onClose}>Cancelar</button>
    </div>
  )

  return (
    <div className="admin-panel">
      <h2>Admin Panel</h2>
      <button onClick={onClose}>Cerrar</button>
      {/* Player selector, jornada editor, user management */}
      {/* Full implementation follows same patterns as original index.html admin */}
      <p>Admin features: edit player stats per jornada, manage users, trigger scraper.</p>
    </div>
  )
}
```

Note: Full admin implementation mirrors the original admin panel logic. The most critical part is the stat editing per jornada which must update `historial` table in Supabase correctly.

- [ ] **Step 2: Add admin trigger to Dashboard**

Add double-click on footer "Dev Admin" text to open AdminPanel, same as original.

- [ ] **Step 3: Commit**

```bash
git add src/components/Admin/
git commit -m "feat: add password-gated admin panel scaffold"
```

---

### Task 7b: Edge Function for Account Deletion

**Files:**
- Create: `supabase/functions/delete-account/index.ts`

Account deletion requires calling `auth.admin.deleteUser` with the service role key. This MUST happen server-side. Supabase Edge Functions run server-side with the service role key injected via secrets.

- [ ] **Step 1: Install Supabase CLI if not installed**

```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref <your-project-ref>
```

- [ ] **Step 2: Create Edge Function**

```typescript
// supabase/functions/delete-account/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401 })

  // Verify caller is authenticated
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) return new Response('Unauthorized', { status: 401 })

  // Delete with admin client (cascade deletes usuarios row via FK)
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id)
  if (deleteError) return new Response(deleteError.message, { status: 500 })

  return new Response('OK', { status: 200 })
})
```

- [ ] **Step 3: Deploy Edge Function**

```bash
supabase functions deploy delete-account
```

- [ ] **Step 4: Verify in Supabase dashboard**
  - Go to Edge Functions tab — `delete-account` should be listed as deployed

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "feat: add Edge Function for secure account deletion"
```

---

### Task 8: Styling

**Files:**
- Modify: `src/index.css` — global CSS variables + resets
- Create: `src/components/**/*.module.css` — per-component styles

- [ ] **Step 1: Define CSS variables matching original cyberpunk theme**

```css
/* src/index.css */
:root {
  --primary: #00d2ff;
  --secondary: #3a7bd5;
  --accent: #ffd700;
  --bg-dark: #0a0a1a;
  --bg-card: rgba(255,255,255,0.05);
  --text: #e0e0e0;
  --text-muted: #888;
  --error: #ff4757;
  --radius: 12px;
  --shadow: 0 8px 32px rgba(0,210,255,0.15);
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Outfit', sans-serif; background: var(--bg-dark); color: var(--text); }
```

- [ ] **Step 2: Add Google Fonts to index.html**

```html
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&family=Teko:wght@400;600&display=swap" rel="stylesheet">
```

- [ ] **Step 3: Style critical path: auth form, pool formation, ranking list**

Migrate styles from original `index.html` `<style>` block into CSS modules for each component. Keep the same visual design — don't redesign.

- [ ] **Step 4: Verify visual parity with original in browser**

Open both `Versiones/1.0.html` and the new app side by side. Main layouts should match.

- [ ] **Step 5: Commit**

```bash
git add src/index.css src/components/
git commit -m "feat: add cyberpunk theme CSS matching original design"
```

---

### Task 9: GitHub Pages Deployment

- [ ] **Step 1: Install gh-pages**

```bash
npm install -D gh-pages
```

- [ ] **Step 2: Add deploy script to package.json**

```json
"scripts": {
  "predeploy": "npm run build",
  "deploy": "gh-pages -d dist"
}
```

- [ ] **Step 3: Add GitHub Actions workflow for auto-deploy**

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

- [ ] **Step 4: Add secrets to GitHub repo**
  - Go to GitHub repo → Settings → Secrets → Actions
  - Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

- [ ] **Step 5: Set GitHub Pages source to gh-pages branch**
  - Go to repo Settings → Pages → Source: gh-pages branch

- [ ] **Step 6: Push to main and verify deployment**

```bash
git checkout main
git merge develop
git push origin main
```

Expected: GitHub Actions runs build + deploy, app live at `https://pablet06.github.io/Sharks-Fantasy/`

- [ ] **Step 7: Commit**

```bash
git add .github/
git commit -m "feat: add GitHub Actions deploy to GitHub Pages"
```

---

### Task 10: Final Tests + TypeScript Build Check

- [ ] **Step 1: Run all tests**

```bash
npm test
```
Expected: all pass.

- [ ] **Step 2: Run TypeScript type check**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Run build**

```bash
npm run build
```
Expected: builds successfully to `dist/`.

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: complete React + TypeScript frontend refactor"
```
