import { useAuth } from './hooks/useAuth'
import { useJugadores } from './hooks/useJugadores'
import { useUsuario } from './hooks/useUsuario'
import { authRedirect } from './lib/supabase'
import { Auth } from './components/Auth/Auth'
import { Onboarding } from './components/Auth/Onboarding'
import { ResetPasswordForm } from './components/Auth/ResetPasswordForm'
import { Dashboard } from './components/Dashboard/Dashboard'

export function App() {
  const { user, loading: authLoading, signOut, recovery, endRecovery } = useAuth()
  const { jugadores, loading: jugadoresLoading, error: jugadoresError } = useJugadores(user?.id)
  const { usuario, loading: usuarioLoading, needsOnboarding, updateNombre, createProfile } = useUsuario(user?.id)

  if (authLoading || jugadoresLoading) {
    return (
      <div className="loading-screen">
        <img src="/Sharks-Fantasy/logo.png" alt="Sharks Fantasy" className="loading-logo" />
        <p>Cargando...</p>
      </div>
    )
  }

  if (jugadoresError) {
    return (
      <div className="error-screen">
        <p>Error cargando jugadores: {jugadoresError}</p>
      </div>
    )
  }

  if (!user) return <Auth linkError={authRedirect.linkError} />

  // A recovery session must set a new password before seeing Onboarding/Dashboard.
  if (recovery) {
    return (
      <div className="auth-container">
        <div className="auth-logo">
          <img src="/Sharks-Fantasy/logo.png" alt="Sharks Fantasy" className="auth-logo-img" />
          <h1 className="auth-title">SHARKS FANTASY</h1>
          <p className="auth-subtitle">Liga de Waterpolo</p>
        </div>
        <ResetPasswordForm
          title="Nueva contraseña"
          onSuccess={endRecovery}
          onCancel={() => {
            endRecovery()
            signOut()
          }}
        />
      </div>
    )
  }

  if (usuarioLoading) {
    return (
      <div className="loading-screen">
        <p>Cargando equipo...</p>
      </div>
    )
  }

  if (needsOnboarding) {
    return (
      <Onboarding
        jugadores={jugadores}
        onComplete={(nombre) => createProfile(nombre, jugadores)}
      />
    )
  }

  if (!usuario) {
    return (
      <div className="error-screen">
        <p>Error cargando perfil. Contacta al admin.</p>
        <button onClick={signOut}>Cerrar sesión</button>
      </div>
    )
  }

  return (
    <Dashboard
      user={user}
      usuario={usuario}
      jugadores={jugadores}
      onSignOut={signOut}
      onUpdateNombre={updateNombre}
    />
  )
}
