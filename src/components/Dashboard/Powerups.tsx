import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Jugador, Usuario, Jornada, PowerupInventario, PowerupAplicado, TipoPowerup } from '../../types'
import { jornadaAbierta } from '../../lib/jornada'
import { validarPowerup } from '../../lib/powerups'

interface Props {
  usuario: Usuario
  jugadores: Jugador[]
}

const TIPOS: { tipo: TipoPowerup; label: string; requiereObjetivo: boolean }[] = [
  { tipo: 'puntos_extra', label: '+2 puntos a un jugador', requiereObjetivo: true },
  { tipo: 'blindaje', label: 'Blindaje de tarjeta', requiereObjetivo: true },
  { tipo: 'presupuesto_extra', label: '+50€ de presupuesto', requiereObjetivo: false },
  { tipo: 'doble_ganancia', label: 'Doble ganancia en apuestas', requiereObjetivo: false },
  { tipo: 'apuesta_sin_riesgo', label: 'Apuesta sin riesgo', requiereObjetivo: false },
  { tipo: 'capitan_tardio', label: 'Capitán tardío (hasta 1h antes)', requiereObjetivo: false },
]

export function Powerups({ usuario, jugadores }: Props) {
  const [jornada, setJornada] = useState<Jornada | null | 'loading'>('loading')
  const [inventario, setInventario] = useState<PowerupInventario[]>([])
  const [aplicado, setAplicado] = useState<PowerupAplicado | null>(null)
  const [misJugadores, setMisJugadores] = useState<number[]>([])
  const [tipoElegido, setTipoElegido] = useState<TipoPowerup | ''>('')
  const [objetivo, setObjetivo] = useState('')
  const [aplicando, setAplicando] = useState(false)
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
    if (!jornada || jornada === 'loading') return
    let cancelled = false
    supabase
      .from('powerups_usuario')
      .select('*')
      .eq('usuario_id', usuario.id)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Inventario fetch error:', error)
        setInventario((data ?? []) as PowerupInventario[])
      })
    supabase
      .from('powerups_aplicados')
      .select('*')
      .eq('usuario_id', usuario.id)
      .eq('jornada', jornada.numero)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Aplicado fetch error:', error)
        setAplicado(data as PowerupAplicado | null)
        setAhora(Date.now())
      })
    supabase
      .from('alineaciones')
      .select('jugadores')
      .eq('usuario_id', usuario.id)
      .eq('jornada', jornada.numero)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Alineacion fetch error:', error)
        setMisJugadores((data?.jugadores as number[] | undefined) ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [jornada, usuario.id])

  if (jornada === 'loading') return <div className="loading-msg">Cargando...</div>

  if (jornada === null) {
    return <p className="placeholder">No hay ninguna jornada abierta para aplicar power-ups todavía.</p>
  }

  const bloqueada = ahora !== null && jornada.fecha_partido !== null &&
    new Date(jornada.fecha_partido).getTime() - ahora <= 24 * 60 * 60 * 1000

  const tipoInfo = TIPOS.find(t => t.tipo === tipoElegido)

  const aplicar = async () => {
    if (!tipoElegido) { setMsg('Elige un power-up.'); return }
    const objetivoNum = tipoInfo?.requiereObjetivo ? Number(objetivo) || null : null
    const validacion = validarPowerup(tipoElegido, objetivoNum, misJugadores)
    if (!validacion.ok) { setMsg(validacion.error); return }

    setAplicando(true)
    setMsg('')
    const { data, error } = await supabase
      .from('powerups_aplicados')
      .insert({ usuario_id: usuario.id, jornada: jornada.numero, tipo: tipoElegido, objetivo: objetivoNum })
      .select()
      .single()
    if (error) {
      setMsg(`Error: ${error.message}`)
    } else {
      setAplicado(data as PowerupAplicado)
      setInventario(prev => prev.map(p => p.tipo === tipoElegido ? { ...p, disponibles: p.disponibles - 1 } : p))
      setMsg('✓ Power-up aplicado')
    }
    setAplicando(false)
  }

  return (
    <div className="powerups-container">
      <div className="team-total-pts">
        <span>Jornada {jornada.numero} — power-ups</span>
      </div>

      <ul className="powerups-inventario">
        {TIPOS.map(({ tipo, label }) => {
          const item = inventario.find(p => p.tipo === tipo)
          return (
            <li key={tipo} className="powerup-row">
              <span>{label}</span>
              <strong>{item?.disponibles ?? 0}</strong>
            </li>
          )
        })}
      </ul>

      {aplicado ? (
        <p className="placeholder">
          Ya aplicaste "{TIPOS.find(t => t.tipo === aplicado.tipo)?.label ?? aplicado.tipo}" esta jornada
          {aplicado.objetivo !== null && ` (objetivo: dorsal ${aplicado.objetivo})`}.
        </p>
      ) : bloqueada ? (
        <p className="placeholder">Jornada bloqueada — ya no se pueden aplicar power-ups.</p>
      ) : (
        <div className="powerup-aplicar">
          <select value={tipoElegido} onChange={e => { setTipoElegido(e.target.value as TipoPowerup | ''); setObjetivo('') }}>
            <option value="">— Elige un power-up —</option>
            {TIPOS.map(({ tipo, label }) => (
              <option key={tipo} value={tipo} disabled={(inventario.find(p => p.tipo === tipo)?.disponibles ?? 0) <= 0}>
                {label} ({inventario.find(p => p.tipo === tipo)?.disponibles ?? 0})
              </option>
            ))}
          </select>

          {tipoInfo?.requiereObjetivo && (
            <select value={objetivo} onChange={e => setObjetivo(e.target.value)}>
              <option value="">— Jugador objetivo —</option>
              {jugadores.filter(j => misJugadores.includes(j.numero)).map(j => (
                <option key={j.numero} value={String(j.numero)}>{j.nick || j.name}</option>
              ))}
            </select>
          )}

          {msg && <p className="admin-msg">{msg}</p>}
          <button className="save-btn" onClick={aplicar} disabled={aplicando}>
            {aplicando ? 'Aplicando...' : 'Aplicar power-up'}
          </button>
        </div>
      )}
    </div>
  )
}
