import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Alineacion, Jornada } from '../types'
import { posicionesPorJornada, type PosicionesJornada } from '../lib/posiciones'

/**
 * Puestos por jornada y acumulados de todos los usuarios (solo lectura; la RLS de `alineaciones`
 * deja leer los `puntos_jornada` de cualquiera). `null` mientras carga; `[]` si no hay jornadas
 * finalizadas o si falla la carga (la UI simplemente no enseña posiciones).
 */
export function usePosicionesPorJornada(): PosicionesJornada[] | null {
  const [posiciones, setPosiciones] = useState<PosicionesJornada[] | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('usuarios').select('id'),
      // ponytail: PostgREST corta a 1000 filas; 24 usuarios x ~22 jornadas son ~530. Si la liga crece, paginar con .range() o una vista agregada.
      supabase.from('alineaciones').select('usuario_id, jornada, puntos_jornada').not('puntos_jornada', 'is', null),
      supabase.from('jornadas').select('numero, orden, finalizado'),
    ]).then(([u, a, j]) => {
      if (cancelled) return
      const error = u.error ?? a.error ?? j.error
      if (error) {
        console.error('Posiciones fetch error:', error)
        setPosiciones([])
        return
      }
      setPosiciones(posicionesPorJornada(
        (u.data ?? []) as { id: string }[],
        (a.data ?? []) as Pick<Alineacion, 'usuario_id' | 'jornada' | 'puntos_jornada'>[],
        (j.data ?? []) as Pick<Jornada, 'numero' | 'orden' | 'finalizado'>[],
      ))
    })
    return () => {
      cancelled = true
    }
  }, [])

  return posiciones
}
