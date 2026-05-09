import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Jugador } from '../../types'
import { calcMatchPoints } from '../../lib/points'

interface Props {
  jugadores: Jugador[]
  onClose: () => void
  onRefresh: () => void
}

// Generate hash: echo -n 'yourpassword' | sha256sum — store only hash, never plaintext
const ADMIN_HASH = import.meta.env.VITE_ADMIN_HASH ?? ''

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function AdminPanel({ jugadores, onClose, onRefresh }: Props) {
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState(false)

  // Stat editor state
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [jornada, setJornada] = useState(1)
  const [stats, setStats] = useState({
    partidos: 0, goles: 0, penaltis: 0, tarjetas: 0, expulsiones: 0,
    tiros: 0, penaltis_fallados: 0, paradas: 0, goles_contra: 0, penaltis_parados: 0
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const checkPassword = async () => {
    const hash = await sha256(password)
    if (hash === ADMIN_HASH) {
      setAuthed(true)
    } else {
      setAuthError(true)
      setTimeout(() => setAuthError(false), 2000)
    }
  }

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
        }, { partidos: 0, goles: 0, penaltis: 0, tarjetas: 0, expulsiones: 0, tiros: 0, penaltis_fallados: 0, paradas: 0, goles_contra: 0, penaltis_parados: 0 })

        await supabase.from('jugadores').update({ stats: totals }).eq('id', jugador.id)
      }

      setMsg(`✓ J${jornada} guardada (${puntos} pts)`)
      onRefresh()
    }
    setSaving(false)
  }

  if (!authed) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="admin-auth" onClick={e => e.stopPropagation()}>
          <h3>Admin Panel</h3>
          <input
            type="password"
            placeholder="Contraseña admin"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && checkPassword()}
            className="auth-input"
          />
          {authError && <p className="auth-error">Contraseña incorrecta</p>}
          <button onClick={checkPassword} className="auth-btn">Acceder</button>
          <button onClick={onClose} className="cancel-btn">Cancelar</button>
        </div>
      </div>
    )
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
