import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Jugador } from '../types'

export function useJugadores() {
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const cargar = async () => {
      let res = await supabase
        .from('jugadores')
        .select('*, historial(*), historial_anterior(*)')
        .order('name')
      // Si la tabla historial_anterior aún no existe (migración pendiente), el
      // embed falla: reintentamos sin ella para no dejar la lista vacía.
      if (res.error) {
        res = await supabase.from('jugadores').select('*, historial(*)').order('name')
      }
      if (res.error) setError(res.error.message)
      else if (res.data) setJugadores(res.data as Jugador[])
      setLoading(false)
    }
    cargar()
  }, [])

  return { jugadores, loading, error }
}
