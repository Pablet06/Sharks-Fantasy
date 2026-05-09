import type { Jugador } from '../../types'
import { calcTotalPoints } from '../../lib/points'

interface Props {
  jugador: Jugador
  onClose: () => void
}

export function PlayerCard({ jugador, onClose }: Props) {
  const totalPoints = calcTotalPoints(jugador.historial || [])
  const s = jugador.stats

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="player-card-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="player-card-header">
          <img
            src={jugador.photo || '/Sharks-Fantasy/jugadores/predeterminado.png'}
            alt={jugador.name}
            className="player-card-photo"
          />
          <div>
            <h2 className="player-card-name">{jugador.name}</h2>
            <span className={`pos-badge pos-${jugador.pos.toLowerCase()}`}>{jugador.pos}</span>
            {jugador.phrase && <p className="player-phrase">"{jugador.phrase}"</p>}
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-item"><span>Partidos</span><strong>{s.partidos}</strong></div>
          <div className="stat-item"><span>Goles</span><strong>{s.goles}</strong></div>
          {jugador.pos === 'Portero' ? (
            <>
              <div className="stat-item"><span>Paradas</span><strong>{s.paradas}</strong></div>
              <div className="stat-item"><span>G. Encajados</span><strong>{s.goles_contra}</strong></div>
              <div className="stat-item"><span>P. Parados</span><strong>{s.penaltis_parados}</strong></div>
            </>
          ) : (
            <>
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
              {[...(jugador.historial || [])].sort((a, b) => a.jornada - b.jornada).map(h => (
                <li key={h.jornada}>
                  <span>J{h.jornada}</span>
                  <span className={h.puntos >= 0 ? 'pts-positive' : 'pts-negative'}>
                    {h.puntos > 0 ? '+' : ''}{h.puntos} pts
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
