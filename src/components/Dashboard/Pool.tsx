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
    // Timeout so the browser captures ghost before we dim the source
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
  const row1 = teamPlayers.slice(1, 3)
  const row2 = teamPlayers.slice(3, 6)
  const row3 = teamPlayers.slice(6, 7)

  return (
    <div className="pool-container">
      <div className="team-total-pts">
        <span>{usuario.nombre}</span>
        <strong>{totalPoints} pts</strong>
      </div>

      <div className="pool">
        {row3.length > 0 && (
          <div className="pool-row">
            {row3.map((p, i) => <PlayerNode key={p.id} player={p} slotIndex={6 + i} />)}
          </div>
        )}
        {row2.length > 0 && (
          <div className="pool-row">
            {row2.map((p, i) => <PlayerNode key={p.id} player={p} slotIndex={3 + i} />)}
          </div>
        )}
        {row1.length > 0 && (
          <div className="pool-row">
            {row1.map((p, i) => <PlayerNode key={p.id} player={p} slotIndex={1 + i} />)}
          </div>
        )}
        {goalkeeper && (
          <div className="pool-row goalkeeper-row">
            <PlayerNode player={goalkeeper} slotIndex={0} />
          </div>
        )}
      </div>

      <p className="pool-drag-hint">Arrastra los jugadores para intercambiar posiciones</p>

      {selected && <PlayerCard jugador={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
