import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import type { Jugador, Usuario, Jornada, Alineacion } from '../../types'
import { calcPrecio } from '../../lib/precio'
import { jornadaAbierta } from '../../lib/jornada'
import { validarDraft } from '../../lib/draft'
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

  const precios = useMemo(() => {
    const m: Record<number, number> = {}
    for (const j of jugadores) m[j.numero] = calcPrecio(j.historial ?? [])
    return m
  }, [jugadores])

  useEffect(() => {
    supabase
      .from('jornadas')
      .select('*')
      .then(({ data }) => {
        const abiertas = (data ?? []) as Jornada[]
        const n = jornadaAbierta(abiertas)
        setJornada(n === null ? null : abiertas.find(j => j.numero === n) ?? null)
      })
  }, [])

  useEffect(() => {
    if (!jornada || jornada === 'loading') return
    supabase
      .from('alineaciones')
      .select('*')
      .eq('usuario_id', usuario.id)
      .eq('jornada', jornada.numero)
      .maybeSingle()
      .then(({ data }) => {
        const a = data as Alineacion | null
        setAlineacion(a)
        setSeleccion(a?.jugadores ?? [])
        setCapitan(a?.capitan ?? null)
      })

    supabase
      .rpc('presupuesto_actual', { p_usuario_id: usuario.id, p_jornada: jornada.numero })
      .then(({ data }) => setPresupuesto(typeof data === 'number' ? data : PRESUPUESTO_BASE))
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
  const pasadoDeadline = jornada.fecha_partido !== null &&
    new Date(jornada.fecha_partido).getTime() - Date.now() <= 24 * 60 * 60 * 1000
  const bloqueada = pasadoDeadline || (alineacion !== null && alineacion.puntos_jornada !== null)
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

    const validacion = validarDraft(seleccion, capitan, precios, presupuesto)
    if (!validacion.ok) { setMsg(validacion.error); return }
    setGuardando(true)
    setMsg('')
    const { error } = await supabase.from('alineaciones').upsert({
      usuario_id: usuario.id,
      jornada: jornada.numero,
      jugadores: seleccion,
      capitan,
      presupuesto_usado: usado,
    }, { onConflict: 'usuario_id,jornada' })
    setMsg(error ? `Error: ${error.message}` : '✓ Alineación guardada')
    setGuardando(false)
  }

  const filtrados = jugadores.filter(j => posFilter === 'Todos' || j.pos === posFilter)

  return (
    <div className="draft-container">
      <div className="team-total-pts">
        <span>Jornada {jornada.numero} — presupuesto</span>
        <strong>{presupuesto - usado}€ <small>de {presupuesto}€</small></strong>
      </div>

      {bloqueada && (
        <p className="placeholder">
          Alineación bloqueada para esta jornada
          {alineacion && alineacion.puntos_jornada !== null && ` — ${alineacion.puntos_jornada} pts`}
        </p>
      )}

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

      {selectedCard && <PlayerCard jugador={selectedCard} onClose={() => setSelectedCard(null)} />}
    </div>
  )
}
