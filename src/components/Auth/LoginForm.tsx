import { useState } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  onSwitch: () => void
  onForgot: () => void
  notice?: string | null
}

export function LoginForm({ onSwitch, onForgot, notice }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <h2>Iniciar Sesión</h2>
      {notice && <p className="auth-error">{notice}</p>}
      {error && <p className="auth-error">{error}</p>}
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
        placeholder="Contraseña"
        value={password}
        onChange={e => setPassword(e.target.value)}
        required
        className="auth-input"
      />
      <button type="submit" disabled={loading} className="auth-btn">
        {loading ? 'Entrando...' : 'Entrar'}
      </button>
      <p className="auth-switch">
        <button type="button" onClick={onForgot} className="auth-link">
          ¿Has olvidado tu contraseña?
        </button>
      </p>
      <p className="auth-switch">
        ¿No tienes cuenta?{' '}
        <button type="button" onClick={onSwitch} className="auth-link">
          Regístrate
        </button>
      </p>
    </form>
  )
}
