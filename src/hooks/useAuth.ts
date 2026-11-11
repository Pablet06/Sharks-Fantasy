import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, authRedirect } from '../lib/supabase'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(authRedirect.recovery)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = () => supabase.auth.signOut()
  const endRecovery = () => setRecovery(false)

  return { user, loading, signOut, recovery, endRecovery }
}
