import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Jugador, Usuario } from '../../types'
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
}

type Tab = 'team' | 'ranking' | 'players' | 'profile'

export function Dashboard({ user, usuario, jugadores, onSignOut, onUpdateNombre }: Props) {
  const [tab, setTab] = useState<Tab>('team')
  const [showAdmin, setShowAdmin] = useState(false)
  const [adminClickCount, setAdminClickCount] = useState(0)
  const [localJugadores] = useState(jugadores)

  const tabLabels: Record<Tab, string> = {
    team: 'Mi Equipo',
    ranking: 'Ranking',
    players: 'Jugadores',
    profile: 'Perfil',
  }

  const handleAdminFooterClick = () => {
    const next = adminClickCount + 1
    setAdminClickCount(next)
    if (next >= 2) {
      setShowAdmin(true)
      setAdminClickCount(0)
    }
    setTimeout(() => setAdminClickCount(0), 800)
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <img src="/Sharks-Fantasy/logo.png" alt="Sharks" className="header-logo" />
        <h1 className="header-title">SHARKS FANTASY</h1>
        <button onClick={onSignOut} className="signout-btn">Salir</button>
      </header>

      <nav className="tabs">
        {(Object.keys(tabLabels) as Tab[]).map(t => (
          <button
            key={t}
            className={`tab-btn ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {tabLabels[t]}
          </button>
        ))}
      </nav>

      <main className="dashboard-main">
        {tab === 'team' && <Pool usuario={usuario} jugadores={localJugadores} />}
        {tab === 'ranking' && <Ranking jugadores={localJugadores} currentUserId={usuario.id} />}
        {tab === 'players' && <Players jugadores={localJugadores} />}
        {tab === 'profile' && (
          <Profile
            usuario={usuario}
            userEmail={user.email ?? ''}
            onUpdate={onUpdateNombre}
            onSignOut={onSignOut}
          />
        )}
      </main>

      <footer className="dashboard-footer">
        <span
          className="admin-trigger"
          onClick={handleAdminFooterClick}
          title=""
        >
          ·
        </span>
      </footer>

      {showAdmin && (
        <AdminPanel
          jugadores={localJugadores}
          onClose={() => setShowAdmin(false)}
          onRefresh={() => {
            window.location.reload()
          }}
        />
      )}
    </div>
  )
}
