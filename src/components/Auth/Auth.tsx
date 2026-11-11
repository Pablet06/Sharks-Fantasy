import { useState } from 'react'
import { LoginForm } from './LoginForm'
import { SignupForm } from './SignupForm'
import { ForgotPasswordForm } from './ForgotPasswordForm'
import { LINK_ERROR_MESSAGE } from '../../lib/auth'

interface Props {
  linkError?: boolean
}

export function Auth({ linkError }: Props) {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')

  return (
    <div className="auth-container">
      <div className="auth-logo">
        <img src="/Sharks-Fantasy/logo.png" alt="Sharks Fantasy" className="auth-logo-img" />
        <h1 className="auth-title">SHARKS FANTASY</h1>
        <p className="auth-subtitle">Liga de Waterpolo</p>
      </div>
      {mode === 'login' && (
        <LoginForm
          onSwitch={() => setMode('signup')}
          onForgot={() => setMode('forgot')}
          notice={linkError ? LINK_ERROR_MESSAGE : null}
        />
      )}
      {mode === 'signup' && <SignupForm onSwitch={() => setMode('login')} />}
      {mode === 'forgot' && <ForgotPasswordForm onBack={() => setMode('login')} />}
    </div>
  )
}
