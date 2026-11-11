import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { authErrorMessage } from '../../lib/auth'

interface Props {
  onBack: () => void
}

const mutedText = { color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.5 }

export function ForgotPasswordForm({ onBack }: Props) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + import.meta.env.BASE_URL,
    })
    setLoading(false)
    if (resetError) {
      setError(authErrorMessage(resetError))
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="auth-form">
        <h2>Revisa tu email</h2>
        <p style={mutedText}>
          Si ese email está registrado, te hemos enviado un enlace para crear una contraseña nueva.
          Revisa también la carpeta de spam.
        </p>
        <button type="button" onClick={onBack} className="auth-btn" style={{ marginTop: 8 }}>
          Volver al login
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <h2>Recuperar contraseña</h2>
      <p style={mutedText}>Te enviaremos un enlace para crear una contraseña nueva.</p>
      {error && <p className="auth-error">{error}</p>}
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
        className="auth-input"
      />
      <button type="submit" disabled={loading} className="auth-btn">
        {loading ? 'Enviando...' : 'Enviar enlace'}
      </button>
      <p className="auth-switch">
        <button type="button" onClick={onBack} className="auth-link">
          Volver al login
        </button>
      </p>
    </form>
  )
}
