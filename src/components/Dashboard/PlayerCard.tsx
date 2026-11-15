import type { Jugador, Position, PlayerStats } from '../../types'
import { calcTotalPoints, sumarStats } from '../../lib/points'
import { evolucionJugador } from '../../lib/precio'
import { useJornadas } from '../../hooks/useJornadas'
import { etiquetaJornada } from '../../lib/jornada'
import { PlayerChart } from './PlayerChart'

interface Props {
  jugador: Jugador
  onClose: () => void
  inline?: boolean
}

function getKeyStats(pos: Position, stats: PlayerStats) {
  const base = [
    { label: 'Faltas penalti', value: stats.faltas_penalti },
    { label: 'Tarjetas', value: stats.tarjetas },
    { label: 'Expulsiones', value: stats.expulsiones },
    { label: 'Expuls. graves', value: stats.expulsiones_graves },
  ]
  if (pos === 'Portero') {
    return [{ label: 'G. Encajados (equipo)', value: stats.goles_contra }, ...base]
  }
  return [
    { label: 'Goles', value: stats.goles },
    { label: 'Goles penalti', value: stats.goles_penalti },
    { label: 'Penaltis fallados', value: stats.penaltis_fallados },
    ...base,
  ]
}

export function PlayerCard({ jugador, onClose, inline = false }: Props) {
  const jornadas = useJornadas()
  const totalPoints = calcTotalPoints(jugador.historial || [])
  // Se suma del historial: la columna jugadores.stats solo la refresca un admin a mano y se queda atrasada.
  const s = sumarStats(jugador.historial ?? [])

  const cardContent = (
    <div
      className="player-card-modal"
      onClick={inline ? undefined : e => e.stopPropagation()}
    >
      <button className="modal-close" onClick={onClose}>×</button>

      <div className="player-card-header">
        <img
          src={jugador.photo || '/Sharks-Fantasy/jugadores/predeterminado.png'}
          alt={jugador.name}
          className="player-card-photo"
        />
        <div className="player-card-identity">
          <h2 className="player-card-name">{jugador.name}</h2>
          {jugador.nick && (
            <p className="player-card-nick">{jugador.nick}</p>
          )}
          <span className={`pos-badge pos-${jugador.pos.toLowerCase()}`}>{jugador.pos}</span>
          {jugador.phrase && (
            <p className="player-phrase">"{jugador.phrase}"</p>
          )}
        </div>
      </div>

      <div className="stats-section-label">Estadísticas generales</div>
      <div className="stats-grid">
        <div className="stat-item"><span>Partidos</span><strong>{s.partidos}</strong></div>
        {jugador.pos !== 'Portero' && (
          <>
            <div className="stat-item"><span>Goles</span><strong>{s.goles}</strong></div>
            <div className="stat-item"><span>Goles penalti</span><strong>{s.goles_penalti}</strong></div>
            <div className="stat-item"><span>P. Fallados</span><strong>{s.penaltis_fallados}</strong></div>
          </>
        )}
        <div className="stat-item"><span>Faltas penalti</span><strong>{s.faltas_penalti}</strong></div>
        <div className="stat-item"><span>Tarjetas</span><strong>{s.tarjetas}</strong></div>
        <div className="stat-item"><span>Expulsiones</span><strong>{s.expulsiones}</strong></div>
        <div className="stat-item"><span>Expuls. graves</span><strong>{s.expulsiones_graves}</strong></div>
      </div>

      <div className="player-card-total">
        <span>TOTAL</span>
        <strong className="total-pts">{totalPoints} pts</strong>
      </div>

      <PlayerChart serie={evolucionJugador(jugador.historial ?? [], jugador.historial_anterior ?? [], jornadas)} />

      {(() => {
        // Historial is dense (a row per rostered player per jornada). Only show
        // jornadas this player actually dressed for, chronologically (by orden, not federation numero).
        const played = [...(jugador.historial || [])]
          .filter(h => h.stats.partidos > 0)
          .sort((a, b) => etiquetaJornada(jornadas, a.jornada) - etiquetaJornada(jornadas, b.jornada))
        return played.length > 0 && (
        <div className="historial-list">
          <h4>Por jornada</h4>
          <ul>
            {played
              .map(h => {
                const keyStats = getKeyStats(jugador.pos, h.stats).filter(st => st.value > 0)
                return (
                  <li key={h.jornada} className="historial-item">
                    <span className="historial-jornada">J{etiquetaJornada(jornadas, h.jornada)}</span>
                    <div className="historial-stats-row">
                      {keyStats.length > 0
                        ? keyStats.map(st => (
                            <span key={st.label} className="historial-stat-chip">
                              {st.label}: {st.value}
                            </span>
                          ))
                        : <span className="historial-no-stats">Jugó, sin estadísticas</span>
                      }
                    </div>
                    <span className={h.puntos >= 0 ? 'pts-positive' : 'pts-negative'}>
                      {h.puntos > 0 ? '+' : ''}{h.puntos} pts
                    </span>
                  </li>
                )
              })}
          </ul>
        </div>
        )
      })()}
    </div>
  )

  if (inline) return cardContent

  return (
    <div className="modal-overlay" onClick={onClose}>
      {cardContent}
    </div>
  )
}
