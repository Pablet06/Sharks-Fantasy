import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Jugador } from '../../types'

interface Props {
  jugadores: Jugador[]
  onSwitch: () => void
}

export function SignupForm({ jugadores, onSwitch }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data, error: signupError } = await supabase.auth.signUp({ email, password })
    if (signupError || !data.user) {
      setError(signupError?.message ?? 'Error al registrarse')
      setLoading(false)
      return
    }

    const shuffle = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5)
    const goalkeepers = jugadores.filter(j => j.pos === 'Portero')
    const fieldPlayers = jugadores.filter(j => j.pos !== 'Portero')
    const team = [
      shuffle(goalkeepers)[0]?.numero,
      ...shuffle(fieldPlayers).slice(0, 6).map(p => p.numero)
    ].filter((id): id is number => id !== undefined)

    const { error: profileError } = await supabase
      .from('usuarios')
      .insert({ id: data.user.id, nombre, equipo: team, puntos: 0 })

    if (profileError) setError(profileError.message)
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <h2>Crear Cuenta</h2>
      {error && <p className="auth-error">{error}</p>}
      <input
        placeholder="Nombre del entrenador"
        value={nombre}
        onChange={e => setNombre(e.target.value)}
        required
        className="auth-input"
      />
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
        className="auth-input"
      />
      <input
        type="password"
        placeholder="Contraseña (mín. 6 caracteres)"
        value={password}
        onChange={e => setPassword(e.target.value)}
        minLength={6}
        required
        className="auth-input"
      />
      <button type="submit" disabled={loading} className="auth-btn">
        {loading ? 'Creando cuenta...' : 'Registrarse'}
      </button>
      <p className="auth-switch">
        ¿Ya tienes cuenta?{' '}
        <button type="button" onClick={onSwitch} className="auth-link">
          Inicia sesión
        </button>
      </p>
    </form>
  )
}
