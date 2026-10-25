import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { withSignedPhotos } from '../lib/photos'
import type { Jugador } from '../types'

/** Las fotos están en un bucket privado: se firman cuando hay sesión (userId). */
export function useJugadores(userId?: string) {
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
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
      if (cancelled) return
      if (res.error) setError(res.error.message)
      else if (res.data) {
        const rows = res.data as Jugador[]
        const conFotos = userId ? await withSignedPhotos(rows) : rows.map(j => ({ ...j, photo: null }))
        if (cancelled) return
        setJugadores(conFotos)
      }
      setLoading(false)
    }
    cargar()
    return () => { cancelled = true }
  }, [userId])

  return { jugadores, loading, error }
}
