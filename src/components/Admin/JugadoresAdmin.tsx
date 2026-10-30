import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Jugador, Position } from '../../types'
import type { useAdminData } from '../../hooks/useAdminData'
import { uploadPhoto } from '../../lib/photos'
import { jornadaEnCurso, etiquetaJornada } from '../../lib/jornada'
import { coincide } from '../../lib/busqueda'

interface Props { data: ReturnType<typeof useAdminData> }
const POSITIONS: Position[] = ['Portero', 'Boya', 'Extremo', 'Lateral', 'Contraboya']

const BLANK = {
  numero: 0, name: '', nick: '', pos: 'Lateral' as Position,
  phrase: '', leverade_id: '',
}

export function JugadoresAdmin({ data }: Props) {
  const [draft, setDraft] = useState<Record<number, Partial<Jugador>>>({})
  const [nuevo, setNuevo] = useState(BLANK)
  const [nuevaFoto, setNuevaFoto] = useState<File | null>(null)
  const [msg, setMsg] = useState('')
  const [q, setQ] = useState('')
  const visibles = data.jugadores.filter(j => coincide(q, j.name, j.nick, j.numero, j.pos))

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

  const subirFoto = async (j: Jugador, file: File) => {
    setMsg('Subiendo foto…')
    try {
      const path = await uploadPhoto(j.numero, file)
      const { error } = await supabase.from('jugadores').update({ photo: path }).eq('id', j.id)
      if (error) throw error
      setMsg(`✓ Foto de ${j.name} actualizada`)
      data.refetch()
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`)
    }
  }

  const crear = async () => {
    setMsg('')
    let photo: string | null = null
    if (nuevaFoto) {
      try { photo = await uploadPhoto(nuevo.numero, nuevaFoto) }
      catch (e) { setMsg(`Error subiendo foto: ${(e as Error).message}`); return }
    }
    const row = {
      ...nuevo,
      nick: nuevo.nick || null,
      phrase: nuevo.phrase || null,
      photo,
      leverade_id: nuevo.leverade_id ? Number(nuevo.leverade_id) : null,
      stats: {
        partidos: 0, goles: 0, goles_penalti: 0, penaltis_fallados: 0,
        faltas_penalti: 0, tarjetas: 0, expulsiones: 0, expulsiones_graves: 0, goles_contra: 0,
      },
    }
    const { error } = await supabase.from('jugadores').insert(row)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setNuevo(BLANK)
    setNuevaFoto(null)
    data.refetch()
  }

  const borrar = async (j: Jugador) => {
    // Solo la jornada en curso: las ya puntuadas no se ven afectadas por el borrado.
    const n = jornadaEnCurso(data.jornadas)
    const enAlineaciones = data.alineaciones
      .filter(a => a.jornada === n && a.jugadores?.includes(j.numero))
      .map(a => data.usuarios.find(u => u.id === a.usuario_id)?.nombre ?? a.usuario_id)
    const warn = n !== null && enAlineaciones.length
      ? `\n\n⚠️ Está en la alineación de la Jornada ${etiquetaJornada(data.jornadas, n)} de: ${enAlineaciones.join(', ')}. Esa alineación quedará incompleta y puntuará 0 si no se cambia (Admin > Usuarios).`
      : ''
    if (!confirm(`¿Borrar a ${j.name}? Se borrará también su historial.${warn}`)) return
    setMsg('')
    const { error } = await supabase.from('jugadores').delete().eq('id', j.id)
    if (error) { setMsg(`Error: ${error.message}`); return }
    data.refetch()
  }

  return (
    <div className="admin-scroll">
      <h3>Jugadores</h3>
      <div className="admin-view-topbar">
        <input type="search" className="admin-buscador" placeholder="Buscar por nombre, nick, nº o posición…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {msg && <p className="admin-msg admin-error">{msg}</p>}
      {q && visibles.length === 0 && <p className="admin-msg">Ningún jugador coincide con «{q}».</p>}
      <table className="admin-table">
        <thead>
          <tr><th>Nº</th><th>Nombre</th><th>Nick</th><th>Pos</th><th>Frase</th><th>Foto</th><th>leverade_id</th><th></th></tr>
        </thead>
        <tbody>
          {visibles.map(j => {
            const d = draft[j.id] ?? {}
            const val = (f: keyof Jugador) => (d[f] ?? j[f] ?? '') as string | number
            return (
              <tr key={j.id}>
                <td data-label="Nº"><input type="number" value={val('numero')} onChange={e => patch(j.id, 'numero', e.target.value === '' ? j.numero : Number(e.target.value))} /></td>
                <td data-label="Nombre"><input value={val('name')} onChange={e => patch(j.id, 'name', e.target.value)} /></td>
                <td data-label="Nick"><input value={val('nick')} onChange={e => patch(j.id, 'nick', e.target.value)} /></td>
                <td data-label="Pos">
                  <select value={val('pos')} onChange={e => patch(j.id, 'pos', e.target.value)}>
                    {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </td>
                <td data-label="Frase"><input value={val('phrase')} onChange={e => patch(j.id, 'phrase', e.target.value)} /></td>
                <td className="admin-foto-cell" data-label="Foto">
                  <span>{j.photo ? '✓ con foto' : 'sin foto'}</span>
                  <label className="admin-subnav-btn admin-upload">
                    {j.photo ? 'Cambiar' : 'Subir'}
                    <input type="file" accept="image/png,image/jpeg,image/webp" hidden
                      onChange={e => { const f = e.target.files?.[0]; if (f) subirFoto(j, f); e.target.value = '' }} />
                  </label>
                </td>
                <td data-label="leverade_id"><input type="number" value={val('leverade_id')} onChange={e => patch(j.id, 'leverade_id', e.target.value === '' ? null : Number(e.target.value))} /></td>
                <td className="admin-row-actions">
                  <button className="admin-subnav-btn" disabled={!draft[j.id]} onClick={() => save(j)}>Guardar</button>
                  <button className="admin-subnav-btn admin-danger" onClick={() => borrar(j)}>Borrar</button>
                </td>
              </tr>
            )
          })}
          <tr>
            <td data-label="Nº"><input type="number" value={nuevo.numero} onChange={e => setNuevo({ ...nuevo, numero: Number(e.target.value) })} /></td>
            <td data-label="Nombre"><input value={nuevo.name} onChange={e => setNuevo({ ...nuevo, name: e.target.value })} /></td>
            <td data-label="Nick"><input value={nuevo.nick} onChange={e => setNuevo({ ...nuevo, nick: e.target.value })} /></td>
            <td data-label="Pos">
              <select value={nuevo.pos} onChange={e => setNuevo({ ...nuevo, pos: e.target.value as Position })}>
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </td>
            <td data-label="Frase"><input value={nuevo.phrase} onChange={e => setNuevo({ ...nuevo, phrase: e.target.value })} /></td>
            <td className="admin-foto-cell" data-label="Foto">
              <label className="admin-subnav-btn admin-upload">
                {nuevaFoto ? nuevaFoto.name.slice(0, 14) : 'Subir'}
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden
                  onChange={e => setNuevaFoto(e.target.files?.[0] ?? null)} />
              </label>
            </td>
            <td data-label="leverade_id"><input value={nuevo.leverade_id} onChange={e => setNuevo({ ...nuevo, leverade_id: e.target.value })} /></td>
            <td><button className="admin-subnav-btn" onClick={crear} disabled={!nuevo.name || !nuevo.numero}>Crear</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
