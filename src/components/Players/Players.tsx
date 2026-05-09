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
      return (
        j.name.toLowerCase().includes(q) ||
        (j.nick || '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => calcTotalPoints(b.historial || []) - calcTotalPoints(a.historial || []))

  return (
    <div className="players-browser">
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
