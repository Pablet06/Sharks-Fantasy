import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { useAdminData } from '../../hooks/useAdminData'

interface Props { data: ReturnType<typeof useAdminData> }

export function SyncAdmin({ data }: Props) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [jornadaInput, setJornadaInput] = useState('')
  const [resolviendo, setResolviendo] = useState(false)

  const jornadas = new Set(
    data.jugadores.flatMap(j => (j.historial ?? []).map(h => h.jornada))
  )
  let unmatched: string[]
  try {
    unmatched = JSON.parse(data.config.unmatched_players || '[]')
  } catch {
    unmatched = []
  }

  const recalc = async () => {
    setBusy(true)
    setMsg('')
    const { error } = await supabase.rpc('recalc_puntos')
    setMsg(error ? `Error: ${error.message}` : '✓ Puntos recalculados')
    if (!error) data.refetch()
    setBusy(false)
  }

  const resolverJornada = async () => {
    const n = Number(jornadaInput)
    if (!n) return
    setResolviendo(true)
    setMsg('')
    const { error } = await supabase.rpc('resolver_jornada', { p_jornada: n })
    setMsg(error ? `Error: ${error.message}` : `✓ Jornada ${n} resuelta`)
    if (!error) data.refetch()
    setResolviendo(false)
  }

  return (
    <div>
      <h3>Estado de sincronización</h3>
      <ul>
        <li>Última sync: {data.config.last_sync_at || '—'}</li>
        <li>Jornadas en historial: {jornadas.size}</li>
        <li>Jugadores sin emparejar: {unmatched.length === 0 ? '—' : unmatched.join(', ')}</li>
      </ul>
      <button onClick={recalc} disabled={busy} className="admin-subnav-btn">
        {busy ? 'Recalculando…' : 'Recalcular puntos'}
      </button>
      <div className="admin-view-topbar">
        <label>
          Jornada:
          <input
            type="number"
            value={jornadaInput}
            onChange={e => setJornadaInput(e.target.value)}
          />
        </label>
        <button onClick={resolverJornada} disabled={resolviendo || !jornadaInput} className="admin-subnav-btn">
          {resolviendo ? 'Resolviendo…' : 'Reprocesar jornada'}
        </button>
      </div>
      {msg && <p className="admin-msg">{msg}</p>}
      <p className="admin-msg">
        Para re-sincronizar con la federación: <code>npm run sync</code> en local,
        o lanza el workflow «Weekly Stats Sync» en GitHub Actions.
      </p>
    </div>
  )
}
