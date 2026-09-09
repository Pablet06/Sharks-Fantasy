import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Usuario } from '../../types'
import type { useAdminData } from '../../hooks/useAdminData'

interface Props { data: ReturnType<typeof useAdminData> }

export function UsuariosAdmin({ data }: Props) {
  const [draft, setDraft] = useState<Record<string, Partial<Usuario>>>({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [myId, setMyId] = useState<string | null>(null)

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null)) }, [])

  const byNumero = new Map(data.jugadores.map(j => [j.numero, j]))

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

  const setEquipoSlot = (u: Usuario, idx: number, numero: number) => {
    const equipo = [...(draft[u.id]?.equipo ?? u.equipo)]
    equipo[idx] = numero
    patch(u.id, 'equipo', equipo)
  }

  const saveEquipo = async (u: Usuario) => {
    const equipo = draft[u.id]?.equipo
    if (!equipo) return
    if (equipo.length !== 7 || new Set(equipo).size !== 7) {
      setMsg('El equipo debe tener 7 jugadores distintos.'); return
    }
    const porteros = equipo.filter(n => byNumero.get(n)?.pos === 'Portero').length
    if (porteros !== 1) { setMsg('El equipo debe tener exactamente 1 Portero.'); return }
    setMsg('')
    const { error } = await supabase.from('usuarios').update({ equipo }).eq('id', u.id)
    if (error) { setMsg(`Error: ${error.message}`); return }
    setDraft(d => { const rest = { ...d }; delete rest[u.id]; return rest })
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
      {msg && <p className="admin-msg admin-error">{msg}</p>}
      <table className="admin-table">
        <thead><tr><th>Nombre</th><th>Puntos</th><th>Admin</th><th>Equipo (nº)</th><th></th></tr></thead>
        <tbody>
          {data.usuarios.map(u => {
            const equipo = draft[u.id]?.equipo ?? u.equipo
            return (
              <tr key={u.id}>
                <td><input value={draft[u.id]?.nombre ?? u.nombre} onChange={e => patch(u.id, 'nombre', e.target.value)} onBlur={() => saveNombre(u)} /></td>
                <td>{u.puntos}</td>
                <td><input type="checkbox" checked={u.is_admin} disabled={u.id === myId} onChange={() => toggleAdmin(u)} /></td>
                <td>
                  <div className="admin-row-actions">
                    {equipo.map((n, i) => (
                      <select key={i} value={n} onChange={e => setEquipoSlot(u, i, Number(e.target.value))}>
                        {data.jugadores.map(j => (
                          <option key={j.id} value={j.numero}>{j.numero} {j.name} ({j.pos[0]})</option>
                        ))}
                      </select>
                    ))}
                  </div>
                </td>
                <td className="admin-row-actions">
                  <button className="admin-subnav-btn" disabled={!draft[u.id]?.equipo} onClick={() => saveEquipo(u)}>Guardar equipo</button>
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
