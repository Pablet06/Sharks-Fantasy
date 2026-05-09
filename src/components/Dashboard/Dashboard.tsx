import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Jugador, Usuario } from '../../types'
import { Pool } from './Pool'

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

  const tabLabels: Record<Tab, string> = {
    team: 'Mi Equipo',
    ranking: 'Ranking',
    players: 'Jugadores',
    profile: 'Perfil',
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
        {tab === 'team' && <Pool usuario={usuario} jugadores={jugadores} />}
        {tab === 'ranking' && <div className="placeholder">Ranking — próximamente</div>}
        {tab === 'players' && <div className="placeholder">Jugadores — próximamente</div>}
        {tab === 'profile' && <div className="placeholder">Perfil — próximamente</div>}
      </main>
    </div>
  )
}
