import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Jugador, Usuario } from '../../types'
import { Shell } from './Shell'
import type { Tab } from './Shell'
import { Draft } from './Draft'
import { Apuestas } from './Apuestas'
import { Ranking } from '../Ranking/Ranking'
import { Players } from '../Players/Players'
import { Profile } from '../Profile/Profile'
import { AdminView } from '../Admin/AdminView'

interface Props {
  user: User
  usuario: Usuario
  jugadores: Jugador[]
  onSignOut: () => void
  onUpdateNombre: (nombre: string) => Promise<unknown>
}

export function Dashboard({ user, usuario, jugadores, onSignOut, onUpdateNombre }: Props) {
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
          {tab === 'team'    && <Draft usuario={usuario} jugadores={jugadores} />}
          {tab === 'apuestas' && <Apuestas usuario={usuario} jugadores={jugadores} />}
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
        </>
      )}
    </Shell>
  )
}
