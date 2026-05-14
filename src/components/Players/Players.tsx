import { useState, useEffect } from 'react'
import type { Jugador } from '../../types'
import { calcTotalPoints } from '../../lib/points'
import { PlayerCard } from '../Dashboard/PlayerCard'

interface Props {
  jugadores: Jugador[]
}

const POSITIONS = ['Todos', 'Portero', 'Boya', 'Extremo', 'Lateral', 'Contraboya']
const DESKTOP_MQ = window.matchMedia('(min-width: 768px)')

export function Players({ jugadores }: Props) {
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState('Todos')
  const [selected, setSelected] = useState<Jugador | null>(null)
  const [isDesktop, setIsDesktop] = useState(DESKTOP_MQ.matches)

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
        {filtered.map(j => (
          <li
            key={j.id}
            onClick={() => setSelected(j)}
            className={`player-row${selected?.id === j.id && isDesktop ? ' current-user' : ''}`}
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
          {selected ? (
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
      {selected && <PlayerCard jugador={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
