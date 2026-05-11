import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Usuario, Jugador } from '../../types'
import { calcTotalPoints } from '../../lib/points'
import { PlayerCard } from '../Dashboard/PlayerCard'

interface Props {
  jugadores: Jugador[]
  currentUserId: string
}

const MEDAL: Record<number, string> = { 0: '🥇', 1: '🥈', 2: '🥉' }
const RANK_CLASS: Record<number, string> = { 0: 'rank-gold', 1: 'rank-silver', 2: 'rank-bronze' }

export function Ranking({ jugadores, currentUserId }: Props) {
  const [ranking, setRanking] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [viewTeam, setViewTeam] = useState<Usuario | null>(null)
  const [viewPlayer, setViewPlayer] = useState<Jugador | null>(null)

  useEffect(() => {
    supabase
      .from('usuarios')
      .select('*')
      .order('puntos', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data) setRanking(data as Usuario[])
        setLoading(false)
      })
  }, [])

  if (loading) return <div className="loading-msg">Cargando ranking...</div>

  return (
    <div className="ranking">
      <h2 className="section-title">Top 10</h2>
      <ol className="ranking-list">
        {ranking.map((u, i) => {
          const isMedal = i < 3
          const isCurrentUser = u.id === currentUserId
          return (
            <li
              key={u.id}
              className={`ranking-item ${isCurrentUser ? 'current-user' : ''} ${isMedal ? RANK_CLASS[i] : ''}`}
              onClick={() => setViewTeam(u)}
            >
              <span className="rank-pos">{isMedal ? MEDAL[i] : `#${i + 1}`}</span>
              <span className="rank-name">{u.nombre}</span>
              <span className="rank-pts">{u.puntos} pts</span>
            </li>
          )
        })}
      </ol>

      {viewTeam && (
        <div className="modal-overlay" onClick={() => setViewTeam(null)}>
          <div className="team-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setViewTeam(null)}>×</button>
            <h3>{viewTeam.nombre}</h3>
            <div className="mini-pool">
              {viewTeam.equipo.map(id => {
                const p = jugadores.find(j => j.numero === id)
                if (!p) return null
                return (
                  <button key={id} className="mini-player" onClick={() => setViewPlayer(p)}>
                    <img src={p.photo || '/Sharks-Fantasy/jugadores/predeterminado.png'} alt={p.nick || p.name} />
                    <span>{p.nick || p.name}</span>
                    <span className="mini-pts">{calcTotalPoints(p.historial || [])} pts</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {viewPlayer && (
        <PlayerCard jugador={viewPlayer} onClose={() => setViewPlayer(null)} />
      )}
    </div>
  )
}
