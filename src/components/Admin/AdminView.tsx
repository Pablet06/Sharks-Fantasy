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
