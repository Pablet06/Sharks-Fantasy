import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Jugador, Position } from '../../types'
import type { useAdminData } from '../../hooks/useAdminData'

interface Props { data: ReturnType<typeof useAdminData> }
const POSITIONS: Position[] = ['Portero', 'Boya', 'Extremo', 'Lateral', 'Contraboya']

const BLANK = {
  numero: 0, name: '', nick: '', pos: 'Lateral' as Position,
  phrase: '', photo: '', leverade_id: '',
}

export function JugadoresAdmin({ data }: Props) {
  const [draft, setDraft] = useState<Record<number, Partial<Jugador>>>({})
  const [nuevo, setNuevo] = useState(BLANK)
  const [msg, setMsg] = useState('')

  const patch = (id: number, field: string, value: unknown) =>
    setDraft(d => ({ ...d, [id]: { ...d[id], [field]: value } }))

  const save = async (j: Jugador) => {
    const changes = draft[j.id]
    if (!changes || Object.keys(changes).length === 0) return
    setMsg('')
    const { error } = await supabase.from('jugadores').update(changes).eq('id', j.id)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setDraft(d => { const rest = { ...d }; delete rest[j.id]; return rest })
    data.refetch()
  }

  const crear = async () => {
    setMsg('')
    const row = {
      ...nuevo,
      nick: nuevo.nick || null,
      phrase: nuevo.phrase || null,
      photo: nuevo.photo || null,
      leverade_id: nuevo.leverade_id ? Number(nuevo.leverade_id) : null,
      stats: {
        partidos: 0, goles: 0, goles_penalti: 0, penaltis_fallados: 0,
        faltas_penalti: 0, tarjetas: 0, expulsiones: 0, expulsiones_graves: 0, goles_contra: 0,
      },
    }
    const { error } = await supabase.from('jugadores').insert(row)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setNuevo(BLANK)
    data.refetch()
  }

  const borrar = async (j: Jugador) => {
    const enEquipos = data.usuarios.filter(u => u.equipo.includes(j.numero)).map(u => u.nombre)
    const warn = enEquipos.length
      ? `\n\n⚠️ En el equipo de: ${enEquipos.join(', ')}. Su hueco quedará vacío hasta que lo cambien.`
      : ''
    if (!confirm(`¿Borrar a ${j.name}? Se borrará también su historial.${warn}`)) return
    setMsg('')
    // historial rows FK-cascade or must go first depending on the constraint;
    // delete them explicitly to be safe.
    await supabase.from('historial').delete().eq('jugador_id', j.id)
    const { error } = await supabase.from('jugadores').delete().eq('id', j.id)
    if (error) { setMsg(`Error: ${error.message}`); return }
    data.refetch()
  }

  return (
    <div className="admin-scroll">
      <h3>Jugadores</h3>
      {msg && <p className="admin-msg admin-error">{msg}</p>}
      <table className="admin-table">
        <thead>
          <tr><th>Nº</th><th>Nombre</th><th>Nick</th><th>Pos</th><th>Frase</th><th>Foto URL</th><th>leverade_id</th><th></th></tr>
        </thead>
        <tbody>
          {data.jugadores.map(j => {
            const d = draft[j.id] ?? {}
            const val = (f: keyof Jugador) => (d[f] ?? j[f] ?? '') as string | number
            return (
              <tr key={j.id}>
                <td><input type="number" value={val('numero')} onChange={e => patch(j.id, 'numero', Number(e.target.value))} /></td>
                <td><input value={val('name')} onChange={e => patch(j.id, 'name', e.target.value)} /></td>
                <td><input value={val('nick')} onChange={e => patch(j.id, 'nick', e.target.value)} /></td>
                <td>
                  <select value={val('pos')} onChange={e => patch(j.id, 'pos', e.target.value)}>
                    {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </td>
                <td><input value={val('phrase')} onChange={e => patch(j.id, 'phrase', e.target.value)} /></td>
                <td><input value={val('photo')} onChange={e => patch(j.id, 'photo', e.target.value)} /></td>
                <td><input type="number" value={val('leverade_id')} onChange={e => patch(j.id, 'leverade_id', Number(e.target.value))} /></td>
                <td className="admin-row-actions">
                  <button className="admin-subnav-btn" disabled={!draft[j.id]} onClick={() => save(j)}>Guardar</button>
                  <button className="admin-subnav-btn admin-danger" onClick={() => borrar(j)}>Borrar</button>
                </td>
              </tr>
            )
          })}
          <tr>
            <td><input type="number" value={nuevo.numero} onChange={e => setNuevo({ ...nuevo, numero: Number(e.target.value) })} /></td>
            <td><input value={nuevo.name} onChange={e => setNuevo({ ...nuevo, name: e.target.value })} /></td>
            <td><input value={nuevo.nick} onChange={e => setNuevo({ ...nuevo, nick: e.target.value })} /></td>
            <td>
              <select value={nuevo.pos} onChange={e => setNuevo({ ...nuevo, pos: e.target.value as Position })}>
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </td>
            <td><input value={nuevo.phrase} onChange={e => setNuevo({ ...nuevo, phrase: e.target.value })} /></td>
            <td><input value={nuevo.photo} onChange={e => setNuevo({ ...nuevo, photo: e.target.value })} /></td>
            <td><input value={nuevo.leverade_id} onChange={e => setNuevo({ ...nuevo, leverade_id: e.target.value })} /></td>
            <td><button className="admin-subnav-btn" onClick={crear} disabled={!nuevo.name || !nuevo.numero}>Crear</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
