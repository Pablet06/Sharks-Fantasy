import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { calcMatchPoints, EMPTY_STATS } from '../../lib/points'
import type { PlayerStats, Jugador } from '../../types'
import type { useAdminData } from '../../hooks/useAdminData'

interface Props { data: ReturnType<typeof useAdminData> }
const STAT_KEYS = Object.keys(EMPTY_STATS) as (keyof PlayerStats)[]

interface Row { jugador: Jugador; entryId: number; stats: PlayerStats }

export function HistorialAdmin({ data }: Props) {
  const [jornada, setJornada] = useState(1)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [addJugadorId, setAddJugadorId] = useState<number | ''>('')
  const [edits, setEdits] = useState<Record<number, PlayerStats>>({})

  const allJornadas = [...new Set(
    data.jugadores.flatMap(j => (j.historial ?? []).map(h => h.jornada))
  )].sort((a, b) => a - b)

  const rows: Row[] = data.jugadores
    .map(j => {
      const e = (j.historial ?? []).find(h => h.jornada === jornada)
      return e ? { jugador: j, entryId: e.id, stats: e.stats } : null
    })
    .filter((r): r is Row => r !== null)

  const statOf = (r: Row) => edits[r.jugador.id] ?? r.stats

  const setStat = (jid: number, base: PlayerStats, key: keyof PlayerStats, v: number) =>
    setEdits(e => ({ ...e, [jid]: { ...(e[jid] ?? base), [key]: v } }))

  const afterWrite = async (okMsg: string) => {
    const { error } = await supabase.rpc('recalc_puntos')
    setMsg(error ? `Guardado, pero recalc falló: ${error.message}` : okMsg)
    setEdits({})
    data.refetch()
    setBusy(false)
  }

  const saveRow = async (r: Row) => {
    setBusy(true); setMsg('')
    const stats = statOf(r)
    const puntos = calcMatchPoints(r.jugador.pos, stats)
    const { error } = await supabase.from('historial').upsert(
      { jugador_id: r.jugador.id, jornada, stats, puntos },
      { onConflict: 'jugador_id,jornada' },
    )
    if (error) { setMsg(`Error: ${error.message}`); setBusy(false); return }
    await afterWrite(`✓ J${jornada} · ${r.jugador.name} (${puntos} pts)`)
  }

  const addRow = async () => {
    if (addJugadorId === '') return
    const jug = data.jugadores.find(j => j.id === addJugadorId)!
    setBusy(true); setMsg('')
    const stats = { ...EMPTY_STATS, partidos: 1 }
    const { error } = await supabase.from('historial').upsert(
      { jugador_id: jug.id, jornada, stats, puntos: calcMatchPoints(jug.pos, stats) },
      { onConflict: 'jugador_id,jornada' },
    )
    if (error) { setMsg(`Error: ${error.message}`); setBusy(false); return }
    setAddJugadorId('')
    await afterWrite(`✓ Añadida J${jornada} · ${jug.name}`)
  }

  const deleteRow = async (r: Row) => {
    if (!confirm(`¿Borrar la entrada de ${r.jugador.name} en J${jornada}?`)) return
    setBusy(true); setMsg('')
    const { error } = await supabase.from('historial').delete().eq('id', r.entryId)
    if (error) { setMsg(`Error: ${error.message}`); setBusy(false); return }
    await afterWrite(`✓ Borrada J${jornada} · ${r.jugador.name}`)
  }

  const deleteJornada = async () => {
    if (!confirm(`¿Borrar TODAS las entradas de la jornada ${jornada}? (${rows.length} filas)`)) return
    setBusy(true); setMsg('')
    const { error } = await supabase.from('historial').delete().eq('jornada', jornada)
    if (error) { setMsg(`Error: ${error.message}`); setBusy(false); return }
    await afterWrite(`✓ Jornada ${jornada} borrada`)
  }

  return (
    <div className="admin-scroll">
      <h3>Historial por jornada</h3>
      <div className="admin-view-topbar">
        <label>Jornada <input type="number" min={1} value={jornada} onChange={e => { setEdits({}); setJornada(Number(e.target.value)) }} /></label>
        <span className="admin-msg">Con datos: {allJornadas.join(', ') || '—'}</span>
        <button className="admin-subnav-btn admin-danger" disabled={busy || rows.length === 0} onClick={deleteJornada}>
          Borrar jornada entera
        </button>
      </div>
      {msg && <p className="admin-msg">{msg}</p>}

      <table className="admin-table">
        <thead>
          <tr><th>Jugador</th>{STAT_KEYS.map(k => <th key={k}>{k}</th>)}<th>pts</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const s = statOf(r)
            const dirty = !!edits[r.jugador.id]
            return (
              <tr key={r.jugador.id}>
                <td>{r.jugador.name}</td>
                {STAT_KEYS.map(k => (
                  <td key={k}>
                    <input type="number" value={s[k]} onChange={e => setStat(r.jugador.id, r.stats, k, Number(e.target.value))} />
                  </td>
                ))}
                <td>{calcMatchPoints(r.jugador.pos, s)}</td>
                <td className="admin-row-actions">
                  <button className="admin-subnav-btn" disabled={busy || !dirty} onClick={() => saveRow(r)}>Guardar</button>
                  <button className="admin-subnav-btn admin-danger" disabled={busy} onClick={() => deleteRow(r)}>Borrar</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="admin-view-topbar">
        <select value={addJugadorId} onChange={e => setAddJugadorId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">— añadir jugador a J{jornada} —</option>
          {data.jugadores
            .filter(j => !rows.some(r => r.jugador.id === j.id))
            .map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
        </select>
        <button className="admin-subnav-btn" disabled={busy || addJugadorId === ''} onClick={addRow}>Añadir</button>
      </div>
    </div>
  )
}
