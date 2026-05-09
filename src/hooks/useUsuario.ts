import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Usuario } from '../types'

export function useUsuario(userId: string | undefined) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }

    supabase
      .from('usuarios')
      .select('*')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) setUsuario(data as Usuario)
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

  return { usuario, loading, updateNombre, updateEquipo }
}
