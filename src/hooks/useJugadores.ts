import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Jugador } from '../types'

export function useJugadores() {
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('jugadores')
      .select('*, historial(*)')
      .order('name')
      .then(({ data, error }) => {
        if (!error && data) setJugadores(data as Jugador[])
        setLoading(false)
      })
  }, [])

  return { jugadores, loading }
}
