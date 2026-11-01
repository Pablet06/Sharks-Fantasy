import { useState, useEffect } from 'react'
import type { Jugador } from '../../types'
import { calcTotalPoints } from '../../lib/points'
import { PlayerCard } from '../Dashboard/PlayerCard'
import { DEFAULT_PHOTO, signedPhotoUrl } from '../../lib/photos'

interface Props {
  jugadores: Jugador[]
}

const POSITIONS = ['Todos', 'Portero', 'Boya', 'Extremo', 'Lateral', 'Contraboya']
const DESKTOP_MQ = window.matchMedia('(min-width: 768px)')
// Easter egg: frontend-only coach (no DB row), so he can't be drafted or bet on.
// La foto vive en el bucket privado `jugadores`; hasta que llega la URL firmada se ve la de por defecto.
const ENTRENADOR = { name: 'José Santapau', descripcion: 'Leyenda', fotoPath: 'entrenador-santapau.webp' }

export function Players({ jugadores }: Props) {
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState('Todos')
  const [selected, setSelected] = useState<Jugador | 'entrenador' | null>(null)
  const [isDesktop, setIsDesktop] = useState(DESKTOP_MQ.matches)
  const [fotoEntrenador, setFotoEntrenador] = useState(DEFAULT_PHOTO)

  useEffect(() => {
    let cancelled = false
    signedPhotoUrl(ENTRENADOR.fotoPath).then(url => { if (url && !cancelled) setFotoEntrenador(url) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const handler = (e: MediaQueryListEvent) => {
      setIsDesktop(e.matches)
      if (!e.matches) setSelected(null)
    }
    DESKTOP_MQ.addEventListener('change', handler)
    return () => DESKTOP_MQ.removeEventListener('change', handler)
  }, [])

  const filtered = jugadores
    .filter(j => {
      const q = search.toLowerCase()
      const matchesSearch = j.name.toLowerCase().includes(q) || (j.nick || '').toLowerCase().includes(q)
      const matchesPos = posFilter === 'Todos' || j.pos.toLowerCase() === posFilter.toLowerCase()
      return matchesSearch && matchesPos
    })
    .sort((a, b) => calcTotalPoints(b.historial || []) - calcTotalPoints(a.historial || []))

  const showEntrenador = posFilter === 'Todos' && ENTRENADOR.name.toLowerCase().includes(search.toLowerCase())

  const fichaEntrenador = (
    <div className="player-card-modal" onClick={isDesktop ? undefined : e => e.stopPropagation()}>
      <button className="modal-close" onClick={() => setSelected(null)}>×</button>
      <div className="player-card-header">
        <img src={fotoEntrenador} alt={ENTRENADOR.name} className="player-card-photo" />
        <div className="player-card-identity">
          <h2 className="player-card-name">{ENTRENADOR.name}</h2>
          <p className="player-card-nick">{ENTRENADOR.descripcion}</p>
          <span className="pos-badge">Entrenador</span>
        </div>
      </div>
      <div className="player-card-total">
        <span>TOTAL</span>
        <strong className="total-pts">∞ pts</strong>
      </div>
    </div>
  )

  const listContent = (
    <>
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
            <button key={pos} className={chipClass} onClick={() => setPosFilter(pos)}>
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
        {showEntrenador && (
          <li
            onClick={() => setSelected('entrenador')}
            className={`player-row${selected === 'entrenador' && isDesktop ? ' current-user' : ''}`}
          >
            <img src={fotoEntrenador} alt={ENTRENADOR.name} className="player-row-photo" />
            <div className="player-row-info">
              <strong>{ENTRENADOR.name}</strong>
              <span className="pos-badge">Entrenador</span>
            </div>
            <span className="player-row-pts">∞ pts</span>
          </li>
        )}
        {filtered.map(j => (
          <li
            key={j.id}
            onClick={() => setSelected(j)}
            className={`player-row${selected !== 'entrenador' && selected?.id === j.id && isDesktop ? ' current-user' : ''}`}
          >
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
    </>
  )

  if (isDesktop) {
    return (
      <div className="players-desktop-layout">
        <div className="players-list-panel">
          {listContent}
        </div>
        <div className="players-detail-panel">
          {selected === 'entrenador' ? (
            fichaEntrenador
          ) : selected ? (
            <PlayerCard jugador={selected} onClose={() => setSelected(null)} inline={true} />
          ) : (
            <div className="players-detail-placeholder">
              <span className="placeholder-icon">👥</span>
              <p>Selecciona un jugador para ver su detalle</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="players-browser">
      {listContent}
      {selected === 'entrenador' ? (
        <div className="modal-overlay" onClick={() => setSelected(null)}>{fichaEntrenador}</div>
      ) : selected && (
        <PlayerCard jugador={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
