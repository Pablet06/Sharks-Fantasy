import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Usuario, Jugador, Alineacion } from '../../types'
import { PlayerCard } from '../Dashboard/PlayerCard'
import { useJornadas } from '../../hooks/useJornadas'
import { usePosicionesPorJornada } from '../../hooks/usePosicionesPorJornada'
import { etiquetaJornada, ultimaAlineacionPuntuada } from '../../lib/jornada'
import { posicionRanking } from '../../lib/ranking'
import { formatoPuesto } from '../../lib/posiciones'

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
  // Alineaciones puntuadas del usuario abierto (null = cargando); la última se elige al renderizar, por `orden`.
  const [viewAlineaciones, setViewAlineaciones] = useState<Alineacion[] | null>(null)
  const [viewPlayer, setViewPlayer] = useState<Jugador | null>(null)
  // Vista de la lista: null = General (como siempre); si no, `numero` de una jornada finalizada.
  const [vista, setVista] = useState<number | null>(null)
  const [modo, setModo] = useState<'jornada' | 'acumulado'>('jornada')
  const jornadas = useJornadas()
  const posiciones = usePosicionesPorJornada()
  const viewAlineacion = viewAlineaciones === null ? 'none' : ultimaAlineacionPuntuada(viewAlineaciones, jornadas)

  useEffect(() => {
    supabase
      .from('usuarios')
      .select('*')
      .order('puntos', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('Ranking fetch error:', error)
        if (data) setRanking(data as Usuario[])
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!viewTeam) return
    let cancelled = false
    supabase
      .from('alineaciones')
      .select('*')
      .eq('usuario_id', viewTeam.id)
      .not('puntos_jornada', 'is', null)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Alineacion fetch error:', error)
        setViewAlineaciones((data as Alineacion[]) ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [viewTeam])

  if (loading) return <div className="loading-msg">Cargando ranking...</div>

  const finalizadas = posiciones ?? [] // por `orden` ascendente
  const sel = vista === null ? undefined : finalizadas.find(p => p.numero === vista)
  // pos null = «No jugó» (solo en modo Jornada); en General se mantiene el orden de la consulta.
  const orden = (p: number | null) => p ?? Infinity
  const filas: { u: Usuario; pos: number | null; pts: number | null }[] = sel
    ? ranking
        .map(u => {
          const f = sel.filas.find(x => x.usuarioId === u.id)
          return modo === 'jornada'
            ? { u, pos: f?.posJornada ?? null, pts: f?.puntos ?? null }
            : { u, pos: f?.posAcumulado ?? null, pts: f?.acumulado ?? null }
        })
        .sort((a, b) => orden(a.pos) === orden(b.pos) ? a.u.nombre.localeCompare(b.u.nombre) : orden(a.pos) - orden(b.pos))
    : ranking.map(u => ({ u, pos: posicionRanking(ranking, u.puntos), pts: u.puntos }))

  return (
    <div className="ranking">
      <h2 className="section-title">Clasificación</h2>
      {finalizadas.length > 0 && (
        <div className="filter-chips ranking-filtros">
          <select aria-label="Jornada" value={vista ?? ''} onChange={e => setVista(e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">General</option>
            {[...finalizadas].reverse().map(p => (
              <option key={p.numero} value={p.numero}>Jornada {p.orden}</option>
            ))}
          </select>
          {sel && (['jornada', 'acumulado'] as const).map(m => (
            <button key={m} className={`filter-chip ${modo === m ? 'active-all' : ''}`} aria-pressed={modo === m} onClick={() => setModo(m)}>
              {m === 'jornada' ? 'Jornada' : 'Acumulado'}
            </button>
          ))}
        </div>
      )}
      {sel && (
        <p className="placeholder">
          {modo === 'jornada' ? `Jugaron ${sel.jugaron} de ${sel.total} usuarios` : `Total tras la Jornada ${sel.orden}`}
        </p>
      )}
      <ol className="ranking-list">
        {filas.map(({ u, pos, pts }) => {
          // Posición de competición: los empatados a puntos comparten puesto (y medalla).
          const isMedal = pos !== null && pos <= 3
          const isCurrentUser = u.id === currentUserId
          return (
            <li
              key={u.id}
              className={`ranking-item ${isCurrentUser ? 'current-user' : ''} ${isMedal ? RANK_CLASS[pos - 1] : ''} ${pos === null ? 'no-jugo' : ''}`}
              onClick={() => { setViewTeam(u); setViewAlineaciones(null) }}
            >
              <span className="rank-pos">{pos === null ? '–' : isMedal ? MEDAL[pos - 1] : `#${pos}`}</span>
              <span className="rank-name">{u.nombre}</span>
              <span className="rank-pts">{pts === null ? 'No jugó' : `${pts} pts`}</span>
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
                <p className="placeholder">Jornada {etiquetaJornada(jornadas, viewAlineacion.jornada)} — {viewAlineacion.puntos_jornada} pts</p>
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
            {finalizadas.length > 0 && (
              <>
                <h4 className="posiciones-titulo">Posición por jornada</h4>
                <table className="posiciones-table">
                  <thead>
                    <tr><th>J</th><th>Pts</th><th>Puesto</th><th>Acum.</th></tr>
                  </thead>
                  <tbody>
                    {finalizadas.map(p => {
                      const f = p.filas.find(x => x.usuarioId === viewTeam.id)
                      return (
                        <tr key={p.numero}>
                          <td>{p.orden}</td>
                          <td>{f?.puntos ?? '–'}</td>
                          <td>{f && f.posJornada !== null ? formatoPuesto(f.posJornada, p.jugaron) : 'No jugó'}</td>
                          <td>{f ? formatoPuesto(f.posAcumulado, p.total) : '–'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
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
