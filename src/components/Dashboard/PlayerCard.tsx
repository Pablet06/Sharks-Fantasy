import type { Jugador, Position, PlayerStats } from '../../types'
import { calcTotalPoints } from '../../lib/points'

interface Props {
  jugador: Jugador
  onClose: () => void
  inline?: boolean
}

function getKeyStats(pos: Position, stats: PlayerStats) {
  if (pos === 'Portero') {
    return [
      { label: 'Paradas', value: stats.paradas },
      { label: 'G. Encajados', value: stats.goles_contra },
      { label: 'P. Parados', value: stats.penaltis_parados },
      { label: 'Tarjetas', value: stats.tarjetas },
      { label: 'Expulsiones', value: stats.expulsiones },
    ]
  }
  return [
    { label: 'Goles', value: stats.goles },
    { label: 'Penaltis', value: stats.penaltis },
    { label: 'Tiros', value: stats.tiros },
    { label: 'P. Fallados', value: stats.penaltis_fallados },
    { label: 'Tarjetas', value: stats.tarjetas },
    { label: 'Expulsiones', value: stats.expulsiones },
  ]
}

export function PlayerCard({ jugador, onClose, inline = false }: Props) {
  const totalPoints = calcTotalPoints(jugador.historial || [])
  const s = jugador.stats

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
        {jugador.pos === 'Portero' ? (
          <>
            <div className="stat-item"><span>Paradas</span><strong>{s.paradas}</strong></div>
            <div className="stat-item"><span>G. Encajados</span><strong>{s.goles_contra}</strong></div>
            <div className="stat-item"><span>P. Parados</span><strong>{s.penaltis_parados}</strong></div>
          </>
        ) : (
          <>
            <div className="stat-item"><span>Goles</span><strong>{s.goles}</strong></div>
            <div className="stat-item"><span>Penaltis</span><strong>{s.penaltis}</strong></div>
            <div className="stat-item"><span>Tiros</span><strong>{s.tiros}</strong></div>
            <div className="stat-item"><span>P. Fallados</span><strong>{s.penaltis_fallados}</strong></div>
          </>
        )}
        <div className="stat-item"><span>Tarjetas</span><strong>{s.tarjetas}</strong></div>
        <div className="stat-item"><span>Expulsiones</span><strong>{s.expulsiones}</strong></div>
      </div>

      <div className="player-card-total">
        <span>TOTAL</span>
        <strong className="total-pts">{totalPoints} pts</strong>
      </div>

      {(jugador.historial || []).length > 0 && (
        <div className="historial-list">
          <h4>Por jornada</h4>
          <ul>
            {[...(jugador.historial || [])]
              .sort((a, b) => a.jornada - b.jornada)
              .map(h => {
                const keyStats = getKeyStats(jugador.pos, h.stats).filter(st => st.value > 0)
                return (
                  <li key={h.jornada} className="historial-item">
                    <span className="historial-jornada">J{h.jornada}</span>
                    <div className="historial-stats-row">
                      {keyStats.length > 0
                        ? keyStats.map(st => (
                            <span key={st.label} className="historial-stat-chip">
                              {st.label}: {st.value}
                            </span>
                          ))
                        : <span className="historial-no-stats">Sin estadísticas</span>
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
      )}
    </div>
  )

  if (inline) return cardContent

  return (
    <div className="modal-overlay" onClick={onClose}>
      {cardContent}
    </div>
  )
}
