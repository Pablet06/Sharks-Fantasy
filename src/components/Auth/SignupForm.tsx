import { useState } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  onSwitch: () => void
}

export function SignupForm({ onSwitch }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: signupError } = await supabase.auth.signUp({ email, password })
    if (signupError) {
      setError(signupError.message)
      setLoading(false)
      return
    }
    setDone(true)
    setLoading(false)
  }

  if (done) {
    return (
      <div className="auth-form">
        <h2>Revisa tu email</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.5 }}>
          Te hemos enviado un enlace de confirmación a <strong style={{ color: '#fff' }}>{email}</strong>.
          Haz clic en él para activar tu cuenta y luego inicia sesión.
        </p>
        <button type="button" onClick={onSwitch} className="auth-btn" style={{ marginTop: 8 }}>
          Ir al login
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <h2>Crear Cuenta</h2>
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
