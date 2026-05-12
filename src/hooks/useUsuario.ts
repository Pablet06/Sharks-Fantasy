import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Usuario } from '../types'

export function useUsuario(userId: string | undefined) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)

  useEffect(() => {
    if (!userId) { setLoading(false); return }

    supabase
      .from('usuarios')
      .select('*')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (error?.code === 'PGRST116') {
          // No row yet — new user after email confirmation
          setNeedsOnboarding(true)
        } else if (!error && data) {
          setUsuario(data as Usuario)
        }
        setLoading(false)
      })
  }, [userId])

  const updateNombre = async (nombre: string): Promise<unknown> => {
    if (!userId) return
    const { error } = await supabase.from('usuarios').update({ nombre }).eq('id', userId)
    if (!error) setUsuario(prev => prev ? { ...prev, nombre } : null)
    return error
  }

  const updateEquipo = async (equipo: number[]): Promise<unknown> => {
    if (!userId) return
    const { error } = await supabase.from('usuarios').update({ equipo }).eq('id', userId)
    if (!error) setUsuario(prev => prev ? { ...prev, equipo } : null)
    return error
  }

  const createProfile = async (nombre: string, jugadores: import('../types').Jugador[]): Promise<unknown> => {
    if (!userId) return
    const shuffle = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5)
    const equipo = [
      shuffle(jugadores.filter(j => j.pos === 'Portero'))[0]?.numero,
      ...shuffle(jugadores.filter(j => j.pos !== 'Portero')).slice(0, 6).map(p => p.numero),
    ].filter((id): id is number => id !== undefined)
    const { data, error } = await supabase
      .from('usuarios')
      .insert({ id: userId, nombre, equipo, puntos: 0 })
      .select()
      .single()
    if (!error && data) {
      setUsuario(data as Usuario)
      setNeedsOnboarding(false)
    }
    return error
  }

  return { usuario, loading, needsOnboarding, updateNombre, updateEquipo, createProfile }
}
