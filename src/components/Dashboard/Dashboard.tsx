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
