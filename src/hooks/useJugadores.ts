import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Jugador } from '../types'

export function useJugadores() {
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('jugadores')
      .select('*, historial(*)')
      .order('name')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else if (data) setJugadores(data as Jugador[])
        setLoading(false)
      })
  }, [])

  return { jugadores, loading, error }
}
