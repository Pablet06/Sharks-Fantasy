import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { authErrorMessage } from '../../lib/auth'

interface Props {
  title?: string
  onSuccess?: () => void
  onCancel?: () => void
}

export function ResetPasswordForm({ title, onSuccess, onCancel }: Props) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setDone(false)
    if (password !== confirm) {
      setError('Las dos contraseñas no coinciden.')
      return
    }
    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (updateError) {
      setError(authErrorMessage(updateError))
      return
    }
    setPassword('')
    setConfirm('')
    setDone(true)
    onSuccess?.()
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      {title && <h2>{title}</h2>}
      {error && <p className="auth-error">{error}</p>}
      {done && <p className="auth-success">✓ Contraseña cambiada</p>}
      <input
        type="password"
        placeholder="Contraseña nueva (mín. 6 caracteres)"
        aria-label="Contraseña nueva"
        autoComplete="new-password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        minLength={6}
        required
        className="auth-input"
      />
      <input
        type="password"
        placeholder="Repite la contraseña"
        aria-label="Repite la contraseña"
        autoComplete="new-password"
        value={confirm}
        onChange={e => setConfirm(e.target.value)}
        minLength={6}
        required
        className="auth-input"
      />
      <button type="submit" disabled={loading} className="auth-btn">
        {loading ? 'Guardando...' : 'Guardar contraseña'}
      </button>
      {onCancel && (
        <p className="auth-switch">
          <button type="button" onClick={onCancel} className="auth-link">
            Cancelar
          </button>
        </p>
      )}
    </form>
  )
}
