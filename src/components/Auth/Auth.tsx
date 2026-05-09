import { useState } from 'react'
import { LoginForm } from './LoginForm'
import { SignupForm } from './SignupForm'
import type { Jugador } from '../../types'

interface Props {
  jugadores: Jugador[]
}

export function Auth({ jugadores }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  return (
    <div className="auth-container">
      <div className="auth-logo">
        <img src="/Sharks-Fantasy/logo.png" alt="Sharks Fantasy" className="auth-logo-img" />
        <h1 className="auth-title">SHARKS FANTASY</h1>
        <p className="auth-subtitle">Liga de Waterpolo</p>
      </div>
      {mode === 'login'
        ? <LoginForm onSwitch={() => setMode('signup')} />
        : <SignupForm jugadores={jugadores} onSwitch={() => setMode('login')} />
      }
    </div>
  )
}
