import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Jornada } from '../../types'
import { faseJuego } from '../../lib/jornada'

/** Franja bajo la cabecera con la fase del juego (fichajes abiertos, cerrados, post-partido, esperando fecha). */
export function FaseBanner() {
  const [jornadas, setJornadas] = useState<Jornada[] | null>(null)
  const [ahora, setAhora] = useState(() => new Date())

  useEffect(() => {
    supabase
      .from('jornadas')
      .select('*')
      .then(({ data, error }) => {
        if (error) console.error('Jornadas fetch error:', error)
        else setJornadas((data ?? []) as Jornada[])
      })
    const id = setInterval(() => setAhora(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  if (jornadas === null) return null
  const { fase, etiqueta, detalle } = faseJuego(jornadas, ahora)
  return (
    <div className={`fase-banner fase-${fase}`} role="status">
      <span className="fase-dot" aria-hidden="true" />
      <strong>{etiqueta}</strong>
      <span className="fase-detalle">{detalle}</span>
    </div>
  )
}
