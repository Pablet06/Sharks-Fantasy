import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Usuario, Jugador, Alineacion } from '../../types'
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
  const [viewAlineacion, setViewAlineacion] = useState<Alineacion | null | 'none'>('none')
  const [viewPlayer, setViewPlayer] = useState<Jugador | null>(null)

  useEffect(() => {
    supabase
      .from('usuarios')
      .select('*')
      .order('puntos', { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (error) console.error('Ranking fetch error:', error)
        if (data) setRanking(data as Usuario[])
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!viewTeam) return
    setViewAlineacion('none')
    let cancelled = false
    supabase
      .from('alineaciones')
      .select('*')
      .eq('usuario_id', viewTeam.id)
      .not('puntos_jornada', 'is', null)
      .order('jornada', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Alineacion fetch error:', error)
        setViewAlineacion((data as Alineacion) ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [viewTeam])

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
            {viewAlineacion === 'none' && <p className="placeholder">Cargando...</p>}
            {viewAlineacion === null && (
              <p className="placeholder">Todavía no tiene ninguna jornada resuelta.</p>
            )}
            {viewAlineacion && viewAlineacion !== 'none' && (
              <>
                <p className="placeholder">Jornada {viewAlineacion.jornada} — {viewAlineacion.puntos_jornada} pts</p>
                <div className="mini-pool">
                  {(viewAlineacion.jugadores ?? []).map(id => {
                    const p = jugadores.find(j => j.numero === id)
                    if (!p) return null
                    return (
                      <button key={id} className="mini-player" onClick={() => setViewPlayer(p)}>
                        <img src={p.photo || '/Sharks-Fantasy/jugadores/predeterminado.png'} alt={p.nick || p.name} />
                        <span>{p.nick || p.name}{viewAlineacion.capitan === id ? ' ★' : ''}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {viewPlayer && (
        <PlayerCard jugador={viewPlayer} onClose={() => setViewPlayer(null)} />
      )}
    </div>
  )
}
