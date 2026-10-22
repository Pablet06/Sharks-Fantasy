import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Jornada } from '../types'

type JornadaOrden = Pick<Jornada, 'numero' | 'orden'>

/** Mapa numero (federación) -> orden (Fantasy), para `etiquetaJornada`. */
export function useJornadas(): JornadaOrden[] {
  const [jornadas, setJornadas] = useState<JornadaOrden[]>([])

  useEffect(() => {
    supabase
      .from('jornadas')
      .select('numero, orden')
      .then(({ data, error }) => {
        if (error) console.error('Jornadas fetch error:', error)
        else setJornadas((data ?? []) as JornadaOrden[])
      })
  }, [])

  return jornadas
}
