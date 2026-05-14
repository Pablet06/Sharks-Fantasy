import { useState, useRef } from 'react'
import type { Jugador, Usuario } from '../../types'
import { calcTotalPoints } from '../../lib/points'
import { PlayerCard } from './PlayerCard'

interface Props {
  usuario: Usuario
  jugadores: Jugador[]
  onUpdateEquipo: (equipo: number[]) => Promise<unknown>
}

export function Pool({ usuario, jugadores, onUpdateEquipo }: Props) {
  const [selected, setSelected] = useState<Jugador | null>(null)
  const [localEquipo, setLocalEquipo] = useState<number[]>(usuario.equipo)
  const [draggingSlot, setDraggingSlot] = useState<number | null>(null)
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null)
  const dragSlot = useRef<number | null>(null)

  const teamPlayers = localEquipo
    .map(id => jugadores.find(j => j.numero === id))
    .filter((p): p is Jugador => p !== undefined)

  const totalPoints = teamPlayers.reduce((sum, p) => sum + calcTotalPoints(p.historial || []), 0)

  const handleDragStart = (slotIndex: number) => {
    dragSlot.current = slotIndex
    setTimeout(() => setDraggingSlot(slotIndex), 0)
  }

  const handleDrop = async (dropSlotIndex: number) => {
    const from = dragSlot.current
    setDragOverSlot(null)
    setDraggingSlot(null)
    if (from === null || from === dropSlotIndex) return
    const newEquipo = [...localEquipo]
    ;[newEquipo[from], newEquipo[dropSlotIndex]] = [newEquipo[dropSlotIndex], newEquipo[from]]
    dragSlot.current = null
    setLocalEquipo(newEquipo)
    await onUpdateEquipo(newEquipo)
  }

  const handleDragEnd = () => {
    dragSlot.current = null
    setDraggingSlot(null)
    setDragOverSlot(null)
  }

  const PlayerNode = ({ player, slotIndex }: { player: Jugador; slotIndex: number }) => {
    const isDragging = draggingSlot === slotIndex
    const isOver = dragOverSlot === slotIndex && draggingSlot !== slotIndex

    return (
      <button
        className={`player-node ${isDragging ? 'dragging' : ''} ${isOver ? 'drag-over' : ''}`}
        draggable
        onClick={() => setSelected(player)}
        onDragStart={() => handleDragStart(slotIndex)}
        onDragEnter={e => { e.preventDefault(); setDragOverSlot(slotIndex) }}
        onDragOver={e => e.preventDefault()}
        onDrop={() => handleDrop(slotIndex)}
        onDragEnd={handleDragEnd}
        title="Arrastra para intercambiar posición"
      >
        <img
          src={player.photo || '/Sharks-Fantasy/jugadores/predeterminado.png'}
          alt={player.nick || player.name}
          className="player-node-photo"
        />
        <span className="player-node-name">{player.nick || player.name}</span>
        <span className="player-node-pts">{calcTotalPoints(player.historial || [])} pts</span>
      </button>
    )
  }

  const goalkeeper = teamPlayers[0]
  const line2m = teamPlayers.slice(1, 4)
  const line5m = teamPlayers.slice(4, 6)
  const lineTop = teamPlayers.slice(6, 7)

  const poolContent = (
    <div className="pool-container">
      <div className="team-total-pts">
        <span>{usuario.nombre}</span>
        <strong>{totalPoints} pts</strong>
      </div>

      <div className="pool">
        <div className="pool-halfline" />

        {lineTop.length > 0 && (
          <div className="pool-row">
            {lineTop.map((p, i) => <PlayerNode key={p.id} player={p} slotIndex={6 + i} />)}
          </div>
        )}

        {line5m.length > 0 && (
          <div className="pool-row">
            {line5m.map((p, i) => <PlayerNode key={p.id} player={p} slotIndex={4 + i} />)}
          </div>
        )}

        {line2m.length > 0 && (
          <>
            <div className="pool-zone-line fivemeter" />
            <div className="pool-row">
              {line2m.map((p, i) => <PlayerNode key={p.id} player={p} slotIndex={1 + i} />)}
            </div>
          </>
        )}

        <div className="pool-zone-line twometer" />

        {goalkeeper && (
          <div className="pool-row goalkeeper-row">
            <PlayerNode player={goalkeeper} slotIndex={0} />
          </div>
        )}

        <div className="pool-goal" />
      </div>

      <p className="pool-drag-hint">Arrastra los jugadores para intercambiar posiciones</p>
    </div>
  )

  return (
    <>
      {/* Desktop: pool + stats panel side by side */}
      <div className="pool-desktop-layout desktop-only">
        {poolContent}

        <aside className="pool-stats-panel">
          <p className="pool-stats-panel-title">Tu equipo</p>
          {[...teamPlayers].reverse().map(player => (
            <button
              key={player.id}
              className="pool-stats-player-row"
              onClick={() => setSelected(player)}
            >
              <img
                src={player.photo || '/Sharks-Fantasy/jugadores/predeterminado.png'}
                alt={player.nick || player.name}
                className="pool-stats-player-photo"
              />
              <div className="pool-stats-player-info">
                <span className="pool-stats-player-name">{player.nick || player.name}</span>
                <span className={`pos-badge pos-${player.pos.toLowerCase()}`}>{player.pos}</span>
              </div>
              <span className="pool-stats-player-pts">{calcTotalPoints(player.historial || [])} pts</span>
            </button>
          ))}
        </aside>
      </div>

      {/* Mobile: single column (unchanged) */}
      <div className="mobile-only">
        {poolContent}
      </div>

      {selected && <PlayerCard jugador={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
