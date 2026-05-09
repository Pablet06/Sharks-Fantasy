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
    .filter((p): p is Jugador => p !== undefined)

  const goalkeeper = teamPlayers[0]
  const row1 = teamPlayers.slice(1, 3)   // 2 defenders
  const row2 = teamPlayers.slice(3, 6)   // 3 mid
  const row3 = teamPlayers.slice(6, 7)   // 1 forward

  const totalPoints = teamPlayers.reduce((sum, p) => sum + calcTotalPoints(p.historial || []), 0)

  const PlayerNode = ({ player }: { player: Jugador }) => (
    <button className="player-node" onClick={() => setSelected(player)}>
      <img
        src={player.photo || '/Sharks-Fantasy/jugadores/predeterminado.png'}
        alt={player.nick || player.name}
        className="player-node-photo"
      />
      <span className="player-node-name">{player.nick || player.name}</span>
      <span className="player-node-pts">{calcTotalPoints(player.historial || [])} pts</span>
    </button>
  )

  return (
    <div className="pool-container">
      <div className="team-total-pts">
        <span>{usuario.nombre}</span>
        <strong>{totalPoints} pts</strong>
      </div>

      <div className="pool">
        {row3.length > 0 && (
          <div className="pool-row">
            {row3.map(p => <PlayerNode key={p.id} player={p} />)}
          </div>
        )}
        {row2.length > 0 && (
          <div className="pool-row">
            {row2.map(p => <PlayerNode key={p.id} player={p} />)}
          </div>
        )}
        {row1.length > 0 && (
          <div className="pool-row">
            {row1.map(p => <PlayerNode key={p.id} player={p} />)}
          </div>
        )}
        {goalkeeper && (
          <div className="pool-row goalkeeper-row">
            <PlayerNode player={goalkeeper} />
          </div>
        )}
      </div>

      {selected && <PlayerCard jugador={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
