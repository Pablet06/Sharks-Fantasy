import { useState } from 'react'
import type { Jugador } from '../../types'

interface Props {
  jugadores: Jugador[]
  onComplete: (nombre: string) => Promise<unknown>
}

export function Onboarding({ onComplete }: Props) {
  const [nombre, setNombre] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return
    setLoading(true)
    setError(null)
    const err = await onComplete(nombre.trim())
    if (err) {
      setError('Error creando el perfil. Inténtalo de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-logo">
        <img src="/Sharks-Fantasy/logo.png" alt="Sharks Fantasy" className="auth-logo-img" />
        <h1 className="auth-title">SHARKS FANTASY</h1>
        <p className="auth-subtitle">Bienvenido al equipo</p>
      </div>
      <form onSubmit={handleSubmit} className="auth-form">
        <h2>¿Cómo te llamas?</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 4 }}>
          Este será tu nombre de entrenador en el ranking.
        </p>
        {error && <p className="auth-error">{error}</p>}
        <input
          placeholder="Nombre del entrenador"
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          required
          autoFocus
          className="auth-input"
        />
        <button type="submit" disabled={loading || !nombre.trim()} className="auth-btn">
          {loading ? 'Creando equipo...' : 'Empezar'}
        </button>
      </form>
    </div>
  )
}
