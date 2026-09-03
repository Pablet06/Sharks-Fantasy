import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Jugador } from '../../types'
import { calcMatchPoints } from '../../lib/points'

interface Props {
  jugadores: Jugador[]
  onClose: () => void
  onRefresh: () => void
}

export function AdminPanel({ jugadores, onClose, onRefresh }: Props) {
  // Stat editor state
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [jornada, setJornada] = useState(1)
  const [stats, setStats] = useState({
    partidos: 0, goles: 0, goles_penalti: 0, penaltis_fallados: 0,
    faltas_penalti: 0, tarjetas: 0, expulsiones: 0, expulsiones_graves: 0,
    goles_contra: 0,
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const handleSaveStats = async () => {
    if (!selectedId) return
    const jugador = jugadores.find(j => j.numero === selectedId)
    if (!jugador) return

    setSaving(true)
    setMsg('')
    const puntos = calcMatchPoints(jugador.pos, stats)

    // Upsert historial entry
    const { error } = await supabase
      .from('historial')
      .upsert({
        jugador_id: jugador.id,
        jornada,
        stats,
        puntos,
        date: new Date().toISOString()
      }, { onConflict: 'jugador_id,jornada' })

    if (error) {
      setMsg(`Error: ${error.message}`)
    } else {
      // Recalc root stats
      const { data: hist } = await supabase
        .from('historial')
        .select('stats')
        .eq('jugador_id', jugador.id)

      if (hist) {
        const totals = hist.reduce((acc, h) => {
          const s = h.stats as typeof stats
          return Object.fromEntries(
            Object.keys(acc).map(k => [k, (acc as Record<string,number>)[k] + ((s as Record<string,number>)[k] ?? 0)])
          ) as typeof stats
        }, { partidos: 0, goles: 0, goles_penalti: 0, penaltis_fallados: 0, faltas_penalti: 0, tarjetas: 0, expulsiones: 0, expulsiones_graves: 0, goles_contra: 0 })

        await supabase.from('jugadores').update({ stats: totals }).eq('id', jugador.id)
      }

      setMsg(`✓ J${jornada} guardada (${puntos} pts)`)
      onRefresh()
    }
    setSaving(false)
  }

  const selectedJugador = jugadores.find(j => j.numero === selectedId)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="admin-panel" onClick={e => e.stopPropagation()}>
        <div className="admin-header">
          <h2>Admin Panel</h2>
          <button onClick={onClose} className="modal-close">×</button>
        </div>

        <div className="admin-section">
          <h3>Editar Jornada</h3>
          <div className="admin-row">
            <label>Jugador</label>
            <select value={selectedId ?? ''} onChange={e => setSelectedId(Number(e.target.value))} className="admin-select">
              <option value="">-- selecciona --</option>
              {jugadores.map(j => (
                <option key={j.id} value={j.numero}>{j.name} ({j.pos})</option>
              ))}
            </select>
          </div>
          <div className="admin-row">
            <label>Jornada</label>
            <input type="number" min={1} value={jornada} onChange={e => setJornada(Number(e.target.value))} className="admin-input" />
          </div>
          {selectedJugador && (
            <div className="stats-editor">
              {Object.entries(stats).map(([key, val]) => (
                <div key={key} className="stat-edit-row">
                  <label>{key}</label>
                  <input
                    type="number"
                    value={val}
                    onChange={e => setStats(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                    className="admin-input"
                  />
                </div>
              ))}
              <button onClick={handleSaveStats} disabled={saving} className="auth-btn">
                {saving ? 'Guardando...' : 'Guardar Jornada'}
              </button>
              {msg && <p className="admin-msg">{msg}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
