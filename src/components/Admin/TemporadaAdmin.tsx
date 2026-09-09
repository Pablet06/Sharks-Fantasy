import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { useAdminData } from '../../hooks/useAdminData'

interface Props { data: ReturnType<typeof useAdminData> }

export function TemporadaAdmin({ data }: Props) {
  const [confirmEnd, setConfirmEnd] = useState('')
  const [confirmStart, setConfirmStart] = useState('')
  const [newTid, setNewTid] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const totalRows = data.jugadores.reduce((n, j) => n + (j.historial?.length ?? 0), 0)

  const terminar = async () => {
    if (confirmEnd !== 'CONFIRMAR') return
    setBusy(true)
    setMsg('')

    // 1. Export historial as a JSON download (browser Blob).
    const { data: hist, error: expErr, count } = await supabase.from('historial').select('*', { count: 'exact' })
    if (expErr || hist == null || hist.length !== count) {
      setMsg('Export incompleto, abortado — no se ha borrado nada.')
      setBusy(false)
      return
    }
    const blob = new Blob([JSON.stringify(hist, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `historial-${data.config.tournament_id}-${new Date().toISOString().slice(0, 10)}.json`,
    })
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)

    // 2. Wipe.
    // ponytail: the "match-everything" filter below is load-bearing — Supabase
    // requires a filter on every delete. jornada>=0 matches every row today;
    // revisit if column semantics change.
    const del = await supabase.from('historial').delete().gte('jornada', 0)
    if (del.error) {
      setMsg(`Borrado historial falló: ${del.error.message}`)
      setBusy(false)
      return
    }
    const { error: recalcErr } = await supabase.rpc('recalc_puntos')
    if (recalcErr) { setMsg(`historial borrado pero el recálculo falló: ${recalcErr.message}`); setBusy(false); return }

    setMsg('✓ Temporada terminada. historial vaciado, stats y puntos a cero.')
    setConfirmEnd('')
    data.refetch()
    setBusy(false)
  }

  const empezar = async () => {
    if (confirmStart !== 'CONFIRMAR' || !newTid) return
    setBusy(true)
    setMsg('')
    const { error } = await supabase.from('config').update({ value: newTid }).eq('key', 'tournament_id')
    setMsg(error ? `Error: ${error.message}` : `✓ tournament_id = ${newTid}. Lanza «npm run sync -- --backfill» para poblar.`)
    if (!error) {
      setNewTid('')
      setConfirmStart('')
      data.refetch()
    }
    setBusy(false)
  }

  return (
    <div>
      <h3>Temporada</h3>
      {msg && <p className="admin-msg">{msg}</p>}

      <section>
        <h4>Terminar temporada actual</h4>
        <p className="admin-msg">
          Descarga <code>historial</code> ({totalRows} filas) como JSON, luego lo vacía
          y pone <code>jugadores.stats</code> y <code>usuarios.puntos</code> a cero. Irreversible.
        </p>
        <label>Escribe CONFIRMAR: <input value={confirmEnd} onChange={e => setConfirmEnd(e.target.value)} /></label>
        <button className="admin-subnav-btn admin-danger" disabled={busy || confirmEnd !== 'CONFIRMAR'} onClick={terminar}>
          Terminar temporada
        </button>
      </section>

      <section>
        <h4>Empezar temporada nueva</h4>
        <p className="admin-msg">
          Cambia <code>config.tournament_id</code> (actual: <code>{data.config.tournament_id}</code>) al de
          la nueva temporada en la federación. Después: <code>npm run sync -- --backfill</code>.
        </p>
        <label>Nuevo tournament_id: <input value={newTid} onChange={e => setNewTid(e.target.value)} /></label>
        <label>Escribe CONFIRMAR: <input value={confirmStart} onChange={e => setConfirmStart(e.target.value)} /></label>
        <button className="admin-subnav-btn admin-danger" disabled={busy || confirmStart !== 'CONFIRMAR' || !newTid} onClick={empezar}>
          Cambiar tournament_id
        </button>
      </section>
    </div>
  )
}
