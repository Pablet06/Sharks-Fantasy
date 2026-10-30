import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Usuario, Position } from '../../types'
import type { useAdminData } from '../../hooks/useAdminData'
import { jornadaEnCurso, ultimaJornadaResuelta } from '../../lib/jornada'
import { filaAlineacionAdmin } from '../../lib/draft'
import { coincide } from '../../lib/busqueda'

interface Props { data: ReturnType<typeof useAdminData> }
interface AlineacionDraft { jugadores: (number | null)[]; capitan: number | null }

export function UsuariosAdmin({ data }: Props) {
  const [draft, setDraft] = useState<Record<string, Partial<Usuario>>>({})
  // Borrador de alineaciones, aparte del de `nombre`; se vacía al cambiar de jornada.
  const [alDraft, setAlDraft] = useState<Record<string, AlineacionDraft>>({})
  // `numero` de federación (nunca el `orden`). Por defecto, la misma jornada que Mi Equipo.
  const [jornadaSel, setJornadaSel] = useState<number | null>(
    () => jornadaEnCurso(data.jornadas) ?? ultimaJornadaResuelta(data.jornadas)?.numero ?? null,
  )
  const [msg, setMsg] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [myId, setMyId] = useState<string | null>(null)

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null)) }, [])

  const byNumero = new Map(data.jugadores.map(j => [j.numero, j]))
  const posiciones: Record<number, Position> = Object.fromEntries(data.jugadores.map(j => [j.numero, j.pos]))
  const jornada = data.jornadas.find(j => j.numero === jornadaSel)
  const etiqueta = (n: number) => {
    const j = byNumero.get(n)
    return j ? `${j.numero} ${j.name} (${j.pos[0]})` : `#${n} (no existe)`
  }

  const visibles = data.usuarios.filter(u => coincide(q, u.nombre))

  const patch = (id: string, field: string, value: unknown) =>
    setDraft(d => ({ ...d, [id]: { ...d[id], [field]: value } }))

  const toggleAdmin = async (u: Usuario) => {
    setMsg('')
    const { error } = await supabase.from('usuarios').update({ is_admin: !u.is_admin }).eq('id', u.id)
    if (error) setMsg(`Error: ${error.message}`); else data.refetch()
  }

  const saveNombre = async (u: Usuario) => {
    const nombre = draft[u.id]?.nombre
    if (nombre == null || nombre === u.nombre) return
    setMsg('')
    const { error } = await supabase.from('usuarios').update({ nombre }).eq('id', u.id)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setDraft(d => { const rest = { ...d }; delete rest[u.id]; return rest })
    data.refetch()
  }

  const setSlot = (u: Usuario, actual: AlineacionDraft, idx: number, numero: number | null) => {
    const jugadores = [...actual.jugadores]
    jugadores[idx] = numero
    // Si el capitán sale del 7, se vacía y hay que elegir otro.
    const capitan = actual.capitan !== null && jugadores.includes(actual.capitan) ? actual.capitan : null
    setAlDraft(d => ({ ...d, [u.id]: { jugadores, capitan } }))
  }

  const saveAlineacion = async (u: Usuario) => {
    const d = alDraft[u.id]
    if (!d || !jornada) return
    setMsg('')
    const al = data.alineaciones.find(a => a.usuario_id === u.id && a.jornada === jornada.numero)
    const yaPuntuada = jornada.finalizado || al?.puntos_jornada != null
    const r = filaAlineacionAdmin(u.id, jornada.numero, yaPuntuada, d.jugadores, d.capitan, posiciones)
    if (!r.ok) { setMsg(r.error); return }
    if (yaPuntuada && !confirm(
      `La Jornada ${jornada.orden} ya está puntuada. Se recalcularán sus puntos (resolver_jornada) para todos.` +
      (al ? '' : ` ${u.nombre} no tenía alineación: recibirá puntos retroactivos.`) +
      ' Si quitas al objetivo de un +2 o Blindaje, ese power-up deja de aplicar. ¿Seguir?',
    )) return
    setBusy(true)
    const { error } = await supabase.from('alineaciones').upsert(r.fila, { onConflict: 'usuario_id,jornada' })
    if (error) { setBusy(false); setMsg(`Error: ${error.message}`); return }
    if (r.reprocesar) {
      const { error: rpcError } = await supabase.rpc('resolver_jornada', { p_jornada: jornada.numero })
      if (rpcError) setMsg(`Alineación guardada pero sin puntuar: usa Sync > Reprocesar jornada ${jornada.numero} (${rpcError.message})`)
    }
    setBusy(false)
    setAlDraft(prev => { const rest = { ...prev }; delete rest[u.id]; return rest })
    data.refetch()
  }

  const borrar = async (u: Usuario) => {
    if (!confirm(`¿Borrar la cuenta de ${u.nombre}? Es irreversible.`)) return
    setBusy(true); setMsg('')
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ target_user_id: u.id }),
    })
    setBusy(false)
    if (res.ok) data.refetch()
    else setMsg(`Error borrando: ${(await res.json().catch(() => ({}))).error ?? res.status}`)
  }

  return (
    <div className="admin-scroll">
      <h3>Usuarios</h3>
      <div className="admin-view-topbar">
        <label>Jornada{' '}
          <select value={jornadaSel ?? ''} onChange={e => { setAlDraft({}); setJornadaSel(Number(e.target.value)) }}>
            {jornadaSel === null && <option value="">—</option>}
            {data.jornadas.map(j => (
              <option key={j.numero} value={j.numero}>
                J{j.orden} · fed. {j.numero}{j.finalizado ? ' · resuelta' : ''}
              </option>
            ))}
          </select>
        </label>
        <input type="search" className="admin-buscador" placeholder="Buscar usuario…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {msg && <p className="admin-msg admin-error">{msg}</p>}
      {q && visibles.length === 0 && <p className="admin-msg">Ningún usuario coincide con «{q}».</p>}
      <table className="admin-table">
        <thead><tr><th>Nombre</th><th>Puntos</th><th>Admin</th><th>Alineación (★ = capitán)</th><th>Pts jornada</th><th></th></tr></thead>
        <tbody>
          {visibles.map(u => {
            const al = data.alineaciones.find(a => a.usuario_id === u.id && a.jornada === jornadaSel)
            const base = alDraft[u.id] ?? { jugadores: al?.jugadores ?? [], capitan: al?.capitan ?? null }
            const actual = { jugadores: Array.from({ length: 7 }, (_, i) => base.jugadores[i] ?? null), capitan: base.capitan }
            const elegidos = [...new Set(actual.jugadores.filter((n): n is number => n !== null))]
            return (
              <tr key={u.id}>
                <td data-label="Nombre"><input value={draft[u.id]?.nombre ?? u.nombre} onChange={e => patch(u.id, 'nombre', e.target.value)} onBlur={() => saveNombre(u)} /></td>
                <td data-label="Puntos">{u.puntos}</td>
                <td data-label="Admin"><input type="checkbox" checked={u.is_admin} disabled={u.id === myId} onChange={() => toggleAdmin(u)} /></td>
                <td data-label="Alineación" className="admin-alineacion-cell">
                  <div className="admin-alineacion">
                    {actual.jugadores.map((n, i) => (
                      <select key={i} value={n ?? ''} onChange={e => setSlot(u, actual, i, e.target.value ? Number(e.target.value) : null)}>
                        <option value="">—</option>
                        {n !== null && !byNumero.has(n) && <option value={n}>{etiqueta(n)}</option>}
                        {data.jugadores.map(j => <option key={j.id} value={j.numero}>{etiqueta(j.numero)}</option>)}
                      </select>
                    ))}
                    <select
                      className="admin-capitan"
                      aria-label="Capitán"
                      value={actual.capitan ?? ''}
                      onChange={e => setAlDraft(d => ({ ...d, [u.id]: { jugadores: actual.jugadores, capitan: e.target.value ? Number(e.target.value) : null } }))}
                    >
                      <option value="">★ Capitán</option>
                      {elegidos.map(n => <option key={n} value={n}>{`★ ${etiqueta(n)}`}</option>)}
                    </select>
                  </div>
                </td>
                <td data-label="Pts jornada">{al?.puntos_jornada ?? '—'}</td>
                <td className="admin-row-actions">
                  <button className="admin-subnav-btn" disabled={busy || !alDraft[u.id] || !jornada} onClick={() => saveAlineacion(u)}>Guardar alineación</button>
                  <button className="admin-subnav-btn admin-danger" disabled={busy} onClick={() => borrar(u)}>Borrar</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
