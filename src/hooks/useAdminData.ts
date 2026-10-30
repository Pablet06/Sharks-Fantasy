import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Jugador, Usuario, Jornada, Alineacion } from '../types'

export function useAdminData() {
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [jornadas, setJornadas] = useState<Jornada[]>([])
  const [alineaciones, setAlineaciones] = useState<Alineacion[]>([])
  const [config, setConfig] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const refetch = useCallback(() => setNonce(n => n + 1), [])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('jugadores').select('*, historial(*)').order('numero'),
      supabase.from('usuarios').select('*').order('puntos', { ascending: false }),
      supabase.from('config').select('key, value'),
      supabase.from('jornadas').select('*').order('orden'),
      supabase.from('alineaciones').select('*'),
    ]).then(([j, u, c, jo, a]) => {
      if (cancelled) return
      const err = j.error || u.error || c.error || jo.error || a.error
      if (err) { setError(err.message); setLoading(false); return }
      setJugadores((j.data ?? []) as Jugador[])
      setUsuarios((u.data ?? []) as Usuario[])
      setConfig(Object.fromEntries((c.data ?? []).map(r => [r.key, r.value])))
      setJornadas((jo.data ?? []) as Jornada[])
      setAlineaciones((a.data ?? []) as Alineacion[])
      setError(null)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [nonce])

  return { jugadores, usuarios, config, jornadas, alineaciones, loading, error, refetch }
}
