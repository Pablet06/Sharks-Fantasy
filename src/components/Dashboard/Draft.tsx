import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import type { Jugador, Usuario, Jornada, Alineacion, Position } from '../../types'
import { calcPrecio } from '../../lib/precio'
import { jornadaAbierta } from '../../lib/jornada'
import { validarDraft, contarPosiciones, COMPOSICION } from '../../lib/draft'
import { PlayerCard } from './PlayerCard'

interface Props {
  usuario: Usuario
  jugadores: Jugador[]
}

const POSITIONS = ['Todos', 'Portero', 'Boya', 'Extremo', 'Lateral', 'Contraboya']
const PRESUPUESTO_BASE = 1000

export function Draft({ usuario, jugadores }: Props) {
  const [jornada, setJornada] = useState<Jornada | null | 'loading'>('loading')
  const [alineacion, setAlineacion] = useState<Alineacion | null>(null)
  const [presupuesto, setPresupuesto] = useState(PRESUPUESTO_BASE)
  const [seleccion, setSeleccion] = useState<number[]>([])
  const [capitan, setCapitan] = useState<number | null>(null)
  const [posFilter, setPosFilter] = useState('Todos')
  const [selectedCard, setSelectedCard] = useState<Jugador | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')
  const [ahora, setAhora] = useState<number | null>(null)
  const [tieneCapitanTardio, setTieneCapitanTardio] = useState(false)
  const [modalAbierto, setModalAbierto] = useState(false)

  const precios = useMemo(() => {
    const m: Record<number, number> = {}
    for (const j of jugadores) m[j.numero] = calcPrecio(j.historial ?? [], j.historial_anterior ?? [])
    return m
  }, [jugadores])

  const posiciones = useMemo(() => {
    const m: Record<number, Position> = {}
    for (const j of jugadores) m[j.numero] = j.pos
    return m
  }, [jugadores])

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
    if (!jornada || jornada === 'loading') return
    let cancelled = false
    supabase
      .from('alineaciones')
      .select('*')
      .eq('usuario_id', usuario.id)
      .eq('jornada', jornada.numero)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Alineacion fetch error:', error)
        const a = data as Alineacion | null
        setAlineacion(a)
        setSeleccion(a?.jugadores ?? [])
        setCapitan(a?.capitan ?? null)
        setAhora(Date.now())
      })

    supabase
      .rpc('presupuesto_actual', { p_usuario_id: usuario.id, p_jornada: jornada.numero })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Presupuesto fetch error:', error)
        setPresupuesto(typeof data === 'number' ? data : PRESUPUESTO_BASE)
      })

    supabase
      .from('powerups_aplicados')
      .select('tipo')
      .eq('usuario_id', usuario.id)
      .eq('jornada', jornada.numero)
      .eq('tipo', 'capitan_tardio')
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Powerup capitan_tardio fetch error:', error)
        setTieneCapitanTardio(data !== null)
      })
    return () => {
      cancelled = true
    }
  }, [jornada, usuario.id])

  if (jornada === 'loading') return <div className="loading-msg">Cargando...</div>

  if (jornada === null) {
    return <p className="placeholder">No hay ninguna jornada abierta para draftear todavía.</p>
  }

  // Bloqueada si ya se resolvió (puntos_jornada asignado) O si el deadline
  // ya pasó aunque la jornada aún no se haya resuelto (el sitio puede
  // quedarse abierto en una pestaña desde antes del cierre) — sin esto, un
  // intento de guardar tras el deadline solo fallaría con el error crudo de
  // la RLS en vez de explicarlo antes de intentarlo.
  const pasadoDeadline = ahora !== null && jornada.fecha_partido !== null &&
    new Date(jornada.fecha_partido).getTime() - ahora <= 24 * 60 * 60 * 1000
  const bloqueada = pasadoDeadline || (alineacion !== null && alineacion.puntos_jornada !== null)
  const pasadoDeadlineCapitan = ahora !== null && jornada.fecha_partido !== null &&
    new Date(jornada.fecha_partido).getTime() - ahora <= 60 * 60 * 1000
  const puedeEditarCapitanTarde = bloqueada && tieneCapitanTardio && !pasadoDeadlineCapitan &&
    alineacion !== null && alineacion.puntos_jornada === null

  const usado = seleccion.reduce((sum, n) => sum + (precios[n] ?? 0), 0)

  const toggleJugador = (numero: number) => {
    if (bloqueada) return
    setSeleccion(prev => {
      if (prev.includes(numero)) {
        if (capitan === numero) setCapitan(null)
        return prev.filter(n => n !== numero)
      }
      if (prev.length >= 7) return prev
      return [...prev, numero]
    })
  }

  const guardar = async () => {
    // Re-check lock at call time (not render time) to catch deadline/resolution changes in idle tabs
    const pasadoDeadlineNow = jornada.fecha_partido !== null &&
      new Date(jornada.fecha_partido).getTime() - Date.now() <= 24 * 60 * 60 * 1000
    const bloqueadaNow = pasadoDeadlineNow || (alineacion !== null && alineacion.puntos_jornada !== null)
    if (bloqueadaNow) {
      setMsg('Esta jornada ya está bloqueada.')
      return
    }

    const validacion = validarDraft(seleccion, capitan, precios, presupuesto, posiciones)
    if (!validacion.ok) { setMsg(validacion.error); return }
    setGuardando(true)
    setMsg('')
    const { data, error } = await supabase.from('alineaciones').upsert({
      usuario_id: usuario.id,
      jornada: jornada.numero,
      jugadores: seleccion,
      capitan,
      presupuesto_usado: usado,
    }, { onConflict: 'usuario_id,jornada' }).select().single()
    if (error) {
      setMsg(`Error: ${error.message}`)
    } else {
      setAlineacion(data as Alineacion)
      setMsg('✓ Alineación guardada')
      setModalAbierto(false)
    }
    setGuardando(false)
  }

  // Cancelar el modal descarta los cambios sin guardar
  const cerrarModal = () => {
    setSeleccion(alineacion?.jugadores ?? [])
    setCapitan(alineacion?.capitan ?? null)
    setMsg('')
    setModalAbierto(false)
  }

  const cambiarCapitanTarde = async (nuevoCapitan: number) => {
    if (!alineacion) return
    const { error } = await supabase
      .from('alineaciones')
      .update({ capitan: nuevoCapitan })
      .eq('usuario_id', usuario.id)
      .eq('jornada', jornada.numero)
    if (error) {
      setMsg(`Error: ${error.message}`)
    } else {
      setAlineacion(prev => prev && { ...prev, capitan: nuevoCapitan })
      setMsg('✓ Capitán actualizado')
    }
  }

  const cuentaPos = contarPosiciones(seleccion, posiciones)
  const filtrados = jugadores.filter(j => posFilter === 'Todos' || j.pos === posFilter)
  const orden = jornada.orden ?? jornada.numero

  // Editor: chips + lista + guardar. Va inline si no hay alineación, o dentro del modal.
  const editor = (
    <>
      {!bloqueada && (
        <div className="filter-chips">
          {POSITIONS.map(pos => (
            <button
              key={pos}
              className={`filter-chip ${posFilter === pos ? 'active-all' : ''}`}
              onClick={() => setPosFilter(pos)}
            >
              {pos}
            </button>
          ))}
        </div>
      )}

      {!bloqueada && (
        <div className="composicion">
          {(Object.keys(COMPOSICION) as Position[]).map(p => (
            <span key={p} className={`composicion-item ${cuentaPos[p] === COMPOSICION[p] ? 'ok' : cuentaPos[p] > COMPOSICION[p] ? 'sobra' : ''}`}>
              {p} {cuentaPos[p]}/{COMPOSICION[p]}
            </span>
          ))}
        </div>
      )}

      <ul className="players-list">
        {filtrados.map(j => {
          const elegido = seleccion.includes(j.numero)
          return (
            <li key={j.id} className={`player-row ${elegido ? 'current-user' : ''}`}>
              <img
                src={j.photo || '/Sharks-Fantasy/jugadores/predeterminado.png'}
                alt={j.nick || j.name}
                className="player-row-photo"
                onClick={() => setSelectedCard(j)}
              />
              <div className="player-row-info" onClick={() => setSelectedCard(j)}>
                <strong>{j.nick || j.name}</strong>
                <span className={`pos-badge pos-${j.pos.toLowerCase()}`}>{j.pos}</span>
              </div>
              <span className="player-row-pts">{precios[j.numero]}€</span>
              {!bloqueada && (
                <>
                  <button
                    className={`draft-pick-btn ${elegido ? 'active' : ''}`}
                    onClick={() => toggleJugador(j.numero)}
                    disabled={!elegido && seleccion.length >= 7}
                  >
                    {elegido ? '✓' : '+'}
                  </button>
                  {elegido && (
                    <button
                      className={`draft-capitan-btn ${capitan === j.numero ? 'active' : ''}`}
                      onClick={() => setCapitan(j.numero)}
                      title="Marcar como capitán"
                    >
                      ★
                    </button>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>

      {!bloqueada && (
        <>
          {msg && <p className="admin-msg">{msg}</p>}
          <button className="save-btn" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : `Guardar (${seleccion.length}/7)`}
          </button>
        </>
      )}
    </>
  )

  // Resumen de la alineación guardada (con datos guardados, no con la selección en edición)
  const guardados = alineacion?.jugadores ?? []
  const costeGuardado = guardados.reduce((sum, n) => sum + (precios[n] ?? 0), 0)

  return (
    <div className="draft-container">
      <div className="team-total-pts team-puntos">
        <span>Puntos</span>
        <strong>{usuario.puntos}</strong>
      </div>

      <div className="team-total-pts team-dinero">
        <span>Jornada {orden}</span>
        <strong>{presupuesto - usado}€</strong>
      </div>

      {jornada.fecha_partido && !bloqueada && (
        <p className="placeholder">
          Cierra el {new Date(jornada.fecha_partido).toLocaleString('es-ES', {
            dateStyle: 'medium', timeStyle: 'short',
          })}
        </p>
      )}

      {bloqueada && (
        <>
          <p className="placeholder">
            Alineación bloqueada para esta jornada
            {alineacion && alineacion.puntos_jornada !== null && ` — ${alineacion.puntos_jornada} pts`}
          </p>

          {puedeEditarCapitanTarde && (
            <div className="powerup-aplicar">
              <span>Capitán tardío: puedes cambiar el capitán hasta 1h antes del partido.</span>
              <select
                value={alineacion?.capitan ?? ''}
                onChange={e => cambiarCapitanTarde(Number(e.target.value))}
              >
                {(alineacion?.jugadores ?? []).map(numero => {
                  const j = jugadores.find(x => x.numero === numero)
                  return <option key={numero} value={numero}>{j?.nick || j?.name || numero}</option>
                })}
              </select>
              {msg && <p className="admin-msg">{msg}</p>}
            </div>
          )}
        </>
      )}

      {alineacion ? (
        <div className="resumen-card">
          <div className="mini-pool">
            {guardados.map(n => {
              const p = jugadores.find(j => j.numero === n)
              if (!p) return null
              return (
                <button key={n} className="mini-player" onClick={() => setSelectedCard(p)}>
                  <img src={p.photo || '/Sharks-Fantasy/jugadores/predeterminado.png'} alt={p.nick || p.name} />
                  <span>{p.nick || p.name}{alineacion.capitan === n ? ' ★' : ''}</span>
                  <small className="mini-pos">{p.pos}</small>
                  <small className="mini-precio">{precios[n]}€</small>
                </button>
              )
            })}
          </div>
          <p className="placeholder">
            Coste: {costeGuardado}€ · <span className="resumen-restante">Te quedan {presupuesto - costeGuardado}€</span>
          </p>
          {!bloqueada && msg && <p className="admin-msg">{msg}</p>}
          {!bloqueada && (
            <button className="save-btn" onClick={() => setModalAbierto(true)}>
              Cambiar Fichajes
            </button>
          )}
        </div>
      ) : (
        editor
      )}

      {alineacion && !bloqueada && modalAbierto && (
        <div className="modal-overlay" onClick={cerrarModal}>
          <div className="team-modal team-modal-wide" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={cerrarModal}>×</button>
            <h3>Cambiar Fichajes</h3>
            <div className="modal-stack">
              <p className="placeholder">Te quedan {presupuesto - usado}€</p>
              {editor}
            </div>
          </div>
        </div>
      )}

      {selectedCard && <PlayerCard jugador={selectedCard} onClose={() => setSelectedCard(null)} />}
    </div>
  )
}
