import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Jugador, Usuario, Jornada, Apuesta } from '../../types'
import { jornadaAbierta } from '../../lib/jornada'
import { validarApuestas } from '../../lib/apuestas'

interface Props {
  usuario: Usuario
  jugadores: Jugador[]
}

type Tipo = 'resultado' | 'goleador' | 'expulsado' | 'porteria'

const TIPOS: { tipo: Tipo; label: string }[] = [
  { tipo: 'resultado', label: 'Resultado del partido' },
  { tipo: 'goleador', label: 'Máximo goleador' },
  { tipo: 'expulsado', label: 'Más expulsado' },
  { tipo: 'porteria', label: 'Portería: menos de 8 goles' },
]

interface Fila {
  seleccion: string
  importe: string
  cuota: number | null
}

const filaVacia = (seleccion = ''): Fila => ({ seleccion, importe: '', cuota: null })

export function Apuestas({ usuario, jugadores }: Props) {
  const [jornada, setJornada] = useState<Jornada | null | 'loading'>('loading')
  const [existentes, setExistentes] = useState<Apuesta[]>([])
  const [presupuesto, setPresupuesto] = useState(1000)
  const [filas, setFilas] = useState<Record<Tipo, Fila>>({
    resultado: filaVacia(),
    goleador: filaVacia(),
    expulsado: filaVacia(),
    porteria: filaVacia('si'),
  })
  const [resultados, setResultados] = useState<Apuesta[]>([])
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')
  const [ahora, setAhora] = useState<number | null>(null)

  useEffect(() => {
    supabase
      .from('jornadas')
      .select('*')
      .then(({ data, error }) => {
        if (error) console.error('Jornadas fetch error:', error)
        const abiertas = (data ?? []) as Jornada[]
        const n = jornadaAbierta(abiertas)
        setJornada(n === null ? null : abiertas.find(j => j.numero === n) ?? null)
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    supabase
      .from('apuestas')
      .select('*')
      .eq('usuario_id', usuario.id)
      .eq('resuelto', true)
      .order('jornada', { ascending: false })
      .limit(4)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Resultados fetch error:', error)
        const rows = (data ?? []) as Apuesta[]
        const ultimaJornada = rows.length ? Math.max(...rows.map(r => r.jornada)) : null
        setResultados(ultimaJornada === null ? [] : rows.filter(r => r.jornada === ultimaJornada))
      })
    return () => {
      cancelled = true
    }
  }, [usuario.id])

  useEffect(() => {
    if (!jornada || jornada === 'loading') return
    let cancelled = false
    supabase
      .from('apuestas')
      .select('*')
      .eq('usuario_id', usuario.id)
      .eq('jornada', jornada.numero)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Apuestas fetch error:', error)
        const rows = (data ?? []) as Apuesta[]
        setExistentes(rows)
        setFilas(prev => {
          const next = { ...prev }
          for (const r of rows) {
            next[r.tipo] = { seleccion: r.seleccion, importe: String(r.importe), cuota: r.cuota }
          }
          return next
        })
        setAhora(Date.now())
      })
    supabase
      .rpc('presupuesto_actual', { p_usuario_id: usuario.id, p_jornada: jornada.numero })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Presupuesto fetch error:', error)
        setPresupuesto(typeof data === 'number' ? data : 1000)
      })
    return () => {
      cancelled = true
    }
  }, [jornada, usuario.id])

  const actualizarCuota = async (tipo: Tipo, seleccion: string, jornadaNumero: number) => {
    if (!seleccion) return
    const { data, error } = await supabase.rpc('cuota_actual', {
      p_tipo: tipo, p_seleccion: seleccion, p_jornada: jornadaNumero,
    })
    if (error) { console.error('Cuota fetch error:', error); return }
    setFilas(prev => ({ ...prev, [tipo]: { ...prev[tipo], cuota: typeof data === 'number' ? data : null } }))
  }

  useEffect(() => {
    if (!jornada || jornada === 'loading') return
    supabase.rpc('cuota_actual', { p_tipo: 'porteria', p_seleccion: 'si', p_jornada: jornada.numero })
      .then(({ data, error }) => {
        if (error) { console.error('Cuota fetch error:', error); return }
        setFilas(prev => ({ ...prev, porteria: { ...prev.porteria, cuota: typeof data === 'number' ? data : null } }))
      })
  }, [jornada])

  if (jornada === 'loading') return <div className="loading-msg">Cargando...</div>

  if (jornada === null) {
    return <p className="placeholder">No hay ninguna jornada abierta para apostar todavía.</p>
  }

  const bloqueada = ahora !== null && jornada.fecha_partido !== null &&
    new Date(jornada.fecha_partido).getTime() - ahora <= 24 * 60 * 60 * 1000

  const setSeleccion = (tipo: Tipo, seleccion: string) => {
    setFilas(prev => ({ ...prev, [tipo]: { ...prev[tipo], seleccion, cuota: null } }))
    actualizarCuota(tipo, seleccion, jornada.numero)
  }

  const setImporte = (tipo: Tipo, importe: string) => {
    setFilas(prev => ({ ...prev, [tipo]: { ...prev[tipo], importe } }))
  }

  const guardar = async () => {
    const pasadoDeadlineNow = jornada.fecha_partido !== null &&
      new Date(jornada.fecha_partido).getTime() - Date.now() <= 24 * 60 * 60 * 1000
    if (pasadoDeadlineNow) { setMsg('Esta jornada ya está bloqueada.'); return }

    const activas = TIPOS
      .map(({ tipo }) => ({ tipo, seleccion: filas[tipo].seleccion, importe: Number(filas[tipo].importe) || 0 }))
      .filter(a => a.seleccion && a.importe > 0)

    if (activas.length > 0) {
      const validacion = validarApuestas(activas, presupuesto)
      if (!validacion.ok) { setMsg(validacion.error); return }
    }

    setGuardando(true)
    setMsg('')

    const idsABorrar = existentes
      .filter(e => !activas.some(a => a.tipo === e.tipo))
      .map(e => e.id)
    if (idsABorrar.length > 0) {
      const { error: errorBorrar } = await supabase.from('apuestas').delete().in('id', idsABorrar)
      if (errorBorrar) { setMsg(`Error: ${errorBorrar.message}`); setGuardando(false); return }
    }

    if (activas.length > 0) {
      const { error } = await supabase.from('apuestas').upsert(
        activas.map(a => ({
          usuario_id: usuario.id,
          jornada: jornada.numero,
          tipo: a.tipo,
          seleccion: a.seleccion,
          importe: a.importe,
        })),
        { onConflict: 'usuario_id,jornada,tipo' },
      )
      if (error) { setMsg(`Error: ${error.message}`); setGuardando(false); return }
    }

    setMsg('✓ Apuestas guardadas')
    setGuardando(false)
  }

  return (
    <div className="apuestas-container">
      <div className="team-total-pts">
        <span>Jornada {jornada.numero} — presupuesto</span>
        <strong>{Math.round(presupuesto)}€</strong>
      </div>

      {resultados.length > 0 && (
        <div className="apuestas-list">
          <p className="placeholder">Resultado de tus apuestas de la jornada {resultados[0].jornada}:</p>
          {resultados.map(previa => (
            <div key={previa.id} className="apuesta-row">
              <span>{TIPOS.find(t => t.tipo === previa.tipo)?.label ?? previa.tipo}: {previa.seleccion} — {previa.importe}€ a {previa.cuota}x</span>
              <span className={(previa.ganancia ?? 0) > 0 ? 'pts-positive' : (previa.ganancia ?? 0) < 0 ? 'pts-negative' : ''}>
                {previa.acierto === null ? 'empate' : previa.acierto ? 'acierto' : 'fallo'} ({previa.ganancia}€)
              </span>
            </div>
          ))}
        </div>
      )}

      {bloqueada ? (
        <div className="apuestas-list">
          {TIPOS.map(({ tipo, label }) => {
            const previa = existentes.find(a => a.tipo === tipo)
            if (!previa) return null
            return (
              <div key={tipo} className="apuesta-row">
                <span>{label}: {previa.seleccion} — {previa.importe}€ a {previa.cuota}x</span>
                {previa.resuelto && (
                  <span className={(previa.ganancia ?? 0) > 0 ? 'pts-positive' : (previa.ganancia ?? 0) < 0 ? 'pts-negative' : ''}>
                    {previa.acierto === null ? 'empate' : previa.acierto ? 'acierto' : 'fallo'} ({previa.ganancia}€)
                  </span>
                )}
              </div>
            )
          })}
          {existentes.length === 0 && <p className="placeholder">No apostaste nada esta jornada.</p>}
        </div>
      ) : (
        <>
          {TIPOS.map(({ tipo, label }) => (
            <div key={tipo} className="apuesta-row">
              <span>{label}</span>
              {tipo === 'resultado' && (
                <select value={filas.resultado.seleccion} onChange={e => setSeleccion('resultado', e.target.value)} aria-label={label}>
                  <option value="">—</option>
                  <option value="gana">Gana</option>
                  <option value="pierde">Pierde</option>
                  <option value="empata">Empata</option>
                </select>
              )}
              {(tipo === 'goleador' || tipo === 'expulsado') && (
                <select value={filas[tipo].seleccion} onChange={e => setSeleccion(tipo, e.target.value)} aria-label={label}>
                  <option value="">—</option>
                  {jugadores.map(j => (
                    <option key={j.numero} value={String(j.numero)}>{j.nick || j.name}</option>
                  ))}
                </select>
              )}
              {tipo === 'porteria' && <span>¿Menos de 8 goles?</span>}
              {filas[tipo].cuota !== null && <span className="apuesta-cuota">{filas[tipo].cuota}x</span>}
              <input
                type="number"
                placeholder="Importe €"
                value={filas[tipo].importe}
                onChange={e => setImporte(tipo, e.target.value)}
                aria-label={`Importe para ${label}`}
              />
            </div>
          ))}
          {msg && <p className="admin-msg">{msg}</p>}
          <button className="save-btn" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar apuestas'}
          </button>
        </>
      )}
    </div>
  )
}
